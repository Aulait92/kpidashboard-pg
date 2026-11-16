"use client";

import { useRef } from "react";
import { MonitorPlay } from "lucide-react";

/**
 * Danke-Seite: Vorbereitungsvideo und „Demo ansehen“. Ab der Hälfte des Videos bzw. beim Öffnen
 * der Demo einmal melden (nur mit Buchungs-Token, der Server vermerkt es am Kontakt).
 */
export function Vorbereitung({
  videoUrl,
  demoUrl,
  onWatched,
  onDemo,
}: {
  videoUrl: string;
  demoUrl: string;
  onWatched: () => Promise<void>;
  onDemo: () => Promise<void>;
}) {
  const sent = useRef(false);
  return (
    <div className="space-y-4">
      <video
        src={videoUrl}
        controls
        playsInline
        preload="metadata"
        className="aspect-video w-full rounded-[var(--radius-md)] bg-black"
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (!sent.current && v.duration > 0 && v.currentTime / v.duration >= 0.5) {
            sent.current = true;
            void onWatched();
          }
        }}
        data-vorbereitungsvideo
      />
      <a
        href={demoUrl}
        target="_blank"
        rel="noopener"
        onClick={() => void onDemo()}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-base font-semibold text-white transition hover:bg-[color:var(--brand-dark)]"
      >
        <MonitorPlay className="h-4 w-4" /> Demo ansehen
      </a>
    </div>
  );
}
