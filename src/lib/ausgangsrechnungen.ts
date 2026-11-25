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
