import "./loadEnv";
import express from "express";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { middleware } from "./middleware";
import { CreateUserSchema, SigninSchema, CreateRoomSchema, GoogleAuthSchema } from "@repo/common/types";
import { signJwt } from "@repo/backend-common/config";
import { prismaClient } from "@repo/db/client";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors());

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

function normalizeEmail(email: string) {
    return email.trim().toLowerCase();
}

function looksLikeBcryptHash(value: string) {
    return /^\$2[aby]\$\d{2}\$/.test(value);
}

// ── Auth ──────────────────────────────────────────────────────

app.post("/signup", async (req, res) => {
    try {
        const parsed = CreateUserSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ message: "Invalid inputs", errors: parsed.error.flatten() });
            return;
        }

        const { password, name } = parsed.data;
        const email = normalizeEmail(parsed.data.email);

        const existing = await prismaClient.user.findUnique({ where: { email } });
        if (existing) {
            res.status(409).json({ message: "User already exists with this email" });
            return;
        }

        const hashed = await bcrypt.hash(password, 10);
        const user = await prismaClient.user.create({
            data: { email, password: hashed, name },
        });

        res.status(201).json({ userId: user.id });
    } catch (error) {
        console.error("[signup]", error);
        res.status(500).json({ message: "Internal server error. Please try again later." });
    }
});

app.post("/signin", async (req, res) => {
    try {
        const parsed = SigninSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ message: "Invalid inputs", errors: parsed.error.flatten() });
            return;
        }

        const password = parsed.data.password;
        const email = normalizeEmail(parsed.data.email);

        const user = await prismaClient.user.findUnique({ where: { email } });
        if (!user || !user.password) {
            res.status(401).json({
                message: user && !user.password
                    ? "This account uses Google. Continue with Google to sign in."
                    : "Invalid email or password",
            });
            return;
        }

        const valid = looksLikeBcryptHash(user.password)
            ? await bcrypt.compare(password, user.password)
            : password === user.password;
        if (!valid) {
            res.status(401).json({ message: "Invalid email or password" });
            return;
        }

        if (!looksLikeBcryptHash(user.password)) {
            const hashed = await bcrypt.hash(password, 10);
            await prismaClient.user.update({
                where: { id: user.id },
                data: { password: hashed },
            });
        }

        const token = await signJwt(user.id);
        res.json({ token });
    } catch (error) {
        console.error("[signin]", error);
        res.status(500).json({ message: "Internal server error. Please try again later." });
    }
});

app.post("/auth/google", async (req, res) => {
    const parsed = GoogleAuthSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid inputs", errors: parsed.error.flatten() });
        return;
    }

    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
        res.status(503).json({ message: "Google sign-in is not configured on this server." });
        return;
    }

    try {
        const ticket = await googleClient.verifyIdToken({
            idToken: parsed.data.idToken,
            audience: clientId,
        });
        const payload = ticket.getPayload();
        if (!payload?.sub || !payload.email) {
            res.status(401).json({ message: "Google could not verify this account." });
            return;
        }

        const email = normalizeEmail(payload.email);
        const googleId = payload.sub;
        const name = (payload.name || email.split("@")[0] || "Drawboard user").slice(0, 100);
        const photo = payload.picture || null;

        let user = await prismaClient.user.findFirst({
            where: { OR: [{ googleId }, { email }] },
        });

        if (user) {
            user = await prismaClient.user.update({
                where: { id: user.id },
                data: {
                    googleId: user.googleId ?? googleId,
                    name: user.name || name,
                    photo: user.photo || photo,
                },
            });
        } else {
            user = await prismaClient.user.create({
                data: { email, name, photo, googleId, password: null },
            });
        }

        const token = await signJwt(user.id);
        res.json({ token });
    } catch (error) {
        console.error("[auth/google]", error);
        res.status(401).json({ message: "Google sign-in failed. Please try again." });
    }
});

// ── User ──────────────────────────────────────────────────────

app.get("/me", middleware, async (req, res) => {
    const user = await prismaClient.user.findUnique({
        where: { id: req.userId },
        select: { id: true, email: true, name: true },
    });
    if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
    }
    res.json(user);
});

// ── Rooms ─────────────────────────────────────────────────────

