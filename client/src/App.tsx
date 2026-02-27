import { useEffect, useState } from "react";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { Card } from "./components/Card";
import { ServersView } from "./components/ServersView";
import { getCards, type Card as CardType } from "./lib/api";

export type View = 'servers' | 'kanban';

function App() {
  const [view, setView]   = useState<View>('servers');
  const [cards, setCards] = useState<CardType[]>([]);

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

  return (
    <div className="flex bg-background text-white h-screen font-sans selection:bg-accent-primary/30 overflow-hidden">
      <Sidebar activeView={view} onViewChange={setView} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {view === 'servers' ? (
          <ServersView />
        ) : (
          <>
            <Header />
            <main className="flex-1 p-6 overflow-auto">
              <div className="max-w-6xl mx-auto">
                <h2 className="text-2xl font-bold mb-6">Omni-View</h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Todo */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-gray-400">To Do</h3>
                      <span className="text-xs bg-white/5 px-2 py-0.5 rounded text-gray-500">
                        {todoCards.length}
                      </span>
                    </div>
                    {todoCards.map((card) => <Card key={card.id} card={card} />)}
                    {todoCards.length === 0 && (
                      <div className="text-sm text-gray-600 italic border border-dashed border-white/5 rounded p-4 text-center">
                        No tasks pending
                      </div>
                    )}
                  </div>

                  {/* Doing */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-gray-400">Doing</h3>
                      <span className="text-xs bg-white/5 px-2 py-0.5 rounded text-gray-500">
                        {doingCards.length}
                      </span>
                    </div>
                    {doingCards.map((card) => <Card key={card.id} card={card} />)}
                  </div>

                  {/* Done */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-gray-400">Done</h3>
                      <span className="text-xs bg-white/5 px-2 py-0.5 rounded text-gray-500">
                        {doneCards.length}
                      </span>
                    </div>
                    {doneCards.map((card) => <Card key={card.id} card={card} />)}
                  </div>
                </div>
              </div>
            </main>
          </>
        )}
      </div>

    </div>
  );
}

export default App;
