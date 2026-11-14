"use server";

// Verträge im Kontakt (Cross-Selling, Ole 14.11.2026): weiteren Abschluss eintragen, bearbeiten,
// stornieren bzw. löschen. Jeder Schritt steht im Verlauf des Kontakts.

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { writableCustomerId } from "@/lib/buyer-write";
import { logLeadHistory } from "@/lib/lead-history";
import { prisma } from "@/lib/prisma";
import { loadCustomerProvision } from "@/lib/provision-server";
import { sparteInfo } from "@/lib/provision";
import { recordUsage } from "@/lib/usage";
import { addLeadContract, contractSummary, parseContractInput, setLeadContractStatus, updateLeadContract } from "@/lib/vertraege";

type Result = { ok: true } | { ok: false; error: string };

const NO_WRITE = "In der Vorschau nur mit Demo-Leads möglich.";

function refresh(leadId: string) {
  revalidatePath(`/buyer/leads/${leadId}`);
  revalidatePath("/buyer");
  revalidatePath("/buyer/zahlen");
  revalidatePath("/buyer/kontakte", "layout");
}

async function summary(customerId: string, c: { sparte: string; premium: unknown }) {
  const rates = (await loadCustomerProvision(customerId)).rates;
  return contractSummary(c, rates);
}

/** „Weiteren Abschluss eintragen“. */
export async function addContractAction(leadId: string, raw: Record<string, unknown>): Promise<Result> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: NO_WRITE };
  const parsed = parseContractInput(raw);
  if (!parsed.ok) return parsed;
  const ctx = await getBuyerContext();
  const res = await addLeadContract(leadId, customerId, parsed.value, ctx?.userId ?? null);
  if (!res.ok) return res;
  await logLeadHistory(leadId, "abschluss", `Weiterer Abschluss · ${await summary(customerId, parsed.value)}`, { customerId });
  await recordUsage("action", "vertrag.add", { meta: { sparte: parsed.value.sparte } });
  refresh(leadId);
  return { ok: true };
}

async function contractAccess(contractId: string): Promise<{ customerId: string; leadId: string } | null> {
  const c = await prisma.leadContract.findUnique({ where: { id: contractId }, select: { leadId: true, customerId: true } });
  if (!c) return null;
  const customerId = await writableCustomerId(c.leadId);
  return customerId && customerId === c.customerId ? { customerId, leadId: c.leadId } : null;
}

/** Vertrag bearbeiten (Sparte, Beitrag, Datum, Versicherer, Vertragsnummer, Police). */
export async function updateContractAction(contractId: string, raw: Record<string, unknown>): Promise<Result> {
  const acc = await contractAccess(contractId);
  if (!acc) return { ok: false, error: NO_WRITE };
  const parsed = parseContractInput(raw);
  if (!parsed.ok) return parsed;
  const res = await updateLeadContract(contractId, acc.customerId, parsed.value);
  if (!res.ok) return res;
  await logLeadHistory(acc.leadId, "abschluss", `Vertrag geändert · ${await summary(acc.customerId, parsed.value)}`, { customerId: acc.customerId });
  refresh(acc.leadId);
  return { ok: true };
}

/** Storno („storniert“), wieder aktiv („aktiv“) oder löschen (nur weitere Verträge). */
export async function setContractStatusAction(contractId: string, status: "aktiv" | "storniert" | "geloescht"): Promise<Result> {
  if (!["aktiv", "storniert", "geloescht"].includes(status)) return { ok: false, error: "Ungültig." };
  const acc = await contractAccess(contractId);
  if (!acc) return { ok: false, error: NO_WRITE };
  const res = await setLeadContractStatus(contractId, acc.customerId, status);
  if (!res.ok) return res;
  const label = sparteInfo(res.sparte).label;
  const text = status === "storniert" ? `Vertrag storniert · ${label}` : status === "aktiv" ? `Vertrag wieder aktiv · ${label}` : `Vertrag gelöscht · ${label}`;
  await logLeadHistory(acc.leadId, "abschluss", text, { customerId: acc.customerId });
  refresh(acc.leadId);
  return { ok: true };
}
