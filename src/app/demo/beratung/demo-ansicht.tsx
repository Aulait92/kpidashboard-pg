"use client";

// Live-Demo der Beratungspräsentation: rechnet nur im Browser (keine Server Actions, kein Speichern), Neuladen setzt zurück.

import { useRef, useState } from "react";
import { FolienDeck, type DeckKlick } from "@/components/folien-deck";
import { demoAngebote, demoCss, demoFolien, demoKlick } from "@/lib/demo-beratung";

export function DemoAnsicht({ eingebettet, folie }: { eingebettet?: boolean; folie?: string }) {
  const [anfang] = useState(demoAngebote);
  const stand = useRef(anfang);
  const [start] = useState(() => demoFolien(anfang));
  const [css] = useState(demoCss);
  const startFolie = folie ? Math.max(0, start.findIndex((f) => f.id.startsWith(folie))) : 0;
  const onKlick = async (k: DeckKlick) => {
    const neu = demoKlick(stand.current, k);
    if (!neu) return { ok: false as const, error: "Das geht in der Demo leider nicht." };
    stand.current = neu;
    return { ok: true as const, folien: demoFolien(neu) };
  };
  return <FolienDeck css={css} folien={start} startFolie={startFolie} onKlick={onKlick} notizen={eingebettet ? "aus" : "schalter"} eingebettet={eingebettet} />;
}
