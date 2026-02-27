import { useState, useEffect, useRef } from 'react';
import {
  Search, Grid3X3, List, StopCircle, RefreshCw,
  Wifi, WifiOff, Star, Zap, ChevronDown, ChevronUp, ExternalLink,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { ServerCard, type HealthStatus } from './ServerCard';
import {
  type ProjectConfig,
  listProjects,
  getRunningServers,
  stopAllServers,
  getFavoritesFromRust,
  saveFavoritesToRust,
  getTailscaleAddress,
  checkServerHealth,
  refreshProjects,
  startServer,
  stopServer,
  restartServer,
  getServerUrl,
  scanExternalServers,
} from '../lib/servers';

const POLL_MS          = 2000;
const EXT_SCAN_MS      = 8000;
const UNDO_TIMEOUT_MS  = 5000;
const SESSION_SEARCH_KEY = 'dexhub_search';
const LS_COLLAPSED_KEY   = 'dexhub_collapsed_workspaces';
const LS_FAV_ORDER_KEY   = 'dexhub_favorites_order';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Deterministic hue for workspace section headers */
function workspaceHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return Math.abs(hash) % 360;
}

function wsAccentColor(ws: string) {
  if (ws === 'Root') return 'hsl(220, 60%, 65%)';
  const h = workspaceHue(ws);
  return `hsl(${h}, 55%, 62%)`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onRunningCountChange?: (count: number) => void;
}

