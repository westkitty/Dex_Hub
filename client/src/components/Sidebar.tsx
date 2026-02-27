import { Server, LayoutGrid, Settings } from "lucide-react";
import clsx from "clsx";
import type { View } from "../App";

interface Props {
  activeView: View;
  onViewChange: (v: View) => void;
}

export function Sidebar({ activeView, onViewChange }: Props) {
  const navItems: Array<{
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    view: View | null;
  }> = [
    { icon: Server,     label: "Dev Servers", view: 'servers' },
    { icon: LayoutGrid, label: "Omni-View",   view: 'kanban'  },
    { icon: Settings,   label: "Settings",    view: null      },
  ];

  return (
    <aside className="w-52 border-r border-white/10 bg-[#0a111f]/60 flex flex-col pt-4 flex-shrink-0">
      <div className="px-3 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.label}
            onClick={() => item.view && onViewChange(item.view)}
            disabled={!item.view}
            className={clsx(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium",
              item.view === activeView
                ? "bg-accent-primary/10 text-accent-primary"
                : item.view
                  ? "text-gray-400 hover:bg-white/5 hover:text-white"
                  : "text-gray-600 cursor-not-allowed",
            )}
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            {item.label}
          </button>
        ))}
      </div>
    </aside>
  );
}
