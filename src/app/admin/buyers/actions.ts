"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession, hashPassword, invalidateUserSessions, issuePasswordResetToken } from "@/lib/auth";
import { buildResetUrl, sendBuyerInviteEmail, sendPasswordResetEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { LOGIN_EMAIL_RE, normalizeLoginEmail } from "@/lib/login-email";

async function requireAdmin() {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Nur Admins.");
  }
  return session;
}

export type CreateBuyerState = {
  ok?: boolean;
  error?: string;
  createdEmail?: string;
};

export async function createBuyerAccount(
  _prev: CreateBuyerState,
  formData: FormData,
): Promise<CreateBuyerState> {
  await requireAdmin();

  const email = normalizeLoginEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const customerId = String(formData.get("customerId") ?? "");

  if (!email || !password || !customerId) {
    return { error: "Email, Passwort und Kunde sind Pflicht." };
  }
  if (password.length < 8) {
    return { error: "Passwort muss mindestens 8 Zeichen lang sein." };
  }
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true },
  });
  if (!customer) {
    return { error: "Kunde existiert nicht." };
  }
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    return { error: "Email ist bereits vergeben." };
  }

  const created = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      role: "BUYER",
      customerId,
    },
  });
  await audit("user.create", { entity: "User", entityId: created.id, customerId, details: { email } });

  revalidatePath("/admin/neu/kunden");
  revalidatePath("/admin/neu/kunden", "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kundenakte)
  return { ok: true, createdEmail: email };
}

export async function resetBuyerPassword(
  _prev: CreateBuyerState,
  formData: FormData,
): Promise<CreateBuyerState> {
  await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!userId || password.length < 8) {
    return { error: "Passwort muss mindestens 8 Zeichen lang sein." };
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true },
  });
  if (!user || user.role !== "BUYER") {
    return { error: "Buyer-Account nicht gefunden." };
  }
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password) },
  });
  // Neues Passwort → alle bestehenden Sitzungen dieses Logins beenden
  await invalidateUserSessions(userId);
  await audit("user.password_reset", { entity: "User", entityId: userId });
  revalidatePath("/admin/neu/kunden");
  revalidatePath("/admin/neu/kunden", "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kundenakte)
  return { ok: true, createdEmail: user.email };
}

// Verknüpft einen bestehenden Buyer-Login mit einem (anderen) Kunden, ohne
// den Account neu anzulegen — Passwort & Login-Historie bleiben erhalten.
// Nützlich, wenn ein Login versehentlich am falschen/gelöschten Kunden hing.
export async function reassignBuyerCustomer(
  _prev: CreateBuyerState,
  formData: FormData,
): Promise<CreateBuyerState> {
  await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const customerId = String(formData.get("customerId") ?? "");
  if (!userId || !customerId) {
    return { error: "Buyer und Kunde sind Pflicht." };
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!user || user.role !== "BUYER") {
    return { error: "Buyer-Account nicht gefunden." };
  }
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true },
  });
  if (!customer) {
    return { error: "Kunde existiert nicht." };
  }
  await prisma.user.update({
    where: { id: userId },
    data: { customerId },
  });
  // Kundenzuordnung steht im Sitzungs-Cookie → neu anmelden lassen
  await invalidateUserSessions(userId);
  await audit("user.reassign", { entity: "User", entityId: userId, customerId });
  revalidatePath("/admin/neu/kunden");
  revalidatePath("/admin/neu/kunden", "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kundenakte)
  // createdEmail trägt hier den Kundennamen für die Bestätigung im UI.
  return { ok: true, createdEmail: customer.name };
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Zugangslink per E-Mail: Wer sich noch nie angemeldet hat, bekommt die Einladung
 * erneut (Passwort festlegen, 7 Tage gültig), alle anderen den Link „Passwort ändern“.
 */
export async function sendBuyerAccessLink(
  formData: FormData,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, role: true, lastLoginAt: true, customerId: true, customer: { select: { name: true } } },
      })
    : null;
  if (!user || user.role !== "BUYER") return { ok: false, error: "Login nicht gefunden." };
  const invite = !user.lastLoginAt;
  const token = await issuePasswordResetToken(user.email, invite ? INVITE_TTL_MS : undefined);
  if (!token) return { ok: false, error: "Link konnte nicht erzeugt werden." };
  const url = buildResetUrl(token.rawToken);
  const sent = invite
    ? await sendBuyerInviteEmail({ to: user.email, customerName: user.customer?.name ?? "performancegrowth", setPasswordUrl: url })
    : await sendPasswordResetEmail({ to: user.email, resetUrl: url });
  await audit(invite ? "user.invite" : "user.reset_link", {
    entity: "User",
    entityId: user.id,
    customerId: user.customerId,
    details: { email: user.email, sent: sent.ok },
  });
  if (!sent.ok) return { ok: false, error: `E-Mail an ${user.email} ging nicht raus: ${sent.error}` };
  revalidatePath("/admin/neu/kunden");
  revalidatePath("/admin/neu/kunden", "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kundenakte)
  return { ok: true, message: invite ? `Einladung an ${user.email} gesendet` : `Link zum Passwort ändern an ${user.email} gesendet` };
}

export async function deleteBuyerAccount(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user || user.role !== "BUYER") return;
  const gone = await prisma.user.delete({ where: { id: userId } });
  await audit("user.delete", { entity: "User", entityId: userId, customerId: gone.customerId, details: { email: gone.email } });
  revalidatePath("/admin/neu/kunden");
  revalidatePath("/admin/neu/kunden", "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kundenakte)
}

/** Login-E-Mail eines Kunden-Logins ändern (Ole, 15.11.2026, z. B. Testkunde mit frischer Adresse). */
export async function changeBuyerEmail(_prev: CreateBuyerState, formData: FormData): Promise<CreateBuyerState> {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const email = normalizeLoginEmail(String(formData.get("email") ?? ""));
  if (!userId || !LOGIN_EMAIL_RE.test(email)) return { error: "Bitte eine gültige E-Mail-Adresse eingeben." };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true, customerId: true } });
  if (!user || user.role !== "BUYER") return { error: "Kunden-Login nicht gefunden." };
  if (user.email === email) return { ok: true, createdEmail: email };
  const taken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (taken) return { error: "Diese E-Mail-Adresse hat schon einen Login." };
  await prisma.user.update({ where: { id: userId }, data: { email } });
  // E-Mail steht im Sitzungs-Cookie → neu anmelden lassen
  await invalidateUserSessions(userId);
  await audit("user.email_change", { entity: "User", entityId: userId, customerId: user.customerId, details: { from: user.email, to: email } });
  revalidatePath("/admin/neu/kunden");
  revalidatePath("/admin/neu/kunden", "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kundenakte)
  return { ok: true, createdEmail: email };
}
