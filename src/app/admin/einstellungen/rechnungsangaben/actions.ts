"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/vertrieb/auth";
import { audit } from "@/lib/audit";
import { billingEnabled } from "@/lib/billing";
import { countSentInvoices, saveTaxNumber, updateCustomerFooters, type CustomerFooterResult, type SentInvoiceCount } from "@/lib/rechnungsangaben";

export type TaxNumberState = { ok?: boolean; message?: string; error?: string };

/** Steuernummer speichern; bei Änderung alle Stripe-Kunden automatisch nachziehen. */
export async function saveTaxNumberAction(_prev: TaxNumberState, fd: FormData): Promise<TaxNumberState> {
  await requireAuth();
  const res = await saveTaxNumber(String(fd.get("taxNumber") ?? ""));
  if (!res.ok) return { error: res.error };
  revalidatePath("/admin/neu/einstellungen/rechnungsangaben");
  revalidatePath("/admin/neu/einstellungen");
  revalidatePath("/admin/neu");
  if (!res.changed) return { ok: true, message: "Gespeichert (unverändert)." };
  await audit("rechnung.steuernummer", { entity: "InvoiceSettings", entityId: "default", details: { gesetzt: !!res.value } });
  if (!billingEnabled()) return { ok: true, message: "Gespeichert. Stripe ist nicht eingerichtet, Kunden werden später aktualisiert." };
  const upd = await updateCustomerFooters({ dryRun: false, taxNumber: res.value });
  if ("error" in upd) return { ok: true, message: `Gespeichert. Stripe-Kunden konnten nicht aktualisiert werden: ${upd.error}` };
  await audit("rechnung.kunden", { details: { ...upd, anlass: "steuernummer" } });
  return {
    ok: true,
    message: `Gespeichert. ${upd.updated} von ${upd.total} Stripe-Kunden aktualisiert${upd.failed ? `, ${upd.failed} fehlgeschlagen` : ""}.`,
  };
}

export type CustomerFooterState = { result?: CustomerFooterResult; error?: string };

/** Trockenlauf (mode=dry) oder alle betroffenen Stripe-Kunden aktualisieren (mode=apply). */
export async function customerFootersAction(_prev: CustomerFooterState, fd: FormData): Promise<CustomerFooterState> {
  await requireAuth();
  const dryRun = fd.get("mode") !== "apply";
  const res = await updateCustomerFooters({ dryRun });
  if ("error" in res) return { error: res.error };
  if (!dryRun) await audit("rechnung.kunden", { details: { ...res, anlass: "knopf" } });
  return { result: res };
}

export type InvoiceCountState = { result?: SentInvoiceCount; error?: string };

/** Verschickte Rechnungen zählen (nur Zahlen, keine Kundendaten). */
export async function countInvoicesAction(_prev: InvoiceCountState): Promise<InvoiceCountState> {
  await requireAuth();
  const res = await countSentInvoices();
  if ("error" in res) return { error: res.error };
  return { result: res };
}