app.post("/room", middleware, async (req, res) => {
    const parsed = CreateRoomSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid inputs", errors: parsed.error.flatten() });
        return;
    }

    const slug = parsed.data.slug;
    const existing = await prismaClient.room.findUnique({ where: { slug } });
    if (existing) {
        res.status(409).json({ message: "Room already exists with this slug" });
        return;
    }

    const room = await prismaClient.room.create({
        data: { slug, adminId: req.userId! },
    });

    res.status(201).json({ id: room.id, publicKey: room.publicKey, slug: room.slug });
});

app.get("/room/:key", middleware, async (req, res) => {
    const key = req.params.key;
    const room = await prismaClient.room.findUnique({ where: { publicKey: key } });
    if (!room) {
        res.status(404).json({ message: "Room not found" });
        return;
    }
    const allowed = room.adminId === req.userId || !!(await prismaClient.roomAccess.findUnique({ where: { roomId_userId: { roomId: room.id, userId: req.userId! } } }));
    if (!allowed) {
        const request = await prismaClient.accessRequest.findUnique({ where: { roomId_userId: { roomId: room.id, userId: req.userId! } } });
        if (!request) await prismaClient.accessRequest.create({ data: { roomId: room.id, userId: req.userId! } });
        res.status(403).json({ message: "Access requested. The room owner must approve you.", accessRequested: true });
        return;
    }
    res.json({ id: room.id, publicKey: room.publicKey, slug: room.slug, adminId: room.adminId, createdAt: room.createdAt.toISOString() });
});

app.get("/rooms", middleware, async (req, res) => {
    const rooms = await prismaClient.room.findMany({
        where: { adminId: req.userId },
        orderBy: { createdAt: "desc" },
        take: 50,
    });
    res.json(rooms.map(r => ({ id: r.id, publicKey: r.publicKey, slug: r.slug, adminId: r.adminId, createdAt: r.createdAt.toISOString() })));
});

app.get("/rooms/:key/access-requests", middleware, async (req, res) => {
    const room = await prismaClient.room.findUnique({ where: { publicKey: req.params.key } });
    if (!room || room.adminId !== req.userId) return void res.status(403).json({ message: "Only the owner can manage access." });
    const requests = await prismaClient.accessRequest.findMany({ where: { roomId: room.id, status: "pending" }, include: { user: { select: { id: true, name: true, email: true, photo: true } } }, orderBy: { createdAt: "asc" } });
    res.json({ requests });
});

app.post("/rooms/:key/access-requests/:requestId/approve", middleware, async (req, res) => {
    const room = await prismaClient.room.findUnique({ where: { publicKey: req.params.key } });
    const request = room ? await prismaClient.accessRequest.findUnique({ where: { id: Number(req.params.requestId) } }) : null;
    if (!room || room.adminId !== req.userId || !request || request.roomId !== room.id) return void res.status(403).json({ message: "Only the owner can approve this request." });
    await prismaClient.$transaction([prismaClient.roomAccess.upsert({ where: { roomId_userId: { roomId: room.id, userId: request.userId } }, update: {}, create: { roomId: room.id, userId: request.userId } }), prismaClient.accessRequest.update({ where: { id: request.id }, data: { status: "approved" } })]);
    res.json({ ok: true });
});

// ── User Search ─────────────────────────────────────────────

app.get("/users/search", middleware, async (req, res) => {
    const q = (req.query.q as string ?? "").trim();
    if (!q) {
        res.status(400).json({ message: "Query parameter 'q' is required" });
        return;
    }

    const users = await prismaClient.user.findMany({
        where: {
            OR: [
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
            ],
        },
        select: { id: true, email: true, name: true, photo: true },
        take: 20,
    });

    res.json({ users });
});

// ── Chats / Drawings ─────────────────────────────────────────

app.get("/chats/:key", middleware, async (req, res) => {
    const room = await prismaClient.room.findUnique({ where: { publicKey: req.params.key } });
    if (!room) {
        res.status(404).json({ message: "Room not found" });
        return;
    }
    const allowed = room.adminId === req.userId || !!(await prismaClient.roomAccess.findUnique({ where: { roomId_userId: { roomId: room.id, userId: req.userId! } } }));
    if (!allowed) return void res.status(403).json({ message: "You do not have access to this room." });

    const messages = await prismaClient.chat.findMany({
        where: { roomId: room.id },
        orderBy: { id: "desc" },
        take: 1000,
    });

    res.json({ messages });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`HTTP backend listening on port ${PORT}`);
});
