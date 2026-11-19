// Angebot für den Termin (Ole, 19.11.2026: „Angebote vorbereiten immer noch nicht sofort verständlich“):
// eine Zeile je Versicherung statt Reiter und Schritte. Die eine Aufgabe vor dem Termin: je Versicherung den
// Beitrag der Empfehlung eintragen. Reine Funktionen für Zeilenstand, Zähler und „Weiter“.

import { empfehlungVon, tarifMonat, type SparteWahl, type Tarifauswahl } from "@/lib/tarifauswahl";

/** fertig: Empfehlung hat einen Beitrag · offen: Beitrag (oder Tarif) fehlt · bedarf: erst bei Bedarf in der Präsentation */
export type ZeilenStand = "fertig" | "offen" | "bedarf";

export function zeilenStand(sp: SparteWahl): ZeilenStand {
  if (sp.zusatz) return "bedarf";
  const e = empfehlungVon(sp);
  return e && tarifMonat(sp, e) != null ? "fertig" : "offen";
}

/** Zähler im Kopf: eingetragene Beiträge von den nötigen (ohne „bei Bedarf“). */
export function preiseStand(a: Tarifauswahl): { fertig: number; von: number } {
  const pflicht = a.sparten.filter((s) => !s.zusatz);
  return { fertig: pflicht.filter((s) => zeilenStand(s) === "fertig").length, von: pflicht.length };
}

/** Sind für alle Versicherungen (außer „bei Bedarf“) Beiträge zur Empfehlung eingetragen? */
export function beitraegeVollstaendig(a: Tarifauswahl): boolean {
  const { fertig, von } = preiseStand(a);
  return von > 0 && fertig === von;
}

/** Erste Versicherung ohne Beitrag (beim Öffnen der Seite aufgeklappt), sonst keine. */
export const ersteOffene = (a: Tarifauswahl): string | null => a.sparten.find((s) => zeilenStand(s) === "offen")?.key ?? null;

/** Nächste Versicherung ohne Beitrag nach `key` (danach von vorn), für „Weiter: …“; null, wenn keine mehr offen ist. */
export function naechsteOffene(a: Tarifauswahl, key: string | null): string | null {
  const i = a.sparten.findIndex((s) => s.key === key);
  const reihe = [...a.sparten.slice(i + 1), ...a.sparten.slice(0, Math.max(i, 0))];
  return reihe.find((s) => s.key !== key && zeilenStand(s) === "offen")?.key ?? null;
}
