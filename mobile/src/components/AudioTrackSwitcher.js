import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

const LANG_LABEL = { vi: 'VI', en: 'EN', zh: '中文', off: 'Tắt' };

/**
 * Mobile audio track switcher.
 * Khi có URI file thật → dùng expo-av Audio.
 * Không có → fallback expo-speech (như bản cũ).
 */
export default function AudioTrackSwitcher({
  languages = ['vi', 'en', 'zh'],
  currentLang,
  onChangeLang,
  audioUris = {}, // { vi: 'file://...' | 'https://...', ... }
  disabled = false,
}) {
  const hasReal = !!audioUris[currentLang];

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Giọng đọc:</Text>
      <View style={styles.row}>
        {['off', ...languages].map((lang) => {
          const active = currentLang === lang;
          return (
            <Pressable
              key={lang}
              disabled={disabled}
              onPress={() => onChangeLang?.(lang)}
              style={[styles.chip, active && styles.chipActive, disabled && styles.disabled]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {LANG_LABEL[lang] || lang}
                {lang !== 'off' && audioUris[lang] ? ' ●' : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {currentLang !== 'off' && (
        <Text style={styles.hint}>
          {hasReal ? 'Đang dùng file audio thật' : 'Đang dùng giọng máy (expo-speech)'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: 8 },
  title: { fontSize: 13, color: '#64748b', marginBottom: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  chipActive: {
    borderWidth: 2,
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  chipText: { fontSize: 13, color: '#334155' },
  chipTextActive: { color: '#1d4ed8', fontWeight: '600' },
  disabled: { opacity: 0.5 },
  hint: { marginTop: 4, fontSize: 11, color: '#94a3b8' },
});
