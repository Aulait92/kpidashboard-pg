// E-Mail an einen Lead, dessen Nummer nicht per WhatsApp erreichbar ist (Ole, 15.11.2026). Rein, ohne Datenbank,
// getestet. Kurz, im Namen des Vermittlers, nur zur konkreten Anfrage, mit persönlichem Terminlink; Du/Sie nach
// Customer.leadAddress, Anrede wie die E-Mail-Vorlagen (werteFuer: ohne bekannte Anrede neutral „Guten Tag,“).
// Versand und Regeln: lib/whatsapp/kein-whatsapp.ts.

import { a, type AnredeKontakt, type Ansprache } from "@/lib/ansprache";
import { fuelle, werteFuer } from "@/lib/mail/platzhalter";
import { ohneGedankenstriche } from "@/lib/gedankenstriche";

export type KeinWhatsAppMailInput = {
  an: Ansprache;
  kontakt: AnredeKontakt;
  /** Produkt bzw. Quelle des Leads (Lead.source), für „kurz zu Ihrer Zahnzusatzversicherung“ */
  source: string | null;
  /** Name des Vermittlers (Absender) */
  advisor: string;
  /** Persönlicher Buchungslink (null: ohne Kalender, dann „antworten Sie einfach“) */
  link: string | null;
  /** Signatur des Postfachs (leer: „Viele Grüße“ und Name) */
  signatur?: string | null;
};

export function keinWhatsAppMail(o: KeinWhatsAppMailInput): { subject: string; text: string } {
  const w = {
    ...werteFuer(
      { name: o.kontakt.fullName ?? null, source: o.source, firstName: o.kontakt.firstName, lastName: o.kontakt.lastName, salutation: o.kontakt.salutation },
      o.advisor,
      { ansprache: o.an, terminlink: o.link },
    ),
    signatur: o.signatur ?? "",
  };
  const an = o.an;
  const termin = o.link
    ? a(an, "Hier kannst du direkt einen Termin wählen, der dir passt:\n{terminlink}", "Hier können Sie direkt einen Termin wählen, der Ihnen passt:\n{terminlink}")
    : a(
        an,
        "Antworte gern einfach auf diese E-Mail, dann melde ich mich zu einer Zeit, die dir passt.",
        "Antworten Sie gern einfach auf diese E-Mail, dann melde ich mich zu einer Zeit, die Ihnen passt.",
      );
  const body = [
    "{anrede},",
    "",
    a(
      an,
      "vielen Dank für dein Interesse. Ich wollte mich per WhatsApp kurz zu {ihr_produkt} bei dir melden, die Nachricht ist unter deiner Nummer aber leider nicht angekommen.",
      "vielen Dank für Ihr Interesse. Ich wollte mich per WhatsApp kurz zu {ihr_produkt} bei Ihnen melden, die Nachricht ist unter Ihrer Nummer aber leider nicht angekommen.",
    ),
    "",
    termin,
    "",
    "{signatur}",
  ].join("\n");
  return {
    subject: ohneGedankenstriche(fuelle("{betreff_name}kurz zu {ihr_produkt}", w)),
    text: ohneGedankenstriche(fuelle(body, w)),
  };
}
