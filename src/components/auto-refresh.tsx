"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const REFRESH_MS = 60_000; // 1 Minute

// Triggert alle 60 Sek ein router.refresh() — Server-Komponenten rendern
// neu und die Karten/Tabellen ziehen frische Daten aus der DB (die der
// Cron-Job parallel im Hintergrund befüllt). Pausiert wenn der Tab im
// Hintergrund ist, holt nach Tab-Rückkehr verpasste Refreshes nach.
export function AutoRefresh() {
  const router = useRouter();
  const lastRef = useRef(Date.now());

  useEffect(() => {
    function tick() {
      if (document.hidden) return;
      router.refresh();
      lastRef.current = Date.now();
    }

    const id = setInterval(tick, REFRESH_MS);

    function onVisibility() {
      if (document.hidden) return;
      // Tab war länger im Hintergrund als das Intervall — sofort nachholen.
      if (Date.now() - lastRef.current >= REFRESH_MS) {
        tick();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  return null;
}
