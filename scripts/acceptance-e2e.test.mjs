import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {acceptance,apiOrigin,verifyTracks} from './acceptance-e2e.mjs';
test('acceptance rejects unsafe origins and missing language tracks',()=>{
 assert.equal(apiOrigin('http://localhost:4000/'),'http://localhost:4000');
 assert.throws(()=>apiOrigin('http://public.example.invalid'));
 assert.throws(()=>apiOrigin('https://user:password@example.invalid'));
 assert.throws(()=>verifyTracks({streams:[{codec_type:'video'},{codec_type:'audio',tags:{language:'vie'}}]},['vi','en']));
});
test('real-system verifier checks all outputs and privacy and writes no session token',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dubchef-acceptance-contract-')),file=join(dir,'source.mp4'),output=join(dir,'out');await writeFile(file,'fixture');
 const assets=['vi','en','zh'].flatMap(language=>['mp3','mp4','srt','vtt'].map(format=>({language,format}))).concat({language:'multi',format:'mp4'});
 let requestCount=0;
 const fetchImpl=async(url,options={})=>{
  requestCount++;const path=new URL(url).pathname;
  if(options.method==='PUT'&&options.body?.[Symbol.asyncIterator]){const chunks=[];for await(const chunk of options.body)chunks.push(chunk);assert.equal(Buffer.concat(chunks).toString(),'fixture');}
  if(options.headers?.Authorization==='Bearer second-test-account')return new Response('{}',{status:404});
  let result={ok:true};
  if(path==='/api/videos')result={video:{id:8}};
  else if(path==='/api/jobs/process-video')result={jobId:'9'};
  else if(path==='/api/jobs/9')result={job:{status:'completed',assets}};
  else if(path.endsWith('/results'))result={narrations:['vi','en','zh'].map(language=>({language,content:JSON.stringify([{text:'fixture',start:0,end:2}])}))};
  else if(path.endsWith('/insights'))result={glossary:[],conversions:[],ingredients:[],steps:[]};
  else if(path.includes('/download/')){const format=path.split('/').pop();return new Response(format==='srt'?'1\n00:00:00,000 --> 00:00:02,000\nfixture':format==='vtt'?'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nfixture':'media fixture');}
  return Response.json(result);
 };
 try{
  const result=await acceptance({baseUrl:'http://localhost:4000',file,output,token:'first-test-account',otherToken:'second-test-account',fetchImpl,
   probeFile:async()=>({streams:[{codec_type:'video'},...['vie','eng','zho'].map(language=>({codec_type:'audio',tags:{language}}))]})});
  assert.equal(result.status,'passed');assert.equal(result.files.length,13);assert.equal(result.ownership,'passed');assert.ok(requestCount>=20);
  assert.doesNotMatch(await readFile(join(output,'report.json'),'utf8'),/first-test-account|second-test-account/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
