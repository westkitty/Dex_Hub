import { useState, useRef, useEffect } from 'react';
import {
  Star, Play, Square, ExternalLink, Copy,
  Terminal, QrCode, Check, AlertCircle,
} from 'lucide-react';
import clsx from 'clsx';
import type { ProjectConfig } from '../lib/servers';
import { openTerminalHere, updateServerPort, getServerUrl } from '../lib/servers';

export type HealthStatus = 'healthy' | 'starting' | 'down';

interface Props {
  project: ProjectConfig;
  running: boolean;
  health: HealthStatus;
  favorite: boolean;
  compact: boolean;
  portConflict?: boolean;
  onStart: () => void;
  onStop: () => void;
  onToggleFavorite: () => void;
  onPortSaved: (port: number) => void;
  onShowQR: (url: string) => void;
}

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

export function ServerCard({
  project, running, health, favorite, compact, portConflict,
  onStart, onStop, onToggleFavorite, onPortSaved, onShowQR,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [editingPort, setEditingPort] = useState(false);
  const [portValue, setPortValue] = useState(String(project.port));
  const portRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPortValue(String(project.port));
  }, [project.port]);

  useEffect(() => {
    if (editingPort) portRef.current?.select();
  }, [editingPort]);

  async function handleCopyUrl() {
    try {
      const url = await getServerUrl(project.name);
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  async function handleOpenBrowser() {
    try {
      const url = await getServerUrl(project.name);
      window.open(url, '_blank');
    } catch { /* ignore */ }
  }

  async function handleShowQR() {
    try {
      const url = await getServerUrl(project.name);
      onShowQR(url);
    } catch { /* ignore */ }
  }

  function commitPort() {
    const p = parseInt(portValue, 10);
    if (!isNaN(p) && p > 0 && p <= 65535 && p !== project.port) {
      onPortSaved(p);
      updateServerPort(project.name, p).catch(() => { /* ignore */ });
    } else {
      setPortValue(String(project.port));
    }
    setEditingPort(false);
  }

  const statusDot = running
    ? health === 'healthy'
      ? 'bg-green-400'
      : health === 'starting'
        ? 'bg-amber-400 animate-status-pulse'
        : 'bg-red-400'
    : 'bg-gray-700';

  // ── Compact row ───────────────────────────────────────────────────────────
  if (compact) {
    return (
      <div className={clsx(
        'glass-card flex items-center gap-2 p-2 transition-all duration-200',
        running && health === 'healthy' && 'ring-1 ring-green-500/25 shadow-md shadow-green-500/10',
      )}>
        {project.icon_data ? (
          <img src={project.icon_data} alt="" className="w-7 h-7 rounded-md object-cover flex-shrink-0" />
        ) : (
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
            style={{ backgroundColor: nameColor(project.name) }}
          >
            {nameInitials(project.name)}
          </div>
        )}
        <div className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', statusDot)} />
        <span className="text-xs font-medium truncate flex-1">{project.name}</span>
        <span className="text-[10px] font-mono text-gray-500 flex-shrink-0">:{project.port}</span>
        <button
          onClick={running ? onStop : onStart}
          className={clsx(
            'flex-shrink-0 w-6 h-6 rounded flex items-center justify-center transition-colors',
            running ? 'text-red-400 hover:bg-red-500/10' : 'text-green-400 hover:bg-green-500/10',
          )}
        >
          {running ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
        </button>
      </div>
    );
  }

  // ── Full grid card ────────────────────────────────────────────────────────
  return (
    <div className={clsx(
      'glass-card flex flex-col gap-2.5 p-3 transition-all duration-200',
      running && health === 'healthy' && 'ring-1 ring-green-500/30 shadow-lg shadow-green-500/10',
      running && health === 'starting' && 'ring-1 ring-amber-400/25',
    )}>
      {/* Header: icon + name + workspace + favorite + status */}
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0">
          {project.icon_data ? (
            <img src={project.icon_data} alt="" className="w-9 h-9 rounded-lg object-cover" />
          ) : (
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold text-white"
              style={{ backgroundColor: nameColor(project.name) }}
            >
              {nameInitials(project.name)}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate leading-tight">{project.name}</p>
          <p className="text-[11px] text-gray-500 truncate">{project.workspace}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={onToggleFavorite}
            className={clsx(
              'w-5 h-5 flex items-center justify-center rounded transition-colors',
              favorite ? 'text-amber-400' : 'text-gray-700 hover:text-gray-400',
            )}
          >
            <Star className={clsx('w-3.5 h-3.5', favorite && 'fill-current')} />
          </button>
          <div className={clsx('w-2 h-2 rounded-full', statusDot)} />
        </div>
      </div>

      {/* Port row */}
      <div className="flex items-center gap-1.5">
        {portConflict && running && (
          <span title="Port conflict with another running server">
            <AlertCircle className="w-3 h-3 text-orange-400 flex-shrink-0" />
          </span>
        )}
        {editingPort ? (
          <input
            ref={portRef}
            type="number"
            min="1"
            max="65535"
            value={portValue}
            onChange={e => setPortValue(e.target.value)}
            onBlur={commitPort}
            onKeyDown={e => {
              if (e.key === 'Enter') commitPort();
              if (e.key === 'Escape') { setPortValue(String(project.port)); setEditingPort(false); }
            }}
            className="w-20 text-xs bg-white/10 border border-accent-primary/50 rounded px-1.5 py-0.5 font-mono text-accent-primary focus:outline-none"
          />
        ) : (
          <button
            onClick={() => setEditingPort(true)}
            className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 px-2 py-0.5 rounded font-mono text-accent-primary transition-colors"
            title="Click to edit port"
          >
            :{project.port}
          </button>
        )}
        {running && health === 'starting' && (
          <span className="text-[10px] text-amber-400">Starting…</span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 flex-wrap">
        {running ? (
          <>
            <button onClick={handleOpenBrowser} className="btn-action text-gray-300">
              <ExternalLink className="w-3 h-3" />
              Open
            </button>
            <button onClick={onStop} className="btn-action text-red-400 border-red-500/20 bg-red-500/5 hover:bg-red-500/15">
              <Square className="w-3 h-3" />
              Stop
            </button>
          </>
        ) : (
          <button onClick={onStart} className="btn-action text-green-400 border-green-500/20 bg-green-500/5 hover:bg-green-500/15">
            <Play className="w-3 h-3" />
            Start
          </button>
        )}
        <button
          onClick={handleCopyUrl}
          disabled={!running}
          className={clsx(
            'btn-action',
            running ? 'text-gray-300' : 'text-gray-600 opacity-40 cursor-not-allowed',
          )}
          title="Copy Tailscale URL"
        >
          {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'URL'}
        </button>
        {running && (
          <button onClick={handleShowQR} className="btn-action text-gray-300" title="Show QR code">
            <QrCode className="w-3 h-3" />
            QR
          </button>
        )}
        <button
          onClick={() => openTerminalHere(project.name).catch(() => { /* ignore */ })}
          className="btn-action text-gray-500 ml-auto"
          title="Open Terminal here"
        >
          <Terminal className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
