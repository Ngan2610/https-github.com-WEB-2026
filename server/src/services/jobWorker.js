import { createTranscriber } from './transcriptionClient.js';
/** Dedicated worker. SQL queue owns job state; /uploads holds inputs and outputs. */
import { createWriteStream } from 'node:fs';
import { mkdir, rm, rename, stat, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform, Readable } from 'node:stream';
import { parseNarration } from '../audioExport.js';
import { createTranslator } from '../translationClient.js';
import { readJobPayload } from './jobPayload.js';
import { validateJobOptions, selectTimeline } from './jobService.js';
import { subtitleText } from './subtitleExport.js';

const sleep = (ms) => new Promise(r=>setTimeout(r,ms));
const fail = (code, status=422) => Object.assign(new Error(code),{code,status});

export async function storeRenderedFile({ requestRender, params, file, maxBytes = 260*1024*1024 }) {
  const temp = file + '.' + randomUUID() + '.part';
  await mkdir(dirname(file),{recursive:true});
  const digest = createHash('sha256');
  let bytes=0;
  try {
    const response = await requestRender(params);
    if (!response.ok || !response.body) throw fail('render_service_unavailable',502);
    const meter = new Transform({ transform(chunk,encoding,callback) {
      bytes += chunk.length;
      if (bytes > maxBytes) return callback(fail('render_too_large',413));
      digest.update(chunk); callback(null,chunk);
    }});
    await pipeline(Readable.fromWeb(response.body),meter,createWriteStream(temp,{flags:'wx'}));
    if (!bytes) throw fail('empty_render');
    await rename(temp,file);
    return {path:file,size:bytes,sha256:digest.digest('hex')};
  } catch (e) {
    await rm(temp,{force:true}).catch(()=>{});
    throw e;
  }
}

