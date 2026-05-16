"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      role: "BUYER",
      customerId,
    },
  });

  revalidatePath("/admin/buyers");
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
  revalidatePath("/admin/buyers");
  return { ok: true, createdEmail: user.email };
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
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/admin/buyers");
}
