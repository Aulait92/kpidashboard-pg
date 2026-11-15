"use client";

// Präsentationsmodus im Termin (Ole, 15.11.2026): gemeinsames Deck (src/components/folien-deck.tsx); Bausteine und Stufen
// per Klick auf der Folie: sofort umschalten (optimistisch), der Server rechnet und speichert.

import { FolienDeck, type DeckKlick } from "@/components/folien-deck";
import { bausteinAction, tarifAction } from "./actions";

type Folie = { id: string; titel: string; html: string; notizen: string[] };

export function Deck({ id, css, folien, nurNotizen, interaktiv = true }: { id: string; css: string; folien: Folie[]; nurNotizen?: boolean; interaktiv?: boolean }) {
  const onKlick = (k: DeckKlick) => (k.tarif != null ? tarifAction(id, k.tarif, k.sparte) : bausteinAction(id, k.item, k.baustein, k.aktiv));
  return (
    <FolienDeck
      kanal={`deck-${id}`}
      css={css}
      folien={folien}
      onKlick={interaktiv ? onKlick : undefined}
      notizen="unten"
      notizenFenster={`sprechzettel-${id}`}
      nurNotizen={nurNotizen}
    />
  );
}
