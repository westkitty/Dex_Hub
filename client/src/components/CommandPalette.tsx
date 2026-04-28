import { useEffect, useMemo, useRef, useState } from 'react';
import { Command, CornerDownLeft } from 'lucide-react';
import { useDebouncedValue } from '../lib/ui';

export interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  keywords?: string[];
  run: () => void;
}

interface Props {
  onClose: () => void;
  commands: CommandItem[];
}

export function CommandPalette({ onClose, commands }: Props) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<Element | null>(null);
  const debouncedQuery = useDebouncedValue(query, 90);

  useEffect(() => {
    returnFocusRef.current = document.activeElement;
    const id = setTimeout(() => inputRef.current?.focus(), 10);
    return () => {
      clearTimeout(id);
      if (returnFocusRef.current instanceof HTMLElement) {
      returnFocusRef.current.focus();
      }
    }
  }, []);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => {
      const hay = [c.title, c.subtitle, ...(c.keywords ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [commands, debouncedQuery]);

  const safeActiveIndex = filtered.length === 0 ? 0 : Math.min(activeIndex, filtered.length - 1);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (filtered.length === 0) return;
        setActiveIndex((prev) => (prev + 1) % filtered.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filtered.length === 0) return;
        setActiveIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filtered[safeActiveIndex];
        if (!cmd) return;
        cmd.run();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filtered, onClose, safeActiveIndex]);

  return (
    <div
      className="absolute inset-0 z-[120] bg-black/65 backdrop-blur-sm flex items-start justify-center pt-[10vh]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="glass-card w-full max-w-xl mx-3 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
          <Command className="w-4 h-4 text-accent-primary" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command…"
            className="w-full bg-transparent text-sm text-white/90 placeholder:text-gray-500 focus:outline-none"
            aria-label="Command search"
          />
        </div>

        <div className="max-h-80 overflow-y-auto custom-scrollbar py-1">
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-gray-500">
              No command matches that query.
            </div>
          )}
          {filtered.map((cmd, idx) => {
            const active = idx === safeActiveIndex;
            return (
              <button
                key={cmd.id}
                type="button"
                onClick={() => { cmd.run(); onClose(); }}
                className={`w-full text-left px-3 py-2 transition-colors ${
                  active ? 'bg-accent-primary/15 text-white' : 'text-gray-300 hover:bg-white/8'
                }`}
              >
                <div className="text-sm font-medium">{cmd.title}</div>
                {cmd.subtitle && (
                  <div className="text-[11px] text-gray-500">{cmd.subtitle}</div>
                )}
              </button>
            );
          })}
        </div>

        <div className="px-3 py-1.5 border-t border-white/10 text-[10px] text-gray-500 flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><CornerDownLeft className="w-3 h-3" />Run</span>
          <span>↑ ↓ Navigate</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  );
}
