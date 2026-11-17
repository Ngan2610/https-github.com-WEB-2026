import {rm} from 'node:fs/promises';
import {parseNarration,produceVoiceover} from '../audioExport.js';
import {createProcessingJob,accessibleJob,matchingAsset} from './jobService.js';
import {saveJobPayload} from './jobPayload.js';
import {cookingInsights} from './cookingInsights.js';
import {DomainError,fail,positiveId,requireRole} from '../domain/errors.js';
const LANG=new Set(['vi','en','zh']);
const VALID_LANG=/^[a-z]{2,8}$/;

export function createVideoService(repo,{storage,maxUploadBytes,voiceover=produceVoiceover}) {
  const activeExports=new Set();
  const visible=async(user,value)=>{
    const video=await repo.getVideo(positiveId(value));
    if(!video)fail('not_found',404);
    if(user.role!=='admin' && video.userEmail!==user.email)fail('forbidden',403);
    return video;
  };
  const jobId=value=>{if(!/^[1-9][0-9]{0,15}$/.test(String(value)))fail('invalid');return String(value);};
  return {
    visible,
    async list(user){return {videos:await repo.userVideos(user.email)};},
    async create(user,body={},requestId=null){
      requireRole(user,'user');
      const title=String(body.title||'').trim(),fileName=String(body.fileName||'').trim(),size=Number(body.size),
        mimeType=String(body.mimeType||'').trim().toLowerCase(),originalLanguage=String(body.originalLanguage||'').trim();
      if(requestId&&!/^[0-9a-f-]{36}$/i.test(requestId))fail('invalid_idempotency_key');
      if(!title||title.length>200||!fileName||fileName.length>255||!Number.isSafeInteger(size)||size<=0||size>maxUploadBytes||
        !['video/mp4','video/webm','video/quicktime'].includes(mimeType)||!LANG.has(originalLanguage))fail('invalid');
      const video=await repo.createVideo(user.email,{title,fileName,size,mimeType,originalLanguage,requestId});
      if(!video)fail('not_found',404);
      return {video};
    },
    async cancel(user,value){requireRole(user,'user');if(!await repo.cancelUnfinishedVideo(positiveId(value),user.id))fail('not_cancellable',409);return {ok:true};},
    async upload(user,id,source,{contentType,length}){
      requireRole(user,'user');const video=await visible(user,id);
      if(video.videoUrl)fail('exists',409);
      if(contentType?.split(';')[0]!=='application/octet-stream')fail('invalid',415);
      if(Number(length)>maxUploadBytes)fail('too_large',413);
      const path=await storage.write(video.id,video.size,source);
      try {if(await repo.setVideoFile(video.id,path)===false)fail('exists',409);}
      catch(error){await storage.remove(path);throw error;}
      return {ok:true,id:video.id};
    },
    async file(user,id){const video=await visible(user,id);return {path:await storage.readable(video.videoUrl),mimeType:video.mimeType};},
    async saveResults(user,id,body={}){
      requireRole(user,'user');const video=await visible(user,id);
      const originalLanguage=body.originalLanguage,segments=body.segments;
      if(originalLanguage!=null&&originalLanguage!==video.originalLanguage)fail('invalid_source_language');
      if(!Array.isArray(segments)||!segments.length||segments.length>2000||segments.some(s=>!s||typeof s!=='object'||
        !Object.keys(s).some(k=>VALID_LANG.test(k))||[...LANG].some(k=>s[k]!=null&&(typeof s[k]!=='string'||s[k].length>4000))||
        ((s.start!=null||s.end!=null)&&(!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.start<0||s.end<=s.start))))fail('invalid');
      if(segments.some((s,i)=>i>0&&s.start!=null&&segments[i-1].end!=null&&s.start<segments[i-1].end))fail('invalid');
      const languages=[...new Set(segments.flatMap(s=>Object.keys(s).filter(k=>LANG.has(k)&&typeof s[k]==='string')))];
      if(!languages.length)fail('invalid');
      const results={narrations:{},subtitles:{}};
      for(const lang of languages){const content=JSON.stringify(segments.filter(s=>s[lang]!=null).map(s=>({text:s[lang],start:s.start??null,end:s.end??null})));results.narrations[lang]=content;results.subtitles[lang]=content;}
      await repo.saveVideoResult(video.id,'completed',results,user.email,originalLanguage);return {ok:true,languages};
    },
    async results(user,id){const video=await visible(user,id);return repo.videoResults(video.id);},
    async insights(user,id){
      const video=await visible(user,id),results=await repo.videoResults(video.id);
      const row=results.narrations?.find(x=>x.language===video.originalLanguage);let lines=[];
      try{lines=JSON.parse(row?.content||'[]');}catch{/* no transcript */}
      return cookingInsights(lines,video.originalLanguage);
    },
    async enqueue(user,body={}){
      requireRole(user,'user');const id=positiveId(body.videoId,'invalid_video_id'),video=await repo.getVideo(id);
      if(!video||video.userEmail!==user.email)fail('not_found',404);
      if(!await storage.exists(video.videoUrl))fail('video_file_missing',409);
      const result=await createProcessingJob(repo,video,user,body,storage.root,(job,payload)=>saveJobPayload(storage.root,job,payload));
      return {ok:true,jobId:result.id,reused:result.reused};
    },
    async latestJob(user,value){
      requireRole(user,'user');const job=await repo.latestVideoProcessingJob(positiveId(value,'invalid_video_id'),user.id);
      if(!job)fail('job_not_found',404);return {ok:true,job:accessibleJob(job,user)};
    },
    async job(user,value){
      const id=jobId(value),job=accessibleJob(await repo.getProcessingJob(id),user),assets=await repo.listProcessingAssets(id);
      const files=assets.map(a=>{const match=/^job-\d+-(vi|en|zh|multi)\.(mp3|mp4|srt|vtt)$/.exec(a.path.split(/[\\/]/).pop());return match?{language:match[1],format:match[2],size:Number(a.size)}:null;}).filter(Boolean);
      return {ok:true,job:{...job,assets:files}};
    },
    async jobFile(user,value,language,format){
      const id=jobId(value),job=accessibleJob(await repo.getProcessingJob(id),user,{ownerOnly:true});
      if(job.status!=='completed')fail('job_not_completed',409);
      const asset=matchingAsset(await repo.listProcessingAssets(id),id,language,format,storage.root);
      if(!asset)fail('not_found',404);
      return {path:await storage.readable(asset.path),fileName:`dubchef-${job.videoId}-${language}.${format}`};
    },
    async languages(){return {languages:(await repo.languages()).filter(x=>x.status==='active'&&LANG.has(x.code))};},
    async exports(user,id){
      const video=await visible(user,id),languages=[...LANG];
      const details=await Promise.all(languages.map(lang=>repo.mediaDetail('narrations',video.id,lang)));
      return {languages:languages.filter((_,i)=>details[i]?.status==='published'),hasVideo:Boolean(video.videoUrl)};
    },
    async voiceFile(user,id,language,format){
      const video=await visible(user,id);
      if(!LANG.has(language)||!['mp3','mp4'].includes(format))fail('invalid');
      if(activeExports.size)fail('export_busy',429);
      const media=await repo.mediaDetail('narrations',video.id,language);
      if(!media)fail('narration_not_found',404);
      if(media.status!=='published')fail('narration_not_published',409);
      let sourceVideo=null;
      try{if(video.videoUrl)sourceVideo=await storage.readable(video.videoUrl);}catch{/* no available original file */}
      if(format==='mp4'&&!sourceVideo)fail('video_file_missing',409);
      // Validate before reserving CPU; keep the slot until download completes.
      try{parseNarration(media.content,language);}catch(error){throw new DomainError(error.code,error.status||422);}
      const key=`${video.id}-${language}`;activeExports.add(key);
      let generated;
      try{generated=await voiceover({content:media.content,language,format,sourceVideo});}
      catch(error){activeExports.delete(key);if(error.status)throw new DomainError(error.code,error.status,error.segment?{segment:error.segment}:{});throw error;}
      return {path:generated.output,fileName:`dubchef-video-${video.id}-${language}-v${media.version}.${format}`,
        dispose:async()=>{try{await rm(generated.directory,{recursive:true,force:true});}finally{activeExports.delete(key);}}};
    },
  };
}
