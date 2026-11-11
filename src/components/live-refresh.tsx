"use client";

// Live-Aktualisierung: hört auf /api/buyer/updates (Server-Sent Events, sonst
// Abfrage alle 3 s) und lädt die Server-Daten der Seite neu, sobald sich bei
// Leads, Chats oder Terminen etwas ändert. Pausiert im Hintergrund-Tab und
// stört niemanden beim Tippen (wartet bis zum Verlassen des Feldes bzw. 5 s Ruhe).

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { nextLiveState } from "@/lib/live-state";
import { notification } from "@/lib/haptics";

const POLL_MS = 3_000;
const DEBOUNCE_MS = 400;
const TYPING_IDLE_MS = 5_000;
const ENDPOINT = "/api/buyer/updates";

function isEditing(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return !["button", "submit", "checkbox", "radio", "hidden", "range", "color", "file"].includes(el.type);
  return (el as HTMLElement).isContentEditable === true;
}

/** Mehr Leads oder mehr offene Chats als vorher? (Fingerabdruck aus lib/live-state.ts) */
function grew(prev: string, next: string): boolean {
  const num = (f: string, re: RegExp) => Number(f.match(re)?.[1] ?? NaN);
  const leads = (f: string) => num(f, /^l(\d+)\./);
  const attention = (f: string) => num(f, /\|c\d+\.[^.|]*\.(\d+)\|/);
  return leads(next) > leads(prev) || attention(next) > attention(prev);
}

export function LiveRefresh({ safetyMs = 60_000 }: { safetyMs?: number } = {}) {
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    let last: string | null = null;
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let sseFailures = 0;
    let usePolling = typeof EventSource === "undefined";
    let lastKeyAt = 0;
    let lastRefreshAt = Date.now();
    let pending = false;
    let disposed = false;

    const doRefresh = () => {
      refreshTimer = null;
      if (disposed || !pending) return;
      // Nicht beim Tippen neu laden: warten, bis das Feld verlassen wurde oder 5 s Ruhe ist.
      if (isEditing(document.activeElement) && Date.now() - lastKeyAt < TYPING_IDLE_MS) {
        refreshTimer = setTimeout(doRefresh, 1_000);
        return;
      }
      pending = false;
      lastRefreshAt = Date.now();
      routerRef.current.refresh();
    };
    const schedule = () => {
      pending = true;
      if (!refreshTimer) refreshTimer = setTimeout(doRefresh, DEBOUNCE_MS);
    };
    const handle = (v: string) => {
      const prev = last;
      const s = nextLiveState(last, v);
      last = s.last;
      if (s.changed) {
        // Neuer Lead oder neue Nachricht, die Aufmerksamkeit braucht, im Vordergrund:
        // kurz spürbar (nur App). Eigene Klicks (Status ändern) lösen nichts aus.
        if (document.visibilityState === "visible" && prev && grew(prev, v)) notification();
        schedule();
      }
    };

    const pollOnce = async () => {
      try {
        const res = await fetch(ENDPOINT, { cache: "no-store", headers: { Accept: "application/json" } });
        if (res.ok) handle(((await res.json()) as { v: string }).v);
      } catch {
        /* offline – nächster Versuch */
      }
    };
    const startPolling = () => {
      if (pollTimer) return;
      void pollOnce(); // sofort Ausgangswert holen, sonst gingen Änderungen der ersten Sekunden verloren
      pollTimer = setInterval(() => void pollOnce(), POLL_MS);
    };
    const startSse = () => {
      if (es || usePolling) return;
      es = new EventSource(ENDPOINT);
      es.onmessage = (e) => {
        sseFailures = 0;
        handle(e.data);
      };
      es.onerror = () => {
        // EventSource verbindet sich selbst neu (z. B. nach 5 Min.). Klappt das mehrfach
        // nicht (Proxy puffert, Netz blockt SSE), auf einfache Abfrage umsteigen.
        sseFailures++;
        if (sseFailures >= 3) {
          es?.close();
          es = null;
          usePolling = true;
          startPolling();
        }
      };
    };
    const stopAll = () => {
      es?.close();
      es = null;
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    };
    const start = () => {
      if (usePolling) startPolling();
      else startSse();
    };

    const onVisibility = () => {
      if (document.hidden) {
        stopAll();
        return;
      }
      void pollOnce(); // sofort nachsehen, was in der Zwischenzeit passiert ist
      start();
    };
    const onKey = () => {
      lastKeyAt = Date.now();
    };
    const onFocusOut = () => {
      if (pending && !refreshTimer) refreshTimer = setTimeout(doRefresh, DEBOUNCE_MS);
    };
    // Sicherheitsnetz (z. B. Wiedervorlage fällig geworden, ohne dass sich Daten ändern).
    const safety = setInterval(() => {
      if (!document.hidden && Date.now() - lastRefreshAt >= safetyMs) {
        pending = true;
        doRefresh();
      }
    }, safetyMs);

    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusout", onFocusOut, true);
    if (!document.hidden) start();

    return () => {
      disposed = true;
      stopAll();
      if (refreshTimer) clearTimeout(refreshTimer);
      clearInterval(safety);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusout", onFocusOut, true);
    };
  }, [safetyMs]);

  return null;
}

/**
 * Im Chat ans Ende scrollen: beim Öffnen und wenn neue Nachrichten dazukommen –
 * aber nur, wenn man ohnehin unten war (wer hochgescrollt hat, wird nicht gestört).
 * Als letztes Kind in den scrollbaren Nachrichtenbereich setzen.
 */
export function StickToBottom({ count, chatId }: { count: number; chatId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef<{ chatId: string; count: number } | null>(null);
  useEffect(() => {
    const box = ref.current?.parentElement;
    if (!box) return;
    const p = prev.current;
    const firstView = !p || p.chatId !== chatId;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 260;
    if (firstView || (count > (p?.count ?? 0) && nearBottom)) box.scrollTop = box.scrollHeight;
    prev.current = { chatId, count };
  }, [count, chatId]);
  return <div ref={ref} aria-hidden="true" />;
}
