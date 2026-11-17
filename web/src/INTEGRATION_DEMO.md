# Cách gắn vào `web/src/pages/Demo.jsx`

## 1. Import thêm

```jsx
import { useJobProgress } from '../hooks/useJobProgress.js';
import JobProgressBar from '../components/JobProgressBar.jsx';
import AudioTrackSwitcher from '../components/AudioTrackSwitcher.jsx';
```

## 2. Trong component Demo()

```jsx
const {
  progress: jobProgress,
  error: jobError,
  start: startJob,
  isRunning: jobRunning,
} = useJobProgress();

// State lưu URL audio thật sau khi job xong
const [audioUrls, setAudioUrls] = useState({}); // { vi: url, en: url, zh: url }
```

## 3. Hàm bắt đầu xử lý tự động (thay / bổ sung nút “Xử lý”)

```jsx
const handleAutoProcess = async () => {
  if (!file || !segments) return;
  // Chuẩn bị narrationByLang từ segments hiện có
  const narrationByLang = {};
  ['vi', 'en', 'zh'].forEach((lang) => {
    const lines = segments
      .filter((s) => s[lang])
      .map((s) => ({ text: s[lang], start: s.start ?? 0, end: s.end ?? 0 }));
    if (lines.length) narrationByLang[lang] = lines;
  });

  try {
    await startJob({
      videoId: /* id video đã upload nếu có */ null,
      languages: ['vi', 'en', 'zh'],
      formats: ['mp3'],
      narrationByLang,
      // sourceVideoPath chỉ cần khi muốn MP4
    });
  } catch (e) {
    console.error(e);
  }
};
```

## 4. Khi job completed → lấy URL audio (nếu API trả về)

```jsx
useEffect(() => {
  if (jobProgress?.status === 'completed' && jobProgress.result?.outputs) {
    // Tùy API của bạn map outputs → URL public
    // Ví dụ giả định:
    // setAudioUrls({ vi: '/uploads/xxx-vi.mp3', en: '...' });
  }
}, [jobProgress]);
```

## 5. Render trong JSX (gần vùng player)

```jsx
{/* Thanh tiến độ */}
<JobProgressBar
  progress={jobProgress}
  error={jobError}
  onRetry={handleAutoProcess}
/>

{/* Bộ chọn ngôn ngữ audio */}
<AudioTrackSwitcher
  languages={['vi', 'en', 'zh']}
  currentLang={voice}
  onChangeLang={setVoice}
  audioUrls={audioUrls}
  useBrowserTts={true}
  disabled={jobRunning}
/>
```

## 6. Nút kích hoạt

```jsx
<button
  type="button"
  disabled={running || jobRunning || !segments}
  onClick={handleAutoProcess}
>
  {jobRunning ? 'Đang xử lý...' : 'Xử lý tự động (Queue)'}
</button>
```
