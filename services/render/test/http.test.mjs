import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, safeSourceVideo } from '../src/server.js';
import { parseNarration } from '../src/audioExport.js';

test('validates timestamped cooking narration and rejects overlaps', () => {
  assert.equal(parseNarration([{ text:'Xào tỏi', start:0, end:2 }], 'vi').length, 1);
  assert.throws(() => parseNarration([{ text:'1',start:0,end:2 },{text:'2',start:1,end:3}], 'vi'), /invalid_timeline/);
});

test('render requires internal token and only serves generated files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dubchef-render-test-'));
  await writeFile(join(dir, 'result.mp3'), Buffer.from('synthetic-mp3-fixture'));
  let called = 0;
  const server = createServer({ internalToken:'private-token', render: async () => { called++; return { directory:dir, output:join(dir,'result.mp3') }; } });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base+'/health')).status, 200);
    assert.equal((await fetch(base+'/render', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' })).status, 401);
    assert.equal((await fetch(base+'/render', { method:'POST', headers:{'Content-Type':'application/json','X-Internal-Token':'private-token'}, body:'{}' })).status, 400);
    const response = await fetch(base+'/render', { method:'POST', headers:{'Content-Type':'application/json','X-Internal-Token':'private-token'}, body: JSON.stringify({ content:[{text:'Xào',start:0,end:2}],language:'vi',format:'mp3' }) });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'synthetic-mp3-fixture');
    assert.equal(called,1);
  } finally {
    await new Promise(r => server.close(r));
    await rm(dir, { recursive:true, force:true });
  }
});

test('rejects input paths outside upload volume, including symlinks', async () => {
  const dir = await mkdtemp(join(tmpdir(),'dubchef-upload-test-'));
  const elsewhere = await mkdtemp(join(tmpdir(),'dubchef-other-'));
  try {
    await writeFile(join(dir,'okay.mp4'), 'safe');
    await writeFile(join(elsewhere,'bad.mp4'), 'bad');
    assert.equal(await safeSourceVideo(join(dir,'okay.mp4'),dir),join(dir,'okay.mp4'));
    await assert.rejects(safeSourceVideo(join(elsewhere,'bad.mp4'),dir),/video_path_forbidden/);
  } finally { await rm(dir,{recursive:true,force:true});await rm(elsewhere,{recursive:true,force:true}); }
});
