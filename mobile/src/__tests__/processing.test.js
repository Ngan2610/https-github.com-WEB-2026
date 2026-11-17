import React from 'react';
import {render,fireEvent,waitFor} from '@testing-library/react-native';
import VideoProcessingPanel from '../components/VideoProcessingPanel';
import {downloadProcessingAsset} from '../api/video';
import * as Sharing from 'expo-sharing';
const mockStart=jest.fn();
jest.mock('../context/AuthContext',()=>({useAuth:()=>({user:{token:'private-test-token'}})}));
jest.mock('../hooks/useJobProgress',()=>({useJobProgress:()=>({jobId:'9',progress:{status:'completed',progress:100,assets:[{language:'vi',format:'mp4'},{language:'en',format:'srt'}]},start:mockStart,resume:jest.fn(),isRunning:false})}));
jest.mock('../api/client',()=>({api:{videoInsights:jest.fn().mockResolvedValue({ingredients:[],steps:[],conversions:[{from:'2 cups',to:'480 ml'}],glossary:[]})}}));
jest.mock('../api/video',()=>({downloadProcessingAsset:jest.fn().mockResolvedValue('file:///private-cache/result.mp4')}));
jest.mock('expo-sharing',()=>({isAvailableAsync:jest.fn().mockResolvedValue(true),shareAsync:jest.fn().mockResolvedValue(undefined)}));
jest.mock('expo-av',()=>({Video:'Video'}));
it('downloads protected subtitles with the user token and opens the share sheet',async()=>{
 const screen=render(<VideoProcessingPanel videoId={5}/>);
 fireEvent.press(screen.getByText('Tải EN SRT'));
 await waitFor(()=>expect(Sharing.shareAsync).toHaveBeenCalled());
 expect(downloadProcessingAsset).toHaveBeenCalledWith('private-test-token','9','en','srt');
 expect(await screen.findByText('2 cups → 480 ml')).toBeTruthy();
});
it('enqueues the selected source language and all export formats',async()=>{
 const screen=render(<VideoProcessingPanel videoId={5} originalLanguage="zh"/>);
 fireEvent.press(screen.getByText('Xử lý video đa ngôn ngữ'));
 await waitFor(()=>expect(mockStart).toHaveBeenCalledWith(5,['vi','en','zh'],['mp3','mp4','srt','vtt'],{sourceLanguage:'zh'}));
});
