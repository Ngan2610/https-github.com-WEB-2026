import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {createTranslationService} from '../src/services/translationService.js';
import {createVideoService} from '../src/services/videoService.js';
import {createAdminService} from '../src/services/adminService.js';

test('active controllers depend on injected services, never SQL or repository methods',async()=>{
 const directory=new URL('../src/routes/',import.meta.url);
 for(const file of await readdir(directory)){
  if(!file.endsWith('.js'))continue;
  const source=await readFile(new URL(file,directory),'utf8');
  assert.doesNotMatch(source,/\brepo\s*\.|from\s+['"][^'"]*(?:repositories|db\.js|mssql)/,file);
 }
 for(const file of await readdir(new URL('../src/services/',import.meta.url))){
  if(!file.endsWith('.js'))continue;
  const source=await readFile(new URL('../src/services/'+file,import.meta.url),'utf8');
  assert.doesNotMatch(source,/from\s+['"](?:express|mssql)['"]/,file);
 }
});
test('translation slots track overlapping requests correctly, including out-of-order completion',async()=>{
 const pending=[];
 const service=createTranslationService({}, {adminReady:true,translator:{translate:()=>new Promise(resolve=>pending.push(resolve))}});
 const user={id:1},body={text:'Add salt',from:'en',to:'vi'};
 const first=service.translate(user,body),second=service.translate(user,body);
 await assert.rejects(service.translate(user,body),{code:'busy'});
 pending[0]('Thêm muối');await first;
 const third=service.translate(user,body);
 await assert.rejects(service.translate(user,body),{code:'busy'});
 pending[1]('Thêm muối');await second;
 pending[2]('Thêm muối');await third;
});
test('a concurrent upload cannot replace SQL file ownership and the losing file is removed',async()=>{
 const files=[];let stored=false;
 const repo={getVideo:async()=>({id:4,size:5,userEmail:'owner@example.invalid'}),
  setVideoFile:async()=>{if(stored)return false;stored=true;return true;}};
 const storage={write:async()=>'/uploads/'+files.push('created'),remove:async path=>files.push('removed:'+path)};
 const service=createVideoService(repo,{storage,maxUploadBytes:100});
 const user={role:'user',email:'owner@example.invalid'};
 const calls=await Promise.allSettled([service.upload(user,4,null,{contentType:'application/octet-stream',length:5}),service.upload(user,4,null,{contentType:'application/octet-stream',length:5})]);
 assert.equal(calls.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(calls.find(x=>x.status==='rejected').reason.code,'exists');
 assert.ok(files.some(x=>x.startsWith('removed:')));
});
test('admin business operations reject a customer even outside HTTP middleware',async()=>{
 let called=false;
 const service=createAdminService({listVideos:async()=>{called=true;return [];}},{video:{},storage:{}});
 await assert.rejects(service.videos({role:'user'}),{code:'forbidden'});assert.equal(called,false);
 assert.deepEqual(await service.videos({role:'admin'}),{videos:[]});
});
