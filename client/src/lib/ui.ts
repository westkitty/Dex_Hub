import { useEffect, useMemo, useState } from 'react';

export function usePersistentState<T>(
  key: string,
  initial: T | (() => T),
) {
  const [state, setState] = useState<T>(() => {
    const fallback = typeof initial === 'function'
      ? (initial as () => T)()
      : initial;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Storage can fail under private mode/quota pressure.
    }
  }, [key, state]);

  return [state, setState] as const;
}

export function useDebouncedValue<T>(value: T, delayMs: number) {
  if (delayMs <= 0) return value;
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}

export function useNetworkStatus() {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    function onOnline() { setOnline(true); }
    function onOffline() { setOnline(false); }
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return online;
}

export function useStableMap<K extends string, V>(entries: Array<[K, V]>) {
  return useMemo(() => new Map<K, V>(entries), [entries]);
}

export function playFeedback(type: 'success' | 'error' = 'success') {
  const storage = typeof localStorage !== 'undefined' ? localStorage : null;
  const wantsAudio = !!storage && typeof storage.getItem === 'function'
    ? storage.getItem('dexhub_feedback_audio') === 'on'
    : false;
  if (wantsAudio) {
    try {
      const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type === 'success' ? 'sine' : 'triangle';
        osc.frequency.value = type === 'success' ? 780 : 220;
        gain.gain.value = 0.03;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.07);
        setTimeout(() => ctx.close().catch(() => {}), 120);
      }
    } catch {
      // Ignore unsupported audio contexts.
    }
  }

  if ('vibrate' in navigator) {
    navigator.vibrate(type === 'success' ? [12] : [18, 20, 18]);
  }
}
