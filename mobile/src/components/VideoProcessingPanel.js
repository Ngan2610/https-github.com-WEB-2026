import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Video } from 'expo-av';
import * as Sharing from 'expo-sharing';
import { api } from '../api/client';
import { downloadProcessingAsset } from '../api/video';
import { useAuth } from '../context/AuthContext';
import { useJobProgress } from '../hooks/useJobProgress';
import Button from './Button';
import JobProgressBar from './JobProgressBar';

export default function VideoProcessingPanel({videoId, originalLanguage='vi'}) {
  const {user}=useAuth();
  const {jobId,progress,error,start,resume,isRunning}=useJobProgress();
  const [message,setMessage]=useState(''),[uri,setUri]=useState(null),[info,setInfo]=useState(null),[busy,setBusy]=useState(false);
  useEffect(()=>{resume(videoId);},[videoId,resume]);
  useEffect(()=>{
    let active=true;
    api.videoInsights(user?.token,videoId).then(data=>{if(active)setInfo(data);}).catch(()=>{});
    return()=>{active=false;};
  },[user?.token,videoId,progress?.status]);
  async function enqueue() {
    try {setMessage('');await start(videoId,['vi','en','zh'],['mp3','mp4','srt','vtt'],{sourceLanguage:originalLanguage});}
    catch(e){setMessage(e.message);}
  }
  async function download(asset,play=false) {
    if(busy)return;setBusy(true);setMessage('');
    try {
      const path=await downloadProcessingAsset(user.token,jobId,asset.language,asset.format);
      if(play)setUri(path);
      else if(await Sharing.isAvailableAsync())await Sharing.shareAsync(path,{mimeType:asset.format==='mp4'?'video/mp4':asset.format==='mp3'?'audio/mpeg':asset.format==='vtt'?'text/vtt':'application/x-subrip'});
      else setMessage('Thiết bị này không hỗ trợ chia sẻ file.');
    } catch(e){setMessage(e.message);}finally{setBusy(false);}
  }
  return <View style={{gap:10,marginVertical:12}}>
    <Button title="Xử lý video đa ngôn ngữ" onPress={enqueue} disabled={isRunning||busy}/>
    <JobProgressBar progress={progress} error={error||message} onRetry={enqueue}/>
    {uri?<Video source={{uri}} style={{width:'100%',aspectRatio:16/9}} useNativeControls resizeMode="contain"/>:null}
    {progress?.status==='completed'?progress.assets?.map(a=><View key={`${a.language}-${a.format}`}>
      <Button title={`Tải ${a.language.toUpperCase()} ${a.format.toUpperCase()}`} onPress={()=>download(a)} disabled={busy}/>
      {a.format==='mp4'&&a.language!=='multi'?<Button title={`Phát giọng ${a.language.toUpperCase()}`} onPress={()=>download(a,true)} disabled={busy}/>:null}
    </View>):null}
    {info?<View>
      <Text>Nguyên liệu: {info.ingredients?.map(x=>x.name).join(', ')||'Chưa trích được từ lời thoại'}</Text>
      {info.steps?.map((x,i)=><Text key={i}>{i+1}. {x.text}</Text>)}
      {info.conversions?.map((x,i)=><Text key={i}>{x.from} → {x.to}</Text>)}
      {info.glossary?.map((x,i)=><Text key={i}>{x.source} → {x.target} ({x.language})</Text>)}
    </View>:null}
  </View>;
}
