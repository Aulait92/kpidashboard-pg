// Falsche Nummer (Ole, 17.11.2026: „wenn falsche Nummer angegeben wird, könnte man noch probieren, per E-Mail die richtige
// Nummer zu holen“). Kurze E-Mail im Namen des Vermittlers, nur zur konkreten Anfrage des Leads (wie „Kein WhatsApp“,
// lib/whatsapp/kein-whatsapp-mail.ts): bittet um die richtige Nummer, mit persönlichem Terminlink. Du/Sie nach
// Customer.leadAddress, keine Gedankenstriche. Rein, ohne Datenbank, getestet. Versand: app/buyer/next-step-actions.ts.

import { a, type AnredeKontakt, type Ansprache } from "@/lib/ansprache";
import { fuelle, werteFuer } from "@/lib/mail/platzhalter";
import { ohneGedankenstriche } from "@/lib/gedankenstriche";

export type NummerMailInput = { an: Ansprache; kontakt: AnredeKontakt; source: string | null; advisor: string; link: string | null; signatur?: string | null };

export function nummerMail(o: NummerMailInput): { subject: string; text: string } {
  const w = {
    ...werteFuer(
      { name: o.kontakt.fullName ?? null, source: o.source, firstName: o.kontakt.firstName, lastName: o.kontakt.lastName, salutation: o.kontakt.salutation },
      o.advisor,
      { ansprache: o.an, terminlink: o.link },
    ),
    signatur: o.signatur ?? "",
  };
  const an = o.an;
  const body = [
    "{anrede},",
    "",
    a(
      an,
      "vielen Dank für deine Anfrage zu {ihr_produkt}. Ich wollte dich gerade anrufen, unter der angegebenen Nummer erreiche ich dich aber leider nicht.",
      "vielen Dank für Ihre Anfrage zu {ihr_produkt}. Ich wollte Sie gerade anrufen, unter der angegebenen Nummer erreiche ich Sie aber leider nicht.",
    ),
    "",
    a(an, "Antworte mir gern kurz mit deiner richtigen Telefonnummer, dann melde ich mich bei dir.", "Antworten Sie mir gern kurz mit Ihrer richtigen Telefonnummer, dann melde ich mich bei Ihnen."),
    ...(o.link ? ["", a(an, "Oder such dir direkt einen Termin aus, der dir passt:\n{terminlink}", "Oder wählen Sie direkt einen Termin, der Ihnen passt:\n{terminlink}")] : []),
    "",
    "{signatur}",
  ].join("\n");
  return {
    subject: ohneGedankenstriche(fuelle(a(an, "{betreff_name}deine Telefonnummer zu {ihr_produkt}", "{betreff_name}Ihre Telefonnummer zu {ihr_produkt}"), w)),
    text: ohneGedankenstriche(fuelle(body, w)),
  };
}
