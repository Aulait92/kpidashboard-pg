// E-Mail-Vorlagen der Vermittler (Ole, 13.11.2026). Beim ersten Öffnen mit Standardvorlagen gefüllt.
// Platzhalter: {vorname}, {name}, {produkt}, {meinname}.

import { prisma } from "@/lib/prisma";

export { PLATZHALTER, fuelle, werteFuer, type Werte } from "@/lib/mail/platzhalter";

export const STANDARD_VORLAGEN: { name: string; subject: string; body: string }[] = [
  {
    name: "Nicht erreicht",
    subject: "Ihre Anfrage: {produkt}",
    body: "Hallo {vorname},\n\nich habe gerade versucht, Sie telefonisch zu erreichen – leider ohne Erfolg. Sie hatten sich für {produkt} interessiert. Wann passt es Ihnen für ein kurzes Telefonat?\n\nViele Grüße\n{meinname}",
  },
  {
    name: "Angebot",
    subject: "Ihr Angebot: {produkt}",
    body: "Hallo {vorname},\n\nwie besprochen erhalten Sie im Anhang Ihr Angebot. Wenn Sie Fragen haben, melden Sie sich gern jederzeit.\n\nViele Grüße\n{meinname}",
  },
  {
    name: "Nachfassen Angebot",
    subject: "Kurze Nachfrage zu Ihrem Angebot",
    body: "Hallo {vorname},\n\nkonnten Sie sich das Angebot schon in Ruhe ansehen? Gern beantworte ich offene Fragen kurz am Telefon.\n\nViele Grüße\n{meinname}",
  },
  {
    name: "Nach dem Abschluss",
    subject: "Vielen Dank für Ihr Vertrauen",
    body: "Hallo {vorname},\n\nvielen Dank für Ihr Vertrauen. Ihre Unterlagen erhalten Sie in Kürze. Wenn Sie Fragen haben, bin ich jederzeit für Sie da.\n\nViele Grüße\n{meinname}",
  },
];

export type Vorlage = { id: string; name: string; subject: string; body: string };

export async function loadVorlagen(customerId: string): Promise<Vorlage[]> {
  let rows = await prisma.mailTemplate.findMany({ where: { customerId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, subject: true, body: true } });
  if (rows.length === 0) {
    await prisma.mailTemplate.createMany({ data: STANDARD_VORLAGEN.map((v) => ({ customerId, ...v })) });
    rows = await prisma.mailTemplate.findMany({ where: { customerId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, subject: true, body: true } });
  }
  return rows;
}

