import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runBinary} from '../src/audioExport.js';
import {muxLanguages} from '../../services/render/src/multitrack.js';

test('real FFmpeg creates a playable MP4 with separately tagged Vietnamese and English tracks',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dubchef-track-test-'));let result;
 try{
  const tracks=[];
  for(const [language,hz]of [['vi',440],['en',660]]){
   const path=join(dir,language+'.mp4');
   await runBinary('ffmpeg',['-nostdin','-v','error','-y','-f','lavfi','-i','color=c=black:s=160x90:r=10:d=1',
    '-f','lavfi','-i',`sine=frequency=${hz}:duration=1`,'-c:v','libx264','-threads','1','-c:a','aac','-shortest',path]);
   tracks.push({language,path});
  }
  result=await muxLanguages(tracks);
  const probe=JSON.parse(await runBinary('ffprobe',['-v','error','-show_streams','-of','json',result.output]));
  assert.equal(probe.streams.filter(x=>x.codec_type==='video').length,1);
  assert.deepEqual(probe.streams.filter(x=>x.codec_type==='audio').map(x=>x.tags.language),['vie','eng']);
 }finally{if(result)await rm(result.directory,{recursive:true,force:true});await rm(dir,{recursive:true,force:true});}
});
