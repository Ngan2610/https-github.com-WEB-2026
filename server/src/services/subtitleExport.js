/** Deterministic SRT and WebVTT exports preserving source timestamps. */
import { parseNarration } from '../audioExport.js';

function timestamp(seconds, separator) {
  const millis=Math.round(seconds*1000);
  const h=Math.floor(millis/3600000), m=Math.floor((millis%3600000)/60000), s=Math.floor((millis%60000)/1000);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}${separator}${String(millis%1000).padStart(3,'0')}`;
}
export function subtitleText(content, language, format) {
  if (!['srt','vtt'].includes(format)) throw new Error('invalid_subtitle_format');
  const lines=parseNarration(content,language);
  const separator=format==='srt'?',':'.';
  const cues=lines.map((line,index)=>`${format==='srt'?String(index+1)+'\n':''}${timestamp(line.start,separator)} --> ${timestamp(line.end,separator)}\n${line.text.replace(/-->/g,'-- >')}\n`).join('\n');
  return format==='vtt'?`WEBVTT\n\n${cues}`:cues;
}