export function ServersView({ onRunningCountChange }: Props) {
  // ── Core state ──────────────────────────────────────────────────────────────
  const [projects,   setProjects]   = useState<ProjectConfig[]>([]);
  const [running,    setRunning]    = useState<Set<string>>(new Set());
  const [health,     setHealth]     = useState<Record<string, HealthStatus>>({});
  const [favorites,  setFavorites]  = useState<Set<string>>(new Set());
  const [favOrder,   setFavOrder]   = useState<string[]>([]);  // ordered favorites list
  const [search,     setSearch]     = useState<string>(() => {
    // UX #9 — search persists across view switches within a session
    try { return sessionStorage.getItem(SESSION_SEARCH_KEY) ?? ''; } catch { return ''; }
  });
  const [viewMode,   setViewMode]   = useState<'grid' | 'compact'>('grid');
  const [tailscale,  setTailscale]  = useState('');
  const [qrUrl,      setQrUrl]      = useState<string | null>(null);

  // ── Workspace collapse (UX #8) ─────────────────────────────────────────────
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(LS_COLLAPSED_KEY) ?? '[]')); }
    catch { return new Set(); }
  });

  // ── External servers (Feature #9) ─────────────────────────────────────────
  const [externalPorts, setExternalPorts] = useState<number[]>([]);

  // ── Undo stop-all (UX #5) ─────────────────────────────────────────────────
  const [undoPayload, setUndoPayload] = useState<string[] | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Keyboard navigation (UX #10 / Feature #7) ─────────────────────────────
  const [focusedName, setFocusedName] = useState<string | null>(null);

  // ── Drag/drop favorites reorder (UX #4) ───────────────────────────────────
  const dragName = useRef<string | null>(null);

  // ── Stale-closure refs ─────────────────────────────────────────────────────
  const userStartedRef  = useRef<Set<string>>(new Set());
  const prevHealthRef   = useRef<Record<string, HealthStatus>>({});
  const visibleCardsRef = useRef<string[]>([]);   // kept fresh each render for keyboard nav

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([listProjects(), getFavoritesFromRust(), getTailscaleAddress()])
      .then(([ps, favs, ts]) => {
        setProjects(ps);
        setFavorites(new Set(favs));
        // Load favOrder from localStorage (or default to favorites list order)
        try {
          const stored = JSON.parse(localStorage.getItem(LS_FAV_ORDER_KEY) ?? '[]') as string[];
          const valid  = stored.filter(n => favs.includes(n));
          const missing = favs.filter(n => !valid.includes(n));
          setFavOrder([...valid, ...missing]);
        } catch { setFavOrder(favs); }
        setTailscale(ts.trim());
      })
      .catch(() => {});
  }, []);

  // ── Running count passthrough ──────────────────────────────────────────────
  useEffect(() => { onRunningCountChange?.(running.size); }, [running.size, onRunningCountChange]);

  // ── Poll running servers + health ──────────────────────────────────────────
  useEffect(() => {
    async function poll() {
      try {
        const runningList = await getRunningServers();
        const newRunning  = new Set(runningList);
        const healthUpdates: Record<string, HealthStatus> = {};
        await Promise.all(
          runningList.map(async name => {
            const ok = await checkServerHealth(name);
            healthUpdates[name] = ok ? 'healthy' : 'starting';
          }),
        );
        for (const name of Array.from(userStartedRef.current)) {
          if (healthUpdates[name] === 'healthy' && prevHealthRef.current[name] !== 'healthy') {
            getServerUrl(name).then(url => window.open(url, '_blank')).catch(() => {});
            userStartedRef.current.delete(name);
          }
        }
        prevHealthRef.current = { ...healthUpdates };
        setRunning(newRunning);
        setHealth(prev => ({ ...prev, ...healthUpdates }));
      } catch { /* ignore */ }
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, []);

  // ── External server scan (Feature #9) ─────────────────────────────────────
  useEffect(() => {
    async function scan() {
      try { setExternalPorts(await scanExternalServers()); }
      catch { /* ignore */ }
    }
    scan();
    const id = setInterval(scan, EXT_SCAN_MS);
    return () => clearInterval(id);
  }, []);

  // ── Persist search to sessionStorage ──────────────────────────────────────
  useEffect(() => {
    try { sessionStorage.setItem(SESSION_SEARCH_KEY, search); } catch { /* ignore */ }
  }, [search]);

  // ── Persist collapsed workspaces ──────────────────────────────────────────
  useEffect(() => {
    try { localStorage.setItem(LS_COLLAPSED_KEY, JSON.stringify(Array.from(collapsed))); }
    catch { /* ignore */ }
  }, [collapsed]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === 'r') { e.preventDefault(); handleRefresh(); return; }
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('input[placeholder="Search servers…"]')?.focus();
        return;
      }
      // Arrow navigation
      if (!['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) return;
      if (document.activeElement?.tagName === 'INPUT') return;
      e.preventDefault();
      const allCards = getAllVisibleCards();
      if (e.key === 'Escape') { setFocusedName(null); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (allCards.length === 0) return;
        const idx = allCards.indexOf(focusedName ?? '');
        const next = e.key === 'ArrowDown'
          ? (idx + 1) % allCards.length
          : (idx - 1 + allCards.length) % allCards.length;
        setFocusedName(allCards[next]);
        return;
      }
      if (e.key === 'Enter' && focusedName) {
        if (running.has(focusedName)) handleStop(focusedName);
        else handleStart(focusedName);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedName, running]);

  // ── Actions ────────────────────────────────────────────────────────────────
  async function handleRefresh() {
    try { setProjects(await refreshProjects()); } catch { /* ignore */ }
  }

  async function handleStopAll() {
    const prevRunning = Array.from(running);
    if (prevRunning.length === 0) return;
    try {
      await stopAllServers();
      setRunning(new Set());
      // Undo toast
      setUndoPayload(prevRunning);
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setUndoPayload(null), UNDO_TIMEOUT_MS);
    } catch { /* ignore */ }
  }

  async function handleUndoStopAll() {
    if (!undoPayload) return;
    setUndoPayload(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    for (const name of undoPayload) handleStart(name);
  }

  function handleStart(name: string) {
    userStartedRef.current.add(name);
    setRunning(prev => new Set([...prev, name]));
    setHealth(prev => ({ ...prev, [name]: 'starting' }));
    startServer(name).catch(() => {});
  }

  function handleStop(name: string) {
    setRunning(prev => { const n = new Set(prev); n.delete(name); return n; });
    setHealth(prev => ({ ...prev, [name]: 'down' }));
    stopServer(name).catch(() => {});
  }

  function handleRestart(name: string) {
    setHealth(prev => ({ ...prev, [name]: 'starting' }));
    restartServer(name).catch(() => {});
  }

  function handleToggleFavorite(name: string) {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
        setFavOrder(o => o.filter(n => n !== name));
      } else {
        next.add(name);
        setFavOrder(o => [...o, name]);
      }
      saveFavoritesToRust(Array.from(next)).catch(() => {});
      return next;
    });
  }

  function handlePortSaved(name: string, port: number) {
    setProjects(prev => prev.map(p => p.name === name ? { ...p, port } : p));
  }

  function toggleCollapsed(ws: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(ws)) next.delete(ws); else next.add(ws);
      return next;
    });
  }

  // ── Drag-to-reorder favorites (UX #4) ─────────────────────────────────────
  function onDragStart(name: string) { dragName.current = name; }
  function onDragOver(e: React.DragEvent, overName: string) {
    e.preventDefault();
    if (!dragName.current || dragName.current === overName) return;
    setFavOrder(prev => {
      const arr = [...prev];
      const from = arr.indexOf(dragName.current!);
      const to   = arr.indexOf(overName);
      if (from < 0 || to < 0) return prev;
      arr.splice(from, 1);
      arr.splice(to, 0, dragName.current!);
      try { localStorage.setItem(LS_FAV_ORDER_KEY, JSON.stringify(arr)); } catch { /* ignore */ }
      return arr;
    });
  }
  function onDragEnd() { dragName.current = null; }

  // ── Port conflict detection ────────────────────────────────────────────────
  function hasPortConflict(project: ProjectConfig) {
    if (!running.has(project.name)) return false;
    return projects.some(p => p.name !== project.name && running.has(p.name) && p.port === project.port);
  }

  // ── All ports for validation ───────────────────────────────────────────────
  const allPorts = projects.map(p => p.port);

  // ── Derived data ───────────────────────────────────────────────────────────
  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  // Keep visible cards ref fresh for keyboard nav (must be AFTER filtered)
  visibleCardsRef.current = filtered.map(p => p.name);

  // ── Visible cards list (for keyboard nav) — always uses the ref ────────────
  function getAllVisibleCards(): string[] {
    return visibleCardsRef.current;
  }

  // Ordered favorites
  const favProjectsOrdered = favOrder
    .filter(n => favorites.has(n))
    .map(n => filtered.find(p => p.name === n))
    .filter((p): p is ProjectConfig => !!p);

  const nonFavProjects = filtered.filter(p => !favorites.has(p.name));

  // Group by workspace, Root first
  const workspaceMap = new Map<string, ProjectConfig[]>();
  for (const p of nonFavProjects) {
    const ws = p.workspace || 'Root';
    if (!workspaceMap.has(ws)) workspaceMap.set(ws, []);
    workspaceMap.get(ws)!.push(p);
  }
  const workspaceEntries = Array.from(workspaceMap.entries()).sort(([a], [b]) => {
    if (a === 'Root') return -1;
    if (b === 'Root') return 1;
    return a.localeCompare(b);
  });

  // UX #7: sort running servers to top within each workspace section
  const sortedWorkspaceEntries = workspaceEntries.map(([ws, ps]) => [
    ws,
    [...ps].sort((a, b) => {
      const aRun = running.has(a.name) ? 0 : 1;
      const bRun = running.has(b.name) ? 0 : 1;
      if (aRun !== bRun) return aRun - bRun;
      return a.name.localeCompare(b.name);
    }),
  ] as [string, ProjectConfig[]]);

  const isTailscale = tailscale !== '' && tailscale !== 'localhost';
  const gridClass   = viewMode === 'compact' ? 'grid-cols-1' : 'grid-cols-2';

  // ── renderCard helper ──────────────────────────────────────────────────────
  function renderCard(p: ProjectConfig, dragProps?: {
    draggable?: boolean;
    onDragStart?: () => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDragEnd?: () => void;
  }) {
    return (
      <div
        key={p.name}
        className={focusedName === p.name ? 'keyboard-focus' : ''}
        {...dragProps}
      >
        <ServerCard
          project={p}
          running={running.has(p.name)}
          health={health[p.name] ?? 'down'}
          favorite={favorites.has(p.name)}
          compact={viewMode === 'compact'}
          portConflict={hasPortConflict(p)}
          allPorts={allPorts}
          onStart={() => handleStart(p.name)}
          onStop={() => handleStop(p.name)}
          onRestart={() => handleRestart(p.name)}
          onToggleFavorite={() => handleToggleFavorite(p.name)}
          onPortSaved={port => handlePortSaved(p.name, port)}
          onShowQR={setQrUrl}
        />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="servers-watermark flex flex-col h-full overflow-hidden">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-black/20 flex-shrink-0 relative z-10">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            placeholder="Search servers…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-md pl-7 pr-2 py-1.5 text-xs focus:outline-none focus:border-accent-primary/40 placeholder:text-gray-600"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors"
            >
              ×
            </button>
          )}
        </div>
        <button
          onClick={() => setViewMode(v => v === 'grid' ? 'compact' : 'grid')}
          className="icon-btn" title={viewMode === 'grid' ? 'Compact list view' : 'Grid view'}
        >
          {viewMode === 'grid' ? <List className="w-4 h-4" /> : <Grid3X3 className="w-4 h-4" />}
        </button>
        {/* UI #7 — Stop All with destructive glow when servers running */}
        <button
          onClick={handleStopAll}
          disabled={running.size === 0}
          className={`flex items-center gap-1 text-xs px-2 py-1.5 rounded border transition-all
            text-red-400 border-red-500/20 hover:bg-red-500/10
            disabled:opacity-30 disabled:cursor-not-allowed
            ${running.size > 0 ? 'stop-all-active' : ''}`}
          title="Stop all servers"
        >
          <StopCircle className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleRefresh} className="icon-btn" title="Refresh projects (⌘R)">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* ── Tailscale pill (UI #10) ── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5 bg-black/10 flex-shrink-0 relative z-10">
        <div className={`tailscale-pill ${isTailscale ? 'tailscale-pill--on' : 'tailscale-pill--off'}`}>
          {isTailscale
            ? <><Wifi className="w-2.5 h-2.5" /><span className="font-mono truncate max-w-[120px]">{tailscale}</span></>
            : <><WifiOff className="w-2.5 h-2.5" /><span>localhost</span></>
          }
        </div>
        {running.size > 0 && (
          <span className="ml-auto text-[10px] font-medium text-green-400/70">
            {running.size} running
          </span>
        )}
      </div>

      {/* ── Undo toast (UX #5) ── */}
      {undoPayload && (
        <div className="mx-3 mt-2 flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-900 border border-white/10 text-xs animate-slide-up flex-shrink-0 relative z-10">
          <span className="text-gray-400">Stopped {undoPayload.length} server{undoPayload.length !== 1 ? 's' : ''}</span>
          <button
            onClick={handleUndoStopAll}
            className="text-accent-primary hover:text-white font-medium transition-colors"
          >
            Undo
          </button>
        </div>
      )}

      {/* ── Project list ── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar relative z-10">

        {/* UI #8 — Empty state with guidance */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center mt-12 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Zap className="w-6 h-6 text-gray-600" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-gray-500">
                {search ? 'No servers match your search' : 'No projects found'}
              </p>
              <p className="text-xs text-gray-700 max-w-[200px] leading-relaxed">
                {search
                  ? 'Try a different search term'
                  : 'DexHub looks for package.json with a dev script in ~/Projects'}
              </p>
            </div>
            {!search && (
              <button onClick={handleRefresh} className="btn-action text-gray-400 mt-1">
                <RefreshCw className="w-3 h-3" />Refresh
              </button>
            )}
          </div>
        ) : (
          <>
            {/* ── Favorites (UX #4 drag-to-reorder) ── */}
            {favProjectsOrdered.length > 0 && (
              <section>
                <div className="flex items-center gap-1.5 mb-2">
                  <Star className="w-3 h-3 text-amber-400 fill-current" />
                  <span className="text-[10px] font-bold text-amber-400/70 uppercase tracking-widest">
                    Favorites
                  </span>
                  <span className="text-[10px] text-gray-700">{favProjectsOrdered.length}</span>
                </div>
                <div className={`grid ${gridClass} gap-2 animate-cards`}>
                  {favProjectsOrdered.map(p =>
                    renderCard(p, {
                      draggable: true,
                      onDragStart: () => onDragStart(p.name),
                      onDragOver:  (e) => onDragOver(e, p.name),
                      onDragEnd,
                    })
                  )}
                </div>
              </section>
            )}

            {/* ── Workspace sections ── */}
            {sortedWorkspaceEntries.map(([ws, wsProjects]) => {
              const accent = wsAccentColor(ws);
              const isCollapsed = collapsed.has(ws);
              return (
                <section key={ws}>
                  {/* UI #3 — workspace header with accent color */}
                  <button
                    onClick={() => toggleCollapsed(ws)}
                    className="flex items-center gap-2 mb-2 w-full group/ws"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: accent }}
                    />
                    <span
                      className="text-[10px] font-bold uppercase tracking-widest"
                      style={{ color: accent }}
                    >
                      {ws}
                    </span>
                    <span className="text-[10px] text-gray-700">{wsProjects.length}</span>
                    {/* Running count in section */}
                    {wsProjects.filter(p => running.has(p.name)).length > 0 && (
                      <span className="text-[9px] text-green-400/60 ml-0.5">
                        ●{wsProjects.filter(p => running.has(p.name)).length}
                      </span>
                    )}
                    <span className="ml-auto text-gray-700 opacity-0 group-hover/ws:opacity-100 transition-opacity">
                      {isCollapsed
                        ? <ChevronDown className="w-3 h-3" />
                        : <ChevronUp className="w-3 h-3" />}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className={`grid ${gridClass} gap-2 animate-cards`}>
                      {wsProjects.map(p => renderCard(p))}
                    </div>
                  )}
                </section>
              );
            })}

            {/* ── External servers (Feature #9) ── */}
            {(externalPorts?.length ?? 0) > 0 && (
              <section>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
                  <span className="text-[10px] font-bold text-purple-400/70 uppercase tracking-widest">
                    External
                  </span>
                  <span className="text-[10px] text-gray-700">{externalPorts.length}</span>
                </div>
                <div className={`grid ${gridClass} gap-2`}>
                  {externalPorts.map(port => (
                    <div
                      key={port}
                      className="glass-card compact-row flex items-center gap-2 px-2.5 py-1.5"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
                      <span className="text-xs text-gray-400 flex-1">Unknown process</span>
                      <span className="text-[10px] font-mono text-purple-400/70 border border-purple-400/20 rounded px-1.5 py-0.5">
                        :{port}
                      </span>
                      <button
                        onClick={() => window.open(`http://localhost:${port}`, '_blank')}
                        className="compact-action text-gray-400"
                        title="Open"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* ── QR Modal ── */}
      {qrUrl && (
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setQrUrl(null)}
        >
          <div className="glass-card p-5 flex flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
            <div className="bg-white p-3 rounded-xl">
              <QRCodeSVG value={qrUrl} size={160} />
            </div>
            <p className="text-[11px] text-gray-400 font-mono text-center break-all max-w-[220px]">{qrUrl}</p>
            <button onClick={() => setQrUrl(null)} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

