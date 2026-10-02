import { z } from "zod";

// --- Auth ---

export const CreateUserSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string().min(1).max(100),
});

export const SigninSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

export const GoogleAuthSchema = z.object({
    idToken: z.string().min(1),
});

// --- Room ---

export const CreateRoomSchema = z.object({
    slug: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes"),
});

export const JoinRoomSchema = z.object({
    slug: z.string().min(1),
});

// --- Response shapes ---

export const SignupResponse = z.object({
    userId: z.string(),
});

export const SigninResponse = z.object({
    token: z.string(),
});

export const RoomResponse = z.object({
    id: z.number(),
    publicKey: z.string(),
    slug: z.string(),
    adminId: z.string(),
    createdAt: z.string(),
});

export const MeResponse = z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
});

// --- WebSocket messages ---

export const WsJoinRoomSchema = z.object({
    type: z.literal("join_room"),
    roomId: z.union([z.string(), z.number()]),
});

export const WsLeaveRoomSchema = z.object({
    type: z.literal("leave_room"),
    roomId: z.union([z.string(), z.number()]),
});

export const WsDrawSchema = z.object({
    type: z.literal("draw"),
    roomId: z.union([z.string(), z.number()]),
    shape: z.object({
        type: z.enum([
            "rect",
            "circle",
            "pencil",
            "diamond",
            "ellipse",
            "arrow",
            "line",
            "text",
            "image",
        ]),
    }).passthrough(),
});

export const WsChatSchema = z.object({
    type: z.literal("chat"),
    roomId: z.union([z.string(), z.number()]),
    message: z.string(),
});

export const WsUpdateSchema = z.object({
    type: z.literal("update"),
    roomId: z.union([z.string(), z.number()]),
    shape: z.object({
        id: z.string(),
    }).passthrough(),
});

export const WsSyncSchema = z.object({
    type: z.literal("sync"),
    roomId: z.union([z.string(), z.number()]),
    shapes: z.array(z.object({}).passthrough()),
});

export const WsClientMessageSchema = z.discriminatedUnion("type", [
    WsJoinRoomSchema,
    WsLeaveRoomSchema,
    WsDrawSchema,
    WsUpdateSchema,
    WsSyncSchema,
    WsChatSchema,
]);

export type WsClientMessage = z.infer<typeof WsClientMessageSchema>;

// --- Inferred types ---

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type SigninInput = z.infer<typeof SigninSchema>;
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;
export type JoinRoomInput = z.infer<typeof JoinRoomSchema>;

export type SignupResponseType = z.infer<typeof SignupResponse>;
export type SigninResponseType = z.infer<typeof SigninResponse>;
export type RoomResponseType = z.infer<typeof RoomResponse>;
export type MeResponseType = z.infer<typeof MeResponse>;

export type BaseShape = {
    strokeColor?: string;
    strokeWidth?: number;
    fillColor?: string;
    id?: string;
};

export type Shape =
    | (BaseShape & {
          type: "rect";
          x: number;
          y: number;
          width: number;
          height: number;
      })
    | (BaseShape & {
          type: "circle";
          centerX: number;
          centerY: number;
          radius: number;
      })
    | (BaseShape & {
          type: "pencil";
          points: { x: number; y: number }[];
      })
    | (BaseShape & {
          type: "diamond";
          x: number;
          y: number;
          width: number;
          height: number;
      })
    | (BaseShape & {
          type: "ellipse";
          x: number;
          y: number;
          width: number;
          height: number;
      })
    | (BaseShape & {
          type: "arrow";
          x: number;
          y: number;
          width: number;
          height: number;
      })
    | (BaseShape & {
          type: "line";
          x: number;
          y: number;
          width: number;
          height: number;
      })
    | (BaseShape & {
          type: "text";
          x: number;
          y: number;
          text: string;
          fontSize: number;
      })
    | (BaseShape & {
          type: "image";
          x: number;
          y: number;
          width: number;
          height: number;
          src: string;
      });
