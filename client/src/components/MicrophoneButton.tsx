import { Mic, MicOff } from "lucide-react";
import { useState } from "react";


export function MicrophoneButton() {
    const [isListening, setIsListening] = useState(false);

    const toggleListening = async () => {
        // Basic toggle logic for UI state
        // In a real implementation with streaming, we'd need more complex state management
        if (!isListening) {
            setIsListening(true);
            // Simulate recording or start listening logic here
            // For now, we just toggle the visual state to show "active"
        } else {
            setIsListening(false);
            // Stop listening logic
        }
    };

    return (
        <button
            onClick={toggleListening}
            className={`fixed bottom-8 right-8 p-4 rounded-full shadow-lg transition-all z-50 ${isListening
                ? "bg-red-500 animate-pulse shadow-red-500/50"
                : "bg-accent-primary hover:bg-accent-primary/90 shadow-accent-primary/40"
                }`}
        >
            {isListening ? (
                <MicOff className="w-6 h-6 text-white" />
            ) : (
                <Mic className="w-6 h-6 text-[#0f172a]" />
            )}
        </button>
    );
}
