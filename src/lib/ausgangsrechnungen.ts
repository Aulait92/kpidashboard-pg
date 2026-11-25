// Ausgangsrechnungen aus Papierkram (Ole, 25.11.2026): CSV-Export „Rechnungen“ einlesen und speichern. Die BWA zählt den
// Umsatz danach nach Rechnungen (lib/bwa.ts). Entwürfe werden nicht übernommen; gleiche Rechnungsnummer = Aktualisierung.
// Parser rein und getestet; speichern: importAusgangsrechnungen.

import { prisma } from "@/lib/prisma";

export type AusgangsrechnungZeile = {
  nummer: string;
  datum: string; // YYYY-MM-DD
  kunde: string;
  kundennr: string | null;
  land: string | null;
  netto: number;
  ust: number;
  brutto: number;
  status: string;
  typ: string;
  notiz: string | null;
};

/** CSV-Zeile mit Semikolon und Anführungszeichen ("" = Anführungszeichen im Feld) zerlegen. */
function felder(zeile: string): string[] {
  const out: string[] = [];
  let akt = "";
  let inQuote = false;
  for (let i = 0; i < zeile.length; i++) {
    const c = zeile[i];
    if (inQuote) {
      if (c === '"' && zeile[i + 1] === '"') {
        akt += '"';
        i++;
      } else if (c === '"') inQuote = false;
      else akt += c;
    } else if (c === '"') inQuote = true;
    else if (c === ";") {
      out.push(akt);
      akt = "";
    } else akt += c;
  }
  out.push(akt);
  return out.map((f) => f.trim());
}

