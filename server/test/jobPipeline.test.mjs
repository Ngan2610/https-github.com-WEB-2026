import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateJobOptions, selectTimeline, accessibleJob, matchingAsset, createProcessingJob } from '../src/services/jobService.js';
import { saveJobPayload } from '../src/services/jobPayload.js';
import { processVideoJob,storeRenderedFile } from '../src/services/jobWorker.js';

test('validate job options, source timestamps, and forbid forged or unowned assets', () => {
  assert.deepEqual(validateJobOptions({languages:['en'],formats:['mp4']},'vi'),{languages:['en'],formats:['mp4']});
  assert.throws(()=>validateJobOptions({languages:['ru']},'vi'),/invalid_job_options/);
  assert.throws(()=>validateJobOptions({formats:['mp3','mp3']},'vi'),/invalid_job_options/);
  assert.throws(()=>selectTimeline({narrations:[]},'vi'),/source_timeline_missing/);
  assert.throws(()=>selectTimeline({narrations:[{language:'vi',content:'[{"text":"a","start":2,"end":1}]'}]},'vi'),/invalid_source_timestamps/);
  assert.throws(()=>accessibleJob({id:1,userId:123,status:'queued'}, {id:999,role:'user'}),/job_not_found/);
  assert.equal(accessibleJob({id:1,userId:123,status:'running',progress:12},{id:123,role:'user'}).status,'active');
  assert.throws(()=>accessibleJob({id:1,userId:123,status:'completed'},{id:77,role:'admin'},{ownerOnly:true}),/job_not_found/);
  assert.equal(matchingAsset([{format:'mp4',path:'/tmp/uploads/exports/job-3-en.mp4'}],3,'en','mp4','/tmp/uploads').format,'mp4');
  assert.equal(matchingAsset([{format:'mp4',path:'/tmp/private/job-3-en.mp4'}],3,'en','mp4','/tmp/uploads'),null);
  assert.throws(()=>matchingAsset([],3,'../../secret','mp4','/tmp/uploads'),/invalid/);
});

test('enqueue verifies SQL timelines before creating a job and stores private payload', async () => {
  const folder=await mkdtemp(join(tmpdir(),'dubchef-enqueue-'));
  const videoPath=join(folder,'input.mp4');await writeFile(videoPath,'video');
  const video={id:45,userId:2,userEmail:'owner@x.vn',originalLanguage:'vi',videoUrl:videoPath};
  let enqueued=0;
  const repo={
    videoResults:async()=>({narrations:[{language:'vi',content:'[{"text":"Xào tỏi","start":0,"end":2}]'}]}),
    createProcessingJob:async()=>{enqueued++;return{id:72,reused:false};},
  };
  try {
    await assert.rejects(createProcessingJob(repo,{...video,videoUrl:'/etc/passwd'},{id:2},{},folder,()=>{}),/video_file_missing/);
    assert.equal(enqueued,0);
    const info=await createProcessingJob(repo,video,{id:2},{formats:['mp3']},folder,(id,payload)=>saveJobPayload(folder,id,payload));
    assert.deepEqual(info,{id:'72',reused:false});
    const content=JSON.parse(await readFile(join(folder,'jobs','72.json'),'utf8'));
    assert.equal(content.videoId,45);
    assert.deepEqual(content.formats,['mp3']);
  } finally { await rm(folder,{recursive:true,force:true}); }
});

test('worker translates preserved timestamps, saves binary outputs and metadata', async () => {
  const folder=await mkdtemp(join(tmpdir(),'dubchef-worker-'));
  const videoPath=join(folder,'input.mp4');await writeFile(videoPath,'source-video');
  await saveJobPayload(folder,23,{videoId:8,originalLanguage:'vi',languages:['vi','en'],formats:['mp3']});
  const assets=[];const states=[];const percents=[];
  const repo={
    getVideo:async()=>({id:8,userId:7,userEmail:'owner@x.vn',videoUrl:videoPath,originalLanguage:'vi'}),
    videoResults:async()=>({narrations:[{language:'vi',content:'[{"text":"Xào tỏi","start":1,"end":3}]'}]}),
    setVideoStatus:async(id,state)=>states.push(state),
    listProcessingAssets:async()=>assets,
    setProcessingProgress:async(id,p)=>percents.push(p),
    recordProcessingAsset:async(record)=>assets.push({format:record.format,path:record.path,size:record.size}),
    completeProcessingJob:async()=>states.push('job_completed'),
  };
  const calls=[];
  try {
    await processVideoJob(repo,{id:23,videoId:8,userId:7},{uploadDir:folder,
      translator:{translate:async(text,from,to)=>{calls.push({from,to});return 'Sauté garlic';}},
      render:async({language,content})=>{
        calls.push({language,content});return new Response(Buffer.from(`mp3:${language}`),{status:200});
      },
    });
    assert.equal(assets.length,2);
    assert.deepEqual(states,['processing','completed','job_completed']);
    assert.deepEqual(calls.find(x=>x.language==='en').content,[{text:'Sauté garlic',start:1,end:3}]);
    assert.equal((await readFile(assets[0].path,'utf8')),'mp3:vi');
    assert.equal((await readFile(assets[1].path,'utf8')),'mp3:en');
    assert.ok(percents.every(p=>p>=0&&p<=99));
  } finally { await rm(folder,{recursive:true,force:true}); }
});

test('failed render is not marked complete and partial download is removed', async()=>{
  const folder=await mkdtemp(join(tmpdir(),'dubchef-failed-render-'));
  try {
    const file=join(folder,'exports','bad.mp3');
    await assert.rejects(storeRenderedFile({file,params:{},requestRender:async()=>new Response('',{status:503})}),/render_service_unavailable/);
    await assert.rejects(stat(file));
  } finally { await rm(folder,{recursive:true,force:true}); }
});
