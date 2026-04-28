import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2, Plus, Redo2, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import clsx from 'clsx';
import {
  applyWindowRingSettings,
  getHammerspoonStatus,
  getWindowRingSettings,
  launchHammerspoon,
  type HammerspoonStatus,
  type RingColor,
  type WindowRingSettings,
} from '../lib/servers';
import { playFeedback, usePersistentState } from '../lib/ui';

const DEFAULT_SETTINGS: WindowRingSettings = {
  enabled: true,
  border_width: 6,
  border_padding: 2,
  default_color: { red: 0.85, green: 0.85, blue: 0.85, alpha: 0.95 },
  app_colors: {
    Safari: { red: 0.18, green: 0.62, blue: 0.95, alpha: 0.95 },
    Finder: { red: 0.25, green: 0.72, blue: 0.45, alpha: 0.95 },
    Terminal: { red: 0.15, green: 0.85, blue: 0.35, alpha: 0.95 },
    iTerm2: { red: 0.15, green: 0.85, blue: 0.35, alpha: 0.95 },
    'Visual Studio Code': { red: 0.00, green: 0.48, blue: 1.00, alpha: 0.95 },
    Xcode: { red: 1.00, green: 0.42, blue: 0.10, alpha: 0.95 },
    Slack: { red: 0.67, green: 0.28, blue: 0.74, alpha: 0.95 },
    Arc: { red: 0.90, green: 0.35, blue: 0.24, alpha: 0.95 },
    Chrome: { red: 0.95, green: 0.75, blue: 0.10, alpha: 0.95 },
  },
};

type FlashState = { kind: 'success' | 'error'; message: string } | null;
interface DraftEnvelope {
  settings: WindowRingSettings;
  updatedAt: number;
}

function clampUnit(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return Number(n.toFixed(3));
}

function clampInt(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  const rounded = Math.round(n);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

function colorToCss(color: RingColor): string {
  const r = Math.round(clampUnit(color.red) * 255);
  const g = Math.round(clampUnit(color.green) * 255);
  const b = Math.round(clampUnit(color.blue) * 255);
  return `rgba(${r}, ${g}, ${b}, ${clampUnit(color.alpha)})`;
}

function componentToHex(c: number): string {
  const hex = Math.round(clampUnit(c) * 255).toString(16);
  return hex.length === 1 ? `0${hex}` : hex;
}

function colorToHex(color: RingColor): string {
  return `#${componentToHex(color.red)}${componentToHex(color.green)}${componentToHex(color.blue)}`;
}

function hexToColor(hex: string, alpha: number): RingColor {
  const safe = hex.replace('#', '');
  const normalized = safe.length === 3
    ? safe.split('').map((c) => `${c}${c}`).join('')
    : safe;
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  return {
    red: clampUnit(Number.isNaN(r) ? 0 : r),
    green: clampUnit(Number.isNaN(g) ? 0 : g),
    blue: clampUnit(Number.isNaN(b) ? 0 : b),
    alpha: clampUnit(alpha),
  };
}

function normalizeSettings(input: WindowRingSettings): WindowRingSettings {
  const appColors: Record<string, RingColor> = {};
  for (const [name, color] of Object.entries(input.app_colors ?? {})) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    appColors[trimmed] = {
      red: clampUnit(color.red),
      green: clampUnit(color.green),
      blue: clampUnit(color.blue),
      alpha: clampUnit(color.alpha),
    };
  }

  return {
    enabled: !!input.enabled,
    border_width: clampInt(input.border_width, 1, 24),
    border_padding: clampInt(input.border_padding, 0, 24),
    default_color: {
      red: clampUnit(input.default_color.red),
      green: clampUnit(input.default_color.green),
      blue: clampUnit(input.default_color.blue),
      alpha: clampUnit(input.default_color.alpha),
    },
    app_colors: appColors,
  };
}

