"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchFormInfo, subscribePage } from "@/lib/meta-leads";
import { assignPendingLeads } from "@/lib/lead-intake";
import { reportError } from "@/lib/monitoring";

async function requireAdmin() {
  const s = await getCurrentSession();
  if (!s || s.role !== "ADMIN") throw new Error("Nur Admins.");
}

const back = (msg: string, ok = true) => redirect(`/admin/lead-eingang?${ok ? "ok" : "err"}=${encodeURIComponent(msg)}`);

export async function assignFormAction(fd: FormData) {
  await requireAdmin();
  const formId = String(fd.get("formId") ?? "").trim();
  const customerId = String(fd.get("customerId") ?? "");
  const productKey = String(fd.get("productKey") ?? "").trim();
  const priceRaw = String(fd.get("leadPrice") ?? "").replace(",", ".").trim();
  const bezug = String(fd.get("bezugAirtableId") ?? "").trim() || null;
  let pageId = String(fd.get("pageId") ?? "").trim() || null;
  if (!/^\d{5,}$/.test(formId)) back("Bitte eine gültige Formular-ID angeben.", false);
  if (!customerId || !productKey) back("Bitte Kunde und Produkt wählen.", false);
  const leadPrice = priceRaw ? Number(priceRaw) : null;
  if (leadPrice != null && (!Number.isFinite(leadPrice) || leadPrice < 0)) back("Der Lead-Preis ist ungültig.", false);

  // Formularfragen (Beschriftungen) und Name von Meta holen – optional.
  let formName: string | null = null;
  let questionLabels: Record<string, string> | null = null;
  try {
    const info = await fetchFormInfo(formId);
    formName = info.name ?? null;
    questionLabels = Object.fromEntries((info.questions ?? []).filter((q) => q.label).map((q) => [q.key, q.label!]));
  } catch (err) {
    reportError(err, "lead-source-form-info", { formId });
  }

  await prisma.leadSource.upsert({
    where: { formId },
    create: { formId, pageId, formName, customerId, productKey, leadPrice, bezugAirtableId: bezug, questionLabels: questionLabels ?? undefined },
    update: { pageId: pageId ?? undefined, formName: formName ?? undefined, customerId, productKey, leadPrice, bezugAirtableId: bezug, active: true, ...(questionLabels ? { questionLabels } : {}) },
  });

  let note = "";
  if (pageId) {
    try {
      await subscribePage(pageId);
      note = " Seite für den Meta-Webhook abonniert.";
    } catch (err) {
      reportError(err, "lead-source-subscribe", { pageId });
      note = " Seite konnte nicht abonniert werden (Berechtigung prüfen).";
    }
  } else {
    pageId = null;
  }
  const taken = await assignPendingLeads(formId);
  revalidatePath("/admin/lead-eingang");
  back(`Formular zugeordnet.${note}${taken ? ` ${taken} wartende Leads übernommen.` : ""}`);
}

export async function toggleSourceAction(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const s = await prisma.leadSource.findUnique({ where: { id }, select: { active: true } });
  if (s) await prisma.leadSource.update({ where: { id }, data: { active: !s.active } });
  revalidatePath("/admin/lead-eingang");
}

export async function dismissUnassignedAction(fd: FormData) {
  await requireAdmin();
  const formId = String(fd.get("formId") ?? "");
  await prisma.unassignedLead.updateMany({ where: { formId: formId || null, resolvedAt: null }, data: { resolvedAt: new Date() } });
  revalidatePath("/admin/lead-eingang");
}
