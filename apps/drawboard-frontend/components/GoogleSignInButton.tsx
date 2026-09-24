"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          prompt: () => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              shape?: "rectangular" | "pill" | "circle" | "square";
              width?: number;
              logo_alignment?: "left" | "center";
            },
          ) => void;
        };
      };
    };
  }
}

const GIS_SRC = "https://accounts.google.com/gsi/client";

function loadGis(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.google?.accounts?.id) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google")));
      if (window.google?.accounts?.id) resolve();
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google"));
    document.head.appendChild(script);
  });
}

interface GoogleSignInButtonProps {
  /** `continue_with` works for both sign-in and sign-up. */
  mode?: "signin" | "signup";
  disabled?: boolean;
  onCredential: (idToken: string) => void | Promise<void>;
  onError?: (message: string) => void;
}

/** Google Identity Services button. Same flow for sign-in and sign-up (backend upserts). */
export function GoogleSignInButton({ mode = "signin", disabled, onCredential, onError }: GoogleSignInButtonProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const onCredentialRef = useRef(onCredential);
  const onErrorRef = useRef(onError);
  onCredentialRef.current = onCredential;
  onErrorRef.current = onError;

  const handleCredential = useCallback(async (credential: string) => {
    setBusy(true);
    try {
      await onCredentialRef.current(credential);
    } catch (err) {
      onErrorRef.current?.(err instanceof Error ? err.message : "Google sign-in failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  const initializedRef = useRef(false);

  useEffect(() => {
    if (!clientId || initializedRef.current) return;
    let cancelled = false;

    loadGis()
      .then(() => {
        if (cancelled || !hostRef.current || !window.google?.accounts?.id || initializedRef.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response.credential) void handleCredential(response.credential);
            else onErrorRef.current?.("Google did not return a credential.");
          },
          cancel_on_tap_outside: true,
        });
        hostRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(hostRef.current, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          width: 384,
          logo_alignment: "left",
        });
        initializedRef.current = true;
        setReady(true);
      })
      .catch(() => {
        onErrorRef.current?.("Couldn't load Google sign-in. Check your connection.");
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, handleCredential]);

  if (!clientId) {
    return (
      <Button type="button" variant="outline" size="lg" className="w-full rounded-full" disabled>
        Continue with Google
        <span className="ml-1 text-xs font-normal text-muted-foreground">(not configured)</span>
      </Button>
    );
  }

  return (
    <div className="relative w-full">
      {(!ready || busy || disabled) && (
        <Button type="button" variant="outline" size="lg" className="w-full rounded-full" disabled>
          {busy ? (
            <>
              <Loader2 className="animate-spin" /> Connecting to Google…
            </>
          ) : (
            "Continue with Google"
          )}
        </Button>
      )}
      <div
        ref={hostRef}
        className={`flex w-full justify-center overflow-hidden rounded-full [&>div]:w-full ${!ready || busy || disabled ? "pointer-events-none absolute inset-0 opacity-0" : ""}`}
        aria-hidden={!ready || busy || disabled}
      />
    </div>
  );
}
