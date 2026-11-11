"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { endPauseNow, planPause } from "@/lib/pause";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { createPortalUrl } from "@/lib/billing";
import { getAppUrl } from "@/lib/email";
import { reportError } from "@/lib/monitoring";

/** Öffnet das Stripe-Kundenportal (nur der Kunde selbst, nicht in der Admin-Vorschau). */
export async function openPortalAction() {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview || ctx.teamRole === "advisor") redirect("/buyer/konto?portal=vorschau");
  const customer = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { stripeCustomerId: true } });
  if (!customer?.stripeCustomerId) redirect("/buyer/konto?portal=fehlt");
  let url: string;
  try {
    url = await createPortalUrl(customer.stripeCustomerId, `${getAppUrl()}/buyer/konto`);
  } catch (err) {
    reportError(err, "billing-portal", { customer: ctx.customerId });
    redirect("/buyer/konto?portal=fehler");
  }
  redirect(url);
}

export type PauseFormState = { ok?: boolean; error?: string };

async function customerOnly() {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview) throw new Error("In der Vorschau nicht möglich.");
  if (ctx.teamRole === "advisor") throw new Error("Nur der Inhaber kann das ändern.");
  return ctx;
}

export async function planPauseAction(_prev: PauseFormState, fd: FormData): Promise<PauseFormState> {
  try {
    const ctx = await customerOnly();
    const until = String(fd.get("until") ?? "").trim();
    const res = await planPause(ctx.customerId, { from: String(fd.get("from") ?? ""), until: until || null, reason: String(fd.get("reason") ?? "") }, "customer");
    if (!res.ok) return { error: res.error };
    revalidatePath("/buyer", "layout");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Das hat nicht geklappt." };
  }
}

export async function endPauseAction(_prev: PauseFormState, _fd: FormData): Promise<PauseFormState> {
  try {
    const ctx = await customerOnly();
    const res = await endPauseNow(ctx.customerId);
    if (!res.ok) return { error: res.error };
    revalidatePath("/buyer", "layout");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Das hat nicht geklappt." };
  }
}

export async function toggleLeadEmailAction(_prev: PauseFormState, _fd: FormData): Promise<PauseFormState> {
  try {
    const ctx = await customerOnly();
    const c = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { leadEmail: true } });
    await prisma.customer.update({ where: { id: ctx.customerId }, data: { leadEmail: !c?.leadEmail } });
    revalidatePath("/buyer/konto");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Das hat nicht geklappt." };
  }
}

export type BudgetFormState = { ok?: boolean; status?: "applied" | "pending"; message?: string; error?: string };

/** Werbebudget ändern (nur Inhaber, nicht in der Vorschau). */
export async function changeBudgetAction(_prev: BudgetFormState, fd: FormData): Promise<BudgetFormState> {
  try {
    const ctx = await customerOnly();
    const { changeBudget } = await import("@/lib/budget");
    const next = fd.getAll("product").map((p, i) => ({ product: String(p), dailyBudget: Number(String(fd.getAll("daily")[i] ?? "").replace(",", ".")) }));
    const when = String(fd.get("when") ?? "now");
    const res = await changeBudget({
      customerId: ctx.customerId,
      userId: ctx.userId,
      next,
      effectiveDate: when === "date" ? String(fd.get("date") ?? "") : null,
      acknowledged: fd.get("ack") === "on",
      actor: { id: ctx.userId, email: ctx.email, role: "BUYER" },
    });
    if (!res.ok) return { error: res.error };
    revalidatePath("/buyer/konto");
    return {
      ok: true,
      status: res.status,
      message:
        res.status === "pending"
          ? "Danke, Ihre Anfrage ist bei uns. Wir melden uns mit einem individuellen Angebot."
          : "Gespeichert. Wir stellen die Anzeigen bei Meta um und schicken Ihnen eine Bestätigung per E-Mail.",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Das hat nicht geklappt." };
  }
}
