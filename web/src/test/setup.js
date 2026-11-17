import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import pricing from '../../../tests/fixtures/pricing.json';

vi.mock('../api/workflows.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    request: (path, options) => path === '/api/pricing'
      ? Promise.resolve(pricing)
      : original.request(path, options),
  };
});

// jsdom chưa có các hàm cuộn trang
window.scrollTo = () => {};
Element.prototype.scrollIntoView = () => {};

// jsdom chưa hỗ trợ tạo/huỷ URL tạm cho file (dùng khi người dùng chọn video để xem trước)
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:mock-url';
}
if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = () => {};
}

beforeEach(() => {
  localStorage.clear(); // mỗi bài test bắt đầu với trình duyệt "sạch"
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});
