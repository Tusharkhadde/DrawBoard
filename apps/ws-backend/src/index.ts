import "./loadEnv";
import { WebSocket, WebSocketServer } from "ws";
import { verifyJwt } from "@repo/backend-common/config";
import { prismaClient } from "@repo/db/client";

const PORT = Number(process.env.PORT) || 8080;
const wss = new WebSocketServer({ port: PORT });

interface ConnectedClient {
    ws: WebSocket;
    userId: string | null;
    isGuest: boolean;
    rooms: Set<string>;
    roomIds: Map<string, number>;
}

const clients: ConnectedClient[] = [];

function findClientByWs(ws: WebSocket): ConnectedClient | undefined {
    return clients.find(c => c.ws === ws);
}

function removeClient(ws: WebSocket) {
    const idx = clients.findIndex(c => c.ws === ws);
    if (idx >= 0) clients.splice(idx, 1);
}

function broadcastToRoom(roomId: string, message: object, excludeWs?: WebSocket) {
    const data = JSON.stringify(message);
    for (const client of clients) {
        if (client.rooms.has(roomId) && client.ws !== excludeWs && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(data);
        }
    }
}

function generateGuestId(): string {
    return `guest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

wss.on("connection", async (ws, request) => {
    const url = request.url ?? "";
    const queryString = url.includes("?") ? url.split("?")[1] ?? "" : "";
    const params = new URLSearchParams(queryString);
    const token = params.get("token") ?? "";
    const isGuest = params.get("guest") === "true";

    let userId: string | null = null;
    let clientIsGuest = false;

    if (isGuest) {
        clientIsGuest = true;
        userId = generateGuestId();
    } else {
        const payload = await verifyJwt(token);
        if (!payload) {
            ws.close(4001, "Unauthorized");
            return;
        }
        userId = payload.userId;
    }

    const client: ConnectedClient = { ws, userId, isGuest: clientIsGuest, rooms: new Set(), roomIds: new Map() };
    clients.push(client);

    ws.on("message", async (raw) => {
        let parsed: Record<string, unknown>;
        try {
            const text = typeof raw === "string" ? raw : raw.toString();
            parsed = JSON.parse(text);
        } catch {
            ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
            return;
        }

        const type = parsed.type;

        if (type === "join_room") {
            const roomId = String(parsed.roomId ?? parsed.room ?? "");
            if (!roomId) {
                ws.send(JSON.stringify({ type: "error", message: "roomId is required" }));
                return;
            }
            const room = await prismaClient.room.findUnique({ where: { publicKey: roomId } });
            if (!room) {
                ws.send(JSON.stringify({ type: "error", message: "Room not found" }));
                return;
            }
            if (!client.isGuest) {
                const allowed = room.adminId === client.userId || !!(await prismaClient.roomAccess.findUnique({ where: { roomId_userId: { roomId: room.id, userId: client.userId! } } }));
                if (!allowed) {
                    const request = await prismaClient.accessRequest.findUnique({ where: { roomId_userId: { roomId: room.id, userId: client.userId! } } });
                    if (!request) await prismaClient.accessRequest.create({ data: { roomId: room.id, userId: client.userId! } });
                    ws.send(JSON.stringify({ type: "access_required", message: "Access requested. Ask the owner to approve you." }));
                    return;
                }
            }
            client.rooms.add(roomId);
            client.roomIds.set(roomId, room.id);
            ws.send(JSON.stringify({ type: "join_room_ack", roomId }));
            return;
        }

        if (type === "leave_room") {
            const roomId = String(parsed.roomId ?? parsed.room ?? "");
            client.rooms.delete(roomId);
            client.roomIds.delete(roomId);
            return;
        }

        if (type === "draw") {
            const roomId = String(parsed.roomId ?? "");
            const shape = parsed.shape;
            if (!roomId || !shape || typeof shape !== "object") {
                ws.send(JSON.stringify({ type: "error", message: "Invalid draw payload" }));
                return;
            }
            const dbRoomId = client.roomIds.get(roomId);
            if (!dbRoomId) return;

            if (!client.isGuest && client.userId) {
                try {
                    await prismaClient.chat.create({
                        data: {
                            roomId: dbRoomId,
                            message: JSON.stringify({ shape }),
                            userId: client.userId,
                        },
                    });
                } catch {
                }
            }

            broadcastToRoom(roomId, { type: "draw", roomId, shape, userId: client.userId }, ws);
            return;
        }

        if (type === "update") {
            const roomId = String(parsed.roomId ?? "");
            const shape = parsed.shape as Record<string, unknown> | null;
            const shapeId = typeof shape === "object" && shape ? String(shape.id ?? "") : "";
            if (!roomId || !shapeId) {
                ws.send(JSON.stringify({ type: "error", message: "Invalid update payload" }));
                return;
            }
            const dbRoomId = client.roomIds.get(roomId);
            if (!dbRoomId) return;

            if (!client.isGuest && client.userId) {
                try {
                    await prismaClient.chat.deleteMany({
                        where: { roomId: dbRoomId, message: { contains: shapeId } },
                    });
                    await prismaClient.chat.create({
                        data: {
                            roomId: dbRoomId,
                            message: JSON.stringify({ shape }),
                            userId: client.userId,
                        },
                    });
                } catch {
                }
            }

            broadcastToRoom(roomId, { type: "update", roomId, shape, userId: client.userId });
            return;
        }

        if (type === "erase") {
            const roomId = String(parsed.roomId ?? "");
            const shapeId = String(parsed.shapeId ?? "");
            if (!roomId || !shapeId) {
                ws.send(JSON.stringify({ type: "error", message: "Invalid erase payload" }));
                return;
            }

            if (!client.isGuest && client.userId) {
                try {
                    await prismaClient.chat.deleteMany({
                        where: { roomId: client.roomIds.get(roomId)!, message: { contains: shapeId } },
                    });
                } catch {
                }
            }

            broadcastToRoom(roomId, { type: "erase", roomId, shapeId, userId: client.userId }, ws);
            return;
        }

        if (type === "sync") {
            const roomId = String(parsed.roomId ?? "");
            const shapes = parsed.shapes;
            if (!roomId || !Array.isArray(shapes)) {
                ws.send(JSON.stringify({ type: "error", message: "Invalid sync payload" }));
                return;
            }
            if (!client.isGuest && client.userId) {
                try {
                    await prismaClient.chat.deleteMany({ where: { roomId: client.roomIds.get(roomId)! } });
                    for (const shape of shapes) {
                        await prismaClient.chat.create({
                            data: { roomId: client.roomIds.get(roomId)!, message: JSON.stringify({ shape }), userId: client.userId },
                        });
                    }
                } catch {
                }
            }
            broadcastToRoom(roomId, { type: "sync", roomId, shapes, userId: client.userId });
            return;
        }

        if (type === "clear") {
            const roomId = String(parsed.roomId ?? "");
            if (!roomId) {
                ws.send(JSON.stringify({ type: "error", message: "roomId is required for clear" }));
                return;
            }
            if (!client.isGuest && client.userId) {
                try {
                    await prismaClient.chat.deleteMany({
                        where: { roomId: client.roomIds.get(roomId)! },
                    });
                } catch {
                }
            }
            broadcastToRoom(roomId, { type: "clear", roomId });
            return;
        }

        if (type === "chat") {
            const roomId = String(parsed.roomId ?? "");
            const message = String(parsed.message ?? "");
            if (!roomId || !message) {
                ws.send(JSON.stringify({ type: "error", message: "Invalid chat payload" }));
                return;
            }

            let userName = "Guest";
            if (!client.isGuest && client.userId) {
                try {
                    const user = await prismaClient.user.findUnique({
                        where: { id: client.userId },
                        select: { name: true },
                    });
                    if (user) userName = user.name;
                    await prismaClient.chat.create({
                        data: {
                            roomId: client.roomIds.get(roomId)!,
                            message,
                            userId: client.userId,
                        },
                    });
                } catch {
                }
            }

            broadcastToRoom(roomId, { type: "chat", roomId, message, userId: client.userId, userName }, ws);
            return;
        }

        ws.send(JSON.stringify({ type: "error", message: `Unknown message type: ${type}` }));
    });

    ws.on("close", () => removeClient(ws));
    ws.on("error", () => removeClient(ws));
});

console.log(`WS backend listening on port ${PORT}`);
