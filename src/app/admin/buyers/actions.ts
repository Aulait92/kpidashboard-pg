"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession, hashPassword, invalidateUserSessions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

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

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
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

  revalidatePath("/admin/buyers");
  revalidatePath("/admin/kunden", "layout");
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
  revalidatePath("/admin/buyers");
  revalidatePath("/admin/kunden", "layout");
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
  revalidatePath("/admin/buyers");
  revalidatePath("/admin/kunden", "layout");
  // createdEmail trägt hier den Kundennamen für die Bestätigung im UI.
  return { ok: true, createdEmail: customer.name };
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
  revalidatePath("/admin/buyers");
  revalidatePath("/admin/kunden", "layout");
}
