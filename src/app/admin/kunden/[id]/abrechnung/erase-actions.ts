"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { eraseCustomerData } from "@/lib/erasure";
import { prisma } from "@/lib/prisma";

export type EraseCustomerState = { ok?: boolean; error?: string; message?: string };

/** Vertragsende: alle Lead-Daten eines Kunden anonymisieren (AVV: binnen 30 Tagen). */
export async function eraseCustomerDataAction(_prev: EraseCustomerState, fd: FormData): Promise<EraseCustomerState> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return { error: "Nur Admins." };
  const id = String(fd.get("customerId") ?? "");
  const confirm = String(fd.get("confirm") ?? "").trim();
  const c = await prisma.customer.findUnique({ where: { id }, select: { name: true } });
  if (!c) return { error: "Kunde nicht gefunden." };
  if (confirm.toLowerCase() !== c.name.trim().toLowerCase()) {
    return { error: "Zur Bestätigung bitte den Kundennamen genau so eingeben." };
  }
  const r = await eraseCustomerData(id);
  revalidatePath("/admin/kunden", "layout");
  return {
    ok: true,
    message: `Gelöscht: ${r.leads} Leads anonymisiert, ${r.conversations} Chats, ${r.appointments} Termine, ${r.consents} Einwilligungen. Kalender getrennt.`,
  };
}
