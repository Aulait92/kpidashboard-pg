"use server";

// Maklervollmacht in der Kundenakte (Ole, 18.11.2026; nur Makler): anfordern, Link per E-Mail, Widerruf eintragen.

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { recordUsage } from "@/lib/usage";

export type VollmachtActionResult = { ok: true; link?: string; message?: string } | { ok: false; error: string };

async function ctx() {
  const c = await getBuyerContext();
  if (!c || c.preview) return null;
  return c;
}

export async function vollmachtAnfordernAction(leadId: string): Promise<VollmachtActionResult> {
  const c = await ctx();
  if (!c) return { ok: false, error: "In der Vorschau nicht möglich." };
  const { vollmachtAnlegen, vollmachtLink } = await import("@/lib/maklervollmacht/server");
  const r = await vollmachtAnlegen(String(leadId), c.customerId, { userId: c.userId });
  if (!r.ok) return r;
  await recordUsage("action", "maklervollmacht.anfordern");
  revalidatePath(`/buyer/leads/${leadId}`);
  revalidatePath("/buyer");
  return { ok: true, link: vollmachtLink(r.vollmacht.token) };
}

export async function vollmachtPerMailAction(id: string, leadId: string): Promise<VollmachtActionResult> {
  const c = await ctx();
  if (!c) return { ok: false, error: "In der Vorschau nicht möglich." };
  const { linkPerMail } = await import("@/lib/maklervollmacht/server");
  const r = await linkPerMail(String(id), c.customerId, c.userId);
  if (!r.ok) return r;
  await recordUsage("action", "maklervollmacht.mail");
  revalidatePath(`/buyer/leads/${leadId}`);
  revalidatePath("/buyer");
  return { ok: true, message: "Link per E-Mail gesendet" };
}

export async function vollmachtWiderrufenAction(id: string, leadId: string): Promise<VollmachtActionResult> {
  const c = await ctx();
  if (!c) return { ok: false, error: "In der Vorschau nicht möglich." };
  const { widerrufen } = await import("@/lib/maklervollmacht/server");
  if (!(await widerrufen(String(id), c.customerId, c.userId))) return { ok: false, error: "Vollmacht nicht gefunden." };
  revalidatePath(`/buyer/leads/${leadId}`);
  revalidatePath("/buyer");
  return { ok: true, message: "Widerruf eingetragen" };
}

/**
 * Bestandsübertragung (lib/maklervollmacht/uebertragung.ts): „Bestätigt“ bzw. „Abgelehnt“ je Versicherer (Karte
 * Maklervollmacht, Wiedervorlage) oder je Vertrag (Vertragsliste). Monatsbeitrag optional, nur wenn er fehlt.
 */
export async function uebertragungAction(
  leadId: string,
  ziel: { versicherer: string } | { contractId: string },
  ergebnis: "bestaetigt" | "abgelehnt",
  monatsbeitrag?: string | null,
): Promise<VollmachtActionResult> {
  const { writableCustomerId } = await import("@/lib/buyer-write");
  const customerId = await writableCustomerId(String(leadId));
  if (!customerId) return { ok: false, error: "In der Vorschau nicht möglich." };
  const c = await getBuyerContext();
  const z = "contractId" in ziel ? { contractId: String(ziel.contractId) } : { versicherer: String(ziel.versicherer) };
  const raw = String(monatsbeitrag ?? "").trim();
  const n = raw ? Number(raw.replace(/[€\s]/g, "").replace(/\./g, "").replace(",", ".")) : null;
  if (n != null && (!Number.isFinite(n) || n < 0 || n > 100_000)) return { ok: false, error: "Bitte einen gültigen Monatsbeitrag eintragen." };
  const m = await import("@/lib/maklervollmacht/uebertragung");
  const r =
    ergebnis === "bestaetigt"
      ? await m.uebertragungBestaetigen(customerId, String(leadId), z, { monatsbeitrag: n, userId: c?.userId ?? null })
      : await m.uebertragungAblehnen(customerId, String(leadId), z, { userId: c?.userId ?? null });
  if (!r.ok) return r;
  await recordUsage("action", `maklervollmacht.uebertragung_${ergebnis}`);
  revalidatePath(`/buyer/leads/${leadId}`);
  revalidatePath("/buyer");
  revalidatePath("/buyer/zahlen");
  return { ok: true, message: ergebnis === "bestaetigt" ? "Übertragung bestätigt, zählt jetzt in Ihren Zahlen" : "Übertragung als abgelehnt vermerkt" };
}