export async function storeSubtitleFile({file, content, language, format}) {
  const text=subtitleText(content,language,format);
  const bytes=Buffer.from(text,'utf8');
  const temp=file+'.'+randomUUID()+'.part';
  await mkdir(dirname(file),{recursive:true});
  try {
    await writeFile(temp,bytes,{flag:'wx',mode:0o600});
    await rename(temp,file);
    return {path:file,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  } finally { await rm(temp,{force:true}).catch(()=>{}); }
}

export function createRenderRequest(env = process.env, fetchImpl = fetch) {
  const url = String(env.RENDER_SERVICE_URL || 'http://render:4200').replace(/\/+$/,'');
  return async ({content,language,format,sourceVideoPath,tracks}) => fetchImpl(url+(tracks?'/mux':'/render'),{
    method:'POST',signal:AbortSignal.timeout(180000),
    headers:{'Content-Type':'application/json',...(env.RENDER_INTERNAL_TOKEN?{'X-Internal-Token':env.RENDER_INTERNAL_TOKEN}:{})},
    body:JSON.stringify({content,language,format,sourceVideoPath,tracks}),
  });
}

export async function processVideoJob(repo, job, { uploadDir, translator = createTranslator(), render = createRenderRequest(), transcribe = createTranscriber() } = {}) {
  const payload = await readJobPayload(uploadDir,job.id);
  if (Number(payload.videoId) !== Number(job.videoId)) throw fail('job_payload_mismatch');
  const { languages,formats } = validateJobOptions(payload,payload.originalLanguage);
  const video = await repo.getVideo(job.videoId);
  if (!video || Number(video.userId)!==Number(job.userId)) throw fail('video_owner_mismatch');
  const root = resolve(uploadDir);
  if (!video.videoUrl || !resolve(video.videoUrl).startsWith(root+sep) || !await stat(video.videoUrl).catch(()=>null))
    throw fail('video_file_missing');
  let results = await repo.videoResults(video.id);
  let source;
  try { source=selectTimeline(results,video.originalLanguage); }
  catch (err) {
    if (!payload.transcribe || err.code !== 'source_timeline_missing') throw err;
    await repo.setProcessingProgress(job.id,8);
    const transcript=await transcribe(video.videoUrl,payload.sourceLanguage || video.originalLanguage);
    source=parseNarration(transcript.segments,transcript.language);
    if (transcript.language !== video.originalLanguage) {
      await repo.setDetectedSourceLanguage(video.id,transcript.language);
      video.originalLanguage=transcript.language;
    }
    const content=JSON.stringify(source);
    await repo.saveVideoResult(video.id,'processing',{
      narrations:{[video.originalLanguage]:content},subtitles:{[video.originalLanguage]:content},
    },video.userEmail);
    results=await repo.videoResults(video.id);
  }
  await repo.setVideoStatus(video.id,'processing',video.userEmail);
  const assetList = await repo.listProcessingAssets(job.id);
  const tasks = Math.max(1, languages.length*formats.length + languages.length);
  let step=0;
  const doneStep = async () => repo.setProcessingProgress(job.id,Math.min(98,Math.round(++step/tasks*95)));
  for (const language of languages) {
    let lines;
    if (language === video.originalLanguage) lines=source;
    else {
      const existing = (results.narrations||[]).find(x=>x.language===language);
      if (existing) {
        try { lines=parseNarration(existing.content,language); } catch { /* regenerate */ }
      }
      if (!lines) {
        lines=[];
        for (const row of source) {
          const text=await translator.translate(row.text,video.originalLanguage,language);
          if (typeof text!=='string'||!text.trim()) throw fail('translation_empty',502);
          lines.push({start:row.start,end:row.end,text:text.trim()});
        }
      }
    }
    // Persist translations through the repository so credits, history and published
    // content protections apply equally to browser and background processing.
    if (language !== video.originalLanguage && repo.saveVideoResult) {
      const content=JSON.stringify(lines);
      await repo.saveVideoResult(video.id,'processing',{
        narrations:{[language]:content},subtitles:{[language]:content},
      },video.userEmail);
    }
    // Keep original timestamps, validate TTS limits before producing files.
    parseNarration(lines,language);
    await doneStep();
    for (const format of formats) {
      const filename=`job-${job.id}-${language}.${format}`;
      const path=join(root,'exports',filename);
      const prior=assetList.find(x=>x.path===path && x.format===format);
      if (!prior || !await stat(path).catch(()=>null)) {
        const output=['srt','vtt'].includes(format)
          ? await storeSubtitleFile({file:path,content:lines,language,format})
          : await storeRenderedFile({
            requestRender:render,params:{content:lines,language,format,sourceVideoPath: format==='mp4'?video.videoUrl:undefined},file:path,
          });
        await repo.recordProcessingAsset({jobId:job.id,videoId:video.id,format,...output});
      }
      await doneStep();
    }
  }
  if(languages.length>1 && formats.includes('mp4')) {
    const tracks=languages.map(language=>({language,path:join(root,'exports',`job-${job.id}-${language}.mp4`)}));
    const file=join(root,'exports',`job-${job.id}-multi.mp4`);
    const output=await storeRenderedFile({requestRender:render,params:{tracks},file});
    await repo.recordProcessingAsset({jobId:job.id,videoId:video.id,format:'mp4',...output});
  }
  await repo.setVideoStatus(video.id,'completed' ,video.userEmail);
  await repo.completeProcessingJob(job.id);
}

export async function runVideoWorker(repo,{uploadDir=process.env.UPLOAD_DIR||join(process.cwd(),'uploads'),sleepMs=2500,signal}={}) {
  await repo.recoverProcessingJobs();
  console.log('[jobs] SQL-backed export worker ready');
  let lastRecovery=Date.now();
  while (!signal?.aborted) {
    if(Date.now()-lastRecovery>60000){await repo.recoverProcessingJobs();lastRecovery=Date.now();}
    let job=null;
    try {
      job=await repo.claimProcessingJob();
      if (job) {
        const heartbeat=setInterval(()=>repo.touchProcessingJob(job.id).catch(()=>{}),30000);
        heartbeat.unref();
        try { await processVideoJob(repo,job,{uploadDir}); }
        finally { clearInterval(heartbeat); }
      }
    } catch(e) {
      console.error('[jobs] failure:',String(e.code||'processing_failed'));
      if (job) {
        const retry=await repo.failProcessingJob(job.id,String(e.code||'processing_failed'),job.attempts).catch(()=>false);
        if (!retry && job.videoId) await repo.setVideoStatus(job.videoId,'failed','system').catch(()=>{});
      }
    }
    if (!job) await sleep(sleepMs);
  }
}
