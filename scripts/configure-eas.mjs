import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
export function validateEasConfig({apiUrl,projectId,owner,token},requireToken=false){
 let url;try{url=new URL(apiUrl);}catch{throw new Error('EXPO_PUBLIC_API_URL must be a reachable HTTPS backend URL');}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('Backend URL must use HTTPS without embedded credentials, query or fragment');
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(projectId||'')||/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(projectId))throw new Error('EXPO_PROJECT_ID must be the real project UUID from Expo');
 if(!/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(owner||''))throw new Error('EXPO_OWNER must be your Expo account or organization');
 if(requireToken&&!token?.trim())throw new Error('Configure the EXPO_TOKEN secret before building');
 return {apiUrl:url.toString().replace(/\/+$/,''),projectId,owner};
}
export async function configureEas(root,env=process.env,{write=false,requireToken=false}={}){
 const config=validateEasConfig({apiUrl:env.EXPO_PUBLIC_API_URL,projectId:env.EXPO_PROJECT_ID,owner:env.EXPO_OWNER,token:env.EXPO_TOKEN},requireToken);
 const app=JSON.parse(await readFile(resolve(root,'mobile/app.json'),'utf8')),eas=JSON.parse(await readFile(resolve(root,'mobile/eas.json'),'utf8'));
 app.expo.extra={...app.expo.extra,eas:{...app.expo.extra?.eas,projectId:config.projectId}};
 app.expo.owner=config.owner;
 eas.build.preview.env={...eas.build.preview.env,EXPO_PUBLIC_API_URL:config.apiUrl};
 if(write){await writeFile(resolve(root,'mobile/app.json'),JSON.stringify(app,null,2)+'\n');await writeFile(resolve(root,'mobile/eas.json'),JSON.stringify(eas,null,2)+'\n');}
 return {app,eas};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{await configureEas(process.cwd(),process.env,{write:process.argv.includes('--write'),requireToken:process.argv.includes('--require-token')});console.log('Expo configuration format validated; EAS will verify access to the real project.');}
 catch(error){console.error(error.message);process.exitCode=1;}
}
