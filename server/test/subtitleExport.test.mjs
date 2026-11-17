import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {subtitleText} from '../src/services/subtitleExport.js';
import {saveJobPayload} from '../src/services/jobPayload.js';
import {processVideoJob} from '../src/services/jobWorker.js';

test('SRT and VTT preserve multilingual text and precise timestamps',()=>{
  const lines=[{text:'Xào rau muống',start:1.25,end:2.45},{text:'Thêm nước mắm',start:3,end:4.2}];
  const srt=subtitleText(lines,'vi','srt');
  assert.match(srt,/1\n00:00:01,250 --> 00:00:02,450\nXào rau muống/);
  assert.match(srt,/2\n00:00:03,000 --> 00:00:04,200/);
  const vtt=subtitleText(lines,'vi','vtt');
  assert.match(vtt,/^WEBVTT\n\n00:00:01\.250 --> 00:00:02\.450/);
  assert.throws(()=>subtitleText([{text:'a',start:2,end:1}],'en','srt'),/invalid_timeline/);
});

test('worker creates durable SRT/VTT assets without invoking TTS render',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'dubchef-subtitle-job-'));
  try {
    const videoPath=join(dir,'source.mp4'); await writeFile(videoPath,'fake-video');
    await saveJobPayload(dir,91,{videoId:8,originalLanguage:'vi',languages:['vi'],formats:['srt','vtt']});
    const assets=[];let calls=0;const repo={
      getVideo:async()=>({id:8,userId:7,userEmail:'a@example.org',videoUrl:videoPath,originalLanguage:'vi'}),
      videoResults:async()=>({narrations:[{language:'vi',content:'[{"text":"Xào tỏi","start":0.1,"end":1.5}]'}]}),
      setVideoStatus:async()=>{},listProcessingAssets:async()=>assets,
      setProcessingProgress:async()=>{},recordProcessingAsset:async(entry)=>assets.push(entry),completeProcessingJob:async()=>{},
    };
    await processVideoJob(repo,{id:91,userId:7,videoId:8},{uploadDir:dir,
      render:async()=>{calls++; throw new Error('render_should_not_run');}});
    assert.equal(calls,0);assert.deepEqual(assets.map(x=>x.format),['srt','vtt']);
    assert.match(await readFile(assets[0].path,'utf8'),/00:00:00,100/);
    assert.match(await readFile(assets[1].path,'utf8'),/WEBVTT/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
