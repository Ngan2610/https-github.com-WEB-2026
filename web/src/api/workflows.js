import { session, ApiError, HAS_API } from './client.js';

const BASE = (import.meta.env && import.meta.env.VITE_API_URL) || '';
/** API thật được sử dụng khi có backend; không báo lưu thành công nếu chưa có SQL Server. */
export async function request(path, { method = 'GET', body, token, binary = false, headers = {} } = {}) {
  if (!HAS_API) throw new ApiError('net');
  const auth = token || session.load()?.token;
  const response = await fetch(BASE + path, {
    method,
    headers: { ...(auth ? { Authorization: 'Bearer ' + auth } : {}),
      'Content-Type': binary ? 'application/octet-stream' : 'application/json', ...headers },
    body: body == null ? undefined : binary ? body : JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data.code || `HTTP_${response.status}`);
  }
  return response.status === 204 ? { ok: true } : response.json();
}

export const workApi = {
  me: () => request('/api/me'),
  entitlements: () => request('/api/me/entitlements'),
  cancelUnfinishedVideo: id => request(`/api/videos/${id}/cancel`, {method:'POST'}),
  updateProfile: name => request('/api/me', { method: 'PATCH', body: { name } }),
  changePassword: (currentPassword, newPassword) => request('/api/me/password', { method: 'PATCH', body: { currentPassword, newPassword } }),
  videos: () => request('/api/videos'),
  async upload(file, language) {
    if (!file || !file.type.startsWith('video/')) throw new ApiError('invalid');
    // Stable key for one upload attempt. A network retry with the same key
    // must reuse the metadata record instead of spending another upload credit.
    const requestId = crypto.randomUUID();
    const { video } = await request('/api/videos', { method: 'POST', headers: {'X-Idempotency-Key':requestId}, body: {
      title: file.name.replace(/\.[^.]+$/, ''), fileName: file.name,
      size: file.size, mimeType: file.type, originalLanguage: language,
    }});
    try {
      await request(`/api/videos/${video.id}/file`, { method: 'PUT', body: file, binary: true });
    } catch (error) {
      // The upload credit is reserved on metadata creation. Retry this video or
      // cancel the unfinished record under Account to get the credit back.
      throw new ApiError(`upload_incomplete_${video.id}_${error.message}`);
    }
    return video.id;
  },
  saveResults: (videoId, segments, originalLanguage) => request(`/api/videos/${videoId}/results`, { method: 'POST', body: { segments, originalLanguage } }),
  videoInsights: id => request(`/api/videos/${id}/insights`),
  videoResults: id => request(`/api/videos/${id}/results`),
  enqueueProcessing: (videoId, languages=['vi','en','zh'], formats=['mp3','mp4','srt','vtt'], options={}) =>
    request('/api/jobs/process-video', {method:'POST',body:{videoId,languages,formats,...options}}),
  processingStatus: id => request(`/api/jobs/${id}`),
  latestProcessing: videoId => request(`/api/jobs/video/${videoId}/latest`),
  async downloadProcessedFile(id,language,format) {
    if (!['vi','en','zh','multi'].includes(language) || !['mp3','mp4','srt','vtt'].includes(format)) throw new ApiError('invalid');
    const token=session.load()?.token;
    const response=await fetch(BASE+`/api/jobs/${id}/download/${language}/${format}`, {
      headers:{Authorization:`Bearer ${token}`},
    });
    if (!response.ok) { const body=await response.json().catch(()=>({})); throw new ApiError(body.code || `HTTP_${response.status}`); }
    return response.blob();
  },
  async downloadVideo(id) {
    const token = session.load()?.token;
    const response = await fetch(BASE + `/api/videos/${id}/file`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new ApiError('net');
    return response.blob();
  },
  exportOptions: id => request(`/api/videos/${id}/exports`),
  async exportVoiceover(id, language, format) {
    if (!['vi', 'en', 'zh'].includes(language) || !['mp3', 'mp4'].includes(format)) throw new ApiError('invalid');
    const token = session.load()?.token;
    const response = await fetch(BASE + `/api/videos/${id}/export/${language}/${format}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ApiError(error.code || `HTTP_${response.status}`);
    }
    return response.blob();
  },
  languages: () => request('/api/languages'),
  feedback: () => request('/api/feedback'),
  sendFeedback: (message, videoId = null) => request('/api/feedback', { method: 'POST', body: { message, videoId } }),
};
export const manageApi = {
  pricingHistory: () => request('/api/admin/pricing/history'),
  updatePricing: body => request('/api/admin/pricing', {method:'PUT',body}),
  packHistory: () => request('/api/admin/pricing/packs/history'),
  createPack: body => request('/api/admin/pricing/packs', {method:'POST',body}),
  updatePack: (id,body) => request(`/api/admin/pricing/packs/${id}`, {method:'PUT',body}),
  videos: () => request('/api/admin/videos'),
  videoInsights: id => request(`/api/videos/${id}/insights`),
  videoResults: id => request(`/api/admin/videos/${id}/translations`),
  updateVideo: (id, status) => request(`/api/admin/videos/${id}`, { method: 'PATCH', body: { status } }),
  deleteVideo: id => request(`/api/admin/videos/${id}`, { method: 'DELETE' }),
  languages: () => request('/api/admin/languages'),
  addLanguage: data => request('/api/admin/languages', { method: 'POST', body: data }),
  updateLanguage: (code, data) => request(`/api/admin/languages/${code}`, { method: 'PATCH', body: data }),
  feedback: () => request('/api/admin/feedback'),
  updateFeedback: (id, data) => request(`/api/admin/feedback/${id}`, { method: 'PATCH', body: data }),
  mediaIndex: kind => request(`/api/admin/media/${kind}`),
  mediaDetail: (kind,id,language) => request(`/api/admin/media/${kind}/${id}/${language}`),
  mediaHistory: (kind,id,language) => request(`/api/admin/media/${kind}/${id}/${language}/history`),
  saveMedia: (kind,id,language,data) => request(`/api/admin/media/${kind}/${id}/${language}`, {method:'PUT',body:data}),
  feedbackHistory: id => request(`/api/admin/feedback/${id}/history`),
  orders: () => request('/api/admin/orders'),
  orderOwnerCandidates: id => request(`/api/admin/orders/${id}/owner-candidates`),
  linkOrderOwner: (id, data) => request(`/api/admin/orders/${id}/link-owner`, {method:'POST',body:data}),
  entitlements: email => request(`/api/admin/entitlements?email=${encodeURIComponent(email)}`),
  audit: () => request('/api/admin/audit?limit=200'),
};
