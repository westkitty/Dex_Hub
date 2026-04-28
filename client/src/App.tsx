import { useEffect, useState } from "react";
import { Command, Palette, Wifi, WifiOff } from "lucide-react";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { Card } from "./components/Card";
import { ServersView } from "./components/ServersView";
import { SettingsView } from "./components/SettingsView";
import { getCards, type Card as CardType } from "./lib/api";
import { useNetworkStatus, usePersistentState } from "./lib/ui";
import { CommandPalette, type CommandItem } from "./components/CommandPalette";

export type View = 'servers' | 'kanban' | 'settings';
type ThemeName = 'midnight' | 'graphite' | 'aurora';
const THEMES: ThemeName[] = ['midnight', 'graphite', 'aurora'];

function App() {
  const [view,         setView]         = useState<View>('servers');
  const [cards,        setCards]        = useState<CardType[]>([]);
  const [runningCount, setRunningCount] = useState(0);
  const [theme, setTheme] = usePersistentState<ThemeName>('dexhub_theme', 'midnight');
  const [commandOpen, setCommandOpen] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [liveMessage, setLiveMessage] = useState('');
  const online = useNetworkStatus();

  // Only poll cards when the kanban view is active
  useEffect(() => {
    if (view !== 'kanban') return;
    async function loadCards() {
      const data = await getCards();
      setCards(data);
    }
    loadCards();
    const interval = setInterval(loadCards, 5000);
    return () => clearInterval(interval);
  }, [view]);

  const todoCards  = cards.filter((c) => c.status === "todo");
  const doingCards = cards.filter((c) => c.status === "doing");
  const doneCards  = cards.filter((c) => c.status === "done");

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  function cycleTheme() {
    const idx = THEMES.indexOf(theme);
    const next = THEMES[(idx + 1) % THEMES.length];
    setTheme(next);
    setLiveMessage(`Theme switched to ${next}.`);
  }

  function triggerRefresh() {
    setRefreshSignal((n) => n + 1);
    setLiveMessage('Refresh triggered.');
  }

  const commandItems: CommandItem[] = [
    {
      id: 'open-servers',
      title: 'Open Dev Servers',
      subtitle: 'Switch to server control view',
      keywords: ['servers', 'dev', 'home'],
      run: () => setView('servers'),
    },
    {
      id: 'open-kanban',
      title: 'Open Omni-View',
      subtitle: 'Switch to kanban dashboard',
      keywords: ['kanban', 'cards'],
      run: () => setView('kanban'),
    },
    {
      id: 'open-settings',
      title: 'Open Settings',
      subtitle: 'Window Ring and system controls',
      keywords: ['settings', 'window ring'],
      run: () => setView('settings'),
    },
    {
      id: 'refresh-projects',
      title: 'Refresh Projects',
      subtitle: 'Rescan projects from disk',
      keywords: ['refresh', 'rescan'],
      run: () => {
        if (view !== 'servers') setView('servers');
        triggerRefresh();
      },
    },
    {
      id: 'toggle-theme',
      title: 'Cycle Theme',
      subtitle: `Current: ${theme}`,
      keywords: ['theme', 'appearance'],
      run: cycleTheme,
    },
  ];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((v) => !v);
        return;
      }
      if (!meta) return;
      if (e.key === '1') { e.preventDefault(); setView('servers'); }
      if (e.key === '2') { e.preventDefault(); setView('kanban'); }
      if (e.key === '3') { e.preventDefault(); setView('settings'); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex text-white h-screen font-sans selection:bg-accent-primary/30 overflow-hidden app-shell">
      <Sidebar activeView={view} onViewChange={setView} runningCount={runningCount} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="h-9 border-b border-white/[0.07] bg-white/[0.02] px-3 flex items-center gap-2 text-[11px] text-gray-400 flex-shrink-0">
          <button
            type="button"
            className="icon-btn w-6 h-6 text-gray-400"
            title="Open command palette (⌘K)"
            onClick={() => setCommandOpen(true)}
          >
            <Command className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className="icon-btn w-6 h-6 text-gray-400"
            title="Cycle theme"
            onClick={cycleTheme}
          >
            <Palette className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className="text-[10px] px-2 py-1 rounded border border-white/10 hover:border-white/20 hover:bg-white/5 transition-colors"
            onClick={triggerRefresh}
            title="Refresh active project list"
          >
            Refresh
          </button>
          <span className="ml-auto inline-flex items-center gap-1.5">
            {online ? <Wifi className="w-3 h-3 text-green-400" /> : <WifiOff className="w-3 h-3 text-amber-400" />}
            <span>{online ? 'Online' : 'Offline mode'}</span>
          </span>
        </div>

        {view === 'servers' ? (
          <div key="servers" className="flex-1 flex flex-col overflow-hidden animate-fade-in">
            <ServersView onRunningCountChange={setRunningCount} refreshSignal={refreshSignal} />
          </div>
        ) : view === 'settings' ? (
          <div key="settings" className="flex-1 flex flex-col overflow-hidden animate-fade-in">
            <SettingsView />
          </div>
        ) : (
          <div key="kanban" className="flex-1 flex flex-col overflow-hidden animate-fade-in">
            <Header />
            <main className="flex-1 p-5 overflow-auto custom-scrollbar">
              <div className="max-w-6xl mx-auto">
                <h2 className="text-xl font-bold mb-5 text-white/80">Omni-View</h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Todo */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">To Do</h3>
                      <span className="text-xs bg-white/5 px-2 py-0.5 rounded-full text-gray-600">
                        {todoCards.length}
                      </span>
                    </div>
                    {todoCards.map((card) => <Card key={card.id} card={card} />)}
                    {todoCards.length === 0 && (
                      <div className="text-sm text-gray-700 border border-dashed border-white/5 rounded-lg p-4 text-center">
                        No tasks pending
                      </div>
                    )}
                  </div>

                  {/* Doing */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Doing</h3>
                      <span className="text-xs bg-white/5 px-2 py-0.5 rounded-full text-gray-600">
                        {doingCards.length}
                      </span>
                    </div>
                    {doingCards.map((card) => <Card key={card.id} card={card} />)}
                  </div>

                  {/* Done */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Done</h3>
                      <span className="text-xs bg-white/5 px-2 py-0.5 rounded-full text-gray-600">
                        {doneCards.length}
                      </span>
                    </div>
                    {doneCards.map((card) => <Card key={card.id} card={card} />)}
                  </div>
                </div>
              </div>
            </main>
          </div>
        )}
      </div>

      {commandOpen && (
        <CommandPalette
          onClose={() => setCommandOpen(false)}
          commands={commandItems}
        />
      )}

      <div className="sr-only" aria-live="polite">{liveMessage}</div>
    </div>
  );
}

export default App;
