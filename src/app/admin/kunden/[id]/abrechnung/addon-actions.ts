"use server";

// Admin: Logins, Bestandskunden-Modul, Kampagnen-Kontingent und Zahlweise eines
// Kunden ändern. Stripe-Änderungen laufen über lib/billing (anteilig verrechnet),
// jede Änderung landet im Änderungsprotokoll.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { changeBillingInterval, setBestandModule, setEmpfehlungModule, syncSeatBilling, type AddOnResult } from "@/lib/billing";

async function requireAdmin() {
  const s = await getCurrentSession();
  if (!s || s.role !== "ADMIN") throw new Error("Nur Admins.");
}

function done(id: string, r: AddOnResult): never {
  revalidatePath(`/admin/kunden/${id}`, "layout");
  revalidatePath("/buyer", "layout");
  const msg = r.ok ? (r.note ? `Gespeichert. ${r.note}` : "Gespeichert.") : r.error;
  redirect(`/admin/kunden/${id}/abrechnung?zusatz=${encodeURIComponent(msg)}${r.ok ? "" : "&fehler=1"}`);
}

/** Inklusive Logins und Preis je weiterem Login setzen, danach Abo abgleichen. */
export async function saveSeatsAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = String(fd.get("customerId") ?? "");
  const included = Number(fd.get("seatsIncluded"));
  const price = Number(String(fd.get("seatMonthly") ?? "").replace(",", "."));
  if (!Number.isInteger(included) || included < 1 || included > 100 || !Number.isFinite(price) || price < 0 || price > 10_000) {
    done(id, { ok: false, error: "Bitte gültige Werte eingeben (Logins 1–100, Preis ab 0 €)." });
  }
  const c = await prisma.customer.findUnique({ where: { id }, select: { seatsIncluded: true, seatMonthly: true } });
  if (!c) done(id, { ok: false, error: "Kunde nicht gefunden." });
  await prisma.customer.update({ where: { id }, data: { seatsIncluded: included, seatMonthly: price } });
  await audit("billing.seats", {
    entity: "Customer",
    entityId: id,
    customerId: id,
    details: { seatsIncluded: { from: c.seatsIncluded, to: included }, seatMonthly: { from: c.seatMonthly != null ? Number(c.seatMonthly) : null, to: price } },
  });
  done(id, await syncSeatBilling(id, { force: true }));
}

export async function syncSeatsAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = String(fd.get("customerId") ?? "");
  done(id, await syncSeatBilling(id, { force: true }));
}

export async function bestandModuleAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = String(fd.get("customerId") ?? "");
  const mode = String(fd.get("mode") ?? "");
  if (mode !== "book" && mode !== "free" && mode !== "cancel") done(id, { ok: false, error: "Unbekannte Aktion." });
  done(id, await setBestandModule(id, mode));
}

export async function empfehlungModuleAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = String(fd.get("customerId") ?? "");
  const mode = String(fd.get("mode") ?? "");
  if (mode !== "book" && mode !== "free" && mode !== "cancel") done(id, { ok: false, error: "Unbekannte Aktion." });
  done(id, await setEmpfehlungModule(id, mode));
}

/** Kampagnen-Kontingent je Monat; leer = Standard aus der Preisliste. */
export async function saveQuotaAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = String(fd.get("customerId") ?? "");
  const raw = String(fd.get("quota") ?? "").trim();
  const quota = raw === "" ? null : Number(raw);
  if (quota != null && (!Number.isInteger(quota) || quota < 0 || quota > 100_000)) done(id, { ok: false, error: "Kontingent: ganze Zahl von 0 bis 100.000." });
  const c = await prisma.customer.findUnique({ where: { id }, select: { bestandMessageQuota: true } });
  if (!c) done(id, { ok: false, error: "Kunde nicht gefunden." });
  await prisma.customer.update({ where: { id }, data: { bestandMessageQuota: quota } });
  await audit("bestand.quota", { entity: "Customer", entityId: id, customerId: id, details: { from: c.bestandMessageQuota, to: quota } });
  done(id, { ok: true, changed: true });
}

export async function billingIntervalAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = String(fd.get("customerId") ?? "");
  const interval = fd.get("interval") === "year" ? "year" : "month";
  done(id, await changeBillingInterval(id, interval));
}
