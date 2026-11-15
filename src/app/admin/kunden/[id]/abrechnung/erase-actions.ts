"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { eraseBlocker, eraseCustomerData } from "@/lib/erasure";
import { prisma } from "@/lib/prisma";

export type EraseCustomerState = { ok?: boolean; error?: string; message?: string };

/** Vertragsende: alle Lead-Daten eines Kunden anonymisieren (AVV: binnen 30 Tagen). */
export async function eraseCustomerDataAction(_prev: EraseCustomerState, fd: FormData): Promise<EraseCustomerState> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return { error: "Nur Admins." };
  const id = String(fd.get("customerId") ?? "");
  const c = await prisma.customer.findUnique({ where: { id }, select: { name: true, archived: true } });
  if (!c) return { error: "Kunde nicht gefunden." };
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 300);
  const blocker = eraseBlocker(c, { confirmName: String(fd.get("confirm") ?? ""), contractEnded: fd.get("contractEnded") === "on", reason });
  if (blocker) return { error: blocker };
  const r = await eraseCustomerData(id, { id: session.userId, email: session.email, role: session.role }, { reason });
  revalidatePath("/admin/kunden", "layout");
  return {
    ok: true,
    message: `Gelöscht: ${r.leads} Leads anonymisiert, ${r.conversations} Chats, ${r.appointments} Termine, ${r.consents} Einwilligungen, ${r.bestand} Bestandskunden, ${r.consentLogs} Einträge im Einwilligungsprotokoll. Kalender und Postfach getrennt.`,
  };
}
