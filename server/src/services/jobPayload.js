/** Job input files are private, atomic and durable in the Docker uploads volume. */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';

export function payloadPath(uploadDir, id) {
  if (!/^[1-9][0-9]{0,15}$/.test(String(id))) throw new Error('invalid_job_id');
  return join(resolve(uploadDir),'jobs',`${id}.json`);
}
export async function saveJobPayload(uploadDir, id, value) {
  const file = payloadPath(uploadDir,id);
  await mkdir(join(resolve(uploadDir),'jobs'), {recursive:true});
  const part = file + '.' + randomUUID() + '.part';
  try { await writeFile(part, JSON.stringify(value), {flag:'wx',mode:0o600}); await rename(part,file); }
  finally { await rm(part,{force:true}).catch(()=>{}); }
}
export async function readJobPayload(uploadDir,id) {
  return JSON.parse(await readFile(payloadPath(uploadDir,id),'utf8'));
}
