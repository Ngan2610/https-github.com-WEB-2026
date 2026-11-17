/**
 * Thanh tiến độ xử lý video tự động.
 * Dùng cùng với hook useJobProgress.
 */

const STAGE_LABEL = {
  queued: 'Đang chờ trong hàng đợi',
  transcribing: 'Đang nhận giọng nói và ngôn ngữ',
  translating: 'Đang dịch phụ đề',
  rendering: 'Đang tạo giọng thuyết minh',
  completed: 'Hoàn thành',
  failed: 'Thất bại',
  active: 'Đang xử lý',
};

export default function JobProgressBar({ progress, error, onRetry }) {
  if (!progress && !error) return null;

  const percent = Math.max(0, Math.min(100, Number(progress?.progress) || 0));
  const stage = progress?.stage || progress?.status || 'queued';
  const label = STAGE_LABEL[stage] || progress?.message || stage;
  const isFailed = progress?.status === 'failed' || !!error;
  const isDone = progress?.status === 'completed';

  return (
    <div className="job-progress" style={{
      margin: '12px 0',
      padding: '12px 16px',
      borderRadius: 12,
      background: isFailed ? '#fef2f2' : isDone ? '#f0fdf4' : '#f8fafc',
      border: `1px solid ${isFailed ? '#fecaca' : isDone ? '#bbf7d0' : '#e2e8f0'}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
        <span style={{ fontWeight: 600, color: isFailed ? '#b91c1c' : isDone ? '#15803d' : '#0f172a' }}>
          {isFailed ? 'Xử lý thất bại' : isDone ? 'Xử lý xong' : label}
        </span>
        <span style={{ color: '#64748b' }}>{percent}%</span>
      </div>

      <div style={{
        height: 8,
        borderRadius: 999,
        background: '#e2e8f0',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${percent}%`,
          borderRadius: 999,
          background: isFailed ? '#ef4444' : isDone ? '#22c55e' : '#3b82f6',
          transition: 'width 0.4s ease',
        }} />
      </div>

      {progress?.message && !isDone && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
          {progress.message}
        </div>
      )}

      {isFailed && (
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#b91c1c' }}>
            {error || progress?.failedReason || 'Có lỗi xảy ra'}
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              style={{
                fontSize: 13,
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid #fca5a5',
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              Thử lại
            </button>
          )}
        </div>
      )}
    </div>
  );
}
