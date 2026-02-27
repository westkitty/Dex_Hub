import { useState, useEffect, useRef } from 'react';
import {
  Search, Grid3X3, List, StopCircle, RefreshCw, Wifi, WifiOff, Star,
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
  getServerUrl,
} from '../lib/servers';

const POLL_MS = 2000;

export function ServersView() {
  const [projects, setProjects]   = useState<ProjectConfig[]>([]);
  const [running, setRunning]     = useState<Set<string>>(new Set());
  const [health, setHealth]       = useState<Record<string, HealthStatus>>({});
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [search, setSearch]       = useState('');
  const [viewMode, setViewMode]   = useState<'grid' | 'compact'>('grid');
  const [tailscale, setTailscale] = useState('');
  const [qrUrl, setQrUrl]         = useState<string | null>(null);

  // Refs for stale-closure-free access inside setInterval
  const userStartedRef  = useRef<Set<string>>(new Set());
  const prevHealthRef   = useRef<Record<string, HealthStatus>>({});

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([listProjects(), getFavoritesFromRust(), getTailscaleAddress()])
      .then(([ps, favs, ts]) => {
        setProjects(ps);
        setFavorites(new Set(favs));
        setTailscale(ts.trim());
      })
      .catch(() => { /* ignore */ });
  }, []);

  // ── Poll running servers + health ──────────────────────────────────────────
  useEffect(() => {
    async function poll() {
      try {
        const runningList = await getRunningServers();
        const newRunning  = new Set(runningList);

        // Health check each running server in parallel
        const healthUpdates: Record<string, HealthStatus> = {};
        await Promise.all(
          runningList.map(async name => {
            const ok = await checkServerHealth(name);
            healthUpdates[name] = ok ? 'healthy' : 'starting';
          }),
        );

        // Auto-open browser when user-started server transitions to healthy
        for (const name of Array.from(userStartedRef.current)) {
          if (
            healthUpdates[name] === 'healthy' &&
            prevHealthRef.current[name] !== 'healthy'
          ) {
            getServerUrl(name)
              .then(url => window.open(url, '_blank'))
              .catch(() => { /* ignore */ });
            userStartedRef.current.delete(name);
          }
        }

        // Replace (not merge) so stopped servers don't keep stale 'healthy' entries
        // that would prevent auto-open when the same server is restarted later.
        prevHealthRef.current = { ...healthUpdates };
        setRunning(newRunning);
        setHealth(prev => ({ ...prev, ...healthUpdates }));
      } catch { /* ignore */ }
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, []);

  // ── ⌘R keyboard shortcut ──────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
        e.preventDefault();
        handleRefresh();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ────────────────────────────────────────────────────────────────
  async function handleRefresh() {
    try {
      const ps = await refreshProjects();
      setProjects(ps);
    } catch { /* ignore */ }
  }

  async function handleStopAll() {
    try {
      await stopAllServers();
      setRunning(new Set());
    } catch { /* ignore */ }
  }

  function handleStart(name: string) {
    userStartedRef.current.add(name);
    setRunning(prev => new Set([...prev, name]));
    setHealth(prev => ({ ...prev, [name]: 'starting' }));
    startServer(name).catch(() => { /* ignore */ });
  }

  function handleStop(name: string) {
    setRunning(prev => { const n = new Set(prev); n.delete(name); return n; });
    setHealth(prev => ({ ...prev, [name]: 'down' }));
    stopServer(name).catch(() => { /* ignore */ });
  }

  function handleToggleFavorite(name: string) {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      saveFavoritesToRust(Array.from(next)).catch(() => { /* ignore */ });
      return next;
    });
  }

  function handlePortSaved(name: string, port: number) {
    setProjects(prev => prev.map(p => p.name === name ? { ...p, port } : p));
  }

  // Port conflict: two running servers sharing a port
  function hasPortConflict(project: ProjectConfig) {
    if (!running.has(project.name)) return false;
    return projects.some(
      p => p.name !== project.name && running.has(p.name) && p.port === project.port,
    );
  }

  // ── Derived data ───────────────────────────────────────────────────────────
  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const favProjects    = filtered.filter(p => favorites.has(p.name));
  const nonFavProjects = filtered.filter(p => !favorites.has(p.name));

  // Group non-favourites by workspace; Root first, then alphabetical
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

  const isTailscale = tailscale !== '' && tailscale !== 'localhost';
  const gridClass   = viewMode === 'compact' ? 'grid-cols-1' : 'grid-cols-2';

  function renderCard(p: ProjectConfig) {
    return (
      <ServerCard
        key={p.name}
        project={p}
        running={running.has(p.name)}
        health={health[p.name] ?? 'down'}
        favorite={favorites.has(p.name)}
        compact={viewMode === 'compact'}
        portConflict={hasPortConflict(p)}
        onStart={() => handleStart(p.name)}
        onStop={() => handleStop(p.name)}
        onToggleFavorite={() => handleToggleFavorite(p.name)}
        onPortSaved={port => handlePortSaved(p.name, port)}
        onShowQR={setQrUrl}
      />
    );
  }

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
        </div>
        <button
          onClick={() => setViewMode(v => v === 'grid' ? 'compact' : 'grid')}
          className="icon-btn"
          title={viewMode === 'grid' ? 'Compact list view' : 'Grid view'}
        >
          {viewMode === 'grid'
            ? <List className="w-4 h-4" />
            : <Grid3X3 className="w-4 h-4" />}
        </button>
        <button
          onClick={handleStopAll}
          disabled={running.size === 0}
          className="flex items-center gap-1 text-xs px-2 py-1.5 rounded border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Stop all servers"
        >
          <StopCircle className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleRefresh} className="icon-btn" title="Refresh projects (⌘R)">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* ── Tailscale indicator ── */}
      <div className="flex items-center gap-1.5 px-3 py-1 border-b border-white/5 bg-black/10 flex-shrink-0 relative z-10">
        {isTailscale ? (
          <>
            <Wifi className="w-2.5 h-2.5 text-green-400 flex-shrink-0" />
            <span className="text-[10px] text-gray-400 font-mono truncate">{tailscale}</span>
          </>
        ) : (
          <>
            <WifiOff className="w-2.5 h-2.5 text-gray-600 flex-shrink-0" />
            <span className="text-[10px] text-gray-600">Tailscale offline — using localhost</span>
          </>
        )}
        {running.size > 0 && (
          <span className="text-[10px] text-gray-600 ml-auto">
            {running.size} running
          </span>
        )}
      </div>

      {/* ── Project list ── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-5 custom-scrollbar relative z-10">
        {filtered.length === 0 ? (
          <div className="text-center text-gray-600 text-sm mt-16">
            {search ? 'No servers match your search.' : 'No projects found in ~/Projects.'}
          </div>
        ) : (
          <>
            {/* Favorites */}
            {favProjects.length > 0 && (
              <section>
                <div className="flex items-center gap-1.5 mb-2">
                  <Star className="w-3 h-3 text-amber-400 fill-current" />
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Favorites
                  </span>
                </div>
                <div className={`grid ${gridClass} gap-2`}>
                  {favProjects.map(renderCard)}
                </div>
              </section>
            )}

            {/* Workspace sections */}
            {workspaceEntries.map(([ws, wsProjects]) => (
              <section key={ws}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                    {ws}
                  </span>
                  <span className="text-[10px] text-gray-700">{wsProjects.length}</span>
                </div>
                <div className={`grid ${gridClass} gap-2`}>
                  {wsProjects.map(renderCard)}
                </div>
              </section>
            ))}
          </>
        )}
      </div>

      {/* ── QR Modal ── */}
      {qrUrl && (
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setQrUrl(null)}
        >
          <div
            className="glass-card p-5 flex flex-col items-center gap-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-white p-3 rounded-xl">
              <QRCodeSVG value={qrUrl} size={160} />
            </div>
            <p className="text-[11px] text-gray-400 font-mono text-center break-all max-w-[220px]">
              {qrUrl}
            </p>
            <button
              onClick={() => setQrUrl(null)}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
