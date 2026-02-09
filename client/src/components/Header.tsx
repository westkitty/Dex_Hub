import { Dog } from "lucide-react";

export function Header() {
    return (
        <header className="h-16 border-b border-white/10 flex items-center px-6 bg-[#0f172a]/90 backdrop-blur shrink-0">
            <div className="flex items-center gap-3">
                <Dog className="w-6 h-6 text-accent-secondary" />
                <h1 className="font-bold text-lg tracking-tight">DexHub</h1>
            </div>
            <div className="ml-auto flex items-center gap-4 text-sm text-gray-400">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span>Connected</span>
                </div>
            </div>
        </header>
    );
}
