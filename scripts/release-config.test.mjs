import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateEasConfig,configureEas} from './configure-eas.mjs';
import {finishedAndroidBuild,collectApk,isApk} from './collect-eas-apk.mjs';
const id='12345678-1234-4234-8234-123456789abc';
test('EAS preflight rejects placeholder project IDs, missing tokens and unsafe backend URLs',()=>{
 const good={apiUrl:'https://api.example.invalid/',projectId:id,owner:'fixture-owner',token:'fixture-token'};
 assert.equal(validateEasConfig(good,true).apiUrl,'https://api.example.invalid');
 for(const patch of [{apiUrl:'http://localhost:4000'},{apiUrl:'https://user:password@example.invalid'},{projectId:'------------------------------------'},{projectId:'00000000-0000-0000-0000-000000000000'},{token:''},{owner:''}])assert.throws(()=>validateEasConfig({...good,...patch},true));
});
test('EAS writes configuration only when asked and preserves existing app metadata',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dubchef-eas-config-'));
 try{
  await mkdir(join(dir,'mobile'));
  const app={expo:{slug:'dubchef',extra:{preserved:true}}},eas={build:{preview:{android:{buildType:'apk'},env:{EXISTING:'value'}}}};
  await writeFile(join(dir,'mobile/app.json'),JSON.stringify(app));await writeFile(join(dir,'mobile/eas.json'),JSON.stringify(eas));
  const env={EXPO_PUBLIC_API_URL:'https://backend.example.invalid',EXPO_PROJECT_ID:id,EXPO_OWNER:'fixture-owner'};
  await configureEas(dir,env);assert.deepEqual(JSON.parse(await readFile(join(dir,'mobile/app.json'))),app);
  await configureEas(dir,env,{write:true});
  const written=JSON.parse(await readFile(join(dir,'mobile/app.json')));
  assert.equal(written.expo.extra.eas.projectId,id);assert.equal(written.expo.extra.preserved,true);
  assert.equal(JSON.parse(await readFile(join(dir,'mobile/eas.json'))).build.preview.env.EXISTING,'value');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('successful EAS build may omit details URL; collect and hash APK without exposing signed URL',async()=>{
 const builds=[{id,status:'FINISHED',platform:'ANDROID',artifacts:{buildUrl:'https://cdn.example.invalid/app.apk?private=fixture'}}];
 assert.match(finishedAndroidBuild(builds,{owner:'group',slug:'dubchef'}).details,/accounts\/group\/projects\/dubchef\/builds/);
 assert.throws(()=>finishedAndroidBuild([{...builds[0],status:'ERRORED'}],{}));
 const dir=await mkdtemp(join(tmpdir(),'dubchef-apk-'));
 try{
  const jsonFile=join(dir,'build.json'),appFile=join(dir,'app.json'),output=join(dir,'app.apk'),summary=join(dir,'summary.md');
  await writeFile(jsonFile,JSON.stringify(builds));await writeFile(appFile,JSON.stringify({expo:{owner:'group',slug:'dubchef'}}));
  const result=await collectApk({jsonFile,appFile,output,summary,fetchImpl:async()=>new Response(Buffer.from('UEsDBBQAAAAAAFSCb13tN8mLCwAAAAsAAAATAAAAQW5kcm9pZE1hbmlmZXN0LnhtbDxtYW5pZmVzdC8+UEsDBBQAAAAAAFSCb11pN0DgDAAAAAwAAAALAAAAY2xhc3Nlcy5kZXhmaXh0dXJlLW9ubHlQSwECFAMUAAAAAABUgm9d7TfJiwsAAAALAAAAEwAAAAAAAAAAAAAAgAEAAAAAQW5kcm9pZE1hbmlmZXN0LnhtbFBLAQIUAxQAAAAAAFSCb11pN0DgDAAAAAwAAAALAAAAAAAAAAAAAACAATwAAABjbGFzc2VzLmRleFBLBQYAAAAAAgACAHoAAABxAAAAAAA=','base64'))});
  assert.equal(result.bytes,257);assert.equal(result.sha256.length,64);
  assert.doesNotMatch(await readFile(summary,'utf8'),/private=fixture/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('APK collector rejects a ZIP header or an Android app bundle without APK entries',()=>{
 assert.equal(isApk(Buffer.from([0x50,0x4b,3,4,0])),false);
 assert.equal(isApk(Buffer.from('<html>error</html>')),false);
});
