"use server";

// Maklervollmacht in der Kundenakte (Ole, 18.11.2026; nur Makler): anfordern, Link per E-Mail, Widerruf eintragen,
// Schreiben an einen Versicherer als gesendet abhaken.

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { recordUsage } from "@/lib/usage";

export type VollmachtActionResult = { ok: true; link?: string; message?: string; id?: string } | { ok: false; error: string };

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
  return { ok: true, link: vollmachtLink(r.vollmacht.token), id: r.vollmacht.id };
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

/** Per WhatsApp senden (Teil 2, 18.11.2026): legt die Vollmacht bei Bedarf an und schickt den Link in den Chat. */
export async function vollmachtPerWhatsAppAction(leadId: string): Promise<VollmachtActionResult & { fallbackMail?: boolean }> {
  const c = await ctx();
  if (!c) return { ok: false, error: "In der Vorschau nicht möglich." };
  const { vollmachtAnlegen, vollmachtLink } = await import("@/lib/maklervollmacht/server");
  const a = await vollmachtAnlegen(String(leadId), c.customerId, { userId: c.userId });
  if (!a.ok) return a;
  if (a.vollmacht.status !== "offen") return { ok: false, error: "Die Vollmacht ist schon unterschrieben." };
  const { sendeVollmachtWhatsApp } = await import("@/lib/maklervollmacht/whatsapp");
  const r = await sendeVollmachtWhatsApp(a.vollmacht.id, c.customerId, { userId: c.userId });
  revalidatePath(`/buyer/leads/${leadId}`);
  if (!r.ok) return { ok: false, error: r.error, fallbackMail: r.grund === "fenster_zu" || r.grund === "abgemeldet" };
  await recordUsage("action", "maklervollmacht.whatsapp");
  return { ok: true, link: vollmachtLink(a.vollmacht.token), message: "Per WhatsApp gesendet" };
}

/** Haken „Eigene Vollmacht liegt bereits vor“ (die App schickt diesem Kunden nichts). */
export async function vollmachtEigeneAction(leadId: string, an: boolean): Promise<VollmachtActionResult> {
  const c = await ctx();
  if (!c) return { ok: false, error: "In der Vorschau nicht möglich." };
  const { eigeneVollmacht } = await import("@/lib/maklervollmacht/server");
  const r = await eigeneVollmacht(String(leadId), c.customerId, !!an, c.userId);
  if (!r.ok) return r;
  revalidatePath(`/buyer/leads/${leadId}`);
  return { ok: true, message: an ? "Gespeichert: Die App schickt diesem Kunden keine Vollmacht." : "Zurückgenommen" };
}

/** „Maklervollmacht: Wer schickt sie Ihren Kunden?“ (Einrichtung, Einstellungen, Hinweis auf „Heute“) */
export async function vollmachtVersandAction(wert: string): Promise<VollmachtActionResult> {
  const c = await ctx();
  if (!c) return { ok: false, error: "In der Vorschau nicht möglich." };
  const { setzeVollmachtVersand } = await import("@/lib/maklervollmacht/server");
  if (!(await setzeVollmachtVersand(c, String(wert)))) return { ok: false, error: "Das kann nur der Inhaber des Kontos ändern." };
  revalidatePath("/buyer");
  revalidatePath("/buyer/einrichtung");
  revalidatePath("/buyer/einstellungen/assistent");
  return { ok: true, message: "Gespeichert" };
}
