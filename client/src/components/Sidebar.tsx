import { useState } from "react";
import { Server, LayoutGrid, Settings, Pin, PinOff } from "lucide-react";
import clsx from "clsx";
import type { View } from "../App";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  activeView: View;
  onViewChange: (v: View) => void;
}

export function Sidebar({ activeView, onViewChange }: Props) {
  const [pinned, setPinned] = useState(false);

  const navItems: Array<{
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    view: View | null;
  }> = [
    { icon: Server,     label: "Dev Servers", view: "servers" },
    { icon: LayoutGrid, label: "Omni-View",   view: "kanban"  },
    { icon: Settings,   label: "Settings",    view: null       },
  ];

  async function togglePin() {
    const next = !pinned;
    setPinned(next);
    try {
      await invoke("set_pin", { pinned: next });
    } catch { /* ignore in browser preview */ }
  }

  return (
    <aside
      data-tauri-drag-region
      className="w-52 border-r border-white/[0.07] bg-white/[0.025] flex flex-col pt-3 pb-2 flex-shrink-0 relative"
    >
      {/* Logo / app name — also a drag handle */}
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
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Pop-out / pin button */}
      <div className="px-2 pt-1.5 border-t border-white/[0.06] mt-1">
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
