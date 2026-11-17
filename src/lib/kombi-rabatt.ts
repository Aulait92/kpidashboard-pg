// Kombi-Rabatt (Bündelrabatt) einer Gesellschaft (Ole, 15./16.11.2026), z. B. Allianz PrivatSchutz: ab 2 Verträgen der
// Linie Komfort oder Premium mit 3 Jahren Laufzeit 5 bis 20 % auf die Summe der Einzelbeiträge. Die Staffel steht je
// Gesellschaft in data/tarifkatalog/<gesellschaft>/buendel.json (BuendelRegel), nie fest im Code.
//
// Reine Funktionen (Terminvorbereitung im Browser, Präsentation, Demo): Wer zählt, welche Stufe gilt, was fehlt bis zur
// nächsten Stufe, welcher gewählte Tarif den Rabatt verhindert (z. B. Smart statt Komfort).

import type { AngebotItem } from "@/lib/angebote-daten";

export type KombiStufe = { anzahl: number; prozent: number; abAnzahl?: boolean };

/** Regel für die Präsentation (Schnappschuss aus dem Katalog, liegt mit den Angeboten in offersJson). */
export type KombiRegel = {
  /** Schlüssel der Gesellschaft („allianz“) bzw. „demo“ */
  gruppe: string;
  /** Anzeigename des Bündels, z. B. „Allianz PrivatSchutz“; null = „Kombi-Rabatt“ */
  name: string | null;
  /** Linien, die zählen (leer = alle) */
  linien: string[];
  mindestLaufzeitJahre: number | null;
  /** Sparten, die zählen (leer = alle) */
  sparten: string[];
  staffel: KombiStufe[];
  /** Sparten, die zusammen nur einmal zählen (R+V: alle Haftpflichtversicherungen) */
  einmal?: string[][];
};

/** Zuordnung eines Angebots zu einer Regel: Gruppe, Sparte (Katalog-Schlüssel), Linie, Laufzeit. */
export type KombiZuordnung = { gruppe: string; sparte: string; linie: string | null; laufzeitJahre?: number | null };

type MitKombi = Pick<AngebotItem, "sparte" | "tarif" | "beitragMonat" | "bausteine" | "gewaehlt"> & { kombi?: KombiZuordnung | null };

export type KombiErgebnis = {
  regel: KombiRegel;
  /** zählende Verträge (je Sparte einmal) */
  anzahl: number;
  /** aktuelle Stufe in Prozent (0 = noch kein Rabatt) */
  prozent: number;
  /** Summe der zählenden Monatsbeiträge */
  basis: number;
  /** Rabatt in Euro im Monat */
  euro: number;
  /** nächste Stufe (null = höchste erreicht) */
  naechste: KombiStufe | null;
  /** Verträge bis zur nächsten Stufe */
  fehlt: number;
  /** gewählte Angebote derselben Gruppe, die wegen der Linie bzw. Laufzeit nicht zählen */
  blockiert: { sparte: string; tarif: string | null; grund: "linie" | "laufzeit" }[];
};

// wie beitragEffektiv (lib/angebote-daten.ts), hier ohne Import, weil angebote-daten diese Datei zum Bereinigen nutzt
const effektiv = (i: Pick<AngebotItem, "beitragMonat" | "bausteine">) =>
  i.beitragMonat == null ? 0 : Math.max(0, i.beitragMonat + i.bausteine.filter((b) => b.aktiv).reduce((s, b) => s + b.beitrag, 0));
const klein = (s: string) => s.toLocaleLowerCase("de").trim();
const cent = (n: number) => Math.round(n * 100);

/** Prozent für eine Anzahl Verträge: die höchste erreichte Stufe (über der letzten bleibt die letzte). */
export function prozentFuer(staffel: KombiStufe[], anzahl: number): number {
  let p = 0;
  for (const s of [...staffel].sort((a, b) => a.anzahl - b.anzahl)) if (anzahl >= s.anzahl) p = s.prozent;
  return p;
}

/** Nächste Stufe mit mehr Prozent als heute; null, wenn die höchste erreicht ist. */
export function naechsteStufe(staffel: KombiStufe[], anzahl: number): KombiStufe | null {
  const jetzt = prozentFuer(staffel, anzahl);
  return [...staffel].sort((a, b) => a.anzahl - b.anzahl).find((s) => s.anzahl > anzahl && s.prozent > jetzt) ?? null;
}

/**
 * Rabatt auf eine Summe: Endbeitrag auf den Cent abgerundet (wie im Beispiel der Allianz: 36,23 € mit 10 % ergibt
 * 32,60 €), Rabatt = Summe minus Endbeitrag. Ganzzahlig in Cent gerechnet, ohne Rundungsfehler.
 */
