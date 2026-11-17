// Thời hạn cố định theo trình duyệt, không gia hạn khi tải lại/quét lại.
export const GUEST_TRIAL_KEY = 'dubchef-guest-trial-start';
export const GUEST_TRIAL_MS = 60 * 60 * 1000;
export function startGuestTrial(now = Date.now()) {
  try {
    if (localStorage.getItem(GUEST_TRIAL_KEY) === null) {
      localStorage.setItem(GUEST_TRIAL_KEY, String(now));
    }
  } catch { /* Không lưu được thì không cấp phiên dùng thử. */ }
}
export function guestTrialRemaining(now = Date.now()) {
  try {
    const raw = localStorage.getItem(GUEST_TRIAL_KEY);
    if (raw === null) return 0;
    const start = Number(raw);
    if (!Number.isFinite(start) || start <= 0 || start > now) return 0;
    return Math.max(0, GUEST_TRIAL_MS - (now - start));
  } catch { return 0; }
}
