/** Explicit real-system acceptance: uploads one video and uses the account's credits. */
import {stat,mkdir,writeFile,readFile} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {resolve,join,basename,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
const run=promisify(execFile);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function apiOrigin(value){
 const url=new URL(value);if(url.username||url.password||url.search||url.hash)throw Error('Use a backend URL without embedded credentials or query');
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('Use HTTPS or local loopback HTTP');
 return url.toString().replace(/\/+$/,'');
}
export function verifyTracks(probe,expectedLanguages){
 const tags={vi:'vie',en:'eng',zh:'zho'},audio=probe.streams?.filter(s=>s.codec_type==='audio')||[];
 if(!probe.streams?.some(s=>s.codec_type==='video'))throw Error('Export contains no video stream');
 for(const lang of expectedLanguages)if(!audio.some(s=>s.tags?.language===tags[lang]))throw Error(`Missing audio track: ${lang}`);
}
export async function acceptance({baseUrl,file,token,email,password,otherToken,output,timeoutMs=1800000,fetchImpl=fetch,pollMs=3000,probeFile}={}){
 const base=apiOrigin(baseUrl),metadata=await stat(file),languages=['vi','en','zh'],formats=['mp3','mp4','srt','vtt'];
 if(metadata.size<=0||metadata.size>150*1024*1024)throw Error('Video must be between 1 byte and 150 MB');
 const mime={'.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime'}[extname(file).toLowerCase()];
 if(!mime)throw Error('Choose MP4, WebM or MOV');
 let auth=token;
 const request=async(path,{method='GET',body,raw=false,useToken=auth}={})=>{
  const response=await fetchImpl(base+path,{method,headers:{...(useToken?{Authorization:'Bearer '+useToken}:{}),...(body!=null?{'Content-Type':raw?'application/octet-stream':'application/json'}:{})},
   ...(body!=null?{body:raw?body:JSON.stringify(body),...(raw?{duplex:'half'}:{})}:{}),signal:AbortSignal.timeout(120000)});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(`${method} ${path}: ${data.code||'HTTP_'+response.status}`);}
  return response;
 };
 if(!auth){if(!email||!password)throw Error('Set ACCEPTANCE_TOKEN or ACCEPTANCE_EMAIL and ACCEPTANCE_PASSWORD');
  auth=(await (await request('/api/auth/login',{method:'POST',body:{email,password}})).json()).user?.token;
  if(!auth)throw Error('Login did not return a session token');}
 await request('/api/health');await request('/api/health/translation');
 await mkdir(output,{recursive:true});
 const report={scope:'video-pipeline',startedAt:new Date().toISOString(),backend:new URL(base).origin,steps:[],files:[],ownership:'not_checked'};
 let videoId;
 try{
  const created=await (await request('/api/videos',{method:'POST',body:{title:'Acceptance cooking video',fileName:basename(file),size:metadata.size,mimeType:mime,originalLanguage:'vi'}})).json();
  videoId=created.video.id;report.videoId=videoId;
  await request(`/api/videos/${videoId}/file`,{method:'PUT',body:createReadStream(file),raw:true});report.steps.push('uploaded');
  const {jobId}=await (await request('/api/jobs/process-video',{method:'POST',body:{videoId,languages,formats,sourceLanguage:'auto'}})).json();report.jobId=jobId;
  const deadline=Date.now()+timeoutMs;let job;
  while(Date.now()<deadline){job=(await (await request(`/api/jobs/${jobId}`)).json()).job;
   if(job.status==='completed')break;if(['failed','cancelled'].includes(job.status))throw Error('Processing failed: '+(job.failedReason||job.status));await sleep(pollMs);}
  if(job?.status!=='completed')throw Error('Processing exceeded the acceptance time limit');report.steps.push('job_completed');
  const results=await (await request(`/api/videos/${videoId}/results`)).json();
  let referenceTimeline;
  for(const lang of languages){const row=results.narrations?.find(x=>x.language===lang);let lines;
   try{lines=JSON.parse(row?.content);}catch{throw Error('Missing persisted transcript for '+lang);}
   if(!Array.isArray(lines)||!lines.length||lines.some(x=>!x.text?.trim()||!Number.isFinite(x.start)||!Number.isFinite(x.end)||x.end<=x.start))throw Error('Invalid saved timestamps for '+lang);
   const timeline=JSON.stringify(lines.map(x=>[x.start,x.end]));
   if(referenceTimeline&&timeline!==referenceTimeline)throw Error('Translation changed the source timestamps for '+lang);
   referenceTimeline=timeline;
  }
  report.steps.push('sql_results_read_back');
  const expected=languages.flatMap(language=>formats.map(format=>({language,format}))).concat({language:'multi',format:'mp4'});
  for(const asset of expected){
   if(!job.assets?.some(x=>x.language===asset.language&&x.format===asset.format))throw Error(`Missing export ${asset.language}/${asset.format}`);
   const response=await request(`/api/jobs/${jobId}/download/${asset.language}/${asset.format}`),path=join(output,`${asset.language}.${asset.format}`);
   const hash=createHash('sha256');let size=0;
   await pipeline(Readable.fromWeb(response.body),new Transform({transform(chunk,_encoding,done){size+=chunk.length;if(size>300*1024*1024)return done(Error('Export exceeded 300 MB'));hash.update(chunk);done(null,chunk);}}),createWriteStream(path));
   if(!size)throw Error('Empty export');
   if(asset.format==='srt'||asset.format==='vtt'){
    const text=await readFile(path,'utf8');if(!/\d\d:\d\d:\d\d[,.]\d{3} -->/.test(text)||(asset.format==='vtt'&&!text.startsWith('WEBVTT')))throw Error('Invalid subtitle format');
   }else{
    const probe=await probeFile(path);
    if(!probe.streams?.some(s=>s.codec_type==='audio'))throw Error('Media has no audio stream');
    if(asset.language==='multi')verifyTracks(probe,languages);
    else if(asset.format==='mp4'&&!probe.streams.some(s=>s.codec_type==='video'))throw Error('MP4 has no video stream');
   }
   report.files.push({...asset,size,sha256:hash.digest('hex')});
  }
  report.steps.push('all_13_exports_verified');
  const info=await (await request(`/api/videos/${videoId}/insights`)).json();
  if(!['glossary','conversions','ingredients','steps'].every(key=>Array.isArray(info[key])))throw Error('Missing cooking-insights contract');report.steps.push('insights_available');
  if(otherToken){
   for(const path of [`/api/videos/${videoId}/file`,`/api/jobs/${jobId}`,`/api/jobs/${jobId}/download/en/mp4`]){
    const response=await fetchImpl(base+path,{headers:{Authorization:'Bearer '+otherToken},signal:AbortSignal.timeout(15000)});
    if(![403,404].includes(response.status))throw Error('Second account can access private data or is not a valid separate account');
   }report.ownership='passed';
  }
  report.status='passed';report.finishedAt=new Date().toISOString();
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));return report;
 }catch(error){report.status='failed';report.error=error.message;await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const file=process.argv[2];
 if(!file){console.error('Usage: node scripts/acceptance-e2e.mjs video.mp4 [output-folder]. This uploads a video and uses account credits.');process.exitCode=1;}
 else try{
  const output=resolve(process.argv[3]||'.acceptance/'+new Date().toISOString().replace(/[:.]/g,'-'));
  const report=await acceptance({baseUrl:process.env.ACCEPTANCE_API_URL||'http://localhost:4000',file:resolve(file),output,
   token:process.env.ACCEPTANCE_TOKEN,email:process.env.ACCEPTANCE_EMAIL,password:process.env.ACCEPTANCE_PASSWORD,otherToken:process.env.ACCEPTANCE_OTHER_TOKEN,
   probeFile:async path=>JSON.parse((await run(process.env.FFPROBE_BIN||'ffprobe',['-v','error','-show_streams','-of','json',path],{maxBuffer:1024*1024})).stdout)});
  console.log(`Acceptance ${report.status}; ${report.files.length} real exports verified. Report: ${join(output,'report.json')}`);
 }catch(error){console.error(error.message);process.exitCode=1;}
}
