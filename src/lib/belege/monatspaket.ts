// Monatspaket für das Steuerbüro (Ole, 23.11.2026: Voranmeldung soll ihn fast keine Zeit kosten). Alle Belege eines
// Monats (Belegdatum) als ZIP mit sprechenden Dateinamen, dazu belege.csv (Datum, Art, Aussteller/Empfänger, Nummer,
// Netto, USt, Brutto, Währung, Zahlung zugeordnet) und eine Umsatzsteuer-Vorschau. Gesendet wird nur auf Oles Klick.

import { prisma } from "@/lib/prisma";
import { buildZip, type ZipEntry } from "@/lib/export/zip";

export const STEUERBUERO_EMAIL = () => process.env.BELEGE_STEUERBUERO_EMAIL?.trim() || "l.schulze@steuerkonzepte.com";

export type PaketBeleg = {
  id: string;
  datum: string;
  typ: string;
  quelle: string;
  firma: string | null;
  nummer: string | null;
  netto: number | null;
  ustSatz: number | null;
  brutto: number | null;
  waehrung: string;
  zugeordnet: boolean;
  mimeType: string | null;
  dateiname: string | null;
};

export type UstVorschau = {
  umsatzsteuer: number;
  steuerpflichtigNetto: number;
  steuerfreiNetto: number;
  vorsteuer: number;
  ohneDeutscheUstEur: number;
  fremdwaehrung: number;
  eigenbelege: number;
  zahllast: number;
};

const r2 = (x: number) => Math.round(x * 100) / 100;
const EINGANG = new Set(["INCOMING_INVOICE", "RECEIPT", "PAYMENT_RECEIPT", "EXPENSE_REIMBURSEMENT", "MISC"]);
const AUSGANG = new Set(["SALES_INVOICE", "SALES_CREDIT_NOTE"]);

export const ART: Record<string, string> = {
  INCOMING_INVOICE: "Eingangsrechnung",
  RECEIPT: "Quittung",
  PAYMENT_RECEIPT: "Zahlungsbeleg",
  MISC: "Sonstiges",
  SALES_INVOICE: "Ausgangsrechnung",
  SALES_INVOICE_VOID: "Ausgangsrechnung storniert",
  SALES_CREDIT_NOTE: "Gutschrift an Kunden",
  CREDIT_NOTE: "Gutschrift an uns (Einnahme)",
  STATEMENT: "Kontoauszug/Abrechnung",
};

/** Doppel (gleiche Nummer und gleicher Betrag) nur einmal. Getestet. */
const nrKurz = (n: string | null) => (n ?? "").replace(/[^0-9a-z]/gi, "").toLowerCase();
const tageAbstand = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
const istMeta = (firma: string | null) => /meta platforms|facebook/i.test(firma ?? "");

/**
 * Doppelt erfasste Belege nur einmal ins Paket: gleiche Nummer (ohne Leerzeichen, „36 0506 …“ = „360506…“), Betrag und
 * Aussteller. Dazu Meta (Ole, 24.11.2026): zu einer Abbuchung gibt es oft Rechnung (FBADS-…) und Zahlungsbeleg (Kürzel
 * wie „FSHN4XMR72“) mit gleichem Betrag am selben Tag; das Steuerbüro bekommt nur einen davon (den zugeordneten, sonst die
 * Rechnung). Getestet.
 */
