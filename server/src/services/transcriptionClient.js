const fail = code => Object.assign(new Error(code), {code,status:503});
export function createTranscriber(env=process.env, fetchImpl=fetch) {
  return async (sourceVideoPath, language='auto') => {
    if (!env.TRANSCRIPTION_SERVICE_URL) throw fail('transcription_unavailable');
    const response=await fetchImpl(env.TRANSCRIPTION_SERVICE_URL.replace(/\/+$/,'')+'/transcribe', {
      method:'POST', signal:AbortSignal.timeout(900000),
      headers:{'Content-Type':'application/json',...(env.TRANSCRIPTION_INTERNAL_TOKEN?{'X-Internal-Token':env.TRANSCRIPTION_INTERNAL_TOKEN}:{})},
      body:JSON.stringify({sourceVideoPath,language}),
    });
    const data=await response.json().catch(()=>({}));
    if (!response.ok) throw fail(['unsupported_language','no_speech','invalid_video','transcription_busy'].includes(data.code)?data.code:'transcription_failed');
    if (!['vi','en','zh'].includes(data.language)||!Array.isArray(data.segments)) throw fail('invalid_transcription');
    return data;
  };
}
