// Neuer Lead: Push und E-Mail je Login nach der Wahl „nur meine / alle im Team“ (Ole, 26.11.2026; Regeln und Texte:
// lib/lead-benachrichtigung-shared.ts). Aufgerufen aus processNewLead (lib/lead-intake.ts) nach der Zuteilung.
//
// Abgrenzung zu bestehenden Lead-Mails (keine Doppelmail):
//   - „Neue Leads per E-Mail“ am Konto (lib/onboarding-cron.ts emailLeads): in Teams nur noch an fest hinterlegte
//     Adressen (Fragebogen leadEmails); an diese Adressen geht hier nichts. Ohne Team bleibt es allein zuständig.
//   - Pay-per-Lead „Kundenbereich + PDF per Mail“ (lib/ppl/delivery.ts): an die Liefer-Adressen des Bezugs geht hier nichts.
//   - Je Lead höchstens einmal (Lead.teamMailAt), je Login höchstens eine Mail, auch wenn er selbst zuständig ist.

import { prisma } from "@/lib/prisma";
import { sendToUser, type PushPayload } from "@/lib/push";
import { reportError } from "@/lib/monitoring";
import { leadMailInhalt, mailEmpfaenger, pushEmpfaenger, type Empfaenger } from "@/lib/lead-benachrichtigung-shared";

type TeamLogin = Empfaenger & { displayName: string | null };

async function teamLogins(customerId: string): Promise<TeamLogin[]> {
  return prisma.user.findMany({
    where: { customerId, role: "BUYER" },
    select: { id: true, email: true, displayName: true, teamRole: true, leadMailScope: true, leadPushScope: true },
    orderBy: { createdAt: "asc" },
  });
}

/** Push „Neuer Lead“: an den Zuständigen und Inhaber mit „alle“; ohne Zuständigen an alle Logins (wie bisher). */
export async function neuerLeadPush(leadId: string, payload: PushPayload): Promise<string[]> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { customerId: true, assignedUserId: true } });
  if (!lead) return [];
  const an = pushEmpfaenger(await teamLogins(lead.customerId), lead.assignedUserId);
  for (const u of an) await sendToUser(u.id, payload).catch((err) => reportError(err, "lead-push", { lead: leadId }));
  return an.map((u) => u.id);
}

/** Adressen, die diesen Lead schon über einen anderen Weg per E-Mail bekommen (klein geschrieben). */
async function schonPerMail(customerId: string, produkt: string | null, kontoLeadMail: boolean): Promise<Set<string>> {
  const out = new Set<string>();
  if (kontoLeadMail) {
    const ob = await prisma.onboarding.findUnique({ where: { customerId }, select: { status: true, questionnaire: true } }).catch(() => null);
    const feste = ((ob?.questionnaire ?? {}) as { leadEmails?: string[] }).leadEmails ?? [];
    if (ob && ob.status !== "cancelled") for (const a of feste) out.add(a.trim().toLowerCase());
  }
  if (produkt) {
    const subs = await prisma.leadSubscription.findMany({ where: { customerId, productKey: produkt, active: true, delivery: "app_pdf" }, select: { deliveryEmail: true } });
    const { parseAddresses } = await import("@/lib/ppl/lead-mail");
    for (const s of subs) for (const a of parseAddresses(s.deliveryEmail)) out.add(a.toLowerCase());
  }
  return out;
}

/** E-Mail „Neuer Lead“ an das Team (nur Teams, je Lead einmal). Gibt die Empfänger-IDs zurück. */
export async function neuerLeadMail(leadId: string): Promise<string[]> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      name: true,
      source: true,
      customerId: true,
      assignedUserId: true,
      teamMailAt: true,
      assignedUser: { select: { displayName: true, email: true } },
      customer: { select: { leadEmail: true, dormantSince: true } },
    },
  });
  if (!lead || lead.teamMailAt || !lead.customer || lead.customer.dormantSince) return [];
  const team = await teamLogins(lead.customerId);
  const kontoLeadMail = lead.customer.leadEmail;
  const schon = await schonPerMail(lead.customerId, lead.source, kontoLeadMail);
  const an = mailEmpfaenger(team, lead.assignedUserId, kontoLeadMail).filter((u) => !schon.has(u.email.toLowerCase()));
  if (!an.length) return [];
  // Je Lead nur einmal, auch wenn processNewLead erneut läuft (z. B. Pay-per-Lead erneut zugestellt)
  const claim = await prisma.lead.updateMany({ where: { id: lead.id, teamMailAt: null }, data: { teamMailAt: new Date() } });
  if (claim.count === 0) return [];
  const [{ sendCustomerMail, getAppUrl }, { vermittlerDu }] = await Promise.all([import("@/lib/email"), import("@/lib/vermittler-ansprache-server")]);
  const du = await vermittlerDu(lead.customerId).catch(() => false);
  const zustaendig = lead.assignedUser ? lead.assignedUser.displayName?.trim() || lead.assignedUser.email : null;
  const gesendet: string[] = [];
  for (const u of an) {
    const m = leadMailInhalt({ du, leadName: lead.name, produkt: lead.source, zustaendig, fuerMich: lead.assignedUserId === u.id, url: `${getAppUrl()}/buyer/leads/${lead.id}` });
    const res = await sendCustomerMail({
      to: u.email,
      subject: m.subject,
      greeting: m.greeting,
      paragraphs: m.paragraphs,
      list: m.list,
      html: `<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#64748B">${m.fuss.replace(/&/g, "&amp;")}</p>`,
      textBlocks: [m.fuss],
      button: m.button,
      replyTo: null,
      signature: "performancegrowth",
    }).catch((err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }));
    if (res.ok) gesendet.push(u.id);
    else reportError(new Error(res.error ?? "Versand fehlgeschlagen"), "lead-team-mail", { lead: lead.id });
  }
  console.info(`[lead-mail team] lead=${lead.id} an=${gesendet.length}/${an.length}`);
  return gesendet;
}
