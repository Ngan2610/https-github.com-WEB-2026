/**
 * Bộ chọn ngôn ngữ audio track + phụ đề.
 * Khi có file MP3/MP4 thật từ render service → phát bằng <audio>.
 * Fallback: SpeechSynthesis (giọng trình duyệt) như bản cũ.
 */
import { useEffect, useRef, useState } from 'react';

const LANG_LABEL = { vi: 'Tiếng Việt', en: 'English', zh: '中文', off: 'Tắt tiếng' };

export default function AudioTrackSwitcher({
  languages = ['vi', 'en', 'zh'],
  currentLang,
  onChangeLang,
  // Map ngôn ngữ → URL file audio đã render (từ job result hoặc API)
  audioUrls = {},          // { vi: 'https://.../voiceover-vi.mp3', en: '...' }
  // Fallback SpeechSynthesis
  useBrowserTts = true,
  onSpeakSegment: _onSpeakSegment,          // (lang, text) => void  (khi dùng browser TTS)
  disabled = false,
}) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  // Khi đổi ngôn ngữ mà có URL thật → load audio mới
  useEffect(() => {
    const url = audioUrls[currentLang];
    const el = audioRef.current;
    if (!el) return;
    if (url) {
      el.src = url;
      el.load();
      if (playing) el.play().catch(() => {});
    } else {
      el.pause();
      el.removeAttribute('src');
    }
  }, [currentLang, audioUrls, playing]);

  const handleSelect = (lang) => {
    if (disabled) return;
    onChangeLang?.(lang);
  };

  const hasRealAudio = !!audioUrls[currentLang];

  return (
    <div className="audio-track-switcher" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <span style={{ fontSize: 13, color: '#64748b', marginRight: 4 }}>Giọng đọc:</span>
      {['off', ...languages].map((lang) => {
        const active = currentLang === lang;
        return (
          <button
            key={lang}
            type="button"
            disabled={disabled}
            onClick={() => handleSelect(lang)}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: active ? '2px solid #3b82f6' : '1px solid #cbd5e1',
              background: active ? '#eff6ff' : '#fff',
              color: active ? '#1d4ed8' : '#334155',
              fontWeight: active ? 600 : 400,
              fontSize: 13,
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            {LANG_LABEL[lang] || lang}
            {lang !== 'off' && audioUrls[lang] && (
              <span style={{ marginLeft: 4, fontSize: 11, color: '#16a34a' }}>●</span>
            )}
          </button>
        );
      })}

      {/* Audio element ẩn – chỉ dùng khi có file thật */}
      <audio
        ref={audioRef}
        style={{ display: 'none' }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      {currentLang !== 'off' && (
        <span style={{ fontSize: 12, color: '#94a3b8' }}>
          {hasRealAudio ? 'Đang dùng file MP3/MP4 thật' : useBrowserTts ? 'Đang dùng giọng trình duyệt' : 'Chưa có audio'}
        </span>
      )}
    </div>
  );
}
