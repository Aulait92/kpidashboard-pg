// E-Mail aus der Kontaktakte senden (Ole, 23.11.2026): Prüfungen, Versand über das Postfach des Admins
// (lib/vertrieb/crm-postfach.ts) und Eintrag im Verlauf des Kontakts. Vorlagen: lib/vertrieb/crm-vorlagen.ts.

import { prisma } from "@/lib/prisma";
import { checkLimit } from "@/lib/rate-limit";
import { aktuellesAngebot } from "@/lib/vertrieb/verkaufspraesentation";
import { absenderName, crmWerte, empfaengerListe, pruefeMail, verlaufEintrag, type CrmVorlage, type CrmWerte, type MailEingabe } from "@/lib/vertrieb/crm-vorlagen";
import { crmPostfachVon, sendViaCrmPostfach, type CrmPostfach } from "@/lib/vertrieb/crm-postfach";

export type CrmMailErgebnis = { ok: true; hinweis: string } | { ok: false; error: string; keinPostfach?: boolean };

/** Vorlagen in der Reihenfolge der Einstellungen. */
export function ladeCrmVorlagen(): Promise<CrmVorlage[]> {
  return prisma.salesMailTemplate.findMany({ orderBy: [{ sort: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, subject: true, body: true, bodyDu: true } }).catch(() => []);
}

/** Link zum aktuellen (verschickten oder angenommenen) Angebot, sonst null. */
export function angebotsLink(offers: { status: string; isTest?: boolean; createdAt: Date; token: string }[], appUrl: string): string | null {
  const o = aktuellesAngebot(offers.filter((x) => x.status !== "draft"));
  return o && appUrl ? `${appUrl}/angebot/${o.token}` : null;
}

export type EmailKontext = {
  postfach: CrmPostfach | null;
  empfaenger: string[];
  vorlagen: CrmVorlage[];
  werte: { sie: CrmWerte; du: CrmWerte };
  gesperrt: string | null;
};

/** Alles für das E-Mail-Fenster der Kontaktakte. */
export async function ladeEmailKontext(
  c: { name: string; email: string; altEmails: string[]; salutation: string | null; firstName: string | null; lastName: string | null; nieKontaktierenAt: Date | null; art17GeloeschtAt: Date | null; offers: { status: string; isTest?: boolean; createdAt: Date; token: string }[] },
  session: { userId: string; email: string },
  appUrl: string,
): Promise<EmailKontext> {
  const [postfach, vorlagen, user] = await Promise.all([
    crmPostfachVon(session.userId),
    ladeCrmVorlagen(),
    prisma.user.findUnique({ where: { id: session.userId }, select: { displayName: true } }).catch(() => null),
  ]);
  const basis = { angebotslink: angebotsLink(c.offers, appUrl), absender: absenderName(user?.displayName, session.email) };
  return {
    postfach,
    empfaenger: empfaengerListe(c),
    vorlagen,
    werte: { sie: crmWerte(c, { ...basis, du: false }), du: crmWerte(c, { ...basis, du: true }) },
    gesperrt: sperrGrund(c),
  };
}

function sperrGrund(c: { nieKontaktierenAt: Date | null; art17GeloeschtAt: Date | null }): string | null {
  if (c.art17GeloeschtAt) return "Der Kontakt wurde auf Verlangen gelöscht.";
  if (c.nieKontaktierenAt) return "Der Kontakt ist auf „Nie kontaktieren“ gesetzt.";
  return null;
}

/** Je Admin höchstens 30 Mails pro Stunde (Schutz bei Doppelklicks und Missbrauch eines Logins). */
export const CRM_MAIL_LIMIT = "crmMail" as const;

/**
 * Mail an einen Vertriebskontakt senden und im Verlauf eintragen. Prüft: Kontakt vorhanden und nicht gesperrt,
 * Adresse gehört zum Kontakt, Betreff/Text vollständig, Grenze je Admin, Postfach verbunden.
 */
export async function sendeKontaktMail(session: { userId: string }, contactId: string, eingabe: MailEingabe): Promise<CrmMailErgebnis> {
  const c = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { id: true, email: true, altEmails: true, nieKontaktierenAt: true, art17GeloeschtAt: true } });
  if (!c) return { ok: false, error: "Kontakt nicht gefunden." };
  const sperre = sperrGrund(c);
  if (sperre) return { ok: false, error: `${sperre} Es wird keine E-Mail gesendet.` };
  const p = pruefeMail(eingabe, empfaengerListe(c));
  if (!p.ok) return p;
  if (!checkLimit(CRM_MAIL_LIMIT, session.userId).ok) return { ok: false, error: "Zu viele E-Mails in kurzer Zeit. Bitte später noch einmal versuchen." };
  const res = await sendViaCrmPostfach(session.userId, { to: p.mail.to, subject: p.mail.subject, text: p.mail.body });
  if (!res.ok) return { ok: false, error: res.error, ...(res.keinPostfach ? { keinPostfach: true } : {}) };
  const eintrag = verlaufEintrag(p.mail, res.from);
  await prisma.$transaction([
    prisma.salesActivity.create({ data: { contactId: c.id, type: "EMAIL", outcome: eintrag.outcome, note: eintrag.note } }),
    prisma.salesContact.update({ where: { id: c.id }, data: { lastContactAt: new Date() } }),
  ]);
  return { ok: true, hinweis: `E-Mail an ${p.mail.to} gesendet.` };
}
