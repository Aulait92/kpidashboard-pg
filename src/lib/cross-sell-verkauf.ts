// „Weiteres Produkt per Klick anbieten“ (Ole, 18.11.2026): Verkaufsmoment für das Bestandskunden-Modul an den
// Stellen, an denen Kunden ohne weiteres Produkt ohnehin auftauchen (Kontakte-Filter „Ohne weiteres Produkt“,
// Wiedervorlage „Weiteres Produkt anbieten?“). Nur, solange das Modul für alle verfügbar ist
// (BESTAND_MODULE_AVAILABLE, lib/bestand/sichtbar.ts); ist es aus, sieht niemand etwas davon.
// Modul gebucht: Bestandskampagne mit genau diesen Kunden. Nicht gebucht: kurzes Blatt mit eigenen Zahlen, ohne Preis.
// Rein (ohne Datenbank), auch im Browser nutzbar; Laden: lib/cross-sell-verkauf-server.ts.

import { BESTAND_MODULE_AVAILABLE } from "@/lib/bestand/sichtbar";
import { CROSS_SELL_TODO } from "@/lib/vertraege-shared";

/** Segment der Bestandskampagne: Kunden aus dem Filter „Ohne weiteres Produkt“ (lib/cross-sell-offen.ts). */
export const OHNE_WEITERES_SEGMENT = { ohneWeiteresProdukt: true } as const;

/** Bestandskampagne „Weiteres Produkt anbieten“, vorbefüllt mit den Kunden ohne weiteres Produkt. */
export const CROSS_SELL_KAMPAGNE_HREF = `/buyer/bestand/kampagne?${new URLSearchParams({ anlass: "cross_sell", segment: JSON.stringify(OHNE_WEITERES_SEGMENT) })}`;

/** Selbstbuchung des Moduls (Konto → Zusatzmodule). */
export const MODUL_BUCHEN_HREF = "/buyer/konto?modul=bestand#zusatzmodule";

/** Daten für Leiste, Knopf und Blatt. null = nichts zeigen. */
export type CrossSellVerkauf = {
  /** Modul aktiv: Knopf öffnet die Kampagne, sonst das Blatt */
  gebucht: boolean;
  /** Kunden ohne weiteres Produkt (gleiche Zählung wie der Filter) */
  anzahl: number;
  /** Eigener Schnitt: Provision im ersten Jahr je Vertrag, gerundet (null = keine belastbare Zahl) */
  provision: number | null;
};

/** Darf der Verkaufsmoment überhaupt erscheinen? Nur mit Modul für alle und nur für den Inhaber (bucht und startet Kampagnen). */
export function crossSellVerkaufAn(teamRole: "owner" | "advisor", verfuegbar: boolean = BESTAND_MODULE_AVAILABLE): boolean {
  return verfuegbar && teamRole === "owner";
}

/** Wiedervorlage „Weiteres Produkt anbieten?“ (auch mit Zusatz „Naheliegend: …“) */
export function istCrossSellAufgabe(note: string | null | undefined): boolean {
  return !!note && note.startsWith(CROSS_SELL_TODO);
}

const eur = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;

/** Leiste über der gefilterten Liste: „12 Kunden ohne weiteres Produkt“. */
export function crossSellLeisteText(anzahl: number): string {
  return `${anzahl.toLocaleString("de-DE")} ${anzahl === 1 ? "Kunde" : "Kunden"} ohne weiteres Produkt`;
}

/**
 * Ein Satz Nutzen mit eigenen Zahlen (kein Preis, kein Versprechen): die Zahl der Kunden und, wenn bekannt, der eigene
 * bisherige Schnitt je Vertrag.
 */
export function crossSellNutzenSatz(anzahl: number, provision: number | null): string {
  const wen = anzahl === 1 ? "diesem Kunden" : `diesen ${anzahl.toLocaleString("de-DE")} Kunden`;
  const zahl = provision != null && provision >= 1 ? `, bisher bringt Ihnen ein Vertrag im Schnitt ${eur(provision)} Provision` : "";
  return `Mit dem Bestandskunden-Modul bieten Sie ${wen} mit einem Klick ein weiteres Produkt an${zahl}.`;
}
