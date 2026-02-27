import { invoke } from "@tauri-apps/api/core";

export interface Card {
    id: string;
    title: string;
    content: string;
    status: "todo" | "doing" | "done";
    priority: number;
}

export async function getCards(): Promise<Card[]> {
    try {
        const json = await invoke<string>("get_cards");
        return JSON.parse(json);
    } catch (e) {
        console.warn("Tauri invoke failed (likely not in Tauri env), returning mock data:", e);
        return [
            { id: "1", title: "Mock Card", content: "This is a test card", status: "todo", priority: 1 },
        ];
    }
}

export async function createCard(title: string, content: string): Promise<string> {
    return invoke("create_card", { title, content });
}

export async function updateCard(id: string, status: string, priority: number): Promise<void> {
    return invoke("update_card", { id, status, priority });
}

export async function deleteCard(id: string): Promise<void> {
    return invoke("delete_card", { id });
}

