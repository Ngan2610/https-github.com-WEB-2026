import { describe,it,expect,vi,afterEach } from 'vitest';
import { render,screen,renderHook,act,cleanup } from '@testing-library/react';
import CookingInsights from '../components/CookingInsights.jsx';
import { useJobProgress } from '../hooks/useJobProgress.js';
import {workApi} from '../api/workflows.js';
vi.mock('../api/workflows.js',()=>({workApi:{enqueueProcessing:vi.fn(),processingStatus:vi.fn(),latestProcessing:vi.fn()}}));
afterEach(()=>{cleanup();vi.clearAllMocks();vi.useRealTimers();});
describe('processing output and lifecycle',()=>{
 it('shows source evidence, metric conversion and terminology',()=>{
  render(<CookingInsights data={{note:'Kiểm tra lại công thức',ingredients:[{name:'water',evidence:'2 cups water'}],steps:[{text:'Add water',start:1}],conversions:[{from:'2 cups',to:'480 ml'}],glossary:[{source:'fish sauce',target:'nước mắm',language:'vi'}]}}/>);
  expect(screen.getByText(/2 cups → 480 ml/)).toBeInTheDocument();
  expect(screen.getByText(/fish sauce → nước mắm/)).toBeInTheDocument();
  expect(screen.getByText(/water — 2 cups water/)).toBeInTheDocument();
 });
 it('stops polling immediately for completed jobs',async()=>{
  vi.useFakeTimers();
  workApi.enqueueProcessing.mockResolvedValue({jobId:'9'});
  workApi.processingStatus.mockResolvedValue({job:{id:'9',status:'completed',progress:100,assets:[]}});
  const {result}=renderHook(()=>useJobProgress());
  await act(async()=>{await result.current.start(4);});
  await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});
  expect(workApi.processingStatus).toHaveBeenCalledTimes(1);
  expect(result.current.isRunning).toBe(false);
 });
 it('ignores an old response after the user switches video',async()=>{
  let release;
  workApi.latestProcessing.mockImplementation(id=>id===1?new Promise(resolve=>{release=resolve;}):Promise.resolve({job:{id:'2',status:'completed'}}));
  workApi.processingStatus.mockResolvedValue({job:{id:'2',status:'completed',progress:100}});
  const {result}=renderHook(()=>useJobProgress());
  let old;act(()=>{old=result.current.resume(1);});
  await act(async()=>{await result.current.resume(2);});
  await act(async()=>{release({job:{id:'1',status:'active'}});await old;});
  expect(result.current.jobId).toBe('2');
 });
});
