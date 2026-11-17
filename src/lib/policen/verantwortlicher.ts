// Wer im Einwilligungstext als Verantwortlicher steht (Ole, 17.11.2026, docs/recht-gesundheitsunterlagen.md Frage 1):
// der Vermittler mit Namen (in der Ansprache des Assistenten) und Firma laut Anbieterangaben, dazu der Link zur
// Langfassung (/datenschutz/policen?k=<Token der Erstinformation>, öffentliche Seite des Vermittlers).

import { prisma } from "@/lib/prisma";
import { firmDisplayName } from "@/lib/advisor-name";
import { publicUrlOr } from "@/lib/public-url";
import type { Person, Verantwortlicher } from "@/lib/policen/regeln";

/** Pfad der Langfassung (Datenschutzhinweis zu Unterlagen) für einen Token der Erstinformation. */
export const policenDatenschutzPfad = (token: string) => `/datenschutz/policen?k=${encodeURIComponent(token)}`;

/** Öffentliche Adresse der Langfassung für diesen Kunden (legt den Token der Erstinformation bei Bedarf an). */
export async function policenDatenschutzUrl(customerId: string): Promise<string> {
  const { getOrCreateErstinfo } = await import("@/lib/erstinformation");
  const { token } = await getOrCreateErstinfo(customerId);
  return publicUrlOr(policenDatenschutzPfad(token));
}

export async function verantwortlicherFuer(customerId: string, person: Person): Promise<Verantwortlicher> {
  const [e, c] = await Promise.all([
    prisma.erstinformation.findUnique({ where: { customerId }, select: { firma: true } }).catch(() => null),
    prisma.customer.findUnique({ where: { id: customerId }, select: { name: true } }).catch(() => null),
  ]);
  const firma = e?.firma?.trim() || firmDisplayName(c?.name) || null;
  const link = await policenDatenschutzUrl(customerId).catch(() => null);
  return { person, firma, link };
}