/** „1.500,00“ → 1500; leer → 0. */
export const betrag = (s: string) => {
  const t = s.replace(/\s|€/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

/** „19.11.2026“ → „2026-11-19“, sonst null. */
const isoDatum = (s: string) => {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
};

/**
 * Papierkram-Export „Rechnungen“ (Kopfzeile mit „Rechnungsnr.“, „Kunde“, „Datum“, „Netto“, „USt.“, „Brutto“, „Status“,
 * „Typ“ …). Entwürfe und Zeilen ohne Nummer oder Datum fallen weg. Wirft, wenn die Kopfzeile nicht passt.
 */
export function parsePapierkramCsv(text: string): AusgangsrechnungZeile[] {
  const zeilen = text.replace(/^﻿/, "").split(/\r?\n/).filter((z) => z.trim());
  if (!zeilen.length) return [];
  const kopf = felder(zeilen[0]);
  const spalte = (name: string) => kopf.findIndex((k) => k.toLowerCase() === name.toLowerCase());
  const idx = {
    nummer: spalte("Rechnungsnr."),
    kunde: spalte("Kunde"),
    land: spalte("Land"),
    kundennr: spalte("Kundennummer"),
    datum: spalte("Datum"),
    status: spalte("Status"),
    typ: spalte("Typ"),
    netto: spalte("Netto"),
    ust: spalte("USt."),
    brutto: spalte("Brutto"),
    notiz: spalte("Notiz"),
  };
  for (const k of ["nummer", "kunde", "datum", "netto", "brutto"] as const) {
    if (idx[k] < 0) throw new Error(`Spalte fehlt im Papierkram-Export: ${k}`);
  }
  const out: AusgangsrechnungZeile[] = [];
  for (const z of zeilen.slice(1)) {
    const f = felder(z);
    const g = (i: number) => (i >= 0 ? (f[i] ?? "") : "");
    const nummer = g(idx.nummer);
    const status = g(idx.status) || "unbekannt";
    const datum = isoDatum(g(idx.datum));
    if (!nummer || !datum || /^entwurf$/i.test(nummer) || /^entwurf$/i.test(status)) continue;
    out.push({
      nummer: nummer.slice(0, 40),
      datum,
      kunde: g(idx.kunde).slice(0, 200) || "Ohne Kunde",
      kundennr: g(idx.kundennr) || null,
      land: g(idx.land) || null,
      netto: betrag(g(idx.netto)),
      ust: betrag(g(idx.ust)),
      brutto: betrag(g(idx.brutto)),
      status: status.slice(0, 40),
      typ: (g(idx.typ) || "Rechnung").slice(0, 40),
      notiz: g(idx.notiz).slice(0, 500) || null,
    });
  }
  return out;
}

/** Speichern (gleiche Nummer = aktualisieren). Gibt neu/aktualisiert zurück. */
export async function importAusgangsrechnungen(zeilen: AusgangsrechnungZeile[], quelle = "papierkram"): Promise<{ neu: number; aktualisiert: number }> {
  let neu = 0;
  let aktualisiert = 0;
  for (const z of zeilen) {
    const daten = { datum: new Date(`${z.datum}T00:00:00Z`), kunde: z.kunde, kundennr: z.kundennr, land: z.land, netto: z.netto, ust: z.ust, brutto: z.brutto, status: z.status, typ: z.typ, notiz: z.notiz, quelle };
    const alt = await prisma.ausgangsrechnung.findUnique({ where: { nummer: z.nummer }, select: { id: true } });
    if (alt) {
      await prisma.ausgangsrechnung.update({ where: { id: alt.id }, data: daten });
      aktualisiert++;
    } else {
      await prisma.ausgangsrechnung.create({ data: { nummer: z.nummer, ...daten } });
      neu++;
    }
  }
  return { neu, aktualisiert };
}

// ── Geschäftsbereiche (Ole, 25.11.2026): Anfang 2026 Funnelprojekte (VENTIS, Bahmann …), ab Juni Pay-per-Lead, jetzt
// Software & Betreuung. Fest gesetzter Bereich (Spalte „bereich“) gewinnt, sonst dieser Vorschlag. Software & Betreuung
// nur mit angenommenem Angebot „Software“ bzw. „Betreuung“ (nicht Pay-per-Lead), ab dessen Erstellung (Ole: Rutsch,
// verrata24 und Tobias D'Angelo sind in der App, aber Pay-per-Lead).
export const BEREICHE = { funnel: "Funnelprojekte", ppl: "Pay-per-Lead", software: "Software & Betreuung", sonstiges: "Sonstiges" } as const;
export type Bereich = keyof typeof BEREICHE;
export const istBereich = (x: unknown): x is Bereich => typeof x === "string" && x in BEREICHE;

const PPL_AB = "2026-06-01";
const FUNNEL_KUNDEN = /ventis|bahmann|futterpro/i;
const SONSTIGE_KUNDEN = /digistore/i;
const FUELLWOERTER = new Set(["allianz", "allianzvertretung", "versicherung", "hauptvertretung", "generalvertretung", "vertretung", "agentur", "gmbh", "team", "beratungs", "vertriebs"]);
const woerter = (s: string) => new Set(s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !FUELLWOERTER.has(w)));

/** Kunde der App, wenn ein markantes Namenswort übereinstimmt (z. B. „Marco Rutsch Allianzvertretung“ ↔ „Allianz Hauptvertretung Marco Rutsch“). */
export function appKundeZu<T extends { name: string }>(kunde: string, appKunden: T[]): T | null {
  const w = woerter(kunde);
  return appKunden.find((k) => [...woerter(k.name)].some((x) => w.has(x))) ?? null;
}

/**
 * Bereich-Vorschlag für eine Rechnung. softwareKunden: Namen aus angenommenen Angeboten mit Paket „Software“ oder
 * „Betreuung“, seit = Erstellung des Angebots. Rechnung an so einen Kunden ab dann: Software & Betreuung.
 * Vor Juni und bekannte Projektkunden: Funnelprojekte. Sonst (auch Gutschriften von Lead-Käufern): Pay-per-Lead.
 */
export function bereichVorschlag(r: { kunde: string; datum: string; typ: string }, softwareKunden: { name: string; seit: string }[]): Bereich {
  if (SONSTIGE_KUNDEN.test(r.kunde)) return "sonstiges";
  if (FUNNEL_KUNDEN.test(r.kunde)) return "funnel";
  if (r.datum < PPL_AB) return "funnel";
  if (softwareKunden.some((k) => r.datum >= k.seit && appKundeZu(r.kunde, [k]))) return "software";
  return "ppl";
}
