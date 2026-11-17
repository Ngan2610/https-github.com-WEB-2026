import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBinary } from './audioExport.js';
/** Each input is already a rendered H.264 MP4 on the original source timeline. */
export async function muxLanguages(tracks) {
  const folder=await mkdtemp(join(tmpdir(),'dubchef-multitrack-'));
  const output=join(folder,'multilingual.mp4');
  const tags={vi:'vie',en:'eng',zh:'zho'};
  try {
    const args=['-nostdin','-v','error','-y'];
    for(const track of tracks)args.push('-i',track.path);
    args.push('-map','0:v:0','-c:v','copy');
    tracks.forEach((track,i)=>args.push('-map',`${i}:a:0`,`-metadata:s:a:${i}`,`language=${tags[track.language]}`,
      `-metadata:s:a:${i}`,`title=${track.language.toUpperCase()}`,`-disposition:a:${i}`,i===0?'default':'0'));
    args.push('-c:a','copy','-movflags','+faststart',output);
    await runBinary(process.env.FFMPEG_BIN||'ffmpeg',args,{timeoutMs:120000});
    return {directory:folder,output};
  }catch(err){await rm(folder,{recursive:true,force:true});throw err;}
}
