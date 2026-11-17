import {hashPassword,isLegacyHash,verifyPassword,makeToken,readToken} from '../auth.js';
const failure=(code,status)=>Object.assign(new Error(code),{code,status,domainError:true});
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGIN_WINDOW_MS=15*60*1000, LOGIN_MAX_FAILS=10;
const publicUser=(u,secret)=>({id:u.id,name:u.name,email:u.email,role:u.role,token:makeToken(u,secret)});
export function createAccountService(repo,secret) {
  // SQL-backed lockout in real deployments; the in-memory adapter is only for
  // isolated unit-test repositories with no SQL interface.
  const testOnlyFails = typeof repo.getLoginFailureCount === 'function' ? null : new Map();
  const failsOf = async (ip) => {
    if (!testOnlyFails) return repo.getLoginFailureCount(ip, secret);
    const f = testOnlyFails.get(ip);
    if (!f || f.until < Date.now()) { testOnlyFails.delete(ip); return 0; }
    return f.count;
  };
  const addFail = async (ip) => {
    if (!testOnlyFails) return repo.registerLoginFailure(ip, secret);
    const now=Date.now();const f=testOnlyFails.get(ip);
    testOnlyFails.set(ip, f && f.until>=now ? {count:f.count+1,until:f.until} : {count:1,until:now+LOGIN_WINDOW_MS});
  };
  const clearFails = async (ip) => testOnlyFails ? testOnlyFails.delete(ip) : repo.clearLoginFailures(ip, secret);

  return {
    async authenticate(token) {
      const who=token&&readToken(token,secret);
      if(!who)throw failure('auth',401);
      const user=await repo.findUser(who.email);
      if(!user||user.status!=='active'||user.role!==who.role||(user.id!=null&&user.id!==who.id))throw failure('auth',401);
      return user;
    },
    profile: user=>({user:publicUser(user,secret)}),
    async entitlements(user) {
      if(user?.role!=='user')throw failure('forbidden',403);
      return repo.entitlements(user.id);
    },
    async register(body={}) {
      const name=String(body.name||'').trim(),email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');
      if(!name||name.length>100||!EMAIL.test(email)||email.length>254||password.length<8||password.length>200)throw failure('invalid',400);
      const user=await repo.createUser({name,email,passwordHash:hashPassword(password)});
      if(!user)throw failure('exists',409);
      return publicUser(user,secret);
    },
    async login(body,ip) {
    const b = body || {};
    if (await failsOf(ip) >= LOGIN_MAX_FAILS) throw failure('too_many',429);
    const user = await repo.findUser(String(b.email || '').trim().toLowerCase());
    const password = String(b.password || '');
    if (!user || !verifyPassword(password, user.hash)) { await addFail(ip); throw failure('invalid',401); }
    if (user.status !== 'active') throw failure('locked',403);
    // Băm SHA-256 cũ được nâng lên scrypt ngay sau lần đăng nhập đúng.
    if (isLegacyHash(user.hash) && typeof repo.updatePasswordHash === 'function') {
      const upgraded = hashPassword(password);
      if (await repo.updatePasswordHash(user.email, upgraded, user.hash).catch(() => false)) user.hash = upgraded;
    }
    await clearFails(ip); // Bỏ khóa IP trong SQL sau khi xác thực thành công.
    if (typeof repo.recordLogin === 'function') {
      await repo.recordLogin(user.id, ip).catch(e => console.warn('Lỗi lưu lịch sử đăng nhập:', e.message));
    }
      return publicUser(user,secret);
    },
    async updateProfile(user,body) {
      const name=String(body?.name||'').trim();
      if(!name||name.length>100)throw failure('invalid',400);
      const updated=await repo.updateProfile(user.email,name);
      if(!updated)throw failure('not_found',404);
      return publicUser(updated,secret);
    },
    async changePassword(user,body) {
      const oldPass=String(body?.currentPassword||''),password=String(body?.newPassword||'');
      if(password.length<8||password.length>200||!verifyPassword(oldPass,user.hash))throw failure('invalid',400);
      await repo.updatePassword(user.email,hashPassword(password));
    },
  };
}
