"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, Bell, Check, Copy, FolderOpen, Loader2, MoreHorizontal, Plus, Search, Sparkles, Users, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Navbar } from "@/components/Navbar";
import { LandingPage } from "@/components/Marketing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { RoomResponseType } from "@repo/common/types";

/* ───────────────────────────── Dashboard ───────────────────────────── */

function Dashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [rooms, setRooms] = useState<RoomResponseType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [slug, setSlug] = useState("");
  const [join, setJoin] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [createError, setCreateError] = useState("");
  const [joinError, setJoinError] = useState("");
  const [reload, setReload] = useState(0);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [approving, setApproving] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api
      .get<RoomResponseType[]>("/rooms")
      .then((data) => active && setRooms(data))
      .catch((e) => active && setError(e instanceof ApiError ? e.message : "We couldn't load your rooms. Check that the server is running and try again."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [reload]);

  const loadAccessRequests = useCallback(async () => {
    if (!rooms.length) {
      setAccessRequests([]);
      return;
    }
    const grouped = await Promise.all(rooms.map(async (room) => {
      try {
        const result = await api.get<{ requests: AccessRequest[] }>(`/rooms/${room.publicKey}/access-requests`);
        return result.requests.map((request) => ({ ...request, roomKey: room.publicKey, roomName: room.slug }));
      } catch {
        return [];
      }
    }));
    setAccessRequests(grouped.flat());
  }, [rooms]);

  useEffect(() => {
    void loadAccessRequests();
    const timer = setInterval(() => void loadAccessRequests(), 15000);
    return () => clearInterval(timer);
  }, [loadAccessRequests]);

  async function approveAccess(request: AccessRequest) {
    setApproving(request.id);
    try {
      await api.post(`/rooms/${request.roomKey}/access-requests/${request.id}/approve`);
      setAccessRequests((current) => current.filter((item) => item.id !== request.id));
      toast.success(`${request.user.name} can now access ${request.roomName}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't approve this request.");
    } finally {
      setApproving(null);
    }
  }

  async function createRoom(event: FormEvent) {
    event.preventDefault();
    if (creating) return;
    const normalized = slug.trim().toLowerCase().replace(/\s+/g, "-");
    if (!/^[a-z0-9-]{3,50}$/.test(normalized)) {
      setCreateError("Use 3–50 letters, numbers, or dashes for your room name.");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const room = await api.post<{ publicKey: string }>("/room", { slug: normalized });
      toast.success(`Room "${normalized}" created`);
      router.push(`/canvas/${room.publicKey}`);
    } catch (e) {
      setCreateError(e instanceof ApiError ? e.message : "Couldn't create the room. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function joinRoom(event: FormEvent) {
    event.preventDefault();
    if (joining) return;
    let value = join.trim();
    try {
      if (/^https?:\/\//i.test(value)) value = new URL(value).pathname.match(/^\/canvas\/([^/]+)\/?$/)?.[1] || "";
    } catch {
      value = "";
    }
    if (!value) {
      setJoinError("Enter a room link, ID, or name.");
      return;
    }
    setJoining(true);
    setJoinError("");
    try {
      const room = await api.get<{ publicKey: string }>(`/room/${encodeURIComponent(value)}`);
      router.push(`/canvas/${room.publicKey}`);
    } catch (e) {
      setJoinError(e instanceof ApiError ? e.message : "Couldn't find that room. Check the link and try again.");
    } finally {
      setJoining(false);
    }
  }

  const filtered = rooms.filter((room) => room.slug.toLowerCase().includes(search.toLowerCase()));
  const firstName = user?.name?.split(" ")[0];

  return (
    <div className="min-h-svh bg-background">
      <Navbar />
      <main className="container py-12 lg:py-16">
        {/* Heading */}
        <div className="reveal flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <Badge variant="soft">
              <Sparkles className="size-3.5" /> Your creative workspace
            </Badge>
            <h1 className="display mt-4 text-4xl sm:text-5xl">
              Good to see you{firstName ? `, ${firstName}` : ""}
              <em>.</em>
            </h1>
            <p className="prose-muted mt-3">A fresh thought, an unfinished plan. What will you work on today?</p>
          </div>
          <Button asChild variant="outline" size="lg" className="rounded-full">
            <Link href="/canvas/guest">
              Quick sketch <ArrowUpRight />
            </Link>
          </Button>
        </div>

        {accessRequests.length > 0 && (
          <section aria-labelledby="access-requests-title" className="mt-8 rounded-2xl border border-primary/20 bg-primary/[0.045] p-5 shadow-soft">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Bell size={18} />
                  <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{accessRequests.length}</span>
                </span>
                <div>
                  <h2 id="access-requests-title" className="font-semibold tracking-tight">Access requests</h2>
                  <p className="mt-1 text-sm text-muted-foreground">People are waiting for permission to join your boards.</p>
                </div>
              </div>
              <span className="hidden rounded-full bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground sm:inline-flex">Updates automatically</span>
            </div>
            <div className="mt-4 divide-y divide-border/70 rounded-xl border border-border/70 bg-background/70">
              {accessRequests.map((request) => (
                <div key={request.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">{request.user.name} <span className="font-normal text-muted-foreground">wants to join</span> {request.roomName}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{request.user.email}</p>
                  </div>
                  <Button size="sm" onClick={() => approveAccess(request)} disabled={approving === request.id} className="shrink-0">
                    {approving === request.id ? <Loader2 className="animate-spin" /> : <Check />} Approve access
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Actions */}
        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Plus size={16} />
                </span>
                Start something new
              </CardTitle>
              <CardDescription>Give your next idea a space of its own.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={createRoom}>
                <div className="flex-1 space-y-2">
                  <Label htmlFor="room-name">Room name</Label>
                  <Input id="room-name" placeholder="e.g. product-brainstorm" value={slug} onChange={(e) => setSlug(e.target.value)} minLength={3} maxLength={50} required disabled={creating} />
                </div>
                <Button type="submit" disabled={creating} className="sm:w-auto">
                  {creating ? <Loader2 className="animate-spin" /> : <Plus />} Create room
                </Button>
              </form>
              {createError && (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {createError}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-lg bg-peach text-orange-700">
                  <Users size={16} />
                </span>
                Pick up the conversation
              </CardTitle>
              <CardDescription>Have an invite? Join your team’s canvas.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={joinRoom}>
                <div className="flex-1 space-y-2">
                  <Label htmlFor="join-room">Room link, ID, or name</Label>
                  <Input id="join-room" placeholder="Paste a link or room name" value={join} onChange={(e) => setJoin(e.target.value)} required disabled={joining} />
                </div>
                <Button type="submit" variant="secondary" disabled={joining}>
                  Join {joining ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                </Button>
              </form>
              {joinError && (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {joinError}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Rooms */}
        <section aria-labelledby="rooms-title" className="mt-14">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="rooms-title" className="flex items-center gap-3 text-xl font-semibold tracking-tight">
              Your boards
              {!loading && <Badge variant="secondary">{rooms.length}</Badge>}
            </h2>
            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Search your boards" placeholder="Find a board…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          {loading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading boards">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="overflow-hidden shadow-none">
                  <Skeleton className="h-36 rounded-none" />
                  <div className="space-y-2.5 p-5">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </Card>
              ))}
            </div>
          ) : error ? (
            <EmptyState icon={FolderOpen} title="Let's try that again" description={error}>
              <Button variant="outline" onClick={() => setReload(reload + 1)}>
                Reload boards
              </Button>
            </EmptyState>
          ) : filtered.length ? (
            <div className="reveal grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((room) => (
                <RoomCard key={room.id} room={room} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={search ? Search : FolderOpen}
              title={search ? "No boards found" : "A blank slate. In the best way."}
              description={search ? "Try a different name to find your board." : "Create your first room above. Your next great idea belongs here."}
            >
              {search && (
                <Button variant="outline" onClick={() => setSearch("")}>
                  Clear search
                </Button>
              )}
            </EmptyState>
          )}
        </section>
      </main>
    </div>
  );
}

type AccessRequest = {
  id: number;
  roomKey?: string;
  roomName?: string;
  user: { id: string; name: string; email: string; photo?: string | null };
};

function EmptyState({ icon: Icon, title, description, children }: { icon: typeof FolderOpen; title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="dot-grid rounded-2xl border border-dashed px-6 py-16 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon size={22} />
      </div>
      <h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3>
      <p className="prose-muted mx-auto mt-2 max-w-sm text-sm">{description}</p>
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}

function RoomCard({ room }: { room: RoomResponseType }) {
  const [copied, setCopied] = useState(false);
  const href = `/canvas/${room.publicKey}`;

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${href}`);
      setCopied(true);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Couldn't copy. Open the board and copy its address.");
    }
  }, [href]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const created = new Date(room.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <Card className="group overflow-hidden shadow-none transition-all duration-300 hover:-translate-y-1 hover:shadow-lift">
      <Link href={href} aria-label={`Open ${room.slug}`} className="block">
        <div className="dot-grid relative flex h-36 items-center justify-center gap-3 bg-lavender/60 text-primary/70">
          <span className="grid h-11 w-16 -rotate-6 place-items-center rounded-md border border-primary/30 bg-card shadow-sm transition-transform duration-300 group-hover:-rotate-3 group-hover:-translate-y-0.5">
            <Sparkles size={18} />
          </span>
          <ArrowRight size={20} className="text-primary/50" />
          <span className="grid size-11 rotate-6 place-items-center rounded-full border border-amber-500/40 bg-butter text-amber-700 shadow-sm transition-transform duration-300 group-hover:rotate-3 group-hover:-translate-y-0.5">
            <Check size={18} />
          </span>
          <span className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        </div>
      </Link>
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <h3 className="truncate font-semibold tracking-tight">
            <Link href={href} className="hover:text-primary">
              {room.slug}
            </Link>
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Created {created}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={copy} aria-label={`Copy link to ${room.slug}`} className="text-muted-foreground">
            {copied ? <Check className="text-emerald-600 animate-check-pop" /> : <Copy />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More options" className="text-muted-foreground">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={href}>
                  <ExternalLink /> Open board
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={copy}>
                <Copy /> Copy invite link
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
}

/* ───────────────────────────── Route ───────────────────────────── */

export default function HomePage() {
  const { token, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="grid min-h-svh place-items-center" role="status">
        <Loader2 className="size-6 animate-spin text-primary" aria-label="Loading workspace" />
      </div>
    );
  }
  return token ? <Dashboard /> : <LandingPage />;
}
