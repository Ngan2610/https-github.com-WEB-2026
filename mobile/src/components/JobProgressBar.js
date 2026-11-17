import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

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
    <View style={[styles.box, isFailed && styles.boxFail, isDone && styles.boxDone]}>
      <View style={styles.row}>
        <Text style={[styles.label, isFailed && styles.textFail, isDone && styles.textDone]}>
          {isFailed ? 'Xử lý thất bại' : isDone ? 'Xử lý xong' : label}
        </Text>
        <Text style={styles.percent}>{percent}%</Text>
      </View>

      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${percent}%` },
            isFailed && styles.fillFail,
            isDone && styles.fillDone,
          ]}
        />
      </View>

      {progress?.message && !isDone ? (
        <Text style={styles.msg}>{progress.message}</Text>
      ) : null}

      {isFailed ? (
        <View style={styles.retryRow}>
          <Text style={styles.textFail}>{error || progress?.failedReason || 'Có lỗi xảy ra'}</Text>
          {onRetry ? (
            <Pressable onPress={onRetry} style={styles.retryBtn}>
              <Text style={styles.retryText}>Thử lại</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginVertical: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  boxFail: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  boxDone: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontWeight: '600', color: '#0f172a', fontSize: 14 },
  textFail: { color: '#b91c1c' },
  textDone: { color: '#15803d' },
  percent: { color: '#64748b', fontSize: 13 },
  track: { height: 8, borderRadius: 999, backgroundColor: '#e2e8f0', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999, backgroundColor: '#3b82f6' },
  fillFail: { backgroundColor: '#ef4444' },
  fillDone: { backgroundColor: '#22c55e' },
  msg: { marginTop: 6, fontSize: 12, color: '#64748b' },
  retryRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  retryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: '#fff',
  },
  retryText: { fontSize: 13, color: '#b91c1c' },
});
