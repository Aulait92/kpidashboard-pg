"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { hashPassword, issuePasswordResetToken } from "@/lib/auth";
import { buildResetUrl, sendCustomerMail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { memberName } from "@/lib/team";

// Team-Verwaltung im Kundenbereich: nur der Inhaber (owner), nie in der
// Admin-Vorschau. Berater (advisor) sehen nur die ihnen zugeteilten Leads.

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type TeamFormState = { ok?: boolean; error?: string; message?: string };

async function requireOwner() {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview || !ctx.userId) throw new Error("In der Vorschau nicht möglich.");
  if (ctx.teamRole !== "owner") throw new Error("Nur der Inhaber kann das Team verwalten.");
  return { ...ctx, userId: ctx.userId };
}

async function memberOf(customerId: string, userId: string) {
  return prisma.user.findFirst({
    where: { id: userId, customerId, role: "BUYER" },
    select: { id: true, email: true, displayName: true, teamRole: true, receivesLeads: true },
  });
}

export async function inviteMemberAction(_prev: TeamFormState, fd: FormData): Promise<TeamFormState> {
  try {
    const ctx = await requireOwner();
    const name = String(fd.get("name") ?? "").trim().slice(0, 80);
    const email = String(fd.get("email") ?? "").trim().toLowerCase();
    if (!name) return { error: "Bitte einen Namen eingeben." };
    if (!EMAIL_RE.test(email)) return { error: "Bitte eine gültige E-Mail-Adresse eingeben." };
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) return { error: "Diese E-Mail-Adresse hat schon einen Zugang. Bitte eine andere verwenden." };
    const count = await prisma.user.count({ where: { customerId: ctx.customerId, role: "BUYER" } });
    if (count >= 10) return { error: "Maximal 10 Zugänge je Agentur. Bitte melden Sie sich bei uns." };

    const [customer, owner] = await Promise.all([
      prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { name: true } }),
      prisma.user.findUnique({ where: { id: ctx.userId }, select: { email: true, displayName: true } }),
    ]);
    await prisma.user.create({
      data: {
        email,
        // Unbenutzbares Zufallspasswort, der Berater legt sein eigenes fest.
        passwordHash: await hashPassword(crypto.randomBytes(24).toString("base64url")),
        role: "BUYER",
        customerId: ctx.customerId,
        teamRole: "advisor",
        displayName: name,
        receivesLeads: true,
      },
    });
    const token = await issuePasswordResetToken(email, INVITE_TTL_MS);
    const url = token ? buildResetUrl(token.rawToken) : null;
    const agency = (customer?.name ?? "Ihre Agentur").replace(/^Allianz\s+/i, "");
    const inviter = owner ? memberName(owner) : agency;
    const sent = url
      ? await sendCustomerMail({
          to: email,
          subject: `Ihr Zugang zum Kundenbereich von ${agency}`,
          greeting: `Hallo ${name},`,
          paragraphs: [
            `${inviter} hat Sie in das Team von ${agency} eingeladen. Im Kundenbereich sehen Sie die Leads, die Ihnen zugeteilt werden, die WhatsApp-Gespräche dazu und Ihre Termine.`,
            "Bitte legen Sie über den Button Ihr Passwort fest. Der Link ist 7 Tage gültig.",
            "Tipp: Installieren Sie die Seite danach als App auf Ihrem Handy und erlauben Sie Mitteilungen. Dann erfahren Sie sofort von jedem neuen Lead.",
          ],
          button: { label: "Passwort festlegen", url },
        })
      : { ok: false as const, error: "Kein Link erzeugt." };
    revalidatePath("/buyer/team");
    return sent.ok
      ? { ok: true, message: `Einladung an ${email} ist verschickt.` }
      : { ok: true, message: `Zugang für ${email} ist angelegt. Die E-Mail ging nicht raus, bitte später „Einladung erneut senden“ nutzen.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Das hat nicht geklappt." };
  }
}

export async function resendInviteAction(fd: FormData): Promise<void> {
  const ctx = await requireOwner();
  const m = await memberOf(ctx.customerId, String(fd.get("userId") ?? ""));
  if (!m || m.teamRole !== "advisor") return;
  const token = await issuePasswordResetToken(m.email, INVITE_TTL_MS);
  if (!token) return;
  await sendCustomerMail({
    to: m.email,
    subject: "Ihr Zugang zum Kundenbereich",
    greeting: `Hallo ${memberName(m)},`,
    paragraphs: ["hier ist Ihr neuer Link, um Ihr Passwort festzulegen. Er ist 7 Tage gültig."],
    button: { label: "Passwort festlegen", url: buildResetUrl(token.rawToken) },
  }).catch((err) => reportError(err, "team-invite"));
  revalidatePath("/buyer/team");
}

export async function toggleReceivesLeadsAction(fd: FormData): Promise<void> {
  const ctx = await requireOwner();
  const m = await memberOf(ctx.customerId, String(fd.get("userId") ?? ""));
  if (!m) return;
  await prisma.user.update({
    where: { id: m.id },
    // Wer wieder einsteigt, reiht sich hinten ein (kein Nachholen verpasster Leads).
    data: { receivesLeads: !m.receivesLeads, ...(!m.receivesLeads ? { lastLeadAssignedAt: new Date() } : {}) },
  });
  revalidatePath("/buyer/team");
}

export async function renameMemberAction(fd: FormData): Promise<void> {
  const ctx = await requireOwner();
  const m = await memberOf(ctx.customerId, String(fd.get("userId") ?? ""));
  const name = String(fd.get("name") ?? "").trim().slice(0, 80);
  if (!m || !name) return;
  await prisma.user.update({ where: { id: m.id }, data: { displayName: name } });
  revalidatePath("/buyer/team");
}

/** Berater entfernen. Seine offenen Leads gehen zurück an den Inhaber. */
export async function removeMemberAction(fd: FormData): Promise<void> {
  const ctx = await requireOwner();
  const m = await memberOf(ctx.customerId, String(fd.get("userId") ?? ""));
  if (!m || m.teamRole !== "advisor" || m.id === ctx.userId) return;
  await prisma.$transaction([
    prisma.lead.updateMany({ where: { customerId: ctx.customerId, assignedUserId: m.id }, data: { assignedUserId: null } }),
    prisma.user.delete({ where: { id: m.id } }),
  ]);
  revalidatePath("/buyer/team");
}

/** Lead einem anderen Team-Mitglied zuteilen (nur Inhaber). */
export async function reassignLeadAction(leadId: string, userId: string | null): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await requireOwner();
    const lead = await prisma.lead.findFirst({ where: { id: leadId, customerId: ctx.customerId }, select: { id: true, name: true } });
    if (!lead) return { ok: false, error: "Lead nicht gefunden." };
    const target = userId ? await memberOf(ctx.customerId, userId) : null;
    if (userId && !target) return { ok: false, error: "Team-Mitglied nicht gefunden." };
    await prisma.lead.update({ where: { id: lead.id }, data: { assignedUserId: target?.id ?? null } });
    if (target && target.id !== ctx.userId) {
      const { sendToUser } = await import("@/lib/push");
      await sendToUser(target.id, {
        title: `Lead an Sie übergeben: ${lead.name ?? "ohne Name"}`,
        body: "Ihr Inhaber hat Ihnen diesen Lead zugeteilt.",
        tag: `lead-assign:${lead.id}`,
        url: `/buyer/leads/${lead.id}`,
      }).catch(() => {});
    }
    revalidatePath(`/buyer/leads/${lead.id}`);
    revalidatePath("/buyer/leads");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Das hat nicht geklappt." };
  }
}
