"use client";

// Live-Demo der Beratungspräsentation: rechnet nur im Browser (keine Server Actions, kein Speichern), Neuladen setzt zurück.
// Beginnt immer mit Folie 1 (Ole, 15.11.2026).

import { useRef, useState } from "react";
import { FolienDeck, type DeckKlick } from "@/components/folien-deck";
import { ToastProvider } from "@/components/ui/toast";
import { demoAngebote, demoCss, demoFolien, demoKlick } from "@/lib/demo-beratung";

export function DemoAnsicht({ eingebettet }: { eingebettet?: boolean }) {
  const [anfang] = useState(demoAngebote);
  const stand = useRef(anfang);
  const [start] = useState(() => demoFolien(anfang));
  const [css] = useState(demoCss);
  const onKlick = async (k: DeckKlick) => {
    const neu = demoKlick(stand.current, k);
    if (!neu) return { ok: false as const, error: "Das geht in der Demo leider nicht." };
    stand.current = neu;
    return { ok: true as const, folien: demoFolien(neu) };
  };
  const deck = <FolienDeck css={css} folien={start} onKlick={onKlick} eingebettet={eingebettet} />;
  // Öffentliche Demo ohne App-Rahmen: eigener Toast für „Unfall hinzugefügt“ (eingebettet steht der Hinweis in der Folie)
  return eingebettet ? deck : <ToastProvider>{deck}</ToastProvider>;
}
