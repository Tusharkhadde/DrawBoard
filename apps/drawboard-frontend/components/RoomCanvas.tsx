"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Canvas } from "./Canvas";
import { StatePage } from "./StatePage";
import { Button } from "@/components/ui/button";
import { getExistingShapes } from "@/draw/http";
import { HTTP_BACKEND, WS_URL } from "@/config";
import { useAuth } from "@/lib/auth";
import type { Shape } from "@repo/common/types";
import type { Connection } from "./excalidraw/types";

const MAX_ATTEMPTS = 4;

interface RoomCanvasProps {
  roomId: string;
  isGuest?: boolean;
}

/**
 * Owns what outgrows a single board render: the websocket lifecycle, the room
 * join handshake and the initial shapes fetched over HTTP.
 */
export function RoomCanvas({ roomId, isGuest = false }: RoomCanvasProps) {
  const { token, isLoading: isAuthLoading } = useAuth();

  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [attempt, setAttempt] = useState(0);

  const [shapes, setShapes] = useState<Shape[]>([]);
  const [isLoadingBoard, setIsLoadingBoard] = useState(!isGuest);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);

  // 1. The websocket only carries deltas, so the board is seeded over HTTP —
  //    otherwise a returning user would always see an empty canvas.
  useEffect(() => {
    if (isGuest) return;
    const controller = new AbortController();

    getExistingShapes(roomId, controller.signal, token)
      .then((loaded) => {
        setShapes(loaded);
        setBoardError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setBoardError(error instanceof Error ? error.message : "Couldn’t load this board.");
      })
      .finally(() => setIsLoadingBoard(false));

    return () => controller.abort();
  }, [roomId, isGuest, token]);

  // 2. Room name for the header — resolves for numeric ids and slug links alike.
  useEffect(() => {
    if (isGuest) return;
    const controller = new AbortController();
      fetch(`${HTTP_BACKEND}/room/${roomId}`, { headers: token ? { Authorization: token } : undefined, signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((room: { slug?: string } | null) => {
        if (room?.slug) setRoomName(room.slug);
      })
      .catch(() => {
        // A missing name is cosmetic; the board still works.
      });
    return () => controller.abort();
  }, [roomId, isGuest, token]);

  const connect = useCallback(() => {
    if (!isGuest && !token) return;

    setConnection(attemptRef.current > 0 ? "reconnecting" : "connecting");

    const query = isGuest ? "guest=true" : `token=${encodeURIComponent(token ?? "")}`;
    const next = new WebSocket(`${WS_URL}/?${query}`);
    socketRef.current = next;

    next.onopen = () => {
      attemptRef.current = 0;
      // The server only relays to sockets that announced a room.
      next.send(JSON.stringify({ type: "join_room", roomId }));
      setConnection("open");
      setSocket(next);
    };

    next.onclose = () => {
      if (socketRef.current !== next) return;
      // Live sync is down: drop the dead socket so the board stops queuing deltas.
      setSocket(null);
      attemptRef.current += 1;
      if (attemptRef.current >= MAX_ATTEMPTS) {
        setConnection("offline");
        return;
      }
      setConnection("reconnecting");
      setAttempt(attemptRef.current);
      setTimeout(connect, 600 * 2 ** (attemptRef.current - 1));
    };

    next.onerror = () => {
      next.close();
    };
  }, [isGuest, token, roomId]);

  const retry = useCallback(() => {
    attemptRef.current = 0;
    setAttempt(0);
    connect();
  }, [connect]);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!isGuest && !token) return;

    connect();
    return () => {
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [connect, isAuthLoading, isGuest, token]);

  if (!isGuest && !isAuthLoading && !token) {
    return (
      <StatePage
        icon={
          <span className="relative grid size-9 place-items-center overflow-hidden rounded-xl">
            <Image src="/drawboard-mark.png" alt="" width={36} height={36} className="size-full object-cover" />
          </span>
        }
        iconClassName="bg-transparent p-0"
        eyebrow="Members only"
        title="Sign in to open this board"
        description="Boards belong to your account, so your work is still here when you come back."
        actions={
          <>
            <Button asChild>
              <Link href="/signin" prefetch={false}>Sign in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/canvas/guest" prefetch={false}>Draw as a guest</Link>
            </Button>
          </>
        }
      />
    );
  }

  if (isLoadingBoard || isAuthLoading) {
    return (
      <StatePage
        icon={<Loader2 size={26} strokeWidth={1.8} className="animate-spin" />}
        title="Opening your board…"
        description="Restoring everything you left on this canvas."
      />
    );
  }

  if (boardError) {
    return (
      <StatePage
        icon={<AlertTriangle size={26} strokeWidth={1.8} />}
        iconClassName="bg-destructive/10 text-destructive"
        title="We couldn’t open this board"
        description={boardError}
        actions={
          <>
            <Button
              onClick={() => {
                setIsLoadingBoard(true);
                setBoardError(null);
                getExistingShapes(roomId, undefined, token)
                  .then((loaded) => setShapes(loaded))
                  .catch((error: unknown) =>
                    setBoardError(error instanceof Error ? error.message : "Couldn’t load this board.")
                  )
                  .finally(() => setIsLoadingBoard(false));
              }}
            >
              Try again
            </Button>
            <Button asChild variant="outline">
              <Link href="/" prefetch={false}>Back to workspace</Link>
            </Button>
          </>
        }
      />
    );
  }

  return (
    <Canvas
      roomId={roomId}
      socket={socket}
      isGuest={isGuest}
      initialShapes={shapes}
      roomName={roomName}
      connection={connection}
      attempt={attempt}
      onReconnect={retry}
    />
  );
}
