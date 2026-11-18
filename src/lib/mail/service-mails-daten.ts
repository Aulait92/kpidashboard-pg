// Daten für „Service-Mails in Ihrem Namen“ (Paket M9/M7): eine Quelle für Einstellungen → Assistent und die Einrichtung
// (Schritt direkt nach „So arbeitet Ihr Assistent“, P8). Antwortweg (M7): mit Schalter MAIL_ANTWORT_EINGANG die
// Weiterleitungsadresse (Muster je Kontakt), ohne Schalter bzw. mit Postfach die eigene Adresse.

import { prisma } from "@/lib/prisma";
import { ABLAUF_VORLAGEN, leseMailAblauf, type MailStufe } from "@/lib/mail/ablauf";
import { MAIL_ARTEN } from "@/lib/mail/kontakt-mail";
import { leadVersandKontext } from "@/lib/mail/lead-versand";
import { fehlendeAngaben, serviceMailVorschau, signaturAngaben, type ServiceMailVorschau, type SignaturAngaben } from "@/lib/mail/service-mails";
import { antwortEingangAn, ANTWORT_DOMAIN, kurzname } from "@/lib/mail/antwort-adresse";
import type { VorlageKey } from "@/lib/mail/vorlagen";

/** Wohin Antworten der Kunden gehen (M7). */
export type Antwortweg = { art: "postfach" } | { art: "eigene"; adresse: string | null } | { art: "eingang"; muster: string };

export type ServiceMailsDaten = {
  mailOff: boolean;
  bestaetigt: boolean;
  vorschau: ServiceMailVorschau;
  angaben: SignaturAngaben;
  fehlend: (keyof SignaturAngaben)[];
  /** Anrede des Vermittlers fehlt (Pflicht, „Herr Kannapinn“ in allen Texten) */
  anredeFehlt: boolean;
  stufen: Record<VorlageKey, MailStufe>;
  namen: Record<VorlageKey, string>;
  kopie: { an: boolean; adresse: string | null; eigene: string | null };
  antwortweg: Antwortweg;
};

/** Antwortweg (rein): Postfach verbunden, Schalter an (Weiterleitungsadresse) oder eigene Adresse. */
export function antwortwegFuer(o: { postfach: boolean; eingangAn: boolean; slug: string | null; eigene: string | null }): Antwortweg {
  if (o.postfach) return { art: "postfach" };
  if (o.eingangAn) {
    const k = kurzname(o.slug);
    return { art: "eingang", muster: `${k ? `${k}.` : ""}<Code>@${ANTWORT_DOMAIN}` };
  }
  return { art: "eigene", adresse: o.eigene };
}

export async function serviceMailsDaten(customerId: string, userId: string | null | undefined, email: string | null | undefined): Promise<ServiceMailsDaten> {
  const [c, angaben, vorschau, k, erst] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { mailAblauf: true, mailFeaturesOff: true, calendarConnection: { select: { bookingSlug: true } } } }),
    signaturAngaben(customerId),
    serviceMailVorschau(customerId, { userId }),
    // Antwortadresse der automatischen Mails = „eigene Adresse“ für die Kopie
    leadVersandKontext(customerId, { nurLesen: true }),
    prisma.erstinformation.findUnique({ where: { customerId }, select: { anrede: true } }).catch(() => null),
  ]);
  const ablauf = leseMailAblauf(c?.mailAblauf);
  const eigene = k.replyTo ?? email ?? null;
  return {
    mailOff: !!c?.mailFeaturesOff,
    bestaetigt: !!ablauf.bestaetigtAt,
    vorschau,
    angaben,
    fehlend: fehlendeAngaben(angaben),
    anredeFehlt: !erst?.anrede,
    stufen: ablauf.stufen,
    namen: Object.fromEntries(ABLAUF_VORLAGEN.map((key) => [key, MAIL_ARTEN[key]])) as Record<VorlageKey, string>,
    kopie: { an: ablauf.bcc.an, adresse: ablauf.bcc.adresse, eigene },
    antwortweg: antwortwegFuer({ postfach: vorschau.postfach, eingangAn: antwortEingangAn(), slug: c?.calendarConnection?.bookingSlug ?? null, eigene }),
  };
}
