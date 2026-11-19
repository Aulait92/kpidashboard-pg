"use client";

// Präsentationsmodus im Termin (Ole, 15.11.2026): gemeinsames Deck (src/components/folien-deck.tsx). Bausteine und
// Stufen per Klick auf der Folie: sofort umschalten (optimistisch), der Server rechnet und speichert.
// Fassung C: Paket auf der Entscheidungsfolie wählen (paketAction).
// Abschluss (19.11.2026): „Ja, so machen wir es“ speichert die Zusage; Einwände als Sprungziele; Sprechhinweise nur
// für den Vermittler (zum Aufklappen). Jede erreichte Folie wird einmal gemessen (lib/praesentation-messung.ts).

import { useCallback } from "react";
import { FolienDeck, type DeckFolie, type DeckKlick } from "@/components/folien-deck";
import { bausteinAction, folieAction, paketAction, tarifAction, zusageAction } from "./actions";

export function Deck({ id, css, folien, einwaende, interaktiv = true }: { id: string; css: string; folien: DeckFolie[]; einwaende?: DeckFolie[]; interaktiv?: boolean }) {
  const onKlick = (k: DeckKlick) =>
    k.paket ? paketAction(id, k.paket) : k.tarif != null ? tarifAction(id, k.tarif, k.sparte, k.sparte && k.aktiv && k.folie === "ueberblick") : bausteinAction(id, k.item, k.baustein, k.aktiv);
  const onFolie = useCallback((f: string) => void folieAction(id, f).catch(() => {}), [id]);
  return (
    <FolienDeck
      css={css}
      folien={folien}
      einwaende={einwaende}
      onKlick={interaktiv ? onKlick : undefined}
      onZusage={interaktiv ? () => zusageAction(id) : undefined}
      onFolie={interaktiv ? onFolie : undefined}
    />
  );
}
