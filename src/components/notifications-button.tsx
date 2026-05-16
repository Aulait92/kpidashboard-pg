"use client";

import { Bell, BellOff, BellRing } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Status = "loading" | "unsupported" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function NotificationsButton() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      setStatus(sub ? "on" : "off");
    } catch {
      setStatus("off");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function enable() {
    if (!publicKey) {
      setMessage("VAPID-Schlüssel fehlen in den Umgebungsvariablen.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg =
        (await navigator.serviceWorker.getRegistration("/")) ??
        (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await navigator.serviceWorker.ready;
      const keyBytes = urlBase64ToUint8Array(publicKey);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // PushManager erwartet BufferSource — Uint8Array passt zur Laufzeit,
        // aber die DOM-Typen sind durch SharedArrayBuffer-Möglichkeit strenger.
        applicationServerKey: keyBytes.buffer as ArrayBuffer,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error(`Server antwortete ${res.status}`);
      setStatus("on");
      setMessage("Aktiviert.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("off");
      setMessage("Deaktiviert.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = (await res.json()) as {
        sent?: number;
        removed?: number;
        errors?: string[];
      };
      if (data.errors && data.errors.length > 0) {
        setMessage(`Fehler: ${data.errors.join(", ")}`);
      } else {
        setMessage(`${data.sent ?? 0} Push gesendet`);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return null;
  }
  if (status === "unsupported") {
    return null;
  }

  const Icon = status === "on" ? BellRing : status === "denied" ? BellOff : Bell;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={status === "on" ? disable : enable}
        disabled={busy || status === "denied"}
        aria-label={
          status === "on"
            ? "Benachrichtigungen deaktivieren"
            : "Benachrichtigungen aktivieren"
        }
        title={
          status === "denied"
            ? "In den Geräte-Einstellungen freigeben"
            : status === "on"
              ? "Benachrichtigungen aktiv — klick zum Deaktivieren"
              : "Benachrichtigungen aktivieren"
        }
        className={cn(
          "inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm transition sm:min-h-0 sm:py-1.5",
          status === "on"
            ? "border-emerald-300 text-emerald-700"
            : "border-[color:var(--border)] text-[color:var(--foreground)] hover:border-[color:var(--brand)]",
          (busy || status === "denied") && "opacity-60",
        )}
      >
        <Icon className="h-4 w-4" />
        <span className="hidden sm:inline">
          {status === "on"
            ? "Push aktiv"
            : status === "denied"
              ? "Push gesperrt"
              : "Push aktivieren"}
        </span>
      </button>
      {status === "on" && !busy ? (
        <button
          type="button"
          onClick={sendTest}
          className="absolute right-0 top-full mt-1 hidden text-[10px] text-[color:var(--brand)] hover:underline sm:block"
        >
          Test senden
        </button>
      ) : null}
      {message ? (
        <div className="absolute right-0 top-full mt-6 whitespace-nowrap text-[10px] text-[color:var(--muted)]">
          {message}
        </div>
      ) : null}
    </div>
  );
}
