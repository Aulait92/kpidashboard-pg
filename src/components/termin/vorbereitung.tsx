"use client";

import { useEffect, useRef } from "react";

/**
 * Danke-Seite: Vorbereitungsvideo von YouTube (youtube-nocookie.com, Ole 20.11.2026, ohne „Demo ansehen“). Ab der
 * Hälfte des Videos einmal melden (nur mit Buchungs-Token, der Server vermerkt es am Kontakt). Den Fortschritt liefert
 * der YouTube-Player per postMessage (enablejsapi=1, Ereignis „listening“).
 */
export function Vorbereitung({ youtubeId, onWatched }: { youtubeId: string; onWatched: () => Promise<void> }) {
  const sent = useRef(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const dauer = useRef(0);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(e.origin) || typeof e.data !== "string") return;
      let d: { event?: string; info?: { currentTime?: number; duration?: number } } | null = null;
      try {
        d = JSON.parse(e.data);
      } catch {
        return;
      }
      const info = d?.info;
      if (!info) return;
      if (typeof info.duration === "number" && info.duration > 0) dauer.current = info.duration;
      if (!sent.current && typeof info.currentTime === "number" && dauer.current > 0 && info.currentTime / dauer.current >= 0.5) {
        sent.current = true;
        void onWatched();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onWatched]);

  const anmelden = () => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: youtubeId }), "*");

  return (
    <iframe
      ref={frame}
      src={`https://www.youtube-nocookie.com/embed/${youtubeId}?enablejsapi=1&rel=0&playsinline=1`}
      title="Vorbereitung auf Ihren Termin"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      onLoad={anmelden}
      className="aspect-video w-full rounded-[var(--radius-md)] bg-black"
      data-vorbereitungsvideo
    />
  );
}
