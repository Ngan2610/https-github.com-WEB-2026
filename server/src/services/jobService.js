/** Business validation and secure, authenticated job operations. */
import { parseNarration } from '../audioExport.js';
import { basename, resolve, sep } from 'node:path';

const LANG = new Set(['vi','en','zh']);
const FORMATS = new Set(['mp3','mp4','srt','vtt']);
const fail = (code, status=400) => Object.assign(new Error(code), { code, status });

export function validateJobOptions(body, originalLanguage) {
  const languages = body?.languages ?? ['vi','en','zh'];
  const formats = body?.formats ?? ['mp3','mp4','srt','vtt'];
  if (!LANG.has(originalLanguage) || !Array.isArray(languages) || !languages.length || languages.length > 3 ||
    new Set(languages).size !== languages.length || languages.some(x=>!LANG.has(x)) ||
    !Array.isArray(formats) || !formats.length || formats.length > 4 ||
    new Set(formats).size !== formats.length || formats.some(x=>!FORMATS.has(x))) throw fail('invalid_job_options');
  return { languages, formats };
}

export function selectTimeline(results, originalLanguage) {
  const row = (results?.narrations || []).find(x => x.language === originalLanguage);
  if (!row) throw fail('source_timeline_missing',409);
  try { return parseNarration(row.content, originalLanguage); }
  catch { throw fail('invalid_source_timestamps',422); }
}

export async function createProcessingJob(repo, video, user, body, uploadDir, savePayload) {
  const { languages, formats } = validateJobOptions(body, video.originalLanguage);
  if (!video.videoUrl || !resolve(video.videoUrl).startsWith(resolve(uploadDir)+sep)) throw fail('video_file_missing',409);
  const results=await repo.videoResults(video.id);
  let transcribe=false;
  try { selectTimeline(results,video.originalLanguage); }
  catch (err) {
    if (err.code !== 'source_timeline_missing' || results.narrations?.length) throw err;
    transcribe=true;
  }
  const sourceLanguage=body?.sourceLanguage ?? video.originalLanguage;
  if (!LANG.has(sourceLanguage) && sourceLanguage !== 'auto') throw fail('invalid_job_options');
  const existingOrNew = await repo.createProcessingJob(video.id,user.id);
  if (!existingOrNew) throw fail('video_not_found',404);
  if (!existingOrNew.reused) {
    try { await savePayload(existingOrNew.id,{ videoId:video.id, languages, formats, transcribe, sourceLanguage, originalLanguage:video.originalLanguage }); }
    catch {
      await repo.failProcessingJob(existingOrNew.id,'payload_unavailable',MAX_ATTEMPTS).catch(()=>{});
      throw fail('job_enqueue_failed',503);
    }
  }
  return { id:String(existingOrNew.id), reused:existingOrNew.reused };
}
// SQL's CHECK limits SoLanThu to <= 100, worker uses 3 attempts.
const MAX_ATTEMPTS = 3;

export function accessibleJob(job, user, { ownerOnly = false } = {}) {
  if (!job) throw fail('job_not_found',404);
  // Admin may inspect job metadata; binary downloads require ownership.
  if ((ownerOnly || user.role !== 'admin') && Number(job.userId) !== Number(user.id)) throw fail('job_not_found',404);
  return {
    id:String(job.id), videoId:job.videoId, status:job.status === 'running' ? 'active' : job.status,
    progress:job.progress, attempts:job.attempts,
    stage:job.status==='running'?(job.progress<12?'transcribing':'rendering'):job.status,
    ...(job.status==='failed' ? {failedReason:job.failedReason || 'processing_failed'} : {}),
    createdAt:job.createdAt,updatedAt:job.updatedAt,
  };
}

export function matchingAsset(assets, jobId, language, format, uploadDir) {
  if (!(LANG.has(language)||(language==='multi'&&format==='mp4')) || !FORMATS.has(format)) throw fail('invalid',400);
  const file = `job-${jobId}-${language}.${format}`;
  return (assets || []).find(x => x.format===format && basename(x.path)===file &&
    resolve(x.path).startsWith(resolve(uploadDir)+sep)) || null;
}
