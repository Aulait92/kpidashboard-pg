"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDormantContext } from "@/lib/buyer-context";
import { clearSessionCookie } from "@/lib/auth";
import type { RetentionState } from "../konto/actions";

export type ReactivateState = { error?: string };

async function ownerOnly() {
  const ctx = await getDormantContext();
  if (!ctx) throw new Error("Ihr Konto ist nicht mehr ruhend. Bitte laden Sie die Seite neu.");
  if (ctx.teamRole !== "owner") throw new Error("Das kann nur der Inhaber des Kontos.");
  return ctx;
}

/** „Konto reaktivieren“: Konto sofort wieder aktiv (lib/ruhend.reactivateCustomer), weiter in den Kundenbereich. */
export async function reactivateAction(_prev: ReactivateState, _fd: FormData): Promise<ReactivateState> {
  let ok = false;
  try {
    const ctx = await ownerOnly();
    const { reactivateCustomer } = await import("@/lib/ruhend");
    const res = await reactivateCustomer(ctx.customerId, { actor: { id: ctx.userId, email: ctx.email, role: "BUYER" } });
    if (!res.ok) return { error: res.error };
    ok = true;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Das hat nicht geklappt." };
  }
  if (ok) {
    revalidatePath("/buyer", "layout");
    redirect("/buyer");
  }
  return {};
}

/** Aufbewahrung ändern; eine schon abgelaufene Frist löscht nach Bestätigung sofort endgültig. */
export async function dormantRetentionAction(_prev: RetentionState, fd: FormData): Promise<RetentionState> {
  let deleted = false;
  try {
    const ctx = await ownerOnly();
    const { isRetentionChoice } = await import("@/lib/ruhend-shared");
    const { setRetentionChoice } = await import("@/lib/ruhend");
    const raw = fd.get("retention");
    if (!isRetentionChoice(raw)) return { error: "Bitte wählen Sie eine Aufbewahrung." };
    const res = await setRetentionChoice(ctx.customerId, raw, { actor: { id: ctx.userId, email: ctx.email, role: "BUYER" }, confirmNow: fd.get("confirmNow") === "on" });
    if (!res.ok) return { error: res.error };
    deleted = res.deleteNow;
    if (!deleted) {
      revalidatePath("/buyer/ruhend");
      return { ok: true, message: "Gespeichert." };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Das hat nicht geklappt." };
  }
  // Logins sind gelöscht: abmelden und Bestätigung auf der Anmeldeseite
  await clearSessionCookie();
  redirect("/login?geloescht=1");
}
