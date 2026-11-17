"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { canEditProvision, saveCustomerProvision, saveStornoQuote } from "@/lib/provision-server";

export type ProvisionFormState = { ok?: boolean; error?: string; at?: number };

/** „Meine Provisionen“ speichern (nur Inhaber, nicht in der Admin-Vorschau). */
export async function saveProvisionAction(_prev: ProvisionFormState, fd: FormData): Promise<ProvisionFormState> {
  const ctx = await getBuyerContext();
  if (!ctx) return { error: "Bitte neu anmelden." };
  if (ctx.preview) return { error: "In der Vorschau nicht möglich." };
  if (!canEditProvision(ctx)) return { error: "Nur der Inhaber kann die Provisionen ändern." };
  let payload: { typ?: unknown; rates?: unknown; storno?: unknown };
  try {
    payload = JSON.parse(String(fd.get("payload") ?? "{}"));
  } catch {
    return { error: "Ungültige Eingabe." };
  }
  const res = await saveCustomerProvision(ctx.customerId, { typ: payload.typ, rates: payload.rates ?? {}, storno: payload.storno ?? null });
  if (!res.ok) return { error: res.error };
  await audit("customer.provision", {
    entity: "Customer",
    entityId: ctx.customerId,
    customerId: ctx.customerId,
    details: { typ: String(payload.typ), eigeneSaetze: res.changed, stornoQuote: payload.storno ?? null },
  });
  revalidatePath("/buyer", "layout");
  return { ok: true, at: Date.now() };
}

/** „Ihre tatsächliche Quote übernehmen“: Stornoquote pro Jahr setzen (nur Inhaber). */
export async function saveStornoAction(value: number | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false, error: "Bitte neu anmelden." };
  if (ctx.preview) return { ok: false, error: "In der Vorschau nicht möglich." };
  if (!canEditProvision(ctx)) return { ok: false, error: "Nur der Inhaber kann das ändern." };
  const res = await saveStornoQuote(ctx.customerId, value);
  if (!res.ok) return res;
  await audit("customer.provision", { entity: "Customer", entityId: ctx.customerId, customerId: ctx.customerId, details: { stornoQuote: res.value } });
  revalidatePath("/buyer", "layout");
  return { ok: true };
}

/** Aufgabe „Police da und erste Zahlung erfolgt?“ 2 Wochen nach dem Abschluss an/aus (nur Inhaber). */
export async function setPoliceReminderAction(on: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false, error: "Bitte neu anmelden." };
  if (ctx.preview) return { ok: false, error: "In der Vorschau nicht möglich." };
  if (!canEditProvision(ctx)) return { ok: false, error: "Nur der Inhaber kann das ändern." };
  await prisma.customer.update({ where: { id: ctx.customerId }, data: { policeReminder: !!on } });
  await audit("customer.policeReminder", { entity: "Customer", entityId: ctx.customerId, customerId: ctx.customerId, details: { on: !!on } });
  revalidatePath("/buyer/provisionen");
  return { ok: true };
}

/** Erinnerung „Weiteres Produkt anbieten?“ 6 Wochen nach dem Abschluss an/aus (nur Inhaber). */
export async function setCrossSellReminderAction(on: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false, error: "Bitte neu anmelden." };
  if (ctx.preview) return { ok: false, error: "In der Vorschau nicht möglich." };
  if (!canEditProvision(ctx)) return { ok: false, error: "Nur der Inhaber kann das ändern." };
  await prisma.customer.update({ where: { id: ctx.customerId }, data: { crossSellReminder: !!on } });
  await audit("customer.crossSellReminder", { entity: "Customer", entityId: ctx.customerId, customerId: ctx.customerId, details: { on: !!on } });
  revalidatePath("/buyer/provisionen");
  return { ok: true };
}

/**
 * Eigene Produkte bearbeiten: Sätze ändern oder entfernen. Bestehende Verträge behalten ihre Sätze. Art (Ole,
 * 17.11.2026): Sach (Abschluss % vom Jahresbeitrag), Leben (‰ der Beitragssumme), Kranken (Monatsbeiträge);
 * Bestand immer % vom Jahresbeitrag pro Jahr.
 */
export async function saveEigeneProdukteAction(
  list: { name: string; art?: string; rateAbschluss: string; rateBestand: string }[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false, error: "Bitte neu anmelden." };
  if (ctx.preview) return { ok: false, error: "In der Vorschau nicht möglich." };
  if (!canEditProvision(ctx)) return { ok: false, error: "Nur der Inhaber kann die Provisionen ändern." };
  const { abschlussAusEingabe, artInfo, asArt, asEigeneProdukte, normName, prozentAnteil } = await import("@/lib/eigene-produkte");
  const out: { name: string; art: ReturnType<typeof asArt>; rateAbschluss: number; rateBestand: number }[] = [];
  for (const p of list.slice(0, 100)) {
    const name = normName(String(p.name ?? ""));
    if (name.length < 2) return { ok: false, error: "Jedes Produkt braucht einen Namen." };
    const art = asArt(p.art);
    const a = abschlussAusEingabe(art, p.rateAbschluss);
    const b = prozentAnteil(p.rateBestand, 100);
    if (a === "invalid" || b === "invalid")
      return { ok: false, error: art === "sach" ? `${name}: Bitte gültige Sätze in Prozent eintragen.` : `${name}: Abschluss in ${artInfo(art).einheit} (höchstens ${artInfo(art).max}), Bestand in Prozent.` };
    out.push({ name, art, rateAbschluss: a ?? 0, rateBestand: b ?? 0 });
  }
  await prisma.customer.update({ where: { id: ctx.customerId }, data: { customProducts: asEigeneProdukte(out) } });
  await audit("customer.provision", { entity: "Customer", entityId: ctx.customerId, customerId: ctx.customerId, details: { eigeneProdukte: out.length } });
  revalidatePath("/buyer", "layout");
  return { ok: true };
}
