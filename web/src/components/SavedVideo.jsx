import CookingInsights from './CookingInsights.jsx';
import { useEffect, useRef, useState } from 'react';
import { workApi } from '../api/workflows.js';
import { useJobProgress } from '../hooks/useJobProgress.js';
import JobProgressBar from './JobProgressBar.jsx';
const TAG = {vi:'vi-VN',en:'en-US',zh:'zh-CN'};
export default function SavedVideo({video, onClose}) {
  const [url,setUrl] = useState('');
  const [renderedUrl,setRenderedUrl] = useState('');
  const [selectedRender,setSelectedRender] = useState('');
  const [renderMessage,setRenderMessage] = useState('');
  const {jobId,progress, error:jobError, start:enqueueJob, resume:resumeJob, isRunning} = useJobProgress();
  const [data,setData] = useState(null);
  const [insights,setInsights]=useState(null);
  const [autoLanguage,setAutoLanguage]=useState(false);
  const [error,setError] = useState('');
  const [language,setLanguage] = useState('vi');
  const [time,setTime] = useState(0);
  const [voice,setVoice] = useState(false);
  const [speed,setSpeed] = useState(1);
  const player = useRef(null);
  const last = useRef(-1);
  useEffect(() => {
    let active = true, objectUrl;
    Promise.all([workApi.downloadVideo(video.id),workApi.videoResults(video.id)]).then(([blob,results]) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);setUrl(objectUrl);setData(results);
      setLanguage(results.subtitles?.[0]?.language || 'vi');
    }).catch(() => { if(active) setError('Không mở được video hoặc kết quả đã lưu.'); });
    return () => { active=false; if(objectUrl) URL.revokeObjectURL(objectUrl); window.speechSynthesis?.cancel(); };
  },[video.id]);
  useEffect(() => () => { if(renderedUrl) URL.revokeObjectURL(renderedUrl); },[renderedUrl]);
  useEffect(() => { resumeJob(video.id); }, [video.id,resumeJob]);
  useEffect(()=>{
    let active=true;
    if(progress?.status==='completed') {
      Promise.all([workApi.videoResults(video.id),workApi.videoInsights(video.id)])
        .then(([results,info])=>{if(active){setData(results);setInsights(info);}})
        .catch(()=>{if(active)setRenderMessage('Không tải được kết quả mới. Vui lòng mở lại video.');});
    }
    return ()=>{active=false;};
  },[video.id,progress?.status]);
  useEffect(()=>{
    let active=true;workApi.videoInsights(video.id).then(info=>{if(active)setInsights(info);}).catch(()=>{});
    return ()=>{active=false;};
  },[video.id]);
  async function createNarrations() {
    setRenderMessage('');
    try { await enqueueJob(video.id, ['vi','en','zh'],['mp3','mp4','srt','vtt'],{sourceLanguage:autoLanguage?'auto':video.originalLanguage}); }
    catch(err) { setRenderMessage('Không thể tạo công việc: '+err.message); }
  }
  async function loadRendered(language,format='mp4') {
    try {
      setRenderMessage('');
      const blob=await workApi.downloadProcessedFile(jobId,language,format);
      if(format!=='mp4'||language==='multi') {
        const address=URL.createObjectURL(blob);
        const a=document.createElement('a');a.href=address;a.download=`dubchef-${video.id}-${language}.${format}`;a.click();
        setTimeout(()=>URL.revokeObjectURL(address),3000);return;
      }
      const address=URL.createObjectURL(blob);setRenderedUrl(address);
      setSelectedRender(language);if(language!=='multi')setLanguage(language);setVoice(false);stop();
    } catch(err) { setRenderMessage('Không mở được bản xuất: '+err.message); }
  }
  const rows = kind => {
    try { return JSON.parse(data?.[kind]?.find(x => x.language===language)?.content || '[]'); }
    catch { return []; }
  };
  const subtitles = rows('subtitles');
  const narrations = rows('narrations');
  const indexAt = (lines,t) => lines.findIndex((x,i) => {
    const d=player.current?.duration || lines.length*3;
    const start=x.start ?? i*d/lines.length, end=x.end ?? (i+1)*d/lines.length;
    return t>=start && t<end;
  });
  const idx=indexAt(subtitles,time);
  function update() {
    const v=player.current;if(!v) return;
    setTime(v.currentTime);
    const n=indexAt(narrations,v.currentTime);
    if(n!==last.current) {
      last.current=n;
      if(voice && n>=0 && window.speechSynthesis && window.SpeechSynthesisUtterance) {
        window.speechSynthesis.cancel();
        const u=new SpeechSynthesisUtterance(narrations[n].text);u.lang=TAG[language] || language;u.rate=speed;
        window.speechSynthesis.speak(u);
      }
    }
  }
  function stop() { window.speechSynthesis?.cancel();last.current=-1; }
  return <section className="panel" aria-label="Video và kết quả đã lưu">
    <div className="panel-head"><h2>{video.title}</h2><button className="btn btn-sm" onClick={onClose}>Đóng video</button></div>
    {error ? <p role="alert">{error}</p> : !url ? <p>Đang tải video…</p> : <>
      <video ref={player} src={renderedUrl || url} controls muted={voice && !renderedUrl} style={{width:'100%',maxHeight:420}}
        onTimeUpdate={update} onPause={stop} onSeeked={stop} onEnded={stop} onPlay={() => {last.current=-1;update();}} />
      <p aria-live="off">{idx>=0 ? subtitles[idx].text : ' '}</p>
      <label>Ngôn ngữ <select value={language} onChange={e => {
        const next=e.target.value;stop();setLanguage(next);
        if(renderedUrl) {
          if(progress?.assets?.some(a=>a.language===next&&a.format==='mp4')) loadRendered(next,'mp4');
          else {setRenderedUrl('');setSelectedRender('');}
        }
      }}>
        {data?.subtitles?.map(x => <option key={x.language} value={x.language}>{x.language}</option>)}
      </select></label>
      <label><input type="checkbox" checked={voice} onChange={e => {stop();setVoice(e.target.checked);}} /> Đọc thuyết minh</label>
      <label>Tốc độ <select value={speed} onChange={e => {const n=Number(e.target.value);setSpeed(n);if(player.current) player.current.playbackRate=n;stop();}}>
        {[0.8,1,1.25].map(n=><option key={n} value={n}>{n}×</option>)}
      </select></label>
      <div style={{marginTop:16}}>
        {!data?.narrations?.length && <label><input type="checkbox" checked={autoLanguage} onChange={e=>setAutoLanguage(e.target.checked)} />Tự nhận diện ngôn ngữ nguồn</label>}
        <button className="btn btn-sm" type="button" disabled={isRunning} onClick={createNarrations}>
          {isRunning?'Đang xử lý…':'Xử lý video → MP3/MP4 và phụ đề'}
        </button>
        <JobProgressBar progress={progress} error={jobError||renderMessage} onRetry={createNarrations}/>
        {progress?.assets?.length>0 && <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:8}}>
          {renderedUrl && <button type="button" className="btn btn-sm" onClick={()=>{setRenderedUrl('');setSelectedRender('');stop();}}>Phát video gốc</button>}
          {progress.assets.map(asset=><button type="button" className="btn btn-sm"
            key={`${asset.language}-${asset.format}`}
            onClick={()=>loadRendered(asset.language,asset.format)}>
            {asset.language==='multi'?'Tải MP4 nhiều audio track':asset.format==='mp4'?`Phát ${asset.language.toUpperCase()} MP4`:`Tải ${asset.language.toUpperCase()} ${asset.format.toUpperCase()}`}
          </button>)}
        </div>}
        {selectedRender && <p className="fine">Đang phát bản MP4 đã lồng tiếng: {selectedRender.toUpperCase()}</p>}
      </div>
      <CookingInsights data={insights} />
      <p className="fine">Giọng đọc trực tiếp sử dụng tiếng nói có sẵn trên thiết bị. MP3/MP4 tạo trong hàng đợi được lưu trong Docker và chỉ tài khoản sở hữu được tải.</p>
    </>}
  </section>;
}
