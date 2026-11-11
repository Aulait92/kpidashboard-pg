"use client";

// Nur in der App-Store-App aktiv (sonst rendert und tut das nichts):
// - Push-Listener (Token an den Server, Tippen auf Benachrichtigung → Seite)
// - Zähler am App-Symbol beim Öffnen/Zurückkehren aktualisieren
// - Zurück-Taste (Android), Neu laden beim Zurückkehren in die App
// - Nach unten ziehen zum Aktualisieren
// - Google/Microsoft-Kalender verbinden im System-Browser (Google blockiert
//   die Anmeldung in eingebetteten Ansichten) – mit Einmal-Übergabe der Anmeldung
// - Beim Abmelden das Gerät vom Login lösen

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { impact, installHapticDelegates } from "@/lib/haptics";
import { forgetNativeDevice, initNativePushListeners, isNativeApp, needsSystemBrowser, openInSystemBrowser, setAppBadge } from "@/lib/native-bridge";

type CapApp = { addListener?: (e: string, cb: (d: { canGoBack?: boolean }) => void) => unknown; minimizeApp?: () => Promise<void> };

export function NativeAppBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const [pull, setPull] = useState(0);
  const pullRef = useRef({ startY: 0, active: false, dist: 0 });
  const [native, setNative] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setNative(isNativeApp()), 0);
    return () => clearTimeout(t);
  }, []);

  // Einmalige Einrichtung
  useEffect(() => {
    if (!native) return;
    document.documentElement.classList.add("native-app");
    const removeHaptics = installHapticDelegates();
    // iOS: „Fertig“-Leiste über der Tastatur; Statusleiste dunkle Schrift auf hellem Grund
    const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, Record<string, (o?: unknown) => Promise<unknown>> | undefined> } }).Capacitor?.Plugins;
    void plugins?.Keyboard?.setAccessoryBarVisible?.({ isVisible: true }).catch(() => {});
    void plugins?.StatusBar?.setStyle?.({ style: "LIGHT" }).catch(() => {});
    void initNativePushListeners((url) => router.push(url));

    const refreshBadge = () =>
      fetch("/api/app/device", { cache: "no-store" })
        .then((r) => r.json() as Promise<{ badge?: number }>)
        .then((d) => setAppBadge(d.badge ?? 0))
        .catch(() => {});
    void refreshBadge();

    const app = (window as unknown as { Capacitor?: { Plugins?: { App?: CapApp } } }).Capacitor?.Plugins?.App;
    app?.addListener?.("resume", () => {
      router.refresh();
      void refreshBadge();
    });
    app?.addListener?.("backButton", (d) => {
      if (d?.canGoBack || window.history.length > 1) window.history.back();
      else void app.minimizeApp?.();
    });

    // Klicks: OAuth-Verbindungen im System-Browser
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a") as HTMLAnchorElement | null;
      if (!a?.href || !needsSystemBrowser(a.href)) return;
      e.preventDefault();
      const u = new URL(a.href);
      void fetch("/api/app/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ next: u.pathname + u.search }),
      })
        .then((r) => r.json() as Promise<{ url?: string }>)
        .then((d) => (d.url ? openInSystemBrowser(d.url) : undefined))
        .catch(() => {});
    };
    // Abmelden: Gerät vom Login lösen
    const onSubmit = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement | null;
      if (f?.action && /\/api\/auth\/logout$/.test(new URL(f.action, location.origin).pathname)) forgetNativeDevice();
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      removeHaptics();
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, [native, router]);

  // Nach unten ziehen zum Aktualisieren (nur ganz oben auf der Seite)
  useEffect(() => {
    if (!native) return;
    const TRIGGER = 80;
    const start = (e: TouchEvent) => {
      // Seiten mit eigenem Pull-to-refresh (components/pull-to-refresh.tsx) nicht doppelt
      if (window.scrollY > 0 || e.touches.length !== 1 || document.querySelector("[data-ptr]")) return;
      // Nicht in Sheets/Dialogen oder scrollbaren Listen ziehen
      if ((e.target as HTMLElement | null)?.closest?.("[role='dialog'],[data-no-ptr]")) return;
      pullRef.current = { startY: e.touches[0].clientY, active: true, dist: 0 };
    };
    const move = (e: TouchEvent) => {
      if (!pullRef.current.active) return;
      const dist = Math.max(0, e.touches[0].clientY - pullRef.current.startY);
      if (dist > 0 && window.scrollY <= 0) {
        if (pullRef.current.dist < TRIGGER && dist >= TRIGGER) impact("light");
        pullRef.current.dist = dist;
        setPull(Math.min(dist, 120));
      }
    };
    const end = () => {
      if (!pullRef.current.active) return;
      const go = pullRef.current.dist >= TRIGGER;
      pullRef.current.active = false;
      setPull(0);
      if (go) router.refresh();
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end);
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
    };
  }, [native, router, pathname]);

  if (!native || pull <= 8) return null;
  const ready = pull >= 80;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center"
      style={{ top: `calc(env(safe-area-inset-top) + ${Math.min(pull, 120) / 2}px)` }}
    >
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-[var(--shadow-md)]"
        style={{ transform: `rotate(${pull * 3}deg)`, opacity: Math.min(1, pull / 80) }}
      >
        <svg viewBox="0 0 24 24" className={`h-4 w-4 ${ready ? "text-[color:var(--brand)]" : "text-slate-400"}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
      </div>
    </div>
  );
}