function RingColorEditor({
  label,
  color,
  onChange,
}: {
  label: string;
  color: RingColor;
  onChange: (next: RingColor) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-300">{label}</span>
        <span className="inline-flex items-center gap-2">
          <span className="w-5 h-5 rounded border border-white/20" style={{ backgroundColor: colorToCss(color) }} />
          <input
            type="color"
            value={colorToHex(color)}
            onChange={(e) => onChange(hexToColor(e.target.value, color.alpha))}
            className="h-6 w-10 bg-transparent border border-white/10 rounded cursor-pointer"
          />
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <label className="text-[10px] text-gray-500">
          R
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={color.red}
            onChange={(e) => onChange({ ...color, red: clampUnit(Number(e.target.value)) })}
            className="mt-1 w-full env-input"
          />
        </label>
        <label className="text-[10px] text-gray-500">
          G
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={color.green}
            onChange={(e) => onChange({ ...color, green: clampUnit(Number(e.target.value)) })}
            className="mt-1 w-full env-input"
          />
        </label>
        <label className="text-[10px] text-gray-500">
          B
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={color.blue}
            onChange={(e) => onChange({ ...color, blue: clampUnit(Number(e.target.value)) })}
            className="mt-1 w-full env-input"
          />
        </label>
        <label className="text-[10px] text-gray-500">
          A
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={color.alpha}
            onChange={(e) => onChange({ ...color, alpha: clampUnit(Number(e.target.value)) })}
            className="mt-1 w-full env-input"
          />
        </label>
      </div>
    </div>
  );
}

