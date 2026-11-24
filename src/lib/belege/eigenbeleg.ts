// Eigenbeleg (Ole, 22.11.2026): Ersatz für einen nicht mehr beschaffbaren Originalbeleg bei kleinen Beträgen. Enthält die
// üblichen Angaben (Empfänger, Datum, Betrag, Gegenstand, betrieblicher Zweck, Grund für das Fehlen, Erstellungsdatum,
// Aussteller). Kein Vorsteuerabzug: Netto = Brutto. Wird als Beleg abgelegt und der Zahlung fest zugeordnet (zuordnung
// „hand“, bleibt beim Neuabgleich bestehen).

import crypto from "node:crypto";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { prisma } from "@/lib/prisma";

export type EigenbelegDaten = {
  nummer: string;
  empfaenger: string;
  datum: string; // YYYY-MM-DD (Zahlungstag)
  betrag: number; // positiv, EUR
  konto: string;
  verwendungszweck: string | null;
  gegenstand: string;
  zweck: string;
  grund: string;
  erstelltAm: string; // YYYY-MM-DD
};

const de = (iso: string) => iso.split("-").reverse().join(".");
const eur = (n: number) => `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
// Standardschrift kann nur WinAnsi: Zeichen außerhalb ersetzen
const sicher = (s: string) => s.replace(/[–—]/g, "-").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

/** PDF erzeugen (getestet). */
export async function eigenbelegPdf(d: EigenbelegDaten): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Eigenbeleg ${d.nummer}`);
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fett = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 780;
  const zeile = (text: string, o: { f?: typeof font; size?: number; x?: number } = {}) => {
    page.drawText(sicher(text), { x: o.x ?? 60, y, size: o.size ?? 11, font: o.f ?? font, color: rgb(0.1, 0.1, 0.1) });
    y -= (o.size ?? 11) + 8;
  };
  const umbrechen = (text: string, breite = 470, size = 11) => {
    const worte = sicher(text).split(/\s+/);
    let akt = "";
    for (const w of worte) {
      const t = akt ? `${akt} ${w}` : w;
      if (font.widthOfTextAtSize(t, size) > breite && akt) {
        zeile(akt, { x: 210 });
        akt = w;
      } else akt = t;
    }
    if (akt) zeile(akt, { x: 210 });
  };
  zeile("Eigenbeleg", { f: fett, size: 20 });
  zeile(`Nr. ${d.nummer}`, { size: 10 });
  y -= 6;
  zeile("Ole Kannapinn UG (haftungsbeschränkt), Lorenzstraße 58, 12209 Berlin", { size: 10 });
  y -= 14;
  const feld = (label: string, wert: string) => {
    page.drawText(sicher(label), { x: 60, y, size: 11, font: fett, color: rgb(0.1, 0.1, 0.1) });
    umbrechen(wert);
  };
  feld("Zahlungsempfänger", d.empfaenger);
  feld("Datum der Zahlung", de(d.datum));
  feld("Betrag (brutto)", eur(d.betrag));
  feld("Bezahlt über", d.konto);
  if (d.verwendungszweck) feld("Verwendungszweck", d.verwendungszweck);
  feld("Gegenstand", d.gegenstand);
  feld("Betrieblicher Zweck", d.zweck);
  feld("Grund für Eigenbeleg", d.grund);
  y -= 10;
  zeile("Ohne Vorsteuerabzug (kein Originalbeleg mit Umsatzsteuerausweis vorhanden).", { size: 10 });
  y -= 30;
  zeile(`Berlin, ${de(d.erstelltAm)}`);
  y -= 24;
  page.drawLine({ start: { x: 60, y: y + 14 }, end: { x: 300, y: y + 14 }, thickness: 0.7, color: rgb(0.3, 0.3, 0.3) });
  zeile("Ole Kannapinn, Geschäftsführer", { size: 10 });
  return doc.save();
}

/** Eigenbeleg zu einer Zahlung erstellen, ablegen und fest zuordnen. */
export async function eigenbelegErstellen(o: { umsatzId: string; gegenstand: string; zweck: string; grund?: string; empfaenger?: string; now?: Date }): Promise<{ ok: true; id: string; nummer: string } | { ok: false; error: string }> {
  const u = await prisma.bankTransaction.findUnique({
    where: { id: o.umsatzId },
    select: { id: true, bookingDate: true, amount: true, counterparty: true, purpose: true, accountKey: true, belegTeilVonId: true, beleg: { select: { id: true } } },
  });
  if (!u) return { ok: false, error: "Zahlung nicht gefunden." };
  if (Number(u.amount) >= 0) return { ok: false, error: "Keine Ausgabe." };
  if (u.beleg || u.belegTeilVonId) return { ok: false, error: "Zahlung hat schon einen Beleg." };
  const now = o.now ?? new Date();
  const erstelltAm = now.toISOString().slice(0, 10);
  const anzahl = await prisma.beleg.count({ where: { quelle: "eigenbeleg" } });
  const nummer = `EB-${erstelltAm.slice(0, 4)}-${String(anzahl + 1).padStart(3, "0")}`;
  const betrag = Math.round(-Number(u.amount) * 100) / 100;
  const konto = u.accountKey.includes("amex") ? "American Express" : u.accountKey.includes("n26") ? "N26 (Privatkonto, geschäftliche Ausgabe)" : "Geschäftskonto Commerzbank";
  const pdf = await eigenbelegPdf({
    nummer,
    empfaenger: (o.empfaenger ?? u.counterparty ?? "unbekannt").slice(0, 120),
    datum: u.bookingDate.toISOString().slice(0, 10),
    betrag,
    konto,
    verwendungszweck: u.purpose?.replace(/\s+/g, " ").slice(0, 160) ?? null,
    gegenstand: o.gegenstand.slice(0, 300),
    zweck: o.zweck.slice(0, 300),
    grund: (o.grund ?? "Originalbeleg nicht mehr auffindbar bzw. vom Anbieter nicht erhältlich.").slice(0, 300),
    erstelltAm,
  });
  const b = await prisma.beleg.create({
    data: {
      quelle: "eigenbeleg",
      datei: Buffer.from(pdf),
      mimeType: "application/pdf",
      hash: crypto.createHash("sha256").update(pdf).digest("hex"),
      dateiname: `Eigenbeleg ${nummer}.pdf`,
      absender: "Eigenbeleg",
      ausgelesen: "eigenbeleg",
      ocrFertig: true,
      typ: "RECEIPT",
      firma: (o.empfaenger ?? u.counterparty ?? "unbekannt").slice(0, 200),
      nummer,
      datum: u.bookingDate,
      netto: betrag,
      ustSatz: 0,
      brutto: betrag,
      waehrung: "EUR",
      bankTransactionId: u.id,
      zuordnung: "hand",
    },
    select: { id: true },
  });
  return { ok: true, id: b.id, nummer };
}
