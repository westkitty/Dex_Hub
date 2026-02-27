import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Star, Play, Square, ExternalLink, Copy,
  Terminal, QrCode, Check, AlertCircle, RotateCcw,
  ChevronDown, ChevronUp, FileText, Settings2, X, Plus, Trash2,
} from 'lucide-react';
import clsx from 'clsx';
import type { ProjectConfig } from '../lib/servers';
import {
  openTerminalHere, updateServerPort, getServerUrl,
  getServerLatency, getServerUptime, getServerLogs,
  getProjectReadme, getEnvOverrides, setEnvOverrides,
  restartServer,
} from '../lib/servers';

export type HealthStatus = 'healthy' | 'starting' | 'down';

interface Props {
  project:   ProjectConfig;
  running:   boolean;
  health:    HealthStatus;
  favorite:  boolean;
  compact:   boolean;
  portConflict?: boolean;
  allPorts?: number[];           // for port-edit conflict detection
  onStart:          () => void;
  onStop:           () => void;
  onRestart:        () => void;
  onToggleFavorite: () => void;
  onPortSaved:      (port: number) => void;
  onShowQR:         (url: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nameColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 45%)`;
}

function nameInitials(name: string) {
  return name
    .replace(/[@/]/g, ' ')
    .split(/[-_ ]/)
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase() ?? '')
    .join('');
}

function formatUptime(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const h = Math.floor(m / 60);
  if (h === 0) return `${m}m`;
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

// ─── Context Menu ─────────────────────────────────────────────────────────────

interface ContextMenuProps {
  x: number; y: number;
  running: boolean;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onOpen: () => void;
  onCopy: () => void;
  onTerminal: () => void;
  onToggleFavorite: () => void;
  favorite: boolean;
  onClose: () => void;
}

function ContextMenu({ x, y, running, onStart, onStop, onRestart, onOpen, onCopy, onTerminal, onToggleFavorite, favorite, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  // Clamp to viewport
  const menuW = 176;
  const menuH = 220;
  const cx = Math.min(x, window.innerWidth  - menuW - 8);
  const cy = Math.min(y, window.innerHeight - menuH - 8);

  const item = (icon: React.ReactNode, label: string, action: () => void, danger = false) => (
    <button
      onClick={() => { action(); onClose(); }}
      className={clsx(
        'w-full flex items-center gap-2.5 px-3 py-1.5 text-xs rounded transition-colors text-left',
        danger ? 'text-red-400 hover:bg-red-500/10' : 'text-gray-300 hover:bg-white/8',
      )}
    >
      {icon}{label}
    </button>
  );

  return (
    <div
      ref={ref}
      className="context-menu fixed z-[999] py-1 rounded-lg min-w-[11rem]"
      style={{ left: cx, top: cy }}
      onContextMenu={e => e.preventDefault()}
    >
      {running
        ? <>
            {item(<ExternalLink className="w-3 h-3" />, 'Open in Browser', onOpen)}
            {item(<Copy className="w-3 h-3" />, 'Copy URL', onCopy)}
            {item(<RotateCcw className="w-3 h-3" />, 'Restart', onRestart)}
            <div className="my-1 border-t border-white/8" />
            {item(<Square className="w-3 h-3" />, 'Stop Server', onStop, true)}
          </>
        : item(<Play className="w-3 h-3 text-green-400" />, 'Start Server', onStart)
      }
      <div className="my-1 border-t border-white/8" />
      {item(<Terminal className="w-3 h-3" />, 'Open Terminal', onTerminal)}
      {item(
        <Star className={clsx('w-3 h-3', favorite && 'fill-current text-amber-400')} />,
        favorite ? 'Remove from Favorites' : 'Add to Favorites',
        onToggleFavorite,
      )}
    </div>
  );
}

// ─── Env Editor ──────────────────────────────────────────────────────────────

function EnvEditor({ name, onClose }: { name: string; onClose: () => void }) {
  const [vars, setVars]     = useState<[string, string][]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getEnvOverrides(name)
      .then(obj => setVars(Object.entries(obj)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [name]);

  function addRow()      { setVars(v => [...v, ['', '']]); }
  function removeRow(i: number) { setVars(v => v.filter((_, idx) => idx !== i)); }
  function setKey(i: number, k: string) { setVars(v => v.map((r, idx) => idx === i ? [k, r[1]] : r)); }
  function setVal(i: number, v2: string) { setVars(v => v.map((r, idx) => idx === i ? [r[0], v2] : r)); }

  async function save() {
    const obj: Record<string, string> = {};
    for (const [k, v] of vars) { if (k.trim()) obj[k.trim()] = v; }
    await setEnvOverrides(name, obj).catch(() => {});
    onClose();
  }

  return (
    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center" onClick={onClose}>
      <div className="glass-card w-72 p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-white/80">Env Variables — {name}</span>
          <button onClick={onClose} className="icon-btn w-5 h-5"><X className="w-3 h-3" /></button>
        </div>
        {loading ? (
          <p className="text-xs text-gray-500">Loading…</p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
            {vars.map(([k, v], i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input value={k} onChange={e => setKey(i, e.target.value)}
                  placeholder="KEY" className="env-input flex-1 min-w-0" />
                <input value={v} onChange={e => setVal(i, e.target.value)}
                  placeholder="value" className="env-input flex-1 min-w-0" />
                <button onClick={() => removeRow(i)} className="icon-btn w-5 h-5 text-red-400">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between pt-1">
          <button onClick={addRow} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors">
            <Plus className="w-3 h-3" />Add
          </button>
          <button onClick={save} className="btn-action text-accent-primary border-accent-primary/30 bg-accent-primary/10 hover:bg-accent-primary/20">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ServerCard({
  project, running, health, favorite, compact, portConflict, allPorts,
  onStart, onStop, onRestart, onToggleFavorite, onPortSaved, onShowQR,
}: Props) {
  const [copied,       setCopied]      = useState(false);
  const [editingPort,  setEditingPort] = useState(false);
  const [portValue,    setPortValue]   = useState(String(project.port));
  const [portError,    setPortError]   = useState('');
  const [showLogs,     setShowLogs]    = useState(false);
  const [logs,         setLogs]        = useState<string[]>([]);
  const [uptime,       setUptime]      = useState<number | null>(null);
  const [latency,      setLatency]     = useState<number | null>(null);
  const [readme,       setReadme]      = useState<string | null | undefined>(undefined);
  const [showReadme,   setShowReadme]  = useState(false);
  const [showEnvEditor,setShowEnvEditor] = useState(false);
  const [contextMenu,  setContextMenu] = useState<{x:number;y:number}|null>(null);
  const [dragging,     setDragging]    = useState(false);

  const portRef  = useRef<HTMLInputElement>(null);
  const logsRef  = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep port input in sync when project changes
  useEffect(() => { setPortValue(String(project.port)); }, [project.port]);
  useEffect(() => { if (editingPort) portRef.current?.select(); }, [editingPort]);

  // Poll uptime + latency while running
  useEffect(() => {
    if (!running) { setUptime(null); setLatency(null); return; }
    let alive = true;
    const poll = async () => {
      if (!alive) return;
      const [u, l] = await Promise.all([
        getServerUptime(project.name).catch(() => null),
        getServerLatency(project.name).catch(() => null),
      ]);
      if (alive) { setUptime(u); setLatency(l); }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => { alive = false; clearInterval(id); };
  }, [running, project.name]);

  // Fetch logs when the drawer opens
  useEffect(() => {
    if (!showLogs) return;
    getServerLogs(project.name).then(setLogs).catch(() => {});
    const id = setInterval(
      () => getServerLogs(project.name).then(setLogs).catch(() => {}),
      1500,
    );
    return () => clearInterval(id);
  }, [showLogs, project.name]);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleCopyUrl() {
    try {
      const url = await getServerUrl(project.name);
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  async function handleOpenBrowser() {
    try { const url = await getServerUrl(project.name); window.open(url, '_blank'); }
    catch { /* ignore */ }
  }

  async function handleShowQR() {
    try { const url = await getServerUrl(project.name); onShowQR(url); }
    catch { /* ignore */ }
  }

  function handleDoubleClick() {
    if (running && health === 'healthy') handleOpenBrowser();
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }

  // ── Port editing ───────────────────────────────────────────────────────────

  function validatePort(raw: string): string {
    const p = parseInt(raw, 10);
    if (isNaN(p) || p < 1 || p > 65535) return 'Must be 1–65535';
    if (p < 1024) return 'System port (<1024)';
    if (allPorts && allPorts.some(existing => existing === p && existing !== project.port)) {
      return 'Used by another project';
    }
    return '';
  }

  function commitPort() {
    const err = validatePort(portValue);
    if (err) {
      // Reset to original value and exit edit mode on invalid input
      setPortValue(String(project.port));
      setPortError('');
      setEditingPort(false);
      return;
    }
    const p = parseInt(portValue, 10);
    if (p !== project.port) {
      onPortSaved(p);
      updateServerPort(project.name, p).catch(() => {});
    }
    setPortError('');
    setEditingPort(false);
  }

  // ── README hover ───────────────────────────────────────────────────────────

  function handleCardMouseEnter() {
    if (readme !== undefined) return; // already fetched (or null)
    hoverTimer.current = setTimeout(async () => {
      try { setReadme(await getProjectReadme(project.name)); }
      catch { setReadme(null); }
    }, 600);
  }

  function handleCardMouseLeave() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setShowReadme(false);
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const statusDot = running
    ? health === 'healthy'   ? 'bg-green-400'
    : health === 'starting'  ? 'bg-amber-400 animate-status-pulse'
    :                          'bg-red-400'
    : 'bg-gray-700';

  const isOverridden = project.port !== project.default_port;

  // ── Compact row ────────────────────────────────────────────────────────────
  if (compact) {
    return (
      <div
        className={clsx(
          'glass-card compact-row flex items-center gap-2 px-2.5 py-1.5 transition-all duration-200',
          running && health === 'healthy' && 'ring-1 ring-green-500/25 shadow-md shadow-green-500/10',
        )}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        draggable={dragging}
      >
        {/* Avatar */}
        {project.icon_data ? (
          <img src={project.icon_data} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0" />
        ) : (
          <div
            className="w-6 h-6 rounded flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
            style={{ backgroundColor: nameColor(project.name) }}
          >
            {nameInitials(project.name)}
          </div>
        )}

        {/* Status dot */}
        <div className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', statusDot)} />

        {/* Name */}
        <span className="text-xs font-medium truncate flex-1 leading-none">{project.name}</span>

        {/* Port */}
        <button
          onClick={() => setEditingPort(true)}
          className={clsx(
            'text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors flex-shrink-0',
            isOverridden
              ? 'text-amber-400 border-amber-500/30 bg-amber-500/5'
              : 'text-gray-500 border-white/8 hover:border-white/20',
          )}
        >
          :{project.port}
        </button>

        {/* Uptime badge */}
        {running && uptime != null && (
          <span className="text-[10px] text-gray-600 flex-shrink-0">↑{formatUptime(uptime)}</span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {running ? (
            <>
              <button onClick={handleOpenBrowser} className="compact-action" title="Open"><ExternalLink className="w-3 h-3" /></button>
              <button onClick={onRestart} className="compact-action text-amber-400" title="Restart"><RotateCcw className="w-3 h-3" /></button>
              <button onClick={onStop} className="compact-action text-red-400" title="Stop"><Square className="w-3 h-3" /></button>
            </>
          ) : (
            <button onClick={onStart} className="compact-action text-green-400" title="Start"><Play className="w-3 h-3" /></button>
          )}
        </div>

        {/* Context menu */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x} y={contextMenu.y}
            running={running} favorite={favorite}
            onStart={onStart} onStop={onStop} onRestart={onRestart}
            onOpen={handleOpenBrowser} onCopy={handleCopyUrl}
            onTerminal={() => openTerminalHere(project.name).catch(() => {})}
            onToggleFavorite={onToggleFavorite}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    );
  }

  // ── Full grid card ─────────────────────────────────────────────────────────
  return (
    <div
      className={clsx(
        'glass-card flex flex-col gap-2 p-3 transition-all duration-200 relative group',
        running && health === 'healthy'  && 'ring-1 ring-green-500/30 shadow-lg shadow-green-500/10',
        running && health === 'starting' && 'ring-1 ring-amber-400/25',
      )}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={handleCardMouseEnter}
      onMouseLeave={handleCardMouseLeave}
    >
      {/* ── Header: icon + name + workspace + favorite + status ── */}
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 relative">
          {project.icon_data ? (
            <img src={project.icon_data} alt="" className="w-8 h-8 rounded-lg object-cover" />
          ) : (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: nameColor(project.name) }}
            >
              {nameInitials(project.name)}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate leading-tight tracking-tight">{project.name}</p>
          <p className="text-[10px] text-gray-600 truncate">{project.workspace}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Uptime badge */}
          {running && uptime != null && (
            <span className="text-[9px] text-gray-600 font-mono">↑{formatUptime(uptime)}</span>
          )}
          {/* Latency badge (healthy only) */}
          {running && health === 'healthy' && latency != null && (
            <span className="text-[9px] text-green-500/70 font-mono">{latency}ms</span>
          )}
          <button
            onClick={onToggleFavorite}
            className={clsx(
              'w-5 h-5 flex items-center justify-center rounded transition-colors',
              favorite ? 'text-amber-400' : 'text-gray-700 hover:text-gray-400',
            )}
          >
            <Star className={clsx('w-3.5 h-3.5', favorite && 'fill-current')} />
          </button>
          <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', statusDot)} />
        </div>
      </div>

      {/* ── Port row ── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {portConflict && running && (
          <span title="Port conflict with another running server">
            <AlertCircle className="w-3 h-3 text-orange-400 flex-shrink-0" />
          </span>
        )}
        {editingPort ? (
          <div className="flex flex-col gap-0.5">
            <input
              ref={portRef}
              type="number" min="1" max="65535"
              value={portValue}
              onChange={e => { setPortValue(e.target.value); setPortError(validatePort(e.target.value)); }}
              onBlur={commitPort}
              onKeyDown={e => {
                if (e.key === 'Enter') commitPort();
                if (e.key === 'Escape') { setPortValue(String(project.port)); setPortError(''); setEditingPort(false); }
              }}
              className="w-24 text-xs bg-white/10 border border-accent-primary/50 rounded px-1.5 py-0.5 font-mono text-accent-primary focus:outline-none"
            />
            {portError && <span className="text-[9px] text-red-400">{portError}</span>}
          </div>
        ) : (
          <button
            onClick={() => setEditingPort(true)}
            title={isOverridden ? `Default: :${project.default_port} (overridden)` : 'Click to edit port'}
            className={clsx(
              'text-xs px-2 py-0.5 rounded border font-mono transition-colors',
              isOverridden
                ? 'text-amber-400 border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10'
                : 'text-accent-primary bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20',
            )}
          >
            :{project.port}
          </button>
        )}
        {/* Extra ports */}
        {project.extra_ports?.map(ep => (
          <span key={ep} className="text-[10px] font-mono text-gray-600 border border-white/8 rounded px-1.5 py-0.5">
            :{ep}
          </span>
        ))}
        {running && health === 'starting' && (
          <span className="text-[10px] text-amber-400">Starting…</span>
        )}
      </div>

      {/* ── Action buttons — primary always visible, secondary on hover ── */}
      <div className="flex items-center gap-1 flex-wrap">
        {/* Primary always-visible actions */}
        {running ? (
          <>
            <button onClick={handleOpenBrowser} className="btn-action text-gray-300">
              <ExternalLink className="w-3 h-3" />Open
            </button>
            <button onClick={onStop} className="btn-action text-red-400 border-red-500/20 bg-red-500/5 hover:bg-red-500/15">
              <Square className="w-3 h-3" />Stop
            </button>
            <button
              onClick={onRestart}
              className="btn-action text-amber-400 border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/15"
              title="Restart server"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </>
        ) : (
          <button onClick={onStart} className="btn-action text-green-400 border-green-500/20 bg-green-500/5 hover:bg-green-500/15">
            <Play className="w-3 h-3" />Start
          </button>
        )}

        {/* Secondary actions — revealed on card hover */}
        <div className="card-actions-secondary flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <button
            onClick={handleCopyUrl}
            disabled={!running}
            className={clsx('btn-action', running ? 'text-gray-300' : 'text-gray-600 opacity-40 cursor-not-allowed')}
            title="Copy Tailscale URL"
          >
            {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'URL'}
          </button>
          {running && (
            <button onClick={handleShowQR} className="btn-action text-gray-300" title="QR code">
              <QrCode className="w-3 h-3" />QR
            </button>
          )}
          <button
            onClick={() => openTerminalHere(project.name).catch(() => {})}
            className="btn-action text-gray-500" title="Open Terminal"
          >
            <Terminal className="w-3 h-3" />
          </button>
        </div>

        {/* Far-right utility buttons */}
        <div className="ml-auto flex items-center gap-0.5">
          {readme != null && (
            <button
              onClick={() => setShowReadme(s => !s)}
              className={clsx('icon-btn w-5 h-5', showReadme && 'text-accent-primary')}
              title="README preview"
            >
              <FileText className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={() => setShowEnvEditor(true)}
            className="icon-btn w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Env variables"
          >
            <Settings2 className="w-3 h-3" />
          </button>
          <button
            onClick={() => setShowLogs(s => !s)}
            className={clsx('icon-btn w-5 h-5', showLogs && 'text-accent-primary')}
            title="Server logs"
          >
            {showLogs ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* ── README preview ── */}
      {showReadme && readme && (
        <div className="log-drawer text-[10px] text-gray-400 leading-relaxed whitespace-pre-wrap font-mono">
          {readme}
        </div>
      )}

      {/* ── Log drawer ── */}
      {showLogs && (
        <div ref={logsRef} className="log-drawer font-mono text-[10px] leading-relaxed overflow-y-auto max-h-32 custom-scrollbar">
          {logs.length === 0
            ? <span className="text-gray-600">No logs yet.</span>
            : logs.map((l, i) => (
                <div key={i} className={clsx('log-line', l.startsWith('[err]') && 'text-red-400/80')}>
                  {l}
                </div>
              ))}
        </div>
      )}

      {/* ── Env editor modal ── */}
      {showEnvEditor && <EnvEditor name={project.name} onClose={() => setShowEnvEditor(false)} />}

      {/* ── Context menu ── */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x} y={contextMenu.y}
          running={running} favorite={favorite}
          onStart={onStart} onStop={onStop} onRestart={onRestart}
          onOpen={handleOpenBrowser} onCopy={handleCopyUrl}
          onTerminal={() => openTerminalHere(project.name).catch(() => {})}
          onToggleFavorite={onToggleFavorite}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