export function ohneDoppel<T extends { nummer: string | null; brutto: number | null; firma: string | null; datum?: string | null; zugeordnet?: boolean }>(belege: T[]): T[] {
  const seen = new Set<string>();
  const ohneNummernDoppel = belege.filter((b) => {
    if (!b.nummer) return true;
    const k = `${nrKurz(b.nummer)}|${b.brutto}|${(b.firma ?? "").slice(0, 6).toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const weg = new Set<T>();
  const rechnungen = ohneNummernDoppel.filter((b) => istMeta(b.firma) && /^FBADS-/i.test(b.nummer ?? "") && b.datum && b.brutto != null);
  const belegt = new Set<T>();
  for (const z of ohneNummernDoppel) {
    if (!istMeta(z.firma) || /^FBADS-/i.test(z.nummer ?? "") || !z.datum || z.brutto == null) continue;
    const r = rechnungen.find((x) => !belegt.has(x) && x.brutto === z.brutto && tageAbstand(x.datum!, z.datum!) <= 2);
    if (!r) continue;
    belegt.add(r);
    weg.add(z.zugeordnet && !r.zugeordnet ? r : z);
  }
  return ohneNummernDoppel.filter((b) => !weg.has(b));
}

/** USt-Vorschau aus den Belegen (Belegdatum; bei Ist-Versteuerung zählt der Zahlungseingang). Getestet. */
export function ustVorschau(belege: PaketBeleg[]): UstVorschau {
  const v: UstVorschau = { umsatzsteuer: 0, steuerpflichtigNetto: 0, steuerfreiNetto: 0, vorsteuer: 0, ohneDeutscheUstEur: 0, fremdwaehrung: 0, eigenbelege: 0, zahllast: 0 };
  for (const b of belege) {
    const ust = b.brutto != null && b.netto != null ? b.brutto - b.netto : 0;
    if (AUSGANG.has(b.typ) || b.typ === "CREDIT_NOTE") {
      if ((b.ustSatz ?? 0) > 0) {
        v.umsatzsteuer += ust;
        v.steuerpflichtigNetto += b.netto ?? 0;
      } else v.steuerfreiNetto += b.netto ?? 0;
    } else if (EINGANG.has(b.typ)) {
      if (b.quelle === "eigenbeleg") v.eigenbelege += b.brutto ?? 0;
      else if (b.waehrung !== "EUR") v.fremdwaehrung++;
      else if ((b.ustSatz ?? 0) > 0) v.vorsteuer += ust;
      else v.ohneDeutscheUstEur += b.brutto ?? 0;
    }
  }
  for (const k of Object.keys(v) as (keyof UstVorschau)[]) if (k !== "fremdwaehrung") v[k] = r2(v[k]);
  v.zahllast = r2(v.umsatzsteuer - v.vorsteuer);
  return v;
}

const zahl = (n: number | null) => (n == null ? "" : n.toFixed(2).replace(".", ","));
const csvFeld = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function belegeCsv(belege: PaketBeleg[], dateinamen: Map<string, string>): string {
  const kopf = ["Datum", "Art", "Aussteller/Empfänger", "Nummer", "Netto", "USt-Satz", "USt", "Brutto", "Währung", "Zahlung zugeordnet", "Datei"];
  const zeilen = belege.map((b) =>
    [
      b.datum,
      ART[b.typ] ?? b.typ,
      b.quelle === "eigenbeleg" ? `${b.firma ?? ""} (Eigenbeleg)` : (b.firma ?? ""),
      b.nummer ?? "",
      zahl(b.netto),
      b.ustSatz == null ? "" : String(b.ustSatz),
      zahl(b.brutto != null && b.netto != null ? r2(b.brutto - b.netto) : null),
      zahl(b.brutto),
      b.waehrung,
      b.zugeordnet ? "ja" : "nein",
      dateinamen.get(b.id) ?? "",
    ]
      .map((x) => csvFeld(String(x)))
      .join(";"),
  );
  return "﻿" + [kopf.join(";"), ...zeilen].join("\r\n");
}

const sauber = (s: string) => s.replace(/[\\/:*?"<>|\n\r]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

const BELEG_FELDER = { id: true, datum: true, typ: true, quelle: true, firma: true, nummer: true, netto: true, ustSatz: true, brutto: true, waehrung: true, bankTransactionId: true, mimeType: true, dateiname: true } as const;
type BelegZeile = { id: string; datum: Date | null; typ: string; quelle: string; firma: string | null; nummer: string | null; netto: unknown; ustSatz: unknown; brutto: unknown; waehrung: string; bankTransactionId: string | null; mimeType: string | null; dateiname: string | null };
const alsPaketBeleg = (b: BelegZeile): PaketBeleg => ({
  id: b.id,
  datum: b.datum ? b.datum.toISOString().slice(0, 10) : "",
  typ: b.typ,
  quelle: b.quelle,
  firma: b.firma,
  nummer: b.nummer,
  netto: b.netto == null ? null : Number(b.netto),
  ustSatz: b.ustSatz == null ? null : Number(b.ustSatz),
  brutto: b.brutto == null ? null : Number(b.brutto),
  waehrung: b.waehrung,
  zugeordnet: !!b.bankTransactionId,
  mimeType: b.mimeType,
  dateiname: b.dateiname,
});

export async function paketBelege(monat: string): Promise<PaketBeleg[]> {
  const von = new Date(`${monat}-01T00:00:00Z`);
  const bis = new Date(Date.UTC(von.getUTCFullYear(), von.getUTCMonth() + 1, 1));
  // Kontoauszüge und Kreditkartenabrechnungen gehen mit (Ole, 24.11.2026: Barclays-Abrechnung fürs Steuerbüro);
  // die USt-Vorschau zählt sie nicht.
  const rows = await prisma.beleg.findMany({ where: { datum: { gte: von, lt: bis } }, orderBy: [{ datum: "asc" }, { firma: "asc" }], select: BELEG_FELDER });
  return ohneDoppel(rows.map(alsPaketBeleg));
}

/** Genau diese Belege (Nachtrag oder festgehaltenes Paket), nach Datum. */
export async function belegeNachIds(ids: string[]): Promise<PaketBeleg[]> {
  const rows = await prisma.beleg.findMany({ where: { id: { in: ids } }, orderBy: [{ datum: "asc" }, { firma: "asc" }], select: BELEG_FELDER });
  return rows.map(alsPaketBeleg);
}

async function paketInhalt(monat: string): Promise<{ dateien: ZipEntry[]; liste: ZipEntry[]; belege: PaketBeleg[]; vorschau: UstVorschau }> {
  return inhaltFuer(await paketBelege(monat), monatName(monat));
}

/** Dateien, Belegliste und USt-Vorschau zu einer Belegliste; titel z. B. „August 2026“ oder „Nachtrag Januar bis Juli 2026“. */
async function inhaltFuer(belege: PaketBeleg[], titel: string): Promise<{ dateien: ZipEntry[]; liste: ZipEntry[]; belege: PaketBeleg[]; vorschau: UstVorschau }> {
  const vorschau = ustVorschau(belege);
  const dateinamen = new Map<string, string>();
  const dateien: ZipEntry[] = [];
  const benutzt = new Set<string>();
  for (const b of belege) {
    const d = await prisma.beleg.findUnique({ where: { id: b.id }, select: { datei: true } });
    if (!d?.datei) continue;
    const endung = b.mimeType === "message/rfc822" ? "eml" : b.mimeType === "text/plain" ? "txt" : b.mimeType?.startsWith("image/") ? b.mimeType.split("/")[1] : "pdf";
    const ordner = AUSGANG.has(b.typ) || b.typ === "SALES_INVOICE_VOID" || b.typ === "CREDIT_NOTE" ? "Ausgang" : b.quelle === "eigenbeleg" ? "Eigenbelege" : "Eingang";
    let name = `${ordner}/${b.datum} ${sauber(b.firma ?? "Beleg")}${b.nummer ? ` ${sauber(b.nummer)}` : ""}${b.brutto != null ? ` ${zahl(b.brutto)} ${b.waehrung}` : ""}.${endung}`;
    for (let i = 2; benutzt.has(name); i++) name = name.replace(/(\.\w+)$/, ` (${i})$1`);
    benutzt.add(name);
    dateinamen.set(b.id, name);
    dateien.push({ name, data: new Uint8Array(d.datei) });
  }
  const liste: ZipEntry[] = [
    { name: "belege.csv", data: belegeCsv(belege, dateinamen) },
    { name: "ust-vorschau.txt", data: vorschauText(titel, vorschau, belege.length) },
  ];
  return { dateien, liste, belege, vorschau };
}

/** ZIP mit Belegen, belege.csv und ust-vorschau.txt (Download). */
export async function paketZip(monat: string): Promise<{ zip: Buffer; belege: PaketBeleg[]; vorschau: UstVorschau }> {
  const { dateien, liste, belege, vorschau } = await paketInhalt(monat);
  return { zip: buildZip([...dateien, ...liste]), belege, vorschau };
}

/** ZIP zu einem festgehaltenen Belegpaket (Download-Link). */
export async function belegPaketZip(belegIds: string[], titel: string): Promise<Buffer> {
  const { dateien, liste } = await inhaltFuer(await belegeNachIds(belegIds), titel);
  return buildZip([...dateien, ...liste]);
}

const groesse = (e: ZipEntry) => (typeof e.data === "string" ? Buffer.byteLength(e.data) : e.data.length);

/**
 * Dateien der Reihe nach auf Teile mit höchstens maxBytes verteilen (Ole, 24.11.2026: August 2026 hatte über 35 MB, eine
 * Mail darf nicht so groß werden). Eine einzelne größere Datei bekommt einen eigenen Teil. Getestet.
 */
export function inTeile<T extends ZipEntry>(dateien: T[], maxBytes: number): T[][] {
  const teile: T[][] = [];
  let akt: T[] = [];
  let summe = 0;
  for (const d of dateien) {
    const g = groesse(d);
    if (akt.length && summe + g > maxBytes) {
      teile.push(akt);
      akt = [];
      summe = 0;
    }
    akt.push(d);
    summe += g;
  }
  if (akt.length || !teile.length) teile.push(akt);
  return teile;
}

const eur = (n: number) => `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
export const monatName = (monat: string) => new Date(`${monat}-01T00:00:00Z`).toLocaleDateString("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });

export function vorschauText(titel: string, v: UstVorschau, anzahl: number): string {
  return [
    `Umsatzsteuer-Vorschau ${/^\d{4}-\d{2}$/.test(titel) ? monatName(titel) : titel} (aus ${anzahl} Belegen, nach Belegdatum; maßgeblich ist Ihre Buchung)`,
    "",
    `Umsatzsteuer aus Ausgangsrechnungen und Gutschriften: ${eur(v.umsatzsteuer)} (steuerpflichtig netto ${eur(v.steuerpflichtigNetto)})`,
    `Steuerfreie Umsätze (§ 4 Nr. 11 UStG) netto: ${eur(v.steuerfreiNetto)}`,
    `Vorsteuer aus Eingangsbelegen mit deutscher USt: ${eur(v.vorsteuer)}`,
    `Eingangsbelege ohne deutsche USt in EUR (Reverse Charge prüfen): ${eur(v.ohneDeutscheUstEur)}`,
    `Eingangsbelege in Fremdwährung: ${v.fremdwaehrung}`,
    `Eigenbelege (ohne Vorsteuer): ${eur(v.eigenbelege)}`,
    "",
    `Vorläufige Zahllast (Umsatzsteuer minus Vorsteuer, ohne Reverse Charge): ${eur(v.zahllast)}`,
  ].join("\r\n");
}

/** Vormonat (YYYY-MM) zu einem Datum, Berliner Zeit. */
export function vormonat(now = new Date()): string {
  const [j, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit" }).format(now).split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

/** Paket an das Steuerbüro senden (nur auf Klick). */
/**
 * Paket festhalten und per Mail mit Download-Link senden (Ole, 24.11.2026: Link statt vieler Mails). Anhänge nur die
 * Belegliste und die USt-Vorschau; der Link läuft nach PAKET_LINK_TAGE ab.
 */
async function paketMitLinkSenden(o: {
  art: "monat" | "nachtrag";
  monat?: string;
  titel: string;
  belege: PaketBeleg[];
  liste: ZipEntry[];
  antwortAn: string | null;
  einleitung: string;
}): Promise<{ ok: true; anzahl: number; link: string } | { ok: false; error: string }> {
  const { getAppUrl, sendPlainMail } = await import("@/lib/email");
  const { paketAblauf, paketPfad, PAKET_LINK_TAGE } = await import("./paket-link");
  const an = STEUERBUERO_EMAIL();
  const paket = await prisma.belegPaket.create({ data: { titel: o.titel, art: o.art, monat: o.monat ?? null, belegIds: o.belege.map((b) => b.id), empfaenger: an } });
  const ablauf = paketAblauf();
  const link = `${getAppUrl()}${paketPfad(paket.id, ablauf)}`;
  const bis = new Date(ablauf * 1000).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
  const r = await sendPlainMail({
    to: an,
    replyTo: o.antwortAn,
    subject: `Belege Ole Kannapinn UG ${o.titel}`,
    text: [
      "Sehr geehrte Frau Schulze,",
      "",
      o.einleitung,
      "",
      `Alle Belege als ZIP zum Herunterladen (gültig bis ${bis}, ${PAKET_LINK_TAGE} Tage):`,
      link,
      "",
      "Im Anhang: belege.csv (je Beleg Datum, Art, Aussteller bzw. Empfänger, Nummer, Netto, Umsatzsteuer, Brutto und ob die Zahlung zugeordnet ist) und ust-vorschau.txt (vorläufige Umsatzsteuer-Übersicht).",
      "",
      "Viele Grüße",
      "Ole Kannapinn",
    ].join("\n"),
    attachments: o.liste.map((e) => ({ filename: e.name, content: typeof e.data === "string" ? e.data : Buffer.from(e.data), contentType: e.name.endsWith(".csv") ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8" })),
  });
  if (!r.ok) return { ok: false, error: r.error ?? "Versand fehlgeschlagen." };
  if (r.blocked) return { ok: false, error: "Versand an diese Adresse ist auf dem Server gesperrt (MAIL_NUR_AN)." };
  await prisma.belegPaket.update({ where: { id: paket.id }, data: { gesendetAm: new Date() } });
  return { ok: true, anzahl: o.belege.length, link };
}

const zaehlen = (belege: PaketBeleg[]) => ({
  eingang: belege.filter((b) => EINGANG.has(b.typ) && b.quelle !== "eigenbeleg").length,
  ausgang: belege.filter((b) => AUSGANG.has(b.typ) || b.typ === "CREDIT_NOTE" || b.typ === "SALES_INVOICE_VOID").length,
  eigen: belege.filter((b) => b.quelle === "eigenbeleg").length,
});

export async function paketSenden(monat: string, o: { antwortAn: string | null }): Promise<{ ok: true; anzahl: number } | { ok: false; error: string }> {
  const belege = await paketBelege(monat);
  if (!belege.length) return { ok: false, error: "Keine Belege für diesen Monat." };
  const { liste, vorschau } = await inhaltFuer(belege, monatName(monat));
  const n = zaehlen(belege);
  const name = monatName(monat);
  const r = await paketMitLinkSenden({
    art: "monat",
    monat,
    titel: name,
    belege,
    liste,
    antwortAn: o.antwortAn,
    einleitung: `anbei die Belege der Ole Kannapinn UG für ${name}: ${n.eingang} Eingangsbelege, ${n.ausgang} Ausgangsbelege${n.eigen ? `, ${n.eigen} Eigenbelege` : ""}.`,
  });
  if (!r.ok) return r;
  await prisma.monatsPaket.upsert({
    where: { monat },
    create: { monat, gesendetAm: new Date(), empfaenger: STEUERBUERO_EMAIL(), anzahl: belege.length, zahllast: vorschau.zahllast },
    update: { gesendetAm: new Date(), empfaenger: STEUERBUERO_EMAIL(), anzahl: belege.length, zahllast: vorschau.zahllast },
  });
  return { ok: true, anzahl: belege.length };
}

/** Nachtrag: genau diese Belege (z. B. zu bereits gebuchten Monaten) mit Hinweis, dass einzelne schon vorliegen können. */
export async function nachtragSenden(belegIds: string[], o: { titel: string; antwortAn: string | null; hinweis?: string }): Promise<{ ok: true; anzahl: number } | { ok: false; error: string }> {
  const belege = await belegeNachIds(belegIds);
  if (!belege.length) return { ok: false, error: "Keine Belege gefunden." };
  const { liste } = await inhaltFuer(belege, o.titel);
  const n = zaehlen(belege);
  return paketMitLinkSenden({
    art: "nachtrag",
    titel: o.titel,
    belege,
    liste,
    antwortAn: o.antwortAn,
    einleitung: [
      `anbei ein Nachtrag mit ${belege.length} Belegen (${n.eingang} Eingangsbelege${n.eigen ? `, ${n.eigen} Eigenbelege` : ""}${n.ausgang ? `, ${n.ausgang} Ausgangsbelege` : ""}). Alle gehören zu Zahlungen auf unseren Konten.`,
      o.hinweis ?? "Einzelne davon liegen Ihnen eventuell schon vor; bitte nur ergänzen, was noch fehlt.",
    ].join(" "),
  });
}
