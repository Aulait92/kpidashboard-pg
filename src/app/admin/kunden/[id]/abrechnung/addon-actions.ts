"use server";

// Admin: Logins, Bestandskunden-Modul, Kampagnen-Kontingent und Zahlweise eines
// Kunden ändern. Stripe-Änderungen laufen über lib/billing (anteilig verrechnet),
// jede Änderung landet im Änderungsprotokoll.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminZiel } from "@/components/admin-neu/ui/rueckweg";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { changeBillingInterval, setBestandModule, setEmpfehlungModule, syncSeatBilling, type AddOnResult } from "@/lib/billing";
import { normalizeRhythmus } from "@/lib/offer-pricing";

async function requireAdmin() {
  const s = await getCurrentSession();
  if (!s || s.role !== "ADMIN") throw new Error("Nur Admins.");
}

async function done(id: string, r: AddOnResult): Promise<never> {
  revalidatePath(`/admin/kunden/${id}`, "layout");
  revalidatePath("/buyer", "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kundenakte)
  const msg = r.ok ? (r.note ? `Gespeichert. ${r.note}` : "Gespeichert.") : r.error;
  redirect(await adminZiel(`/admin/kunden/${id}/abrechnung?zusatz=${encodeURIComponent(msg)}${r.ok ? "" : "&fehler=1"}`));
}

/** Inklusive aktive Verkäufer und Preis je weiterem Verkäufer setzen, danach Abo abgleichen. */
export async function saveSeatsAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = String(fd.get("customerId") ?? "");
  const included = Number(fd.get("seatsIncluded"));
  const price = Number(String(fd.get("seatMonthly") ?? "").replace(",", "."));
  if (!Number.isInteger(included) || included < 1 || included > 100 || !Number.isFinite(price) || price < 0 || price > 10_000) {
    return done(id, { ok: false, error: "Bitte gültige Werte eingeben (Verkäufer 1 bis 100, Preis ab 0 €)." });
  }
  const c = await prisma.customer.findUnique({ where: { id }, select: { seatsIncluded: true, seatMonthly: true } });
  if (!c) return done(id, { ok: false, error: "Kunde nicht gefunden." });
  await prisma.customer.update({ where: { id }, data: { seatsIncluded: included, seatMonthly: price } });
  await audit("billing.seats", {
    entity: "Customer",
    entityId: id,
    customerId: id,
    details: { seatsIncluded: { from: c.seatsIncluded, to: included }, seatMonthly: { from: c.seatMonthly != null ? Number(c.seatMonthly) : null, to: price } },
  });
  return done(id, await syncSeatBilling(id, { force: true }));
}

export async function syncSeatsAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = String(fd.get("customerId") ?? "");
  return done(id, await syncSeatBilling(id, { force: true }));
}

export async function bestandModuleAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = String(fd.get("customerId") ?? "");
  const mode = String(fd.get("mode") ?? "");
  if (mode !== "book" && mode !== "free" && mode !== "cancel") return done(id, { ok: false, error: "Unbekannte Aktion." });
  return done(id, await setBestandModule(id, mode));
}

/** Bestandskunden-Modul im Kundenbereich sichtbar, auch ohne Buchung (Testkunden; lib/bestand/sichtbar.ts). */
export async function bestandSichtbarAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = String(fd.get("customerId") ?? "");
  const on = fd.get("on") === "1";
  const c = await prisma.customer.findUnique({ where: { id }, select: { bestandSichtbar: true } });
  if (!c) return done(id, { ok: false, error: "Kunde nicht gefunden." });
  await prisma.customer.update({ where: { id }, data: { bestandSichtbar: on } });
  await audit("bestand.sichtbar", { entity: "Customer", entityId: id, customerId: id, details: { from: c.bestandSichtbar, to: on } });
  return done(id, { ok: true, changed: true });
}

export async function empfehlungModuleAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = String(fd.get("customerId") ?? "");
  const mode = String(fd.get("mode") ?? "");
  if (mode !== "book" && mode !== "free" && mode !== "cancel") return done(id, { ok: false, error: "Unbekannte Aktion." });
  return done(id, await setEmpfehlungModule(id, mode));
}

/** Kampagnen-Kontingent je Monat; leer = Standard aus der Preisliste. */
export async function saveQuotaAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = String(fd.get("customerId") ?? "");
  const raw = String(fd.get("quota") ?? "").trim();
  const quota = raw === "" ? null : Number(raw);
  if (quota != null && (!Number.isInteger(quota) || quota < 0 || quota > 100_000)) return done(id, { ok: false, error: "Kontingent: ganze Zahl von 0 bis 100.000." });
  const c = await prisma.customer.findUnique({ where: { id }, select: { bestandMessageQuota: true } });
  if (!c) return done(id, { ok: false, error: "Kunde nicht gefunden." });
  await prisma.customer.update({ where: { id }, data: { bestandMessageQuota: quota } });
  await audit("bestand.quota", { entity: "Customer", entityId: id, customerId: id, details: { from: c.bestandMessageQuota, to: quota } });
  return done(id, { ok: true, changed: true });
}

export async function billingIntervalAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = String(fd.get("customerId") ?? "");
  const interval = normalizeRhythmus(fd.get("interval"));
  return done(id, await changeBillingInterval(id, interval));
}
