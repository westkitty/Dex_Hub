import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Tauri core — all invoke() calls are no-ops unless overridden per-test
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));
