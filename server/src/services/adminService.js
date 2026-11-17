import {buildStats} from '../stats.js';
import {validMediaLines,validateFeedback,MEDIA_STATES} from '../adminPolicy.js';
import {validateLegacyOwnerLink} from '../domain/legacyOwnerPolicy.js';
import {fail,positiveId,requireRole,isEmail} from '../domain/errors.js';
const LANG=new Set(['vi','en','zh']),VALID_LANG=/^[a-z]{2,8}$/;
const mediaKind=x=>['narrations','subtitles'].includes(x);
const mediaArgs=(kind,id,language)=>{if(!mediaKind(kind)||!VALID_LANG.test(language||''))fail('invalid');return positiveId(id);};
const legacyId=value=>{if(!/^[1-9]\d*$/.test(String(value)))fail('invalid');const id=positiveId(value);if(id>2147483647)fail('invalid');return id;};
export function createAdminService(repo,{tz,video,storage}){
  const methods={
    async overview(_user,days,qr=false){const span=[7,14,30].includes(Number(days))?Number(days):7;
      const raw=qr?await repo.qrStats(span,tz):await repo.visitStats(span,tz);return {stats:buildStats(raw,Date.now(),span,tz)};},
    async users(){return {users:(await repo.listUsers()).filter(u=>u.role==='user').map(({name,email,at,status})=>({name,email,at,status}))};},
    async dashboard(){return repo.dashboardSummary();},
    async statistics(){return {success:true,statistics:await repo.adminStatistics()};},
    async videos(){return {videos:await repo.listVideos()};},
    async mediaIndex(_user,kind){if(!mediaKind(kind))fail('invalid');return {items:await repo.mediaIndex(kind)};},
    async mediaHistory(_user,{kind,id,language}){const value=mediaArgs(kind,id,language);return {history:await repo.mediaHistory(kind,value,language)};},
    async mediaDetail(_user,{kind,id,language}){const value=mediaArgs(kind,id,language),item=await repo.mediaDetail(kind,value,language);if(!item)fail('not_found',404);return {item};},
    async saveMedia(user,{kind,id,language},body={}){
      const value=mediaArgs(kind,id,language),{lines,status,version}=body;
      if(!MEDIA_STATES.includes(status)||!Number.isSafeInteger(version)||version<0||!validMediaLines(lines))fail('invalid');
      if(!await repo.getVideo(value))fail('not_found',404);
      try{return {ok:true,...await repo.saveManagedMedia({kind,videoId:value,language,lines,status,version,editor:user.email})};}
      catch(error){if(['conflict','review_required','reopen_required'].includes(error.code))fail(error.code,409);throw error;}
    },
    async languages(){return {languages:(await repo.languages()).map(x=>({...x,processingSupported:LANG.has(x.code)}))};},
    async createLanguage(_user,body={}){
      const code=String(body.code||'').toLowerCase().trim(),name=String(body.name||'').trim(),englishName=String(body.englishName||'').trim();
      if(!VALID_LANG.test(code)||!name||name.length>80||!englishName||englishName.length>80)fail('invalid');
      if(!await repo.createLanguage({code,name,englishName,status:LANG.has(code)?'active':'inactive'}))fail('exists',409);return {ok:true};
    },
    async updateLanguage(_user,code,body={}){
      const name=String(body.name||'').trim(),englishName=String(body.englishName||'').trim(),status=body.status;
      if(!VALID_LANG.test(code)||!name||name.length>80||!englishName||englishName.length>80||!['active','inactive'].includes(status))fail('invalid');
      if(status==='active'&&!LANG.has(code))fail('language_not_supported',409);
      if(!await repo.updateLanguage(code,{name,englishName,status}))fail('not_found',404);return {ok:true};
    },
    async legacyMedia(user,{id,kind,language},body={}){
      await video.visible(user,id);
      if(!mediaKind(kind)||!VALID_LANG.test(language||''))fail('invalid');
      const lines=body.lines;
      if(!Array.isArray(lines)||!lines.length||lines.length>2000||lines.some(x=>!x||typeof x.text!=='string'||x.text.length>4000||
        (x.start!=null&&(!Number.isFinite(x.start)||x.start<0))||(x.end!=null&&(!Number.isFinite(x.end)||x.end<0))))fail('invalid');
      fail('use_media_management',410);
    },
    async translations(user,id){return video.results(user,id);},
    async setVideoStatus(user,id,body={}){const item=await video.visible(user,id),status=String(body.status||'');
      if(!['uploaded','processing','completed','failed','hidden'].includes(status))fail('invalid');await repo.setVideoStatus(item.id,status,user.email);return {ok:true};},
    async deleteVideo(user,id){const item=await video.visible(user,id);await repo.deleteVideo(item.id);await storage.remove(item.videoUrl);return {ok:true};},
    async feedback(){return {feedback:await repo.allFeedback()};},
    async feedbackHistory(_user,id){if(!/^[fc]-[1-9]\d*$/.test(id))fail('invalid');return {history:await repo.feedbackHistory(id)};},
    async handleFeedback(user,id,body={}){
      const status=String(body.status||''),reply=String(body.reply||'').trim(),priority=String(body.priority||'normal');
      if(!/^[fc]-[1-9]\d*$/.test(id)||!validateFeedback({status,priority,reply}))fail('invalid');
      if(!await repo.handleFeedback(id,{status,reply:reply||null,priority,editor:user.email}))fail('not_found',404);return {ok:true};
    },
    async entitlements(_user,value){const email=String(value||'').trim().toLowerCase();if(!isEmail(email))fail('invalid');
      const data=await repo.entitlementsForEmail(email);if(!data)fail('not_found',404);return data;},
    async orders(){return {orders:await repo.adminOrders()};},
    async ownerCandidates(_user,id){const result=await repo.legacyOwnerCandidates(legacyId(id));if(!result)fail('not_found',404);return result;},
    async linkOwner(user,id,body){
      const value=legacyId(id);if(!validateLegacyOwnerLink(body))fail('invalid');
      try{return await repo.linkLegacyOwner(value,body,user.email);}
      catch(error){if(error.code==='not_found')fail(error.code,404);
        if(['already_linked','ambiguous_owner','email_mismatch'].includes(error.code))fail(error.code,409);
        if(error.code==='invalid')fail(error.code);throw error;}
    },
    async audit(_user,limit){const count=Math.min(200,Math.max(1,Number.parseInt(limit,10)||50));return {activities:await repo.adminAudit(count)};},
    async userStatus(user,body={}){const email=String(body.email||'').trim().toLowerCase(),status=body.status;
      if(!['active','locked'].includes(status))fail('invalid');if(!await repo.setUserStatus(email,status,user.email))fail('not_found',404);return {ok:true};},
    async anonymize(user,body={}){const email=String(body.email||'').trim().toLowerCase();if(!isEmail(email)||body.confirmed!==true)fail('confirmation_required');
      if(!await repo.anonymizeUser(email,user.email))fail('not_found',404);return {ok:true};},
    async deleteUser(user,value){const email=String(value||'').trim().toLowerCase();
      try{if(!await repo.deleteUser(email,user.email))fail('not_found',404);return {ok:true};}
      catch(error){if(error.number===547)fail('has_data',409);throw error;}
    },
  };
  // Enforce role in the business layer as well as in HTTP middleware.
  return Object.fromEntries(Object.entries(methods).map(([name,method])=>[name,async(user,...args)=>{requireRole(user,'admin');return method(user,...args);} ]));
}
