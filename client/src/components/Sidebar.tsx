import { useState, useEffect } from "react";
import { Server, LayoutGrid, Settings, Pin, PinOff, Power } from "lucide-react";
import clsx from "clsx";
import type { View } from "../App";
import { invoke } from "@tauri-apps/api/core";
import { getAutostartEnabled, setAutostartEnabled } from "../lib/servers";

interface Props {
  activeView:   View;
  onViewChange: (v: View) => void;
  runningCount?: number;          // badge count for Dev Servers nav item (UI #4)
}

export function Sidebar({ activeView, onViewChange, runningCount = 0 }: Props) {
  const [pinned,    setPinned]    = useState(false);
  const [autostart, setAutostart] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);

  // Load autostart state on mount (Feature #6)
  useEffect(() => {
    getAutostartEnabled()
      .then(setAutostart)
      .catch(() => {});
  }, []);

  const navItems: Array<{
    icon:  React.ComponentType<{ className?: string }>;
    label: string;
    view:  View | null;
  }> = [
    { icon: Server,     label: "Dev Servers", view: "servers" },
    { icon: LayoutGrid, label: "Omni-View",   view: "kanban"  },
    { icon: Settings,   label: "Settings",    view: null       },
  ];

  async function togglePin() {
    const next = !pinned;
    setPinned(next);
    try { await invoke("set_pin", { pinned: next }); }
    catch { /* ignore in browser preview */ }
  }

  async function toggleAutostart() {
    setAutoLoading(true);
    const next = !autostart;
    try {
      await setAutostartEnabled(next);
      setAutostart(next);
    } catch { /* ignore */ }
    finally { setAutoLoading(false); }
  }

  return (
    <aside
      data-tauri-drag-region
      className="w-52 border-r border-white/[0.07] bg-white/[0.025] flex flex-col pt-3 pb-2 flex-shrink-0 relative"
    >
      {/* Logo / app name — drag handle */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-2.5 px-4 pb-3 mb-1"
      >
        <img
          src="/DexHub_Icon_Prime.png"
          alt="DexHub"
          className="w-6 h-6 rounded-md object-cover opacity-80 flex-shrink-0 pointer-events-none"
        />
        <span className="text-[13px] font-semibold text-white/60 tracking-tight pointer-events-none">
          DexHub
        </span>
      </div>

      {/* Nav items */}
      <div className="px-2 space-y-0.5 flex-1">
        {navItems.map((item) => {
          const isActive = item.view === activeView;
          return (
            <button
              key={item.label}
              onClick={() => item.view && onViewChange(item.view)}
              disabled={!item.view}
              className={clsx(
                "nav-item w-full flex items-center gap-2.5 px-3 py-2 rounded-lg",
                "text-sm font-medium transition-all duration-150",
                isActive && "active",
                isActive
                  ? "bg-accent-primary/10 text-accent-primary"
                  : item.view
                  ? "text-gray-400 hover:bg-white/[0.06] hover:text-white active:scale-[0.97] active:bg-white/[0.04] active:transition-none"
                  : "text-gray-600 cursor-not-allowed opacity-40",
              )}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>

              {/* UI #4 — running count badge on Dev Servers */}
              {item.view === "servers" && runningCount > 0 && (
                <span className="running-badge">
                  {runningCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom actions */}
      <div className="px-2 pt-1.5 border-t border-white/[0.06] mt-1 space-y-0.5">
        {/* Feature #6 — Launch at login toggle */}
        <button
          onClick={toggleAutostart}
          disabled={autoLoading}
          title={autostart ? "Disable launch at login" : "Launch DexHub at login"}
          className={clsx(
            "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg",
            "text-xs font-medium transition-all duration-150",
            autostart
              ? "text-green-400 bg-green-500/10"
              : "text-gray-600 hover:text-gray-400 hover:bg-white/[0.06]",
          )}
        >
          <Power className={clsx("w-3.5 h-3.5 flex-shrink-0", autoLoading && "animate-spin")} />
          Launch at login
          {autostart && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400" />}
        </button>

        {/* Pin / Pop-out */}
        <button
          onClick={togglePin}
          title={pinned ? "Unpin window" : "Pin window — keep on top"}
          className={clsx(
            "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg",
            "text-xs font-medium transition-all duration-150",
            pinned
              ? "text-accent-primary bg-accent-primary/10 animate-pin-glow"
              : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] active:scale-[0.97] active:transition-none",
          )}
        >
          {pinned
            ? <Pin className="w-3.5 h-3.5 flex-shrink-0 fill-current" />
            : <PinOff className="w-3.5 h-3.5 flex-shrink-0" />}
          {pinned ? "Pinned on top" : "Pop out"}
        </button>
      </div>
    </aside>
  );
}
