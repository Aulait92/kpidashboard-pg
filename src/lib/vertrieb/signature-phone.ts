// Telefonnummer aus der E-Mail-Signatur einer Antwort ergänzen (Ole, 13.11.2026):
// Cold-Mail-Kontakte kommen oft ohne Nummer ins CRM, schreiben sie aber in ihre Signatur.
// Nie aus Abwesenheitsnotizen (dort steht oft die Vertretung).
// Seit 16.11.2026 über lib/vertrieb/kontaktdaten(-server).ts: fehlt die Hauptnummer, wird die erste
// erkannte Haupt; weitere Nummern kommen als weitere Telefonnummer dazu.

import { htmlToText } from "@/lib/impressum";
import { prisma } from "@/lib/prisma";
import { extractMailPhones, ownPhones } from "@/lib/vertrieb/kontaktdaten";
import { addContactPhone, captureFromMail } from "@/lib/vertrieb/kontaktdaten-server";

export { ownPhones };

/** Erste plausible Telefonnummer aus der Signatur einer Antwort (zitierter Verlauf wird abgeschnitten). */
export function extractSignaturePhone(text: string | null | undefined, exclude: string[] = []): string | null {
  return extractMailPhones(text, exclude).phones[0]?.raw ?? null;
}

/**
 * Nummern aus dem Text einer (echten) Antwort übernehmen. Gibt die neue Hauptnummer zurück,
 * wenn das Feld leer war, sonst null.
 */
export async function fillPhoneFromMail(contactId: string, text: string | null | undefined): Promise<string | null> {
  const before = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { phone: true } });
  if (!before) return null;
  await captureFromMail(contactId, { direction: "IN", text, isAutoReply: false }, { phonesOnly: true, llm: null });
  if (before.phone?.trim()) return null;
  const after = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { phone: true } });
  return after?.phone?.trim() || null;
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
      select: { text: true, html: true, sentAt: true },
      take: 10,
    });
    let found: string | null = null;
    for (const m of mails) {
      const phone = extractMailPhones(m.text || (m.html ? htmlToText(m.html) : null), ownPhones()).phones[0];
      if (phone && (await addContactPhone(c.id, phone.raw, { source: "MAIL", at: m.sentAt, kind: phone.kind })) === "main") {
        found = phone.raw;
        break;
      }
    }
    if (found) updated++;
    else await prisma.salesContact.update({ where: { id: c.id }, data: { phoneMailCheckedAt: new Date() } });
  }
  return { tried: contacts.length, updated };
}
