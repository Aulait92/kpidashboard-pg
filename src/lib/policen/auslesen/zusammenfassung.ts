// Vergleichsblatt: Zusammenfassung über alle ausgelesenen Verträge eines Kunden (rein, testbar). Nur Hinweise an den
// Vermittler, keine Beratung und keine Bewertung (Rechtsprüfung K8: nichts zu Versicherbarkeit, Annahme oder Preisen;
// Hinweise auf fehlende Bausteine deshalb nur bei Sachversicherungen und nur, wenn das Dokument ausdrücklich „nein“ sagt).

import { monatsbetrag, SPARTE_LABEL, type AuslesenSparte, type Felder } from "@/lib/policen/auslesen/felder";

export type VertragKurz = { id: string; sparte: AuslesenSparte; felder: Felder; geprueft: boolean };

export type Kuendigung = { id: string; sparte: AuslesenSparte; versicherer: string | null; zum: string; bis: string | null };
export type Zusammenfassung = {
  vertraege: number;
  /** Summe der Monatsbeträge (gleiche Police doppelt geschickt zählt einmal); null, wenn kein Beitrag bekannt */
  monatSumme: number | null;
  /** Verträge mit Beitrag, aber ohne Zahlweise bzw. umgekehrt (nicht in der Summe) */
  ohneBetrag: number;
  ungeprueft: number;
  kuendigungen: Kuendigung[];
  doppelt: AuslesenSparte[];
  bausteine: { id: string; text: string }[];
};

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const plusMonate = (isoTag: string, m: number) => {
  const d = new Date(`${isoTag}T00:00:00Z`);
  const tag = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + m);
  const letzter = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(tag, letzter));
  return iso(d);
};

/**
 * Nächster Termin, zu dem gekündigt werden kann (zum), und bis wann die Kündigung beim Versicherer sein muss (bis).
 * Genannter Kündigungstermin geht vor; sonst Ablauf, jährlich fortgeschrieben, bis die Frist noch erreichbar ist.
 */
export function naechsteKuendigung(f: Felder, heute: string): { zum: string; bis: string | null } | null {
  const frist = typeof f.kuendigungsfrist_monate?.w === "number" ? f.kuendigungsfrist_monate.w : null;
  const genannt = typeof f.naechster_kuendigungstermin?.w === "string" ? f.naechster_kuendigungstermin.w : null;
  if (genannt && genannt >= heute) return { zum: genannt, bis: frist != null ? plusMonate(genannt, -frist) : null };
  const ablauf = typeof f.ablauf?.w === "string" ? f.ablauf.w : null;
  if (!ablauf) return null;
  let zum = ablauf;
  for (let i = 0; i < 60 && (frist != null ? plusMonate(zum, -frist) : zum) < heute; i++) zum = plusMonate(zum, 12);
  return { zum, bis: frist != null ? plusMonate(zum, -frist) : null };
}

/** Gleicher Vertrag (Police und Nachtrag bzw. doppelt geschickt): Sparte, Versicherer und Nummer gleich. */
const schluessel = (v: VertragKurz) => {
  const nr = v.felder.versicherungsnummer?.w;
  const vers = v.felder.versicherer?.w;
  return typeof nr === "string" && typeof vers === "string" ? `${v.sparte}|${vers.toLowerCase()}|${nr}` : `id|${v.id}`;
};

export function zusammenfassung(vertraege: VertragKurz[], now: Date): Zusammenfassung {
  const heute = iso(now);
  const in3 = iso(new Date(now.getTime() + 92 * DAY));
  // Gleiche Police nur einmal (die zuerst gelistete)
  const gesehen = new Set<string>();
  const einzeln = vertraege.filter((v) => {
    const k = schluessel(v);
    if (gesehen.has(k)) return false;
    gesehen.add(k);
    return true;
  });

  let summe = 0;
  let mitBetrag = 0;
  let ohneBetrag = 0;
  for (const v of einzeln) {
    const m = monatsbetrag(v.felder);
    if (m != null) {
      summe += m;
      mitBetrag++;
    } else if (v.felder.beitrag) ohneBetrag++;
  }

  const kuendigungen: Kuendigung[] = [];
  for (const v of einzeln) {
    const k = naechsteKuendigung(v.felder, heute);
    if (!k) continue;
    const stichtag = k.bis ?? k.zum;
    if (stichtag >= heute && stichtag <= in3) {
      kuendigungen.push({ id: v.id, sparte: v.sparte, versicherer: typeof v.felder.versicherer?.w === "string" ? v.felder.versicherer.w : null, ...k });
    }
  }
  kuendigungen.sort((a, b) => (a.bis ?? a.zum).localeCompare(b.bis ?? b.zum));

  const proSparte = new Map<AuslesenSparte, number>();
  for (const v of einzeln) proSparte.set(v.sparte, (proSparte.get(v.sparte) ?? 0) + 1);
  const doppelt = [...proSparte].filter(([, n]) => n > 1).map(([s]) => s);

  const bausteine: { id: string; text: string }[] = [];
  const nein = (v: VertragKurz, k: string) => v.felder[k]?.w === false;
  for (const v of einzeln) {
    const l = SPARTE_LABEL[v.sparte];
    if (v.sparte === "haftpflicht") {
      if (nein(v, "forderungsausfall")) bausteine.push({ id: v.id, text: `${l} ohne Forderungsausfall` });
      if (nein(v, "schluesselverlust")) bausteine.push({ id: v.id, text: `${l} ohne Schlüsselverlust` });
    }
    if (v.sparte === "hausrat") {
      if (nein(v, "elementar")) bausteine.push({ id: v.id, text: `${l} ohne Elementarschäden` });
      if (nein(v, "unterversicherungsverzicht")) bausteine.push({ id: v.id, text: `${l} ohne Unterversicherungsverzicht` });
    }
    if (v.sparte === "wohngebaeude" && nein(v, "elementar")) bausteine.push({ id: v.id, text: `${l} ohne Elementarschäden` });
  }

  return {
    vertraege: einzeln.length,
    monatSumme: mitBetrag ? Math.round(summe * 100) / 100 : null,
    ohneBetrag,
    ungeprueft: einzeln.filter((v) => !v.geprueft).length,
    kuendigungen,
    doppelt,
    bausteine,
  };
}
