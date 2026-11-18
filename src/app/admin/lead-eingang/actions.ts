"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchFormInfo, subscribePage } from "@/lib/meta-leads";
import { assignPendingLeads } from "@/lib/lead-intake";
import { reportError } from "@/lib/monitoring";
import { audit } from "@/lib/audit";
import { VERTRIEB_ZIEL } from "@/app/admin/lead-eingang/daten";

async function requireAdmin() {
  const s = await getCurrentSession();
  if (!s || s.role !== "ADMIN") throw new Error("Nur Admins.");
}

// Rückweg: alte Seite oder (Feld „zurueck“) der neue Admin unter /admin/neu/leads
const ziel = (fd: FormData) => {
  const z = String(fd.get("zurueck") ?? "");
  return z.startsWith("/admin/neu/") && !z.includes("?") ? z : "/admin/lead-eingang";
};
const back = (msg: string, ok = true, basis = "/admin/lead-eingang") => redirect(`${basis}?${ok ? "ok" : "err"}=${encodeURIComponent(msg)}`);

export async function assignFormAction(fd: FormData) {
  await requireAdmin();
  const basis = ziel(fd);
  const formId = String(fd.get("formId") ?? "").trim();
  const customerId = String(fd.get("customerId") ?? "");
  const productKey = String(fd.get("productKey") ?? "").trim();
  const priceRaw = String(fd.get("leadPrice") ?? "").replace(",", ".").trim();
  const bezug = String(fd.get("bezugAirtableId") ?? "").trim() || null;
  const pageId = String(fd.get("pageId") ?? "").trim() || null;
  if (!/^\d{5,}$/.test(formId)) back("Bitte eine gültige Formular-ID angeben.", false, basis);
  if (customerId === VERTRIEB_ZIEL) return assignToVertrieb(formId, pageId, basis);
  if (!customerId || !productKey) back("Bitte Kunde und Produkt wählen.", false, basis);
  const leadPrice = priceRaw ? Number(priceRaw) : null;
  if (leadPrice != null && (!Number.isFinite(leadPrice) || leadPrice < 0)) back("Der Lead-Preis ist ungültig.", false, basis);

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
  await audit("leadsource.assign", { entity: "LeadSource", entityId: formId, customerId, details: { productKey, leadPrice: leadPrice ? Number(leadPrice) : null } });
  // Ein Formular hat genau ein Ziel: gehörte es bisher dem Vertrieb, jetzt nicht mehr
  await prisma.vertriebLeadForm.updateMany({ where: { formId, active: true }, data: { active: false } });

  const note = await abonniereSeite(pageId);
  const taken = await assignPendingLeads(formId);
  aktualisieren();
  back(`Formular zugeordnet.${note}${taken ? ` ${taken} wartende Leads übernommen.` : ""}`, true, basis);
}

function aktualisieren() {
  revalidatePath("/admin/lead-eingang");
  revalidatePath("/admin/neu", "layout");
  revalidatePath("/admin/kunden", "layout");
  revalidatePath("/admin/vertrieb", "layout");
}

/** Seite am Meta-Webhook abonnieren (leadgen). Gibt den Hinweis für die Meldung zurück. */
async function abonniereSeite(pageId: string | null): Promise<string> {
  if (!pageId) return "";
  try {
    await subscribePage(pageId);
    return " Seite für den Meta-Webhook abonniert.";
  } catch (err) {
    reportError(err, "lead-source-subscribe", { pageId });
    const msg = err instanceof Error ? err.message : "";
    return /administrative permission|\(#200\)/i.test(msg)
      ? " Seite konnte nicht abonniert werden: Unser Systemnutzer braucht auf der Seite „Volle Kontrolle“ (Business-Einstellungen → Seiten → Personen). Danach erneut „Zuordnen“."
      : ` Seite konnte nicht abonniert werden (${msg.replace(/^Seite abonnieren fehlgeschlagen /, "").slice(0, 160)}).`;
  }
}

/** Formular dem Vertrieb zuordnen: Leads gehen als Vermittler-Leads in Verkaufen → Kontakte (lib/vertrieb/inbound.ts). */
async function assignToVertrieb(formId: string, pageId: string | null, basis: string) {
  let formName: string | null = null;
  try {
    formName = (await fetchFormInfo(formId)).name ?? null;
  } catch (err) {
    reportError(err, "vertrieb-form-info", { formId });
  }
  await prisma.vertriebLeadForm.upsert({
    where: { formId },
    create: { formId, pageId, formName },
    update: { pageId: pageId ?? undefined, formName: formName ?? undefined, active: true },
  });
  // Ein Formular hat genau ein Ziel: Kunden-Zuordnung pausieren (bleibt für die Historie stehen)
  await prisma.leadSource.updateMany({ where: { formId, active: true }, data: { active: false } });
  await audit("leadsource.assign", { entity: "VertriebLeadForm", entityId: formId, details: { ziel: "vertrieb" } });
  const note = await abonniereSeite(pageId);
  const taken = await assignPendingLeads(formId);
  aktualisieren();
  back(`Formular dem Vertrieb zugeordnet.${note}${taken ? ` ${taken} wartende Leads übernommen.` : ""}`, true, basis);
}

export async function toggleVertriebFormAction(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const f = await prisma.vertriebLeadForm.findUnique({ where: { id }, select: { active: true } });
  if (f) {
    const u = await prisma.vertriebLeadForm.update({ where: { id }, data: { active: !f.active } });
    await audit("leadsource.toggle", { entity: "VertriebLeadForm", entityId: u.formId, details: { active: u.active } });
  }
  aktualisieren();
}

export async function toggleSourceAction(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const s = await prisma.leadSource.findUnique({ where: { id }, select: { active: true } });
  if (s) {
    const u = await prisma.leadSource.update({ where: { id }, data: { active: !s.active } });
    await audit("leadsource.toggle", { entity: "LeadSource", entityId: u.formId, customerId: u.customerId, details: { active: u.active } });
  }
  revalidatePath("/admin/lead-eingang");
  revalidatePath("/admin/neu", "layout");
  revalidatePath("/admin/kunden", "layout");
}

export async function dismissUnassignedAction(fd: FormData) {
  await requireAdmin();
  const formId = String(fd.get("formId") ?? "");
  await prisma.unassignedLead.updateMany({ where: { formId: formId || null, resolvedAt: null }, data: { resolvedAt: new Date() } });
  revalidatePath("/admin/lead-eingang");
  revalidatePath("/admin/neu", "layout");
  revalidatePath("/admin/kunden", "layout");
}
