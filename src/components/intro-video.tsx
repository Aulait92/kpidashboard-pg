"use client";

// Einführungsvideos (Ole, 13.11.2026): Rundgang durch die neue Oberfläche.
// Kurz (ca. 1 Min.) als wegklickbare Karte auf „Heute“, beide Videos unter /buyer/einfuehrung.

import { useState } from "react";
import { PlayCircle, X } from "lucide-react";
import { Card } from "@/components/ui";
import { markIntroSeenAction } from "@/app/buyer/einfuehrung/actions";
import { VIDEOS } from "@/lib/intro-videos";


export function IntroVideo({ kind, onEnded }: { kind: keyof typeof VIDEOS; onEnded?: () => void }) {
  const v = VIDEOS[kind];
  return (
    <video
      className="aspect-video w-full rounded-[var(--radius-md)] bg-black"
      src={v.src}
      poster={v.poster}
      controls
      playsInline
      preload="none"
      onEnded={onEnded}
      data-intro-video={kind}
    >
      Ihr Browser kann dieses Video nicht abspielen.
    </video>
  );
}

/** Karte „Willkommen! Ihre Software in 1 Minute“ – verschwindet nach Wegklicken oder Ansehen. */
export function IntroVideoCard() {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  const done = () => {
    setHidden(true);
    void markIntroSeenAction();
  };
  return (
    <Card className="mb-5" data-intro-card>
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <PlayCircle className="h-5 w-5 text-[color:var(--brand)]" /> Willkommen! Ihre Software in 1 Minute
          </h2>
          <p className="mt-0.5 text-sm text-[color:var(--muted)]">Ein kurzer Rundgang – funktioniert auch ohne Ton.</p>
        </div>
        <button type="button" onClick={done} aria-label="Video ausblenden" className="rounded-full p-1.5 text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken,#f1f5f9)]">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-5 pt-3">
        <IntroVideo
          kind="kurz"
          onEnded={() => {
            void markIntroSeenAction();
          }}
        />
        <p className="mt-2 text-xs text-[color:var(--muted)]">Später jederzeit wieder im Profilmenü unter „Einführung ansehen“.</p>
      </div>
    </Card>
  );
}