export function SettingsView() {
  const [draftSettings, setDraftSettings] = useState<WindowRingSettings>(DEFAULT_SETTINGS);
  const [persistedDraft, setPersistedDraft] = usePersistentState<DraftEnvelope | null>('dexhub_window_ring_draft', null);
  const [hammerspoonStatus, setHammerspoonStatus] = useState<HammerspoonStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [flash, setFlash] = useState<FlashState>(null);
  const [newAppName, setNewAppName] = useState('');
  const [newAppError, setNewAppError] = useState('');
  const [showGuidance, setShowGuidance] = useState(false);
  const [draftConflict, setDraftConflict] = useState(false);
  const [undoStack, setUndoStack] = useState<WindowRingSettings[]>([]);
  const [redoStack, setRedoStack] = useState<WindowRingSettings[]>([]);
  const [autosaveAt, setAutosaveAt] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  const appRows = useMemo(() => Object.entries(draftSettings.app_colors), [draftSettings.app_colors]);
  const historyBypassRef = useRef(false);
  const previousDraftRef = useRef(draftSettings);
  const initialPersistedDraftRef = useRef(persistedDraft);
  async function refreshStatus() {
    try {
      setHammerspoonStatus(await getHammerspoonStatus());
    } catch {
      setHammerspoonStatus({
        running: false,
        installed: false,
        status: 'Unable to check Hammerspoon status.',
        settings_path: '~/.hammerspoon/dexhub_window_ring_settings.json',
      });
    }
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      setFlash(null);
      try {
        const [settings, status] = await Promise.all([
          getWindowRingSettings(),
          getHammerspoonStatus(),
        ]);
        const normalized = normalizeSettings(settings);
        const localDraft = initialPersistedDraftRef.current;
        const hasLocalDraft = localDraft?.settings
          && JSON.stringify(normalizeSettings(localDraft.settings)) !== JSON.stringify(normalized);
        if (hasLocalDraft) {
          setDraftConflict(true);
        } else {
          setDraftSettings(normalized);
          previousDraftRef.current = normalized;
        }
        setHammerspoonStatus(status);
      } catch {
        setFlash({ kind: 'error', message: 'Failed to load Window Ring settings.' });
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (historyBypassRef.current) {
      historyBypassRef.current = false;
      previousDraftRef.current = draftSettings;
      return;
    }
    const prev = previousDraftRef.current;
    if (JSON.stringify(prev) === JSON.stringify(draftSettings)) return;
    setUndoStack((stack) => [...stack.slice(-39), prev]);
    setRedoStack([]);
    previousDraftRef.current = draftSettings;
    const now = Date.now();
    setPersistedDraft({ settings: draftSettings, updatedAt: now });
    setAutosaveAt(now);
  }, [draftSettings, loading, setPersistedDraft]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 's') {
        e.preventDefault();
        applySettings();
        return;
      }
      if (meta && e.key === 'Enter') {
        e.preventDefault();
        applySettings();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function resolveConflictKeepLocal() {
    if (persistedDraft?.settings) {
      const normalized = normalizeSettings(persistedDraft.settings);
      setDraftSettings(normalized);
      previousDraftRef.current = normalized;
    }
    setDraftConflict(false);
  }

  async function resolveConflictUseStored() {
    try {
      const settings = await getWindowRingSettings();
      const normalized = normalizeSettings(settings);
      historyBypassRef.current = true;
      setDraftSettings(normalized);
      previousDraftRef.current = normalized;
      setPersistedDraft(null);
    } finally {
      setDraftConflict(false);
    }
  }

  function undoDraft() {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const prev = stack[stack.length - 1];
      historyBypassRef.current = true;
      setRedoStack((redo) => [...redo, draftSettings]);
      setDraftSettings(prev);
      return stack.slice(0, -1);
    });
  }

  function redoDraft() {
    setRedoStack((stack) => {
      if (stack.length === 0) return stack;
      const next = stack[stack.length - 1];
      historyBypassRef.current = true;
      setUndoStack((undo) => [...undo, draftSettings]);
      setDraftSettings(next);
      return stack.slice(0, -1);
    });
  }

  function setDefaultColor(next: RingColor) {
    setDraftSettings((prev) => ({ ...prev, default_color: next }));
  }

  function updateAppColor(name: string, next: RingColor) {
    setDraftSettings((prev) => ({
      ...prev,
      app_colors: {
        ...prev.app_colors,
        [name]: next,
      },
    }));
  }

  function renameAppColor(oldName: string, rawName: string) {
    const nextName = rawName.trim();
    if (!nextName || nextName === oldName) return;

    setDraftSettings((prev) => {
      if (prev.app_colors[nextName]) return prev;
      const next = { ...prev.app_colors };
      const color = next[oldName];
      delete next[oldName];
      next[nextName] = color;
      return { ...prev, app_colors: next };
    });
  }

  function removeAppColor(name: string) {
    setDraftSettings((prev) => {
      const next = { ...prev.app_colors };
      delete next[name];
      return { ...prev, app_colors: next };
    });
  }

  function addAppColor() {
    const trimmed = newAppName.trim();
    if (!trimmed) {
      setNewAppError('App name is required.');
      return;
    }
    if (draftSettings.app_colors[trimmed]) {
      setNewAppError(`Mapping "${trimmed}" already exists.`);
      return;
    }

    setDraftSettings((prev) => ({
      ...prev,
      app_colors: {
        ...prev.app_colors,
        [trimmed]: { ...prev.default_color },
      },
    }));
    setNewAppName('');
    setNewAppError('');
    setStatusMessage(`Added mapping for ${trimmed}.`);
  }

  function resetDefaults() {
    historyBypassRef.current = true;
    setDraftSettings(DEFAULT_SETTINGS);
    setUndoStack([]);
    setRedoStack([]);
    setFlash({ kind: 'success', message: 'Window Ring settings reset locally. Apply to persist.' });
    setStatusMessage('Settings reset to defaults.');
  }

  async function applySettings() {
    setApplying(true);
    setFlash(null);
    try {
      const normalized = normalizeSettings(draftSettings);
      const message = await applyWindowRingSettings(normalized);
      setDraftSettings(normalized);
      await refreshStatus();
      setFlash({ kind: 'success', message });
      setStatusMessage(message);
      setPersistedDraft({ settings: normalized, updatedAt: Date.now() });
      playFeedback('success');
    } catch (err) {
      const msg = typeof err === 'string'
        ? err
        : err instanceof Error
        ? err.message
        : 'Apply failed. Check Hammerspoon status.';
      setFlash({ kind: 'error', message: msg });
      await refreshStatus();
      setStatusMessage(msg);
      playFeedback('error');
    } finally {
      setApplying(false);
    }
  }

  async function launchAndRetry() {
    setApplying(true);
    setFlash(null);
    try {
      await launchHammerspoon();
      await new Promise((resolve) => setTimeout(resolve, 800));
      await applySettings();
    } catch (err) {
      const msg = typeof err === 'string'
        ? err
        : err instanceof Error
        ? err.message
        : 'Could not launch Hammerspoon.';
      setFlash({ kind: 'error', message: msg });
      await refreshStatus();
      setApplying(false);
      setStatusMessage(msg);
    }
  }

  if (loading) {
    return (
      <main className="flex-1 p-5 overflow-auto custom-scrollbar">
        <div className="max-w-5xl mx-auto">
          <div className="glass-card p-6 text-sm text-gray-400 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading settings…
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-hidden flex flex-col">
      <div className="px-5 pt-4 border-b border-white/[0.08]">
        <h2 className="text-xl font-bold text-white/85">Settings</h2>
        <div className="mt-3 flex items-center gap-2">
          <button
            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-accent-primary/25 bg-accent-primary/10 text-accent-primary"
            type="button"
          >
            Window Ring
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-white/15 bg-white/5 text-gray-300 hover:bg-white/10"
            onClick={() => setShowGuidance((v) => !v)}
          >
            <Info className="w-3 h-3 inline mr-1" />
            Help
          </button>
          <button
            type="button"
            className="icon-btn w-6 h-6"
            title="Undo draft change"
            onClick={undoDraft}
            disabled={undoStack.length === 0}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className="icon-btn w-6 h-6"
            title="Redo draft change"
            onClick={redoDraft}
            disabled={redoStack.length === 0}
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <span className="ml-auto text-[10px] text-gray-500 tabular-nums">
            {autosaveAt ? `Autosaved ${new Date(autosaveAt).toLocaleTimeString()}` : 'No local draft yet'}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar p-5">
        <div className="max-w-5xl mx-auto space-y-4">
          {draftConflict && (
            <section className="glass-card p-3 text-xs text-amber-200 border-amber-200/20 space-y-2">
              <p>Local draft differs from stored settings.</p>
              <div className="flex items-center gap-2">
                <button type="button" className="btn-action" onClick={resolveConflictKeepLocal}>Resume local draft</button>
                <button type="button" className="btn-action" onClick={resolveConflictUseStored}>Use stored settings</button>
              </div>
            </section>
          )}

          {showGuidance && (
            <section className="glass-card p-3 text-xs text-gray-300 space-y-1">
              <p>Tips: use app names exactly as shown in macOS app switcher. RGBA values are normalized `0..1`.</p>
              <p>Shortcuts: <kbd className="kbd">⌘/Ctrl + S</kbd> save/apply, <kbd className="kbd">⌘ + Enter</kbd> apply.</p>
            </section>
          )}

          <section className="glass-card p-4 md:p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white/90">Window Ring</h3>
                <p className="text-xs text-gray-400">Control Hammerspoon window border overlays from DexHub.</p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-gray-300">
                <input
                  type="checkbox"
                  checked={draftSettings.enabled}
                  onChange={(e) => setDraftSettings((prev) => ({ ...prev, enabled: e.target.checked }))}
                />
                Master Enable
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-gray-300">Border Width</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={1}
                    max={24}
                    step={1}
                    value={draftSettings.border_width}
                    onChange={(e) => setDraftSettings((prev) => ({ ...prev, border_width: clampInt(Number(e.target.value), 1, 24) }))}
                    className="flex-1"
                  />
                  <input
                    type="number"
                    min={1}
                    max={24}
                    step={1}
                    value={draftSettings.border_width}
                    onChange={(e) => setDraftSettings((prev) => ({ ...prev, border_width: clampInt(Number(e.target.value), 1, 24) }))}
                    className="env-input w-16"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-gray-300">Border Padding</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={24}
                    step={1}
                    value={draftSettings.border_padding}
                    onChange={(e) => setDraftSettings((prev) => ({ ...prev, border_padding: clampInt(Number(e.target.value), 0, 24) }))}
                    className="flex-1"
                  />
                  <input
                    type="number"
                    min={0}
                    max={24}
                    step={1}
                    value={draftSettings.border_padding}
                    onChange={(e) => setDraftSettings((prev) => ({ ...prev, border_padding: clampInt(Number(e.target.value), 0, 24) }))}
                    className="env-input w-16"
                  />
                </div>
              </div>
            </div>

            <RingColorEditor
              label="Default Color (RGBA)"
              color={draftSettings.default_color}
              onChange={setDefaultColor}
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Per-App Colors</h4>
                <div className="flex items-center gap-2">
                  <input
                    value={newAppName}
                    onChange={(e) => { setNewAppName(e.target.value); setNewAppError(''); }}
                    placeholder="App name (e.g. Safari)"
                    className="env-input w-44"
                  />
                  <button type="button" className="btn-action" onClick={addAppColor}>
                    <Plus className="w-3 h-3" />
                    Add
                  </button>
                </div>
              </div>
              {newAppError && <p className="text-[11px] text-red-300">{newAppError}</p>}

              <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                {appRows.length === 0 && (
                  <p className="text-xs text-gray-500">No app mappings yet.</p>
                )}
                {appRows.map(([appName, color]) => (
                  <div key={appName} className="rounded-md border border-white/10 bg-white/5 p-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded border border-white/20" style={{ backgroundColor: colorToCss(color) }} />
                      <input
                        defaultValue={appName}
                        onBlur={(e) => renameAppColor(appName, e.target.value)}
                        className="env-input flex-1"
                      />
                      <button
                        type="button"
                        className="icon-btn w-6 h-6 text-red-400"
                        onClick={() => removeAppColor(appName)}
                        title="Remove mapping"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <RingColorEditor
                      label="RGBA"
                      color={color}
                      onChange={(next) => updateAppColor(appName, next)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 flex flex-wrap items-center gap-2">
              <button type="button" className="btn-action" onClick={resetDefaults} disabled={applying}>
                <RotateCcw className="w-3 h-3" />
                Reset to defaults
              </button>
              <button
                type="button"
                className={clsx(
                  'btn-action',
                  'text-accent-primary border-accent-primary/30 bg-accent-primary/10 hover:bg-accent-primary/20',
                )}
                onClick={applySettings}
                disabled={applying}
              >
                {applying ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Save / Apply
              </button>
            </div>
          </section>

          <section className="glass-card p-4 md:p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white/90">Hammerspoon Runtime</h3>
            <div className="text-xs text-gray-400 space-y-1">
              <p>
                Status:{' '}
                <span className={hammerspoonStatus?.running ? 'text-green-400' : 'text-amber-400'}>
                  {hammerspoonStatus?.status ?? 'Unknown'}
                </span>
              </p>
              <p className="break-all">Config mirror: {hammerspoonStatus?.settings_path ?? '~/.hammerspoon/dexhub_window_ring_settings.json'}</p>
            </div>

            {!hammerspoonStatus?.running && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-action text-amber-300 border-amber-300/25 bg-amber-300/10 hover:bg-amber-300/20"
                  onClick={launchAndRetry}
                  disabled={applying}
                >
                  {applying ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Launch / Retry Apply
                </button>
              </div>
            )}
          </section>

          {flash && (
            <div
              className={clsx(
                'glass-card p-3 text-xs flex items-start gap-2',
                flash.kind === 'success' ? 'text-green-300 border-green-300/20' : 'text-red-300 border-red-300/20',
              )}
            >
              {flash.kind === 'success' ? (
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              )}
              <span>{flash.message}</span>
            </div>
          )}

          <div className="sr-only" aria-live="polite">{statusMessage}</div>
        </div>
      </div>
    </main>
  );
}