export function rabattAuf(summe: number, prozent: number): { euro: number; end: number } {
  const c = cent(summe);
  if (prozent <= 0 || c <= 0) return { euro: 0, end: c / 100 };
  const end = Math.floor((c * (100 - prozent)) / 100 + 1e-9);
  return { euro: (c - end) / 100, end: end / 100 };
}

const passtSparte = (r: KombiRegel, sparte: string) => !r.sparten.length || r.sparten.includes(sparte);
const passtLinie = (r: KombiRegel, linie: string | null) => !r.linien.length || (!!linie && r.linien.some((l) => klein(l) === klein(linie)));
// Ohne Angabe gilt die Laufzeit der Regel (der Vermittler rechnet im Termin mit ihr); nur eine kürzere schließt aus.
const passtLaufzeit = (r: KombiRegel, jahre: number | null | undefined) => r.mindestLaufzeitJahre == null || jahre == null || jahre >= r.mindestLaufzeitJahre;

/** Schlüssel zum Zählen: Sparten einer „einmal“-Gruppe zählen zusammen als eine. */
const zaehlKey = (r: KombiRegel, sparte: string) => {
  const g = r.einmal?.findIndex((xs) => xs.includes(sparte)) ?? -1;
  return g >= 0 ? `einmal:${g}` : sparte;
};

/** Anzahl zählender Verträge für eine Menge Sparten (ohne Beiträge), z. B. für „Mit Unfall: 15 %“. */
export function anzahlFuer(r: KombiRegel, sparten: string[]): number {
  return new Set(sparten.filter((s) => passtSparte(r, s)).map((s) => zaehlKey(r, s))).size;
}

/** Kombi-Rabatt einer Regel über die gewählten Angebote. */
export function kombiFuer(r: KombiRegel, items: MitKombi[]): KombiErgebnis {
  // Nur Verträge mit Beitrag zählen: sonst zeigte die Folie eine Stufe, deren Beitrag noch fehlt
  const gruppe = items.filter((i) => i.gewaehlt && i.beitragMonat != null && i.kombi?.gruppe === r.gruppe && passtSparte(r, i.kombi.sparte));
  const blockiert: KombiErgebnis["blockiert"] = [];
  const zaehlen: MitKombi[] = [];
  for (const i of gruppe) {
    if (!passtLinie(r, i.kombi!.linie)) blockiert.push({ sparte: i.sparte, tarif: i.tarif, grund: "linie" });
    else if (!passtLaufzeit(r, i.kombi!.laufzeitJahre)) blockiert.push({ sparte: i.sparte, tarif: i.tarif, grund: "laufzeit" });
    else zaehlen.push(i);
  }
  const anzahl = new Set(zaehlen.map((i) => zaehlKey(r, i.kombi!.sparte))).size;
  const prozent = prozentFuer(r.staffel, anzahl);
  // Rabatt auf die Summe aller zählenden Beiträge (inkl. gewählter Bausteine)
  const basis = zaehlen.reduce((s, i) => s + effektiv(i), 0);
  const { euro } = rabattAuf(basis, prozent);
  const naechste = naechsteStufe(r.staffel, anzahl);
  return { regel: r, anzahl, prozent, basis: cent(basis) / 100, euro, naechste, fehlt: naechste ? naechste.anzahl - anzahl : 0, blockiert };
}

/**
 * Bester Kombi-Rabatt über alle Regeln (Makler mit mehreren Gesellschaften: je Gesellschaft gerechnet, die mit dem
 * meisten Rabatt bzw. den meisten zählenden Verträgen gewinnt). null ohne passende Regel oder ohne zählenden Vertrag.
 */
export function kombiRabatt(items: MitKombi[], regeln: KombiRegel[] | null | undefined): KombiErgebnis | null {
  let best: KombiErgebnis | null = null;
  for (const r of regeln ?? []) {
    const e = kombiFuer(r, items);
    if (!e.anzahl && !e.blockiert.length) continue;
    if (!best || e.euro > best.euro || (e.euro === best.euro && e.anzahl > best.anzahl)) best = e;
  }
  return best;
}

/** Prozent, wenn eine weitere Sparte dazukommt (für „Mit Unfall: 15 %“); null, wenn sie nicht zählt oder nichts ändert. */
export function prozentMit(e: KombiErgebnis, sparte: string, gewaehlteSparten: string[]): number | null {
  if (!passtSparte(e.regel, sparte)) return null;
  const n = anzahlFuer(e.regel, [...gewaehlteSparten, sparte]);
  const p = prozentFuer(e.regel.staffel, n);
  return p > e.prozent ? p : null;
}

