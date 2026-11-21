"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { eraseBlocker } from "@/lib/erasure";
import { finalDeleteCustomer } from "@/lib/ruhend";
import { prisma } from "@/lib/prisma";

export type EraseCustomerState = { ok?: boolean; error?: string; message?: string };

/**
 * Endgültig löschen von Hand (z. B. Wunsch des Kunden per E-Mail, Altkunden ohne Kündigung im Kundenbereich). Sonst läuft
 * die Löschung automatisch nach der gewählten Aufbewahrung (lib/ruhend.ts, AVV „Löschung und Rückgabe“).
 */
export async function eraseCustomerDataAction(_prev: EraseCustomerState, fd: FormData): Promise<EraseCustomerState> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return { error: "Nur Admins." };
  const id = String(fd.get("customerId") ?? "");
  const c = await prisma.customer.findUnique({ where: { id }, select: { name: true, archived: true } });
  if (!c) return { error: "Kunde nicht gefunden." };
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 300);
  const blocker = eraseBlocker(c, { confirmName: String(fd.get("confirm") ?? ""), contractEnded: fd.get("contractEnded") === "on", reason });
  if (blocker) return { error: blocker };
  const r = await finalDeleteCustomer(id, { actor: { id: session.userId, email: session.email, role: session.role }, reason });
  revalidatePath("/admin/neu/kunden", "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kundenakte)
  return {
    ok: true,
    message: `Gelöscht: ${r.leads} Leads anonymisiert, ${r.conversations} Chats, ${r.appointments} Termine, ${r.consents} Einwilligungen, ${r.bestand} Bestandskunden, ${r.consentLogs} Einträge im Einwilligungsprotokoll. ${r.logins} Logins entfernt. Kalender und Postfach getrennt.`,
  };
}
