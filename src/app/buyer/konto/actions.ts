"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { endPauseNow, planPause } from "@/lib/pause";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { createPaymentSetupUrl, createPortalUrl } from "@/lib/billing";
import { getAppUrl } from "@/lib/email";
import { reportError } from "@/lib/monitoring";
import { parseZahlart } from "@/lib/zahlart";

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

/**
 * „Zahlungsart hinterlegen“: Stripe-Seite mit der gewählten Zahlart (Lastschrift vorausgewählt).
 * Die neue Zahlart wird per Webhook Standard für Kunde und Abo (savePaymentSetup).
 */
export async function paymentSetupAction(fd: FormData) {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview || ctx.teamRole === "advisor") redirect("/buyer/konto?portal=vorschau");
  let url: string;
  try {
    url = await createPaymentSetupUrl(ctx.customerId, `${getAppUrl()}/buyer/konto`, {
      zahlart: parseZahlart(fd.get("zahlart")),
      description: "Zahlungsart für Rechnungen",
    });
  } catch (err) {
    reportError(err, "billing-payment-setup-konto", { customer: ctx.customerId });
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
    revalidatePath("/buyer/einstellungen/erinnerungen");
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
    revalidatePath("/buyer/wachstum");
    revalidatePath("/buyer/zahlen");
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

export type ProductFormState = { ok?: boolean; status?: "setup" | "requested"; message?: string; error?: string };

/** Weiteres Produkt buchen (nur Inhaber, nicht in der Vorschau). */
export async function bookProductAction(_prev: ProductFormState, fd: FormData): Promise<ProductFormState> {
  try {
    const ctx = await customerOnly();
    const { bookProduct } = await import("@/lib/produkt-buchen");
    const when = String(fd.get("when") ?? "asap");
    const res = await bookProduct({
      customerId: ctx.customerId,
      userId: ctx.userId,
      catalogKey: String(fd.get("catalogKey") ?? ""),
      dailyBudget: Number(String(fd.get("daily") ?? "").replace(",", ".")),
      startDate: when === "date" ? String(fd.get("date") ?? "") : null,
      acknowledged: fd.get("ack") === "on",
      actor: { id: ctx.userId, email: ctx.email, role: "BUYER" },
    });
    if (!res.ok) return { error: res.error };
    revalidatePath("/buyer/konto");
    revalidatePath("/buyer/wachstum");
    revalidatePath("/buyer/zahlen");
    return {
      ok: true,
      status: res.status,
      message:
        res.status === "requested"
          ? "Danke, Ihre Anfrage ist bei uns. Wir melden uns mit einem individuellen Angebot."
          : "Gebucht. Wir richten das Produkt jetzt ein und schicken Ihnen eine Bestätigung per E-Mail.",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Das hat nicht geklappt." };
  }
}

/** Produkt beenden anfragen (keine Selbstabschaltung, die Laufzeit prüfen wir). */
export async function requestProductEndAction(_prev: ProductFormState, fd: FormData): Promise<ProductFormState> {
  try {
    const ctx = await customerOnly();
    const { requestProductEnd } = await import("@/lib/produkt-buchen");
    const res = await requestProductEnd(ctx.customerId, String(fd.get("product") ?? ""), ctx.userId, { id: ctx.userId, email: ctx.email, role: "BUYER" });
    if (!res.ok) return { error: res.error };
    revalidatePath("/buyer/konto");
    revalidatePath("/buyer/wachstum");
    revalidatePath("/buyer/zahlen");
    return { ok: true, message: "Ihre Anfrage ist bei uns. Wir prüfen die Laufzeit und melden uns." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Das hat nicht geklappt." };
  }
}

/** Weiteres Produkt auf Anfrage (nicht im Katalog). */
export async function requestOtherProductAction(_prev: ProductFormState, fd: FormData): Promise<ProductFormState> {
  try {
    const ctx = await customerOnly();
    const { requestOtherProduct } = await import("@/lib/produkt-buchen");
    const res = await requestOtherProduct(ctx.customerId, String(fd.get("wish") ?? ""), { id: ctx.userId, email: ctx.email, role: "BUYER" });
    if (!res.ok) return { error: res.error };
    return { ok: true, message: "Danke! Wir prüfen Ihre Anfrage und melden uns." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Das hat nicht geklappt." };
  }
}

export type CancelContractState = { ok?: boolean; error?: string; effectiveIso?: string; already?: boolean };

/** „Vertrag hier kündigen“ → „Jetzt kündigen“ (nur Inhaber, nicht in der Vorschau). Den Termin rechnet der Server. */
export async function cancelContractAction(_prev: CancelContractState, fd: FormData): Promise<CancelContractState> {
  try {
    const ctx = await customerOnly();
    const { cancelContract } = await import("@/lib/vertrag-kuendigung");
    const { normalizeRetention } = await import("@/lib/ruhend-shared");
    const res = await cancelContract(ctx.customerId, {
      actor: { id: ctx.userId, email: ctx.email, role: "BUYER" },
      reason: String(fd.get("reason") ?? ""),
      retention: normalizeRetention(fd.get("retention")),
    });
    if (!res.ok) return { error: res.error };
    revalidatePath("/buyer/konto");
    revalidatePath("/buyer/wachstum");
    revalidatePath("/buyer/zahlen");
    return { ok: true, effectiveIso: res.effectiveIso, already: res.already };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Das hat nicht geklappt." };
  }
}

export type RetentionState = { ok?: boolean; error?: string; message?: string };

/** Aufbewahrung nach Vertragsende ändern (Konto, nach der Kündigung; jederzeit bis zur Löschung). */
export async function retentionAction(_prev: RetentionState, fd: FormData): Promise<RetentionState> {
  try {
    const ctx = await customerOnly();
    const { isRetentionChoice } = await import("@/lib/ruhend-shared");
    const { setRetentionChoice } = await import("@/lib/ruhend");
    const raw = fd.get("retention");
    if (!isRetentionChoice(raw)) return { error: "Bitte wählen Sie eine Aufbewahrung." };
    const res = await setRetentionChoice(ctx.customerId, raw, { actor: { id: ctx.userId, email: ctx.email, role: "BUYER" } });
    if (!res.ok) return { error: res.error };
    revalidatePath("/buyer/konto");
    revalidatePath("/buyer/wachstum");
    revalidatePath("/buyer/zahlen");
    return { ok: true, message: "Gespeichert. Die Bestätigung steht im Konto." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Das hat nicht geklappt." };
  }
}

// ─── Anti-Churn vor der Kündigung (lib/anti-churn.ts): Grund, Alternative, Termin, Halteangebote ───

export type ChurnState = {
  ok?: boolean;
  error?: string;
  intentId?: string;
  message?: string;
  /** Angebote zum Grund mit aktuellen Werten (lib/halteangebote-server.churnOfferViews) */
  offers?: import("@/lib/halteangebote").OfferView[];
  /** Freie Termine für „Wir richten die App für Sie ein“ */
  einrichtungSlots?: { start: string }[];
};

/** Grund gewählt (freiwillig): Absicht speichern, passende Angebote mit aktuellen Werten zurückgeben. */
export async function churnIntentAction(_prev: ChurnState, fd: FormData): Promise<ChurnState> {
  try {
    const ctx = await customerOnly();
    const { isChurnReason } = await import("@/lib/anti-churn");
    const { recordChurnIntent } = await import("@/lib/anti-churn-server");
    const raw = fd.get("reason");
    const reason = isChurnReason(raw) ? raw : null;
    const res = await recordChurnIntent(ctx.customerId, {
      reason,
      note: String(fd.get("note") ?? ""),
      actor: { id: ctx.userId, email: ctx.email, role: "BUYER" },
    });
    const { churnOfferViews } = await import("@/lib/halteangebote-server");
    const views = await churnOfferViews(ctx.customerId, reason);
    return { ok: true, intentId: res.id, offers: views.offers, einrichtungSlots: views.einrichtungSlots };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Das hat nicht geklappt." };
  }
}

/** Alternative gewählt (Pause, Budget, Module springen auf der Seite; Check und Rückruf erzeugen eine Aufgabe). */
export async function churnOfferAction(_prev: ChurnState, fd: FormData): Promise<ChurnState> {
  try {
    const ctx = await customerOnly();
    const { isChurnOffer } = await import("@/lib/anti-churn");
    const { chooseChurnOffer } = await import("@/lib/anti-churn-server");
    const offer = fd.get("offer");
    const { isHalteKind } = await import("@/lib/anti-churn");
    if (!isChurnOffer(offer) || offer === "termin" || isHalteKind(offer)) return { error: "Ungültige Auswahl." };
    const res = await chooseChurnOffer(ctx.customerId, String(fd.get("intentId") ?? ""), offer, { id: ctx.userId, email: ctx.email, role: "BUYER" });
    if (!res.ok) return { error: res.error };
    const message =
      offer === "check"
        ? "Danke! Wir prüfen Ihre Kampagne und melden uns innerhalb von zwei Werktagen mit konkreten Änderungen. Ihr Vertrag läuft unverändert weiter."
        : offer === "rueckruf"
          ? "Danke! Wir rufen Sie innerhalb eines Werktags an. Ihr Vertrag läuft unverändert weiter."
          : undefined;
    return { ok: true, message };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Das hat nicht geklappt." };
  }
}

/** 15-Minuten-Termin statt Kündigung (Teamkalender, wie der Hilfetermin in der Einrichtung). */
export async function churnHelpCallAction(_prev: ChurnState, fd: FormData): Promise<ChurnState> {
  try {
    const ctx = await customerOnly();
    const { churnReasonLabel } = await import("@/lib/anti-churn");
    const { chooseChurnOffer } = await import("@/lib/anti-churn-server");
    const { bookHelpCall } = await import("@/lib/help-call");
    const intentId = String(fd.get("intentId") ?? "");
    const intent = await prisma.churnIntent.findFirst({ where: { id: intentId, customerId: ctx.customerId }, select: { reason: true } });
    const res = await bookHelpCall(ctx.customerId, String(fd.get("start") ?? ""), `Statt Kündigung: ${churnReasonLabel(intent?.reason)}`);
    if (!res.ok) return { error: res.error };
    await chooseChurnOffer(ctx.customerId, intentId, "termin", { id: ctx.userId, email: ctx.email, role: "BUYER" });
    revalidatePath("/buyer", "layout");
    const when = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(res.start);
    return { ok: true, message: `Gebucht: ${when} Uhr, 15 Minuten per Video. Die Einladung kommt per E-Mail. Ihr Vertrag läuft unverändert weiter.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Das hat nicht geklappt." };
  }
}

/** Halteangebot annehmen (Nachlass, Neustart, Neuausrichtung, Spartenwechsel, Pause ohne Kosten, Einrichtung, Nur Bestand). */
export async function halteOfferAction(_prev: ChurnState, fd: FormData): Promise<ChurnState> {
  try {
    const ctx = await customerOnly();
    const { isHalteKind } = await import("@/lib/anti-churn");
    const { acceptHalteOffer } = await import("@/lib/halteangebote-server");
    const kind = fd.get("offer");
    if (!isHalteKind(kind)) return { error: "Ungültige Auswahl." };
    const str = (k: string) => {
      const v = fd.get(k);
      return typeof v === "string" && v.trim() ? v.trim() : null;
    };
    const res = await acceptHalteOffer(
      ctx.customerId,
      { intentId: String(fd.get("intentId") ?? ""), kind, note: str("note"), start: str("start"), from: str("from"), until: str("until"), confirmed: fd.get("confirm") === "on" },
      { id: ctx.userId, email: ctx.email, role: "BUYER" },
    );
    if (!res.ok) return { error: res.error };
    revalidatePath("/buyer", "layout");
    return { ok: true, message: res.message };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Das hat nicht geklappt." };
  }
}
