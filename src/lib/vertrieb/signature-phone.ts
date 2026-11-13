// Telefonnummer aus der E-Mail-Signatur einer Antwort ergänzen (Ole, 13.11.2026):
// Cold-Mail-Kontakte kommen oft ohne Nummer ins CRM, schreiben sie aber in ihre Signatur.
// Nur wenn das Feld leer ist; nie aus Abwesenheitsnotizen (dort steht oft die Vertretung).

import { htmlToText } from "@/lib/impressum";
import { prisma } from "@/lib/prisma";

const QUOTE_START = /^\s*(>|Am .{3,80}schrieb|On .{3,80}wrote|-{3,}\s*Original|Von:\s|From:\s|Gesendet von meinem)/im;
// Nummer: optional +/00-Ländervorwahl, dann Ziffern mit Leerzeichen, /, -, (), Punkten
const NUMBER = /(\+?\(?\d[\d\s/()\-–.]{5,22}\d)/;
const LABELLED = new RegExp(
  String.raw`(?:^|[\s|·•,;])(?:Tel(?:efon)?|Fon|Phone|Festnetz|Büro|Mobil(?:funk)?|Mobile|Handy|Mob|Cell|T|M)\.?\s*[:.]?\s*` + NUMBER.source,
  "i",
);
const FAX_LABEL = /(?:Tele)?fax|\bF\s*[:.]/i;
const BARE_LINE = /^\s*(\+49|0049|0)[\d\s/()\-–.]{6,20}\d\s*$/;

/** Gültige deutsche/internationale Rufnummer? (6–15 Ziffern, keine 0180-Servicenummer, kein Datum/PLZ) */
function plausible(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return false;
  if (/^(0|49|0049)?180/.test(digits)) return false;
  if (/^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/.test(raw.trim())) return false; // Datum
  return /^(\+|00|0)/.test(raw.trim().replace(/^\(/, ""));
}

const tidy = (raw: string) => raw.replace(/[–]/g, "-").replace(/\s+/g, " ").trim();

/** Erste plausible Telefonnummer aus dem eigenen Teil einer Antwort (zitierter Verlauf wird abgeschnitten). */
export function extractSignaturePhone(text: string | null | undefined, exclude: string[] = []): string | null {
  if (!text) return null;
  const cut = text.search(QUOTE_START);
  const own = cut > 0 ? text.slice(0, cut) : cut === 0 ? "" : text;
  const skip = new Set(exclude.map((e) => e.replace(/\D/g, "").replace(/^(49|0049)/, "0")).filter(Boolean));
  const ok = (raw: string) => {
    if (!plausible(raw)) return false;
    const d = raw.replace(/\D/g, "").replace(/^(0049|49)/, "0");
    return !skip.has(d);
  };
  const lines = own.split(/\r?\n/).flatMap((l) => l.split(/\s[|·•]\s/));
  for (const line of lines) {
    // Fax-Zeile überspringen, außer sie enthält zusätzlich eine beschriftete Telefonnummer vor dem Fax
    const beforeFax = FAX_LABEL.test(line) ? line.slice(0, line.search(FAX_LABEL)) : line;
    const m = beforeFax.match(LABELLED);
    if (m && ok(m[1])) return tidy(m[1]);
  }
  for (const line of lines) {
    if (FAX_LABEL.test(line)) continue;
    if (BARE_LINE.test(line) && ok(line)) return tidy(line);
  }
  return null;
}

/** Eigene Nummern (aus der Absender-Signatur), die nie als Kontakt-Nummer übernommen werden. */
export function ownPhones(): string[] {
  // Unsere Nummer (steht auch in der App unter Einrichtung) + optional weitere per Umgebungsvariable
  return ["+49 151 52418846", ...(process.env.OWN_PHONE_NUMBERS ?? "").split(",")].map((s) => s.trim()).filter(Boolean);
}

/**
 * Füllt die leere Telefonnummer eines Kontakts aus dem Text einer (echten) Antwort.
 * Gibt die übernommene Nummer zurück oder null.
 */
export async function fillPhoneFromMail(contactId: string, text: string | null | undefined): Promise<string | null> {
  const c = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { phone: true } });
  if (!c || (c.phone && c.phone.trim())) return null;
  const phone = extractSignaturePhone(text, ownPhones());
  if (!phone) return null;
  const updated = await prisma.salesContact.updateMany({
    where: { id: contactId, OR: [{ phone: null }, { phone: "" }] },
    data: { phone, phoneMailCheckedAt: new Date() },
  });
  if (!updated.count) return null;
  await prisma.salesActivity.create({ data: { contactId, type: "NOTIZ", note: `Automatisch ergänzt: Telefon ${phone} (E-Mail-Signatur).` } });
  return phone;
}

/** Nachholen für bestehende Kontakte ohne Nummer: einmal alle bisherigen Antworten durchsehen. */
export async function backfillPhonesFromMail(limit = 50): Promise<{ tried: number; updated: number }> {
  const contacts = await prisma.salesContact.findMany({
    where: {
      OR: [{ phone: null }, { phone: "" }],
      phoneMailCheckedAt: null,
      emails: { some: { direction: "IN", isAutoReply: false } },
    },
    select: { id: true },
    take: limit,
  });
  let updated = 0;
  for (const c of contacts) {
    const mails = await prisma.salesEmail.findMany({
      where: { contactId: c.id, direction: "IN", isAutoReply: false },
      orderBy: { sentAt: "desc" },
      select: { text: true, html: true },
      take: 10,
    });
    let found: string | null = null;
    for (const m of mails) {
      found = await fillPhoneFromMail(c.id, m.text || (m.html ? htmlToText(m.html) : null));
      if (found) break;
    }
    if (found) updated++;
    else await prisma.salesContact.update({ where: { id: c.id }, data: { phoneMailCheckedAt: new Date() } });
  }
  return { tried: contacts.length, updated };
}
