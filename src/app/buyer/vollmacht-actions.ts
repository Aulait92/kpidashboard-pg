"use server";

// Maklervollmacht in der Kundenakte (Ole, 18.11.2026; nur Makler): anfordern, Link per E-Mail, Widerruf eintragen,
// Schreiben an einen Versicherer als gesendet abhaken.

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

export async function vollmachtSchreibenGesendetAction(id: string, leadId: string, versicherer: string, gesendet: boolean): Promise<VollmachtActionResult> {
  const c = await ctx();
  if (!c) return { ok: false, error: "In der Vorschau nicht möglich." };
  const { uebertragungMarkieren } = await import("@/lib/maklervollmacht/server");
  if (!(await uebertragungMarkieren(String(id), c.customerId, String(versicherer).slice(0, 80), !!gesendet, c.userId))) return { ok: false, error: "Vollmacht nicht gefunden." };
  revalidatePath(`/buyer/leads/${leadId}`);
  return { ok: true, message: gesendet ? "Als gesendet abgehakt" : "Wieder offen" };
}
