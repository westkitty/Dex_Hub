import type { Card as CardType } from "../lib/api";
import clsx from "clsx";

interface CardProps {
    card: CardType;
}

export function Card({ card }: CardProps) {
    return (
        <div className="bg-[#1e293b] border border-white/5 rounded-lg p-4 shadow-sm hover:border-accent-primary/30 transition-colors">
            <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-white">{card.title}</h3>
                <span
                    className={clsx(
                        "text-xs px-2 py-0.5 rounded-full border",
                        card.priority >= 3
                            ? "bg-red-500/10 text-red-400 border-red-500/20"
                            : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                    )}
                >
                    P{card.priority}
                </span>
            </div>
            <p className="text-sm text-gray-400 whitespace-pre-wrap">{card.content}</p>
        </div>
    );
}
