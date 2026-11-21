// Euro-Potenzial je Chance im Bestand (Cockpit „Heute zuerst“, Plan 2026-11-19-bestand-champions, Paket 1).
//
// Erwartete Provision = Empfänger × Antwortquote × Abschlussquote × Provision je Sparte (1. Jahr, mit den eigenen
// Sätzen aus „Meine Provisionen“, sonst Standard aus lib/provision.ts). Immer als gerundete Spanne mit dem Hinweis
// „Schätzung“, nie als Zusage. Quoten: vorsichtige Standards je Anlass; ab EIGENE_MIN eigenen angeschriebenen Kunden
// zu einem Anlass die eigene Antwortquote (aus lib/bestand/statistik.ts), bei genug Antworten auch die eigene
// Abschlussquote. Nur für den Vermittler (intern), nie in Texten an Bestandskunden.
// Rein, ohne Datenbank (getestet in tests/unit/bestand-potenzial.test.ts).

import { contractProvision, type ProvisionOverrides, type SparteKey } from "@/lib/provision";
import type { Occasion } from "@/lib/bestand/campaigns";

/** Spanne in Euro (untere und obere Schätzung). */
export type Spanne = { low: number; high: number };
/** Quoten als Anteile: Antwort je angeschriebenem Kunden, Abschluss je Antwort. */
export type Quoten = { reply: Spanne; close: Spanne; own: boolean };

/** Chancen-Art im Cockpit: Kampagnen-Anlass oder die Bitte um Einwilligung. */
export type ChanceArt = Occasion | "einwilligung";

/** Ab so vielen eigenen angeschriebenen Kunden zählen die eigenen Quoten. */
export const EIGENE_MIN = 30;
/** Ab so vielen eigenen Antworten zählt die eigene Abschlussquote. */
const EIGENE_ANTWORTEN_MIN = 8;

/**
 * Vorsichtige Standardquoten (Erfahrungswerte, eher niedrig angesetzt). Einwilligung: reply = Anteil, der
 * einwilligt; close = Anteil der Neu-Erreichbaren, der über eine spätere Kampagne abschließt.
 */
export const STANDARD_QUOTEN: Record<ChanceArt, { reply: Spanne; close: Spanne }> = {
  cross_sell: { reply: { low: 0.08, high: 0.15 }, close: { low: 0.2, high: 0.35 } },
  renewal: { reply: { low: 0.1, high: 0.2 }, close: { low: 0.2, high: 0.35 } },
  review: { reply: { low: 0.08, high: 0.15 }, close: { low: 0.15, high: 0.25 } },
  birthday: { reply: { low: 0.1, high: 0.2 }, close: { low: 0.05, high: 0.1 } },
  empfehlung: { reply: { low: 0.04, high: 0.08 }, close: { low: 0.15, high: 0.25 } },
  einwilligung: { reply: { low: 0.15, high: 0.3 }, close: { low: 0.016, high: 0.05 } },
};

/** Sparte im Bestand (ExistingContract.line) → Sparte der Provisionsrechnung. */
export const LINE_SPARTE: Record<string, SparteKey> = {
  KFZ: "kfz",
  Haftpflicht: "privatschutz",
  Hausrat: "hausrat",
  Wohngebäude: "wohngebaeude",
  Rechtsschutz: "rechtsschutz",
  Unfall: "unfall",
  Vorsorge: "leben_bu",
  BU: "bu",
  Kranken: "krankenzusatz",
  Pflege: "pflegezusatz",
  Tier: "katze",
};

/** Provision im 1. Jahr für einen typischen neuen Vertrag dieser Sparte (eigene Sätze, sonst Standard). */
export function provisionForLine(line: string | null | undefined, rates?: ProvisionOverrides): number {
  const sparte: SparteKey = (line && LINE_SPARTE[line]) || "sonstiges";
  return contractProvision({ sparte, premium: null }, rates).firstYear;
}

/** Eigene Zahlen je Anlass (aus der Kampagnen-Statistik). */
export type EigeneZahlen = { angeschrieben: number; geantwortet: number; abschluss: number };

/** Summiert die Statistik je Anlass (rein; Eingabe wie lib/bestand/statistik.CampaignStats). */
export function eigeneZahlen(stats: { occasion: string; funnel: { gesamt: EigeneZahlen } }[]): Partial<Record<Occasion, EigeneZahlen>> {
  const out: Partial<Record<Occasion, EigeneZahlen>> = {};
  for (const s of stats) {
    const k = s.occasion as Occasion;
    const o = (out[k] ??= { angeschrieben: 0, geantwortet: 0, abschluss: 0 });
    o.angeschrieben += s.funnel.gesamt.angeschrieben;
    o.geantwortet += s.funnel.gesamt.geantwortet;
    o.abschluss += s.funnel.gesamt.abschluss;
  }
  return out;
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));
/** Eigener Wert als Spanne: ±25 % um die gemessene Quote. */
const around = (q: number): Spanne => ({ low: clamp(q * 0.75), high: clamp(q * 1.25) });

/** Quoten für einen Anlass: eigene ab EIGENE_MIN angeschriebenen Kunden, sonst Standard. */
export function quotenFor(art: ChanceArt, own?: EigeneZahlen | null): Quoten {
  const std = STANDARD_QUOTEN[art];
  if (art === "einwilligung" || !own || own.angeschrieben < EIGENE_MIN) return { ...std, own: false };
  const reply = around(own.geantwortet / own.angeschrieben);
  const close = own.geantwortet >= EIGENE_ANTWORTEN_MIN ? around(own.abschluss / own.geantwortet) : std.close;
  return { reply, close, own: true };
}

/** Erwartete Provision als ungerundete Spanne. */
export function erwarteteProvision(recipients: number, q: Pick<Quoten, "reply" | "close">, provision: number): Spanne {
  if (recipients <= 0 || provision <= 0) return { low: 0, high: 0 };
  return { low: recipients * q.reply.low * q.close.low * provision, high: recipients * q.reply.high * q.close.high * provision };
}

const step = (n: number) => (n < 100 ? 10 : n < 1000 ? 50 : n < 10000 ? 100 : 1000);

/** Glatte Spanne: unten abrunden, oben aufrunden (Stufen 10 / 50 / 100 / 1.000 €). */
export function rundeSpanne(s: Spanne): Spanne {
  const low = Math.floor(s.low / step(s.low)) * step(s.low);
  const high = Math.max(Math.ceil(s.high / step(s.high)) * step(s.high), low);
  return { low, high };
}

const eur = (n: number) => n.toLocaleString("de-DE");

/** „ca. 900 bis 1.900 €“ bzw. „bis 10 €“ (gerundet). Ohne Wert: null. */
export function spanneText(s: Spanne): string | null {
  const r = rundeSpanne(s);
  if (r.high <= 0) return null;
  if (r.low <= 0) return `bis ${eur(r.high)} €`;
  if (r.low === r.high) return `ca. ${eur(r.low)} €`;
  return `ca. ${eur(r.low)} bis ${eur(r.high)} €`;
}

/** Mitte der Spanne (für die Rangfolge). */
export const mitte = (s: Spanne) => (s.low + s.high) / 2;

/** Nach erwartetem Euro-Wert sortieren (Mitte der Spanne), bei Gleichstand nach Kundenzahl. Stabil, rein. */
export function nachEuro<T extends { euro: Spanne; count: number }>(list: readonly T[]): T[] {
  return [...list].sort((x, y) => mitte(y.euro) - mitte(x.euro) || y.count - x.count);
}
