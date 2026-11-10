"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const REFRESH_MS = 60_000; // 1 Minute

// Triggert alle 60 Sek ein router.refresh() — Server-Komponenten rendern
// neu und die Karten/Tabellen ziehen frische Daten aus der DB (die der
// Cron-Job parallel im Hintergrund befüllt). Pausiert wenn der Tab im
// Hintergrund ist, holt nach Tab-Rückkehr verpasste Refreshes nach.
export function AutoRefresh({ intervalMs = REFRESH_MS }: { intervalMs?: number } = {}) {
  const router = useRouter();
  const lastRef = useRef(0);

  useEffect(() => {
    lastRef.current = Date.now();
    function tick() {
      if (document.hidden) return;
      router.refresh();
      lastRef.current = Date.now();
    }

    const id = setInterval(tick, intervalMs);

    function onVisibility() {
      if (document.hidden) return;
      // Tab war länger im Hintergrund als das Intervall — sofort nachholen.
      if (Date.now() - lastRef.current >= intervalMs) {
        tick();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, intervalMs]);

  return null;
}
