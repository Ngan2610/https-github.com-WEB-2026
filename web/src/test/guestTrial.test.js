import { beforeEach, describe, expect, it } from 'vitest';
import { GUEST_TRIAL_KEY, GUEST_TRIAL_MS, startGuestTrial, guestTrialRemaining } from '../utils/guestTrial.js';

describe('thời hạn khách QR', () => {
  beforeEach(() => localStorage.clear());
  it('chưa quét thì phải đăng nhập', () => expect(guestTrialRemaining()).toBe(0));
  it('hết hạn đúng 60 phút và quét lại không gia hạn', () => {
    const now = 1700000000000;
    startGuestTrial(now);
    expect(guestTrialRemaining(now)).toBe(GUEST_TRIAL_MS);
    expect(guestTrialRemaining(now + GUEST_TRIAL_MS - 1)).toBe(1);
    startGuestTrial(now + GUEST_TRIAL_MS);
    expect(guestTrialRemaining(now + GUEST_TRIAL_MS)).toBe(0);
  });
  it('mốc thời gian không hợp lệ không cấp quyền', () => {
    localStorage.setItem(GUEST_TRIAL_KEY, 'invalid');
    expect(guestTrialRemaining()).toBe(0);
    localStorage.setItem(GUEST_TRIAL_KEY, String(Date.now() + 100000));
    expect(guestTrialRemaining()).toBe(0);
  });
});
