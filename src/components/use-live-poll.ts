"use client";

// Ein Hook für alle Live-Ansichten (Kundenbereich und Admin-Chats): fragt `url` alle
// `intervalMs` ab (JSON { v }), nur bei sichtbarer Seite, und ruft `onChange`, wenn sich
// der Marker ändert. Logik in lib/live-poll.ts.

import { useEffect, useRef } from "react";
import { startLivePoll } from "@/lib/live-poll";

export const LIVE_POLL_MS = 5_000;

export function useLivePoll(url: string, onChange: (marker: string, prev: string) => void, intervalMs = LIVE_POLL_MS): void {
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  }, [onChange]);

  useEffect(
    () =>
      startLivePoll({
        intervalMs,
        onChange: (marker, prev) => cb.current(marker, prev),
        fetchMarker: async () => {
          const res = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
          if (!res.ok) return null;
          const v = ((await res.json()) as { v?: unknown }).v;
          return typeof v === "string" ? v : null;
        },
      }),
    [url, intervalMs],
  );
}