/** „Noch 1 Vertrag bis 10 %“ bzw. „Noch 2 Verträge bis 5 %“; null auf der höchsten Stufe. */
export function naechsteText(e: Pick<KombiErgebnis, "naechste" | "fehlt">): string | null {
  if (!e.naechste || e.fehlt <= 0) return null;
  return `Noch ${e.fehlt} ${e.fehlt === 1 ? "Vertrag" : "Verträge"} bis ${e.naechste.prozent} %`;
}

/** Bedingung als Fußnote: „ab 2 Verträgen der Linie Komfort oder Premium, Laufzeit 3 Jahre“. */
export function bedingungText(r: KombiRegel): string {
  const ab = [...r.staffel].sort((a, b) => a.anzahl - b.anzahl)[0]?.anzahl ?? 2;
  const linien = r.linien.length ? ` der Linie ${r.linien.length > 1 ? `${r.linien.slice(0, -1).join(", ")} oder ${r.linien.at(-1)}` : r.linien[0]}` : "";
  const laufzeit = r.mindestLaufzeitJahre ? `, Laufzeit ${r.mindestLaufzeitJahre} Jahre` : "";
  return `ab ${ab} Verträgen${linien}${laufzeit}`;
}

/** Staffel zum Anzeigen: „2 Verträge 5 %“ … „5+ Verträge 20 %“, aktuelle Stufe markiert. */
export function staffelLeiste(e: Pick<KombiErgebnis, "regel" | "prozent">): { text: string; prozent: number; aktiv: boolean }[] {
  const st = [...e.regel.staffel].sort((a, b) => a.anzahl - b.anzahl);
  return st.map((s, i) => ({
    text: `${s.anzahl}${s.abAnzahl || i === st.length - 1 ? "+" : ""} Verträge`,
    prozent: s.prozent,
    aktiv: s.prozent === e.prozent,
  }));
}

/** Regel defensiv lesen (aus offersJson bzw. vom Browser). */
export function cleanKombiRegeln(raw: unknown): KombiRegel[] {
  const out: KombiRegel[] = [];
  for (const x of (Array.isArray(raw) ? raw : []).slice(0, 6)) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const gruppe = typeof r.gruppe === "string" && /^[a-z0-9-]{1,40}$/.test(r.gruppe) ? r.gruppe : null;
    const liste = (v: unknown, n = 20) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && !!s.trim()).map((s) => s.trim().slice(0, 60)).slice(0, n) : []);
    const staffel = (Array.isArray(r.staffel) ? r.staffel : [])
      .map((s) => (s && typeof s === "object" ? (s as Record<string, unknown>) : {}))
      .filter((s) => typeof s.anzahl === "number" && typeof s.prozent === "number" && s.anzahl > 0 && s.anzahl < 20 && s.prozent > 0 && s.prozent < 100)
      .map((s) => ({ anzahl: s.anzahl as number, prozent: s.prozent as number, ...(s.abAnzahl === true ? { abAnzahl: true } : {}) }))
      .sort((a, b) => a.anzahl - b.anzahl)
      .slice(0, 8);
    if (!gruppe || !staffel.length || out.some((o) => o.gruppe === gruppe)) continue;
    const einmal = (Array.isArray(r.einmal) ? r.einmal : []).map((g) => liste(g)).filter((g) => g.length > 1).slice(0, 4);
    out.push({
      gruppe,
      name: typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 60) : null,
      linien: liste(r.linien, 6),
      mindestLaufzeitJahre: typeof r.mindestLaufzeitJahre === "number" && r.mindestLaufzeitJahre > 0 && r.mindestLaufzeitJahre <= 10 ? r.mindestLaufzeitJahre : null,
      sparten: liste(r.sparten, 30),
      staffel,
      ...(einmal.length ? { einmal } : {}),
    });
  }
  return out;
}

export function cleanKombiZuordnung(raw: unknown): KombiZuordnung | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const gruppe = typeof r.gruppe === "string" && /^[a-z0-9-]{1,40}$/.test(r.gruppe) ? r.gruppe : null;
  const sparte = typeof r.sparte === "string" && /^[a-z0-9-]{1,60}$/.test(r.sparte) ? r.sparte : null;
  if (!gruppe || !sparte) return null;
  const linie = typeof r.linie === "string" && r.linie.trim() ? r.linie.trim().slice(0, 40) : null;
  const laufzeit = typeof r.laufzeitJahre === "number" && r.laufzeitJahre > 0 && r.laufzeitJahre <= 10 ? Math.round(r.laufzeitJahre) : null;
  return { gruppe, sparte, linie, ...(laufzeit ? { laufzeitJahre: laufzeit } : {}) };
}
