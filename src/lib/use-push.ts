"use client";

// Gemeinsame Push-Logik für Admin (Dashboard-Knopf) und Kundenbereich
// (Hinweis oben + Profilmenü). Anmeldung läuft über /api/push/subscribe,
// der Service Worker liegt unter /sw.js.

import { useCallback, useEffect, useState } from "react";

export type PushStatus = "loading" | "unsupported" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** iPhone/iPad im normalen Safari-Tab: Web-Push geht erst nach „Zum Home-Bildschirm“. */
function iosNeedsInstall(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

export function usePush() {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [needsInstall, setNeedsInstall] = useState(false);
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setNeedsInstall(iosNeedsInstall());
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
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
  }, [refresh]);

  const enable = useCallback(async (): Promise<boolean> => {
    if (!publicKey) {
      setMessage("Benachrichtigungen sind auf dem Server noch nicht eingerichtet.");
      return false;
    }
    setBusy(true);
    setMessage(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "denied" : "off");
        return false;
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
      return true;
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      setMessage(
        /permission|denied|NotAllowed/i.test(text)
          ? "Der Browser hat Benachrichtigungen blockiert. Bitte in den Einstellungen des Browsers für diese Seite erlauben."
          : `Das hat nicht geklappt (${text}).`,
      );
      return false;
    } finally {
      setBusy(false);
    }
  }, [publicKey]);

  const disable = useCallback(async () => {
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
  }, []);

  const sendTest = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = (await res.json()) as { sent?: number; errors?: string[] };
      if (data.errors && data.errors.length > 0) setMessage(`Fehler: ${data.errors.join(", ")}`);
      else setMessage(data.sent ? "Test gesendet – kommt gleich an." : "Kein Gerät angemeldet.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, busy, message, needsInstall, enable, disable, sendTest };
}
