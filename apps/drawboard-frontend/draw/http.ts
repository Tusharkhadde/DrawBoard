import { HTTP_BACKEND } from "@/config";
import type { Shape } from "@repo/common/types";

function isValidPoint(value: unknown): value is { x: number; y: number } {
    if (!value || typeof value !== "object") return false;
    const point = value as { x?: unknown; y?: unknown };
    return typeof point.x === "number" && typeof point.y === "number";
}

function normalizeShape(shape: unknown): Shape | null {
    if (!shape || typeof shape !== "object") return null;

    const candidate = shape as Partial<Shape> & { type?: unknown };
    if (typeof candidate.type !== "string") return null;

    if (candidate.type === "pencil") {
        const points = Array.isArray(candidate.points)
            ? candidate.points.filter(isValidPoint)
            : [];

        if (points.length < 2) return null;
        return {
            ...candidate,
            type: "pencil",
            points,
        } as Shape;
    }

    return candidate as Shape;
}

export async function getExistingShapes(roomId: string, signal?: AbortSignal, token?: string | null): Promise<Shape[]> {
        if (roomId === "guest") return [];
        const res = await fetch(`${HTTP_BACKEND}/chats/${roomId}`, { headers: token ? { Authorization: token } : undefined, signal });
        if (!res.ok) throw new Error("Couldn’t load this board. Check the room ID and try again.");
        const data = await res.json();
        const messages: { message: string }[] = data.messages ?? [];

        const shapes: Shape[] = [];
        for (const msg of messages) {
            try {
                const parsed = JSON.parse(msg.message);
                const shape = normalizeShape(parsed.shape);
                if (shape) {
                    shapes.push(shape);
                }
            } catch {
                // skip malformed entries
            }
        }
        return shapes;
}
