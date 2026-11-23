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
export function ohneDoppel<T extends { nummer: string | null; brutto: number | null; firma: string | null }>(belege: T[]): T[] {
  const seen = new Set<string>();
  return belege.filter((b) => {
    if (!b.nummer) return true;
    const k = `${b.nummer}|${b.brutto}|${(b.firma ?? "").slice(0, 6).toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
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

export async function paketBelege(monat: string): Promise<PaketBeleg[]> {
  const von = new Date(`${monat}-01T00:00:00Z`);
  const bis = new Date(Date.UTC(von.getUTCFullYear(), von.getUTCMonth() + 1, 1));
  const rows = await prisma.beleg.findMany({
    where: { datum: { gte: von, lt: bis }, typ: { notIn: ["STATEMENT"] } },
    orderBy: [{ datum: "asc" }, { firma: "asc" }],
    select: { id: true, datum: true, typ: true, quelle: true, firma: true, nummer: true, netto: true, ustSatz: true, brutto: true, waehrung: true, bankTransactionId: true, mimeType: true, dateiname: true },
  });
  return ohneDoppel(
    rows.map((b) => ({
      id: b.id,
      datum: b.datum!.toISOString().slice(0, 10),
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
    })),
  );
}

/** ZIP mit Belegen, belege.csv und ust-vorschau.txt. */
export async function paketZip(monat: string): Promise<{ zip: Buffer; belege: PaketBeleg[]; vorschau: UstVorschau }> {
  const belege = await paketBelege(monat);
  const vorschau = ustVorschau(belege);
  const dateinamen = new Map<string, string>();
  const eintraege: ZipEntry[] = [];
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
    eintraege.push({ name, data: new Uint8Array(d.datei) });
  }
  eintraege.push({ name: "belege.csv", data: belegeCsv(belege, dateinamen) });
  eintraege.push({ name: "ust-vorschau.txt", data: vorschauText(monat, vorschau, belege.length) });
  return { zip: buildZip(eintraege), belege, vorschau };
}

const eur = (n: number) => `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
export const monatName = (monat: string) => new Date(`${monat}-01T00:00:00Z`).toLocaleDateString("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });

export function vorschauText(monat: string, v: UstVorschau, anzahl: number): string {
  return [
    `Umsatzsteuer-Vorschau ${monatName(monat)} (aus ${anzahl} Belegen, nach Belegdatum; maßgeblich ist Ihre Buchung)`,
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
export async function paketSenden(monat: string, o: { antwortAn: string | null }): Promise<{ ok: true; anzahl: number } | { ok: false; error: string }> {
  const { zip, belege, vorschau } = await paketZip(monat);
  if (!belege.length) return { ok: false, error: "Keine Belege für diesen Monat." };
  if (zip.length > 35 * 1024 * 1024) return { ok: false, error: "Paket größer als 35 MB: bitte herunterladen und aufteilen." };
  const an = STEUERBUERO_EMAIL();
  const name = monatName(monat);
  const eingang = belege.filter((b) => EINGANG.has(b.typ) && b.quelle !== "eigenbeleg").length;
  const ausgang = belege.filter((b) => AUSGANG.has(b.typ) || b.typ === "CREDIT_NOTE" || b.typ === "SALES_INVOICE_VOID").length;
  const eigen = belege.filter((b) => b.quelle === "eigenbeleg").length;
  const { sendPlainMail } = await import("@/lib/email");
  const r = await sendPlainMail({
    to: an,
    replyTo: o.antwortAn,
    subject: `Belege Ole Kannapinn UG ${name}`,
    text: [
      "Sehr geehrte Frau Schulze,",
      "",
      `anbei die Belege der Ole Kannapinn UG für ${name}: ${eingang} Eingangsbelege, ${ausgang} Ausgangsbelege${eigen ? `, ${eigen} Eigenbelege` : ""}.`,
      "Die Datei belege.csv listet je Beleg Datum, Art, Aussteller bzw. Empfänger, Nummer, Netto, Umsatzsteuer, Brutto und ob die Zahlung zugeordnet ist. In ust-vorschau.txt steht eine vorläufige Umsatzsteuer-Übersicht.",
      "",
      "Viele Grüße",
      "Ole Kannapinn",
    ].join("\n"),
    attachments: [{ filename: `Belege ${monat}.zip`, content: zip, contentType: "application/zip" }],
  });
  if (!r.ok) return { ok: false, error: r.error ?? "Versand fehlgeschlagen." };
  if (r.blocked) return { ok: false, error: "Versand an diese Adresse ist auf dem Server gesperrt (MAIL_NUR_AN)." };
  await prisma.monatsPaket.upsert({
    where: { monat },
    create: { monat, gesendetAm: new Date(), empfaenger: an, anzahl: belege.length, zahllast: vorschau.zahllast },
    update: { gesendetAm: new Date(), empfaenger: an, anzahl: belege.length, zahllast: vorschau.zahllast },
  });
  return { ok: true, anzahl: belege.length };
}
