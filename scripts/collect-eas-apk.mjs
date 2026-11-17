import {readFile,writeFile,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
export function finishedAndroidBuild(builds,{owner,slug}){
 const build=builds?.[0];
 if(!build||build.status!=='FINISHED'||build.platform!=='ANDROID'||!/^[a-f0-9-]{36}$/i.test(build.id||''))throw new Error('EAS did not return a finished Android build');
 const artifact=build.artifacts?.buildUrl||build.artifacts?.applicationArchiveUrl;
 let url;try{url=new URL(artifact);}catch{throw new Error('EAS did not return an APK download URL');}
 if(url.protocol!=='https:'||url.username||url.password)throw new Error('Invalid EAS artifact URL');
 return {id:build.id,url:url.toString(),details:`https://expo.dev/accounts/${encodeURIComponent(owner)}/projects/${encodeURIComponent(slug)}/builds/${build.id}`};
}
/** Check ZIP central directory for APK-specific entries; an AAB/HTML response is rejected. */
export function isApk(bytes){
 if(bytes.length<22||bytes.readUInt32LE(0)!==0x04034b50)return false;
 let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}}
 if(end<0)return false;
 const entries=bytes.readUInt16LE(end+10),offset=bytes.readUInt32LE(end+16),size=bytes.readUInt32LE(end+12);
 if(offset+size>end)return false;
 let at=offset;const names=new Set();
 for(let i=0;i<entries;i++){
  if(at+46>end||bytes.readUInt32LE(at)!==0x02014b50)return false;
  const nameLength=bytes.readUInt16LE(at+28),extra=bytes.readUInt16LE(at+30),comment=bytes.readUInt16LE(at+32);
  if(at+46+nameLength+extra+comment>end)return false;
  names.add(bytes.subarray(at+46,at+46+nameLength).toString('utf8'));at+=46+nameLength+extra+comment;
 }
 return names.has('AndroidManifest.xml')&&names.has('classes.dex');
}
export async function collectApk({jsonFile,appFile,output,summary,fetchImpl=fetch}){
 const builds=JSON.parse(await readFile(jsonFile,'utf8')),app=JSON.parse(await readFile(appFile,'utf8')).expo;
 const build=finishedAndroidBuild(builds,{owner:app.owner,slug:app.slug});
 const response=await fetchImpl(build.url,{signal:AbortSignal.timeout(300000)});
 if(!response.ok)throw new Error('Failed to download the built APK from Expo');
 const chunks=[];let length=0;
 for await(const chunk of response.body){length+=chunk.length;if(length>400*1024*1024)throw new Error('APK exceeds the 400 MB download limit');chunks.push(chunk);}
 const bytes=Buffer.concat(chunks);
 if(!isApk(bytes))throw new Error('Downloaded artifact is not an Android APK archive');
 await writeFile(output,bytes);const sha256=createHash('sha256').update(bytes).digest('hex');
 if(summary)await appendFile(summary,`### Android APK\n- Build: ${build.id}\n- Expo: ${build.details}\n- SHA-256: ${sha256}\n- APK is available in this run's Artifacts.\n`);
 return {id:build.id,sha256,bytes:bytes.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.log(await collectApk({jsonFile:'mobile/eas-build.json',appFile:'mobile/app.json',output:'mobile/dubchef-preview.apk',summary:process.env.GITHUB_STEP_SUMMARY}));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
