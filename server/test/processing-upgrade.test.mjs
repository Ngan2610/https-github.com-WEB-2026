import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cookingInsights } from '../src/services/cookingInsights.js';
import { createProcessingJob } from '../src/services/jobService.js';
import { processVideoJob } from '../src/services/jobWorker.js';
import { saveJobPayload } from '../src/services/jobPayload.js';
import { createApp } from '../src/app.js';
import { makeToken } from '../src/auth.js';

test('cooking insights preserve evidence, do not invent quantities, convert English units',()=>{
  const info=cookingInsights([{text:'Add 2 cups water and fish sauce, then simmer at 350°F.',start:0,end:8}],'en');
  assert.ok(info.conversions.some(x=>x.to==='480 ml'));
  assert.ok(info.conversions.some(x=>x.to==='177°C'));
  assert.ok(info.glossary.some(x=>x.target==='nước mắm'));
  assert.ok(info.ingredients.some(x=>x.name==='water' && x.evidence.includes('2 cups')));
  assert.equal(info.steps[0].start,0);
  assert.equal(cookingInsights([{text:'Xin chào'}],'vi').ingredients.length,0);
});

test('raw upload can enqueue STT; malformed existing timestamps must not be silently overwritten',async()=>{
  const video={id:1,originalLanguage:'vi',videoUrl:'/tmp/uploads/video.bin'};
  let payload;
  const repo={videoResults:async()=>({narrations:[]}),createProcessingJob:async()=>({id:2,reused:false})};
  await createProcessingJob(repo,video,{id:3},{sourceLanguage:'auto'},'/tmp/uploads',async(_,value)=>{payload=value;});
  assert.equal(payload.transcribe,true);assert.equal(payload.sourceLanguage,'auto');
  repo.videoResults=async()=>({narrations:[{language:'vi',content:'[{"text":"hi","start":3,"end":1}]'}]});
  await assert.rejects(createProcessingJob(repo,video,{id:3},{},'/tmp/uploads',()=>{}),/invalid_source_timestamps/);
});

test('STT -> detected language -> durable translated subtitles uses quota-aware persistence',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'dubchef-full-pipeline-'));
  const path=join(dir,'input.bin');await writeFile(path,'video fixture');
  const video={id:5,userId:3,userEmail:'owner@example.invalid',videoUrl:path,originalLanguage:'vi'};
  let results={narrations:[],subtitles:[]};const stored=[],saved=[];let completed=false;
  const repo={getVideo:async()=>video,videoResults:async()=>results,
    setVideoStatus:async()=>{},setProcessingProgress:async()=>{},listProcessingAssets:async()=>[],
    setDetectedSourceLanguage:async(_,lang)=>{video.originalLanguage=lang;},
    saveVideoResult:async(_,state,value)=>{
      saved.push(value);
      for(const kind of ['narrations','subtitles'])for(const [language,content]of Object.entries(value[kind])){
        results[kind]=results[kind].filter(x=>x.language!==language).concat({language,content});
      }
    },recordProcessingAsset:async x=>stored.push(x),completeProcessingJob:async()=>{completed=true;}};
  try {
    await saveJobPayload(dir,4,{videoId:5,originalLanguage:'vi',transcribe:true,sourceLanguage:'auto',languages:['en','vi'],formats:['srt','vtt']});
    await processVideoJob(repo,{id:4,videoId:5,userId:3},{uploadDir:dir,
      transcribe:async()=>({language:'en',segments:[{text:'Add fish sauce',start:0,end:3}]}),
      translator:{translate:async()=> 'Thêm nước mắm'},render:async()=>{throw Error('TTS should not run for subtitles');}});
    assert.equal(completed,true);assert.equal(video.originalLanguage,'en');assert.equal(saved.length,2);
    assert.equal(stored.length,4);assert.match(await readFile(stored[2].path,'utf8'),/Thêm nước mắm/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('private insights and every subtitle asset format obey authenticated ownership',async()=>{
  const owner={id:1,email:'owner@example.invalid',name:'Owner',role:'user',status:'active'};
  const other={...owner,id:2,email:'other@example.invalid'};
  const repo={findUser:async email=>email===owner.email?owner:other,
    getVideo:async()=>({id:8,userId:1,userEmail:owner.email,originalLanguage:'en'}),
    videoResults:async()=>({narrations:[{language:'en',content:'[{"text":"Add fish sauce","start":0,"end":3}]'}]}),
    getProcessingJob:async()=>({id:7,videoId:8,userId:1,status:'completed',progress:100}),
    listProcessingAssets:async()=>['mp3','mp4','srt','vtt'].map(format=>({format,path:`/tmp/uploads/job-7-en.${format}`,size:100})),
  };
  const server=createApp(repo,{secret:'test-secret'}).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const headers=user=>({Authorization:'Bearer '+makeToken(user,'test-secret')});
  try{
    assert.equal((await fetch(base+'/api/videos/8/insights')).status,401);
    assert.equal((await fetch(base+'/api/videos/8/insights',{headers:headers(other)})).status,403);
    const info=await fetch(base+'/api/videos/8/insights',{headers:headers(owner)}).then(r=>r.json());
    assert.ok(info.ingredients.length);
    const job=await fetch(base+'/api/jobs/7',{headers:headers(owner)}).then(r=>r.json());
    assert.deepEqual(job.job.assets.map(x=>x.format),['mp3','mp4','srt','vtt']);
    assert.equal((await fetch(base+'/api/jobs/7',{headers:headers(other)})).status,404);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
