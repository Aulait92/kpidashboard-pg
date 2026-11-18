// Zentrale Sperren für E-Mails an Leads (Ole, 17.11.2026, Paket M0, docs/plan-mail-vorlagen.md Regeln 5 bis 7).
// Eine Stelle für alle Vorlagen-Mails, automatisch und von Hand (lib/mail/vorlagen-mail.ts, Dialog „E-Mail schreiben“).
//
//   Immer:          Lead gelöscht, Konto ruht, E-Mail-Funktionen aus („Meine Gesellschaft erlaubt das nicht“),
//                   keine gültige Adresse.
//   Abmeldung:      Sperrliste des Vermittlers (Abmeldelink, BestandOptOut), Mail als „abgemeldet“/Spam gemeldet,
//                   „STOPP“ per WhatsApp. Sperrt alle automatischen Mails und von Hand die werblichen Vorlagen.
//   Nur automatisch: Stufe nicht „automatisch“, Stopp-Regeln (Abschluss, Absage), Antwort des Leads seit dem Anlass
//                   (WhatsApp oder, seit Paket M2, E-Mail an die Antwortadresse; automatische Antworten zählen nicht).
// Tageslimit und Idempotenz stehen in vorlagen-mail.ts (Reservierung in LeadMailVersand).

import { prisma } from "@/lib/prisma";
import { optOutHash } from "@/lib/bestand/links";
import { WERBLICH, istMailAdresse, type MailStufe } from "@/lib/mail/ablauf";
import { hatMailAntwort } from "@/lib/mail/kontakt-mail";
import type { VorlageKey } from "@/lib/mail/vorlagen";

export type SperrGrund = "geloescht" | "ruhend" | "mail_aus" | "keine_adresse" | "abgemeldet" | "stufe" | "status" | "antwort";

/** Hinweis für den Vermittler (Sie-Form). */
export const SPERR_TEXT: Record<SperrGrund, string> = {
  geloescht: "Die Daten dieses Kontakts sind gelöscht.",
  ruhend: "Ihr Konto ruht, die App sendet keine E-Mails.",
  mail_aus: "E-Mail-Funktionen sind ausgeschaltet. Sie können den Text kopieren oder im eigenen Mailprogramm öffnen.",
  keine_adresse: "Bitte eine gültige E-Mail-Adresse angeben.",
  abgemeldet: "Der Kontakt hat sich von E-Mails abgemeldet.",
  stufe: "Für diese Mail ist der automatische Versand aus.",
  status: "Der Kontakt ist abgeschlossen oder abgesagt.",
  antwort: "Der Kontakt hat inzwischen geantwortet.",
};

export type SperrDaten = {
  geloescht: boolean;
  ruhend: boolean;
  mailAus: boolean;
  adresse: string | null;
  abgemeldet: boolean;
  status: string | null;
  /** Lead hat seit dem Anlass geantwortet (WhatsApp oder E-Mail an die Antwortadresse) */
  antwort: boolean;
};

const VERLOREN = new Set(["kein interesse", "disqualifiziert", "verloren", "nicht erreichbar"]);

/** Phase für die Stopp-Regeln (rein). */
export function statusGruppe(status: string | null | undefined): "offen" | "abschluss" | "verloren" {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "abschluss") return "abschluss";
  if (VERLOREN.has(s) || s.startsWith("storno")) return "verloren";
  return "offen";
}

/** Was nach Abschluss bzw. Absage automatisch noch gehen darf (Stopp-Regeln, Regel 5). */
const NACH_ABSCHLUSS = new Set<VorlageKey>(["nach_abschluss", "willkommen", "kuendigung", "unterlagen_fehlen", "beratungsdoku"]);
const NACH_ABSAGE = new Set<VorlageKey>(["tuer_offen"]);
/** Gehen automatisch erst nach dem Abschluss bzw. der Absage. */
const NUR_DANACH = new Set<VorlageKey>(["nach_abschluss", "willkommen", "kuendigung", "tuer_offen"]);

