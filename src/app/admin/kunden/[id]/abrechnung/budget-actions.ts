"use server";

// Admin: Budget-Anfragen über dem Listenpreis (individuelles Angebot) übernehmen oder ablehnen.
// Normale Budgetänderungen übernimmt die App sofort (lib/budget.ts), hier nur Historie.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { decideBudgetRequest } from "@/lib/budget";

export async function decideBudgetAction(fd: FormData): Promise<void> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") throw new Error("Nur Admins.");
  const customerId = String(fd.get("customerId") ?? "");
  const changeId = String(fd.get("changeId") ?? "");
  const accept = fd.get("decision") === "accept";
  const note = String(fd.get("note") ?? "").trim() || null;
  const r = await decideBudgetRequest(changeId, accept, note, { id: session.userId, email: session.email, role: session.role });
  revalidatePath(`/admin/kunden/${customerId}`, "layout");
  const msg = r.ok ? (accept ? "Budget übernommen, Kunde informiert." : "Anfrage abgelehnt, Kunde informiert.") : r.error;
  redirect(`/admin/kunden/${customerId}/abrechnung?budget=${encodeURIComponent(msg)}${r.ok ? "" : "&fehler=1"}`);
}
