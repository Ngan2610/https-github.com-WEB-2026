import * as FileSystem from 'expo-file-system';
import { api, HAS_API, ApiError } from './client';
const BASE = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/,'');
export async function saveMobileVideo(user, file, language, segments) {
  if (!HAS_API || !user?.token) throw new ApiError('net');
  const info = await FileSystem.getInfoAsync(file.uri);
  const size = file.size || info.size;
  if (!Number.isSafeInteger(size) || size<=0 || size>150*1024*1024) throw new ApiError('too_large');
  const mimeType = file.mimeType || (file.name?.endsWith('.webm') ? 'video/webm' : file.name?.endsWith('.mov') ? 'video/quicktime' : 'video/mp4');
  const {video} = await api.createVideo(user.token,{title:file.name || 'Video',fileName:file.name || 'video.mp4',size,mimeType,originalLanguage:language});
  const upload = await FileSystem.uploadAsync(BASE+`/api/videos/${video.id}/file`,file.uri,{
    httpMethod:'PUT',uploadType:FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers:{Authorization:'Bearer '+user.token,'Content-Type':'application/octet-stream'},
  });
  if(upload.status!==201) throw new ApiError('upload_failed');
  if (segments?.length) await api.saveResults(user.token,video.id,segments);
  return video.id;
}

export async function downloadProcessingAsset(token, jobId, language, format) {
  if(!token || !/^[1-9][0-9]*$/.test(String(jobId)) || !['vi','en','zh','multi'].includes(language) || !['mp3','mp4','srt','vtt'].includes(format)) throw new ApiError('invalid');
  const target=FileSystem.cacheDirectory+`dubchef-${jobId}-${language}.${format}`;
  const result=await FileSystem.downloadAsync(BASE+`/api/jobs/${jobId}/download/${language}/${format}`,target,
    {headers:{Authorization:'Bearer '+token}});
  if(result.status!==200) {
    await FileSystem.deleteAsync(target,{idempotent:true}).catch(()=>{});
    throw new ApiError('download_failed');
  }
  return result.uri;
}
