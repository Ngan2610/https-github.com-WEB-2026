import {fail,positiveId,isEmail} from '../domain/errors.js';
export function createCommunityService(repo){return {
  async feedback(user){return {feedback:await repo.userFeedback(user.email)};},
  async addFeedback(user,body={}){
    const message=String(body.message||'').trim(),videoId=body.videoId==null||body.videoId===''?null:positiveId(body.videoId);
    if(!message||message.length>2000)fail('invalid');
    if(videoId!==null){const video=await repo.getVideo(videoId);if(!video||video.userEmail!==user.email)fail('not_found',404);}
    return {feedback:await repo.addFeedback(user.email,message,videoId)};
  },
  async contact(body={}){
    const name=String(body.name||'').trim(),email=String(body.email||'').trim().toLowerCase(),message=String(body.message||'').trim();
    if(!name||name.length>100||!isEmail(email)||!message||message.length>2000)fail('invalid');
    await repo.addMessage({name,email,body:message});return {ok:true};
  },
  async track(body={},qr=false){
    const visitorId=String(body.visitorId||''),lang=String(body.lang||''),path=String(body.path||'');
    if(!/^[\w-]{1,64}$/.test(visitorId)||!/^[a-z]{2,8}$/.test(lang)||(!qr&&(!path.startsWith('/')||path.length>200)))fail('invalid');
    if(qr)await repo.addQrScan({visitorId,lang});else if(!path.startsWith('/admin'))await repo.addVisit({visitorId,path,lang});
  },
};}