/**
 * Darf diese Mail raus? null = ja, sonst der erste Grund (rein). `stufe` nur bei automatischen Mails.
 * Pflicht-Mails (z. B. Terminbestätigung) prüfen Stufe und Status nicht.
 */
export function sperrGrund(d: SperrDaten, o: { vorlage: VorlageKey | null; automatisch: boolean; stufe?: MailStufe; pflicht?: boolean }): SperrGrund | null {
  if (d.geloescht) return "geloescht";
  if (d.ruhend) return "ruhend";
  if (d.mailAus) return "mail_aus";
  if (!istMailAdresse(d.adresse)) return "keine_adresse";
  if (d.abgemeldet && (o.automatisch || (o.vorlage && WERBLICH.has(o.vorlage)))) return "abgemeldet";
  if (!o.automatisch || o.pflicht) return null;
  if (o.stufe && o.stufe !== "auto") return "stufe";
  const g = statusGruppe(d.status);
  if (g === "abschluss" && !(o.vorlage && NACH_ABSCHLUSS.has(o.vorlage))) return "status";
  if (g === "verloren" && !(o.vorlage && NACH_ABSAGE.has(o.vorlage))) return "status";
  if (g === "offen" && o.vorlage && NUR_DANACH.has(o.vorlage)) return "status";
  if (d.antwort) return "antwort";
  return null;
}

/** Ist die Adresse für diesen Kunden abgemeldet (Sperrliste, gemeldete Mail, WhatsApp-STOPP des Leads)? */
export async function istAbgemeldet(customerId: string, adresse: string, leadId?: string | null): Promise<boolean> {
  const to = adresse.trim().toLowerCase();
  if (!to) return false;
  const [liste, gemeldet, stopp] = await Promise.all([
    prisma.bestandOptOut.findFirst({ where: { customerId, kind: "email", hash: optOutHash("email", to) }, select: { id: true } }),
    prisma.contactMail.findFirst({ where: { customerId, recipient: { equals: to, mode: "insensitive" }, status: "abgemeldet" }, select: { id: true } }),
    leadId ? prisma.conversation.findFirst({ where: { customerId, leadId, optedOutAt: { not: null } }, select: { id: true } }) : null,
  ]);
  return !!(liste || gemeldet || stopp);
}

/** Daten für sperrGrund aus der Datenbank. `antwortSeit`: Antwort per WhatsApp oder E-Mail seit diesem Zeitpunkt zählt. */
export async function ladeSperrDaten(leadId: string, o: { to?: string | null; antwortSeit?: Date | null } = {}): Promise<SperrDaten & { customerId: string | null }> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { customerId: true, email: true, status: true, erasedAt: true, customer: { select: { dormantSince: true, dataDeletedAt: true, mailFeaturesOff: true } } },
  });
  if (!lead) return { customerId: null, geloescht: true, ruhend: false, mailAus: false, adresse: null, abgemeldet: false, status: null, antwort: false };
  const adresse = (o.to ?? lead.email ?? "").trim() || null;
  const [abgemeldet, antwort] = await Promise.all([
    adresse ? istAbgemeldet(lead.customerId, adresse, leadId) : false,
    o.antwortSeit
      ? Promise.all([
          prisma.message.count({ where: { direction: "inbound", createdAt: { gt: o.antwortSeit }, conversation: { customerId: lead.customerId, leadId } } }),
          hatMailAntwort(leadId, o.antwortSeit),
        ]).then(([wa, mail]) => wa > 0 || mail)
      : false,
  ]);
  return {
    customerId: lead.customerId,
    geloescht: !!lead.erasedAt,
    ruhend: !!(lead.customer.dormantSince || lead.customer.dataDeletedAt),
    mailAus: lead.customer.mailFeaturesOff,
    adresse,
    abgemeldet,
    status: lead.status,
    antwort,
  };
}
