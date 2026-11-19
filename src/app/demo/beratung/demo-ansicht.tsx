"use client";

// Live-Demo der Beratungspräsentation: rechnet nur im Browser (keine Server Actions, kein Speichern), Neuladen setzt zurück.
// Beginnt immer mit Folie 1 (Ole, 15.11.2026).

import { useRef, useState } from "react";
import { FolienDeck, type DeckKlick } from "@/components/folien-deck";
import { ToastProvider } from "@/components/ui/toast";
import { demoAngebote, demoCss, demoEinwaende, demoFolien, demoKlick } from "@/lib/demo-beratung";

export function DemoAnsicht({ eingebettet }: { eingebettet?: boolean }) {
  const [anfang] = useState(demoAngebote);
  const stand = useRef(anfang);
  const zugesagt = useRef<Date | null>(null);
  const [start] = useState(() => demoFolien(anfang));
  const [css] = useState(demoCss);
  const onKlick = async (k: DeckKlick) => {
    const neu = demoKlick(stand.current, k);
    if (!neu) return { ok: false as const, error: "Das geht in der Demo leider nicht." };
    stand.current = neu;
    return { ok: true as const, folien: demoFolien(neu, new Date(), zugesagt.current) };
  };
  const [einwaende] = useState(() => demoEinwaende(anfang));
  // „Ja, so machen wir es“ in der Demo: nur im Browser, nichts wird gespeichert
  const onZusage = async () => {
    zugesagt.current = new Date();
    return { ok: true as const, folien: demoFolien(stand.current, new Date(), zugesagt.current) };
  };
  const deck = <FolienDeck css={css} folien={start} onKlick={onKlick} eingebettet={eingebettet} onZusage={onZusage} einwaende={eingebettet ? [] : einwaende} />;
  // Öffentliche Demo ohne App-Rahmen: eigener Toast für „Unfall hinzugefügt“ (eingebettet steht der Hinweis in der Folie)
  return eingebettet ? deck : <ToastProvider>{deck}</ToastProvider>;
}
