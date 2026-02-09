import { LayoutGrid, Mic, Settings } from "lucide-react";
import clsx from "clsx";

export function Sidebar() {
    const items = [
        { icon: LayoutGrid, label: "Omni-View", active: true },
        { icon: Mic, label: "DexDictate", active: false },
        { icon: Settings, label: "Settings", active: false },
    ];

    return (
        <aside className="w-64 border-r border-white/10 bg-[#0f172a]/50 flex flex-col pt-4">
            <div className="px-3 space-y-1">
                {items.map((item) => (
                    <button
                        key={item.label}
                        className={clsx(
                            "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium",
                            item.active
                                ? "bg-accent-primary/10 text-accent-primary"
                                : "text-gray-400 hover:bg-white/5 hover:text-white"
                        )}
                    >
                        <item.icon className="w-4 h-4" />
                        {item.label}
                    </button>
                ))}
            </div>
        </aside>
    );
}
