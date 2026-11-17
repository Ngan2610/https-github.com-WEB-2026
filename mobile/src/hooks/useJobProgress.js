/** Serialized polling. Generation guards discard responses after switching videos/unmount. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMemo } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
const FINAL = new Set(['completed','failed','cancelled']);
export function useJobProgress() {
  const {user}=useAuth();
  const token=user?.token;
  const workApi=useMemo(()=>({
    processingStatus:id=>api.processingStatus(token,id),
    latestProcessing:id=>api.latestProcessing(token,id),
    enqueueProcessing:(videoId,languages,formats,options)=>api.enqueueProcessing(token,videoId,{languages,formats,...options}),
  }),[token]);
  const [jobId,setJobId]=useState(null), [progress,setProgress]=useState(null), [error,setError]=useState(null);
  const timer=useRef(null), generation=useRef(0);
  const stop=useCallback(()=>{ generation.current++; clearTimeout(timer.current);timer.current=null; },[]);
  const poll=useCallback(async(id,version)=>{
    try {
      const {job}=await workApi.processingStatus(id);
      if(version!==generation.current) return;
      setProgress(job);setError(null);
      if(!FINAL.has(job.status)) timer.current=setTimeout(()=>poll(id,version),2500);
    } catch(err) {
      if(version===generation.current) setError(err.message||'progress_unavailable');
    }
  },[workApi]);
  const resume=useCallback(async(videoId)=>{
    stop();const version=generation.current;
    setError(null);setJobId(null);setProgress(null);
    try {
      const {job}=await workApi.latestProcessing(videoId);
      if(version!==generation.current) return;
      setJobId(job.id);await poll(job.id,version);
    } catch(err) {
      if(version===generation.current && !['job_not_found','HTTP_404'].includes(err.message)) setError(err.message);
    }
  },[stop,workApi,poll]);
  const start=useCallback(async(videoId,languages=['vi','en','zh'],formats=['mp3','mp4','srt','vtt'],options={})=>{
    stop();const version=generation.current;setError(null);setProgress({status:'queued',progress:0});
    try {
      const response=await workApi.enqueueProcessing(videoId,languages,formats,options);
      if(version!==generation.current) return;
      if(!response.jobId) throw new Error('no_job_id');
      setJobId(response.jobId);await poll(response.jobId,version);return response.jobId;
    } catch(err) {
      if(version===generation.current){setError(err.message);setProgress(null);}throw err;
    }
  },[stop,workApi,poll]);
  useEffect(()=>()=>stop(),[stop]);
  return {jobId,progress,error,start,resume,stop,isRunning:Boolean(progress&&!FINAL.has(progress.status))};
}
