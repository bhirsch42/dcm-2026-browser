import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Happy-dom v20 + vitest 4 doesn't wire localStorage onto window in this
// pool, and Node v22 ships an experimental `globalThis.localStorage` that
// returns undefined without --localstorage-file. Polyfill a minimal
// in-memory Storage so the app code (which uses `localStorage` directly)
// runs unchanged in tests.
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
}
const storage = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  writable: true,
  configurable: true,
});
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: storage,
    writable: true,
    configurable: true,
  });
}

// Happy-dom doesn't implement window.confirm/alert. Default to a no-op so
// tests can spy on it; individual tests override via vi.spyOn.
if (typeof window.confirm !== 'function') {
  window.confirm = () => true;
}

beforeEach(() => {
  // Reset URL between tests so window.location.search doesn't bleed.
  window.history.replaceState({}, '', '/');
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});
