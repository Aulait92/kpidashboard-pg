"use server";

import { revalidatePath } from "next/cache";
import { backfillReferralDiscounts, markRewardDone } from "@/lib/kollegen";
import { requireAuth } from "@/lib/vertrieb/auth";

/** Von Hand gutgeschriebene Empfehlungsprämie bestätigen (Empfehler wird benachrichtigt). */
export async function markRewardDoneAction(fd: FormData): Promise<void> {
  const session = await requireAuth();
  const id = String(fd.get("id") ?? "");
  const amount = Number(String(fd.get("amount") ?? "").replace(",", "."));
  await markRewardDone(id, Number.isFinite(amount) && amount > 0 ? amount : null, { id: session.userId, email: session.email, role: session.role });
  revalidatePath("/admin/marketing/empfehlungen");
}

/** Einmalig: Empfehlungsrabatt in offene Angebote an Empfohlene übernehmen (Liste vorher auf der Seite). */
export async function applyReferralDiscountsAction(): Promise<void> {
  const session = await requireAuth();
  await backfillReferralDiscounts({ apply: true, actor: { id: session.userId, email: session.email, role: session.role } });
  revalidatePath("/admin/marketing/empfehlungen");
}
