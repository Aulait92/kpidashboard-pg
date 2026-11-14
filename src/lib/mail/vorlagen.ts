// E-Mail-Vorlagen der Vermittler (Ole, 13.11.2026). Beim ersten Öffnen mit Standardvorlagen gefüllt.
// Platzhalter: {anrede}, {vorname}, {nachname}, {name}, {produkt}, {terminlink}, {meinname}, {signatur} (Signatur sonst automatisch darunter).

import { prisma } from "@/lib/prisma";
import { asAnsprache, type Ansprache } from "@/lib/ansprache";

export { PLATZHALTER, fuelle, fuelleMitSignatur, werteFuer, type Werte } from "@/lib/mail/platzhalter";

// Standardvorlagen je Ansprache (Ole, 14.11.2026): Sie ist Standard. Ohne Gedankenstriche.
// {anrede} = „Guten Tag Frau Beispiel“ bzw. „Guten Tag Anna Beispiel“ / „Guten Tag“ (Sie) oder „Hallo Anna“ (Du), siehe lib/ansprache.ts.
// {terminlink} = persönlicher Buchungslink; ohne Link (Termin steht schon) entfällt der Satz.
export const STANDARD_VORLAGEN_JE: Record<Ansprache, { name: string; subject: string; body: string }[]> = {
  sie: [
    {
      name: "Nicht erreicht",
      subject: "Ihre Anfrage: {produkt}",
      body: "{anrede},\n\nich habe gerade versucht, Sie telefonisch zu erreichen, leider ohne Erfolg. Sie hatten sich für {produkt} interessiert. Wann passt es Ihnen für ein kurzes Telefonat? Hier können Sie sich auch direkt einen Termin aussuchen: {terminlink}\n\n{signatur}",
    },
    {
      name: "Angebot",
      subject: "Ihr Angebot: {produkt}",
      body: "{anrede},\n\nwie besprochen erhalten Sie im Anhang Ihr Angebot. Wenn Sie Fragen haben, melden Sie sich gern jederzeit.\n\n{signatur}",
    },
    {
      name: "Nachfassen Angebot",
      subject: "Kurze Nachfrage zu Ihrem Angebot",
      body: "{anrede},\n\nkonnten Sie sich das Angebot schon in Ruhe ansehen? Gern beantworte ich offene Fragen kurz am Telefon. Einen passenden Termin können Sie sich hier aussuchen: {terminlink}\n\n{signatur}",
    },
    {
      name: "Nach dem Abschluss",
      subject: "Vielen Dank für Ihr Vertrauen",
      body: "{anrede},\n\nvielen Dank für Ihr Vertrauen. Ihre Unterlagen erhalten Sie in Kürze. Wenn Sie Fragen haben, bin ich jederzeit für Sie da.\n\n{signatur}",
    },
  ],
  du: [
    {
      name: "Nicht erreicht",
      subject: "Deine Anfrage: {produkt}",
      body: "{anrede},\n\nich habe gerade versucht, dich telefonisch zu erreichen, leider ohne Erfolg. Du hattest dich für {produkt} interessiert. Wann passt es dir für ein kurzes Telefonat? Hier kannst du dir auch direkt einen Termin aussuchen: {terminlink}\n\n{signatur}",
    },
    {
      name: "Angebot",
      subject: "Dein Angebot: {produkt}",
      body: "{anrede},\n\nwie besprochen bekommst du im Anhang dein Angebot. Wenn du Fragen hast, melde dich gern jederzeit.\n\n{signatur}",
    },
    {
      name: "Nachfassen Angebot",
      subject: "Kurze Nachfrage zu deinem Angebot",
      body: "{anrede},\n\nkonntest du dir das Angebot schon in Ruhe ansehen? Gern beantworte ich offene Fragen kurz am Telefon. Einen passenden Termin kannst du dir hier aussuchen: {terminlink}\n\n{signatur}",
    },
    {
      name: "Nach dem Abschluss",
      subject: "Vielen Dank für dein Vertrauen",
      body: "{anrede},\n\nvielen Dank für dein Vertrauen. Deine Unterlagen bekommst du in Kürze. Wenn du Fragen hast, bin ich jederzeit für dich da.\n\n{signatur}",
    },
  ],
};

/** Standardvorlagen in Sie-Form (Standard). */
export const STANDARD_VORLAGEN = STANDARD_VORLAGEN_JE.sie;

export type Vorlage = { id: string; name: string; subject: string; body: string };

export async function loadVorlagen(customerId: string): Promise<Vorlage[]> {
  let rows = await prisma.mailTemplate.findMany({ where: { customerId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, subject: true, body: true } });
  if (rows.length === 0) {
    const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { leadAddress: true } });
    await prisma.mailTemplate.createMany({ data: STANDARD_VORLAGEN_JE[asAnsprache(c?.leadAddress)].map((v) => ({ customerId, ...v })) });
    rows = await prisma.mailTemplate.findMany({ where: { customerId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, subject: true, body: true } });
  }
  return rows;
}

/**
 * Ansprache gewechselt: unveränderte Standardvorlagen der anderen Ansprache auf die neue umstellen.
 * Selbst geänderte Vorlagen bleiben, wie sie sind.
 */
export async function vorlagenAufAnsprache(customerId: string, neu: Ansprache): Promise<number> {
  const alt: Ansprache = neu === "sie" ? "du" : "sie";
  let n = 0;
  for (let i = 0; i < STANDARD_VORLAGEN_JE[alt].length; i++) {
    const from = STANDARD_VORLAGEN_JE[alt][i];
    const to = STANDARD_VORLAGEN_JE[neu][i];
    const r = await prisma.mailTemplate.updateMany({ where: { customerId, name: from.name, subject: from.subject, body: from.body }, data: { subject: to.subject, body: to.body } });
    n += r.count;
  }
  return n;
}

