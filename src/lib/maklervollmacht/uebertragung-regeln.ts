// Bestandsübertragung aus der Maklervollmacht (Ole, 18.11.2026): reine Regeln ohne Datenbank, getestet in
// tests/unit/bestandsuebertragung.test.ts. Server: lib/maklervollmacht/uebertragung.ts.
//
// Nach der Unterschrift legt die App je Vertrag der Vollmacht einen LeadContract mit herkunft „uebertragung“ an.
// Er bringt nur Bestandsprovision (lib/provision contractProvision mit uebertragung) und zählt in Umsatz und
// Kennzahlen erst, wenn der Makler die Umschlüsselung bestätigt hat (uebertragungBestaetigtAt).

import { cleanBisher, bisherMonat } from "@/lib/bisheriger-vertrag";
import { asSparte, sparteForSource, sparteInfo, sparteKind, type SparteKey } from "@/lib/provision";
import { gesellschaftAusText } from "@/lib/tarifkatalog";
import { sparteLabel, type VvVertrag } from "@/lib/maklervollmacht/regeln";

export const UEBERTRAGUNG = "uebertragung";
/** Wiedervorlage „Übertragung bei … bestätigt?“ 4 Wochen nach der Unterschrift */
export const UEBERTRAGUNG_TAGE = 28;

/** Je Vertrag der Vollmacht höchstens ein LeadContract (Index in der Liste der Vollmacht). */
export const uebertragungKey = (vollmachtId: string, index: number) => `${vollmachtId}:${index}`;

/** Art der Aufgabe (LeadTask.kind, eindeutig je Lead): eine je Versicherer. */
export function aufgabeKind(versicherer: string): string {
  const slug = versicherer
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `uebertragung:${slug || "versicherer"}`;
}

/**
 * Sparte der Vollmacht → Sparte für die Provision, über die bestehende Zuordnung (lib/provision sparteForSource mit
 * dem Namen der Sparte, z. B. „Tierversicherung“ → Tier, „Privathaftpflicht“ → Privatschutz). Krankenversicherung
 * (auch Zusatz) als Kranken-Zusatz (PKV-Neugeschäft ist kein Bestand), Unbekanntes als „Sonstiges“.
 */
export function provisionsSparte(vvSparte: string): SparteKey {
  if (vvSparte === "kranken") return "krankenzusatz";
  if (vvSparte === "sonstige") return "sonstiges";
  return sparteForSource(sparteLabel(vvSparte)) ?? sparteForSource(vvSparte) ?? "sonstiges";
}

const grob = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]+/g, "");

/** Gleicher Versicherer? Über die bekannten Gesellschaften (Allianz, HUK, …), sonst gleicher Name ohne Satzzeichen. */
export function gleicherVersicherer(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  const ga = gesellschaftAusText(a);
  const gb = gesellschaftAusText(b);
  if (ga && gb) return ga === gb;
  const x = grob(a);
  const y = grob(b);
  return !!x && !!y && (x === y || (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))));
}

/** Gleiche Sparte für den Beitrag? Über die Bestandslinie (z. B. Zahnzusatz und Krankenzusatz = Kranken). */
export const gleicheSparte = (a: SparteKey, b: SparteKey) => sparteInfo(a).bestandLine === sparteInfo(b).bestandLine;

/** Monatsbeitrag → gespeicherter Beitrag (LeadContract.premium): Kranken-Sparten den Monatsbeitrag, sonst den Jahresbeitrag. */
export function beitragAusMonat(sparte: string, monat: number | null | undefined): number | null {
  if (monat == null || !Number.isFinite(monat) || monat <= 0) return null;
  const kind = sparteKind(sparte);
  if (kind === "honorar") return null;
  return Math.round((kind === "monthly" ? monat : monat * 12) * 100) / 100;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * Monatsbeitrag des bisherigen Vertrags aus der Terminvorbereitung (Tarifauswahl der Termine, neueste zuerst), wenn
 * dort für diese Sparte und diesen Versicherer eingetragen. Ohne Versicherer im bisherigen Vertrag reicht die Sparte.
 */
export function bisherBeitragMonat(tarifauswahlen: unknown[], v: Pick<VvVertrag, "versicherer" | "sparte">): number | null {
  const ziel = provisionsSparte(v.sparte);
  for (const t of tarifauswahlen) {
    const sparten = obj(t).sparten;
    if (!Array.isArray(sparten)) continue;
    for (const sp of sparten) {
      const s = obj(sp);
      const b = cleanBisher(s.bisher);
      if (!b || b.beitrag == null) continue;
      const key = typeof s.key === "string" ? s.key : "";
      const label = typeof s.label === "string" ? s.label : "";
      const sparte = sparteForSource(label) ?? sparteForSource(key.replace(/-/g, " "));
      if (!sparte || !gleicheSparte(asSparte(sparte), ziel)) continue;
      if (b.gesellschaft && !gleicherVersicherer(b.gesellschaft, v.versicherer)) continue;
      const m = bisherMonat(b);
      if (m != null && m > 0) return m;
    }
  }
  return null;
}

export type UebertragungStand = "laeuft" | "bestaetigt" | "abgelehnt";

export function uebertragungStand(c: { status: string; uebertragungBestaetigtAt: Date | string | null }): UebertragungStand {
  if (c.status === "storniert" && !c.uebertragungBestaetigtAt) return "abgelehnt";
  return c.uebertragungBestaetigtAt ? "bestaetigt" : "laeuft";
}

/** Zählt der Vertrag in Umsatz und Kennzahlen? Eigene Abschlüsse immer, Übertragungen erst nach Bestätigung. */
export const zaehltVertrag = (c: { herkunft?: string | null; uebertragungBestaetigtAt?: Date | string | null }) =>
  c.herkunft !== UEBERTRAGUNG || !!c.uebertragungBestaetigtAt;
