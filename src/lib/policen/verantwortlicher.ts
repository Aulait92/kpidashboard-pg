// Langfassung des Datenschutzhinweises zu Policen per WhatsApp (/datenschutz/policen?k=<Token der Erstinformation>,
// öffentliche Seite des Vermittlers, Texte lib/policen/datenschutz-text.ts).

import { publicUrlOr } from "@/lib/public-url";

/** Pfad der Langfassung (Datenschutzhinweis zu Unterlagen) für einen Token der Erstinformation. */
export const policenDatenschutzPfad = (token: string) => `/datenschutz/policen?k=${encodeURIComponent(token)}`;

/** Öffentliche Adresse der Langfassung für diesen Kunden (legt den Token der Erstinformation bei Bedarf an). */
export async function policenDatenschutzUrl(customerId: string): Promise<string> {
  const { getOrCreateErstinfo } = await import("@/lib/erstinformation");
  const { token } = await getOrCreateErstinfo(customerId);
  return publicUrlOr(policenDatenschutzPfad(token));
}
