// Direkter Lead-Eingang ohne Airtable: Meta-Webhook (leadgen) oder Zapier-
// Webhook liefern einen Lead → Zuordnung über das Leadformular (LeadSource)
// → Lead in der Datenbank → sofort weiterverarbeiten (Push an den Kunden,
// WhatsApp-Erstanschreiben, bei „Nur Betreuung“ Lead-Mail). Formulare ohne
// Zuordnung landen im Posteingang (UnassignedLead) und gehen nicht verloren.

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/whatsapp/phone";
import { attachLeadToContact } from "@/lib/whatsapp/lead-link";
import { sendToAdmins } from "@/lib/push";
import { assignLead, notifyLeadPush } from "@/lib/team";
import { reportError } from "@/lib/monitoring";
import { runOutreach } from "@/lib/whatsapp/outreach";
import { emailLeads } from "@/lib/onboarding-cron";
import type { MetaLead } from "@/lib/meta-leads";

export type IncomingLead = {
  externalId: string | null;
  formId: string | null;
  pageId: string | null;
  createdAt: string; // ISO
  campaignName: string | null;
  adName: string | null;
  fields: Record<string, string>;
};

const META_KEYS = new Set([
  "id", "leadgen_id", "lead_id", "form_id", "page_id", "created_time", "ad_id", "ad_name", "adset_id",
  "adset_name", "campaign_id", "campaign_name", "platform", "is_organic", "form_name", "page_name",
  "field_data", "partner_name", "retailer_item_id", "vehicle", "inbox_url", "custom_disclaimer_responses",
]);

const str = (v: unknown) => (v == null ? "" : Array.isArray(v) ? v.map(String).join(", ") : String(v)).trim();

export function fromMetaLead(l: MetaLead, pageId: string | null): IncomingLead {
  const fields: Record<string, string> = {};
  for (const f of l.field_data ?? []) fields[f.name] = (f.values ?? []).join(", ").trim();
  return {
    externalId: l.id,
    formId: l.form_id ?? null,
    pageId,
    createdAt: l.created_time ? new Date(l.created_time).toISOString() : new Date().toISOString(),
    campaignName: l.campaign_name ?? null,
    adName: l.ad_name ?? null,
    fields,
  };
}

/** Flaches JSON (z. B. aus Zapier „Facebook Lead Ads“) in einen Lead übersetzen. */
export function fromFlatPayload(body: Record<string, unknown>): IncomingLead {
  const fields: Record<string, string> = {};
  if (Array.isArray(body.field_data)) {
    for (const f of body.field_data as { name?: string; values?: unknown }[]) {
      if (f?.name) fields[f.name] = str(f.values);
    }
  }
  for (const [k, v] of Object.entries(body)) {
    if (META_KEYS.has(k.toLowerCase()) || v == null || typeof v === "object") continue;
    const value = str(v);
    if (value) fields[k] = value;
  }
  const created = str(body.created_time);
  return {
    externalId: str(body.leadgen_id) || str(body.lead_id) || str(body.id) || null,
    formId: str(body.form_id) || null,
    pageId: str(body.page_id) || null,
    createdAt: created && !Number.isNaN(new Date(created).getTime()) ? new Date(created).toISOString() : new Date().toISOString(),
    campaignName: str(body.campaign_name) || null,
    adName: str(body.ad_name) || null,
    fields,
  };
}

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
const pick = (fields: Record<string, string>, keys: string[]) => {
  const want = new Set(keys.map(norm));
  for (const [k, v] of Object.entries(fields)) if (want.has(norm(k)) && v) return { key: k, value: v };
  return null;
};

function prettify(key: string): string {
  const s = key.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : key;
}

function extract(inc: IncomingLead, labels: Record<string, string>) {
  const used = new Set<string>();
  const take = (keys: string[]) => {
    const hit = pick(inc.fields, keys);
    if (hit) used.add(hit.key);
    return hit?.value ?? null;
  };
  const full = take(["full_name", "name", "vollständiger_name", "vollstaendiger_name"]);
  const first = take(["first_name", "vorname"]);
  const last = take(["last_name", "nachname"]);
  const name = full ?? ([first, last].filter(Boolean).join(" ") || null);
  const phone = normalizePhone(take(["phone_number", "phone", "telefonnummer", "telefon", "handynummer"]) ?? "");
  const email = take(["email", "e-mail", "e_mail", "emailadresse"])?.toLowerCase() ?? null;
  const answers = Object.entries(inc.fields)
    .filter(([k, v]) => !used.has(k) && v)
    .map(([k, v]) => ({ label: labels[k] ?? prettify(k), value: v.replace(/_/g, " ") }));
  return { name, phone, email, answers };
}

export type IngestResult = { status: "created" | "duplicate" | "unassigned"; leadId?: string };

export async function ingestLead(
  inc: IncomingLead,
  via: "meta" | "zapier",
  override?: { customerId?: string | null; productKey?: string | null },
): Promise<IngestResult> {
  if (inc.externalId) {
    const dup = await prisma.lead.findUnique({ where: { externalId: inc.externalId }, select: { id: true } });
    if (dup) return { status: "duplicate", leadId: dup.id };
  }
  const source = inc.formId ? await prisma.leadSource.findFirst({ where: { formId: inc.formId, active: true } }) : null;
  const customerId = source?.customerId ?? override?.customerId ?? null;
  const productKey = source?.productKey ?? override?.productKey ?? null;

  if (!customerId || !productKey) {
    const payload = inc as unknown as Prisma.InputJsonValue;
    if (inc.externalId) {
      await prisma.unassignedLead.upsert({ where: { externalId: inc.externalId }, create: { externalId: inc.externalId, formId: inc.formId, pageId: inc.pageId, via, payload }, update: {} });
    } else {
      await prisma.unassignedLead.create({ data: { formId: inc.formId, pageId: inc.pageId, via, payload } });
    }
    await sendToAdmins({
      title: "📥 Lead ohne Zuordnung",
      body: `Formular ${inc.formId ?? "unbekannt"}${inc.campaignName ? ` · ${inc.campaignName}` : ""}. Bitte unter Lead-Eingang zuordnen.`,
      url: "/admin/lead-eingang",
      tag: `unassigned:${inc.formId ?? "x"}`,
    }).catch(() => {});
    return { status: "unassigned" };
  }

  const labels = (source?.questionLabels ?? {}) as Record<string, string>;
  const { name, phone, email, answers } = extract(inc, labels);
  const createdAt = new Date(inc.createdAt);
  let lead;
  try {
    lead = await prisma.lead.create({
      data: {
        externalId: inc.externalId,
        source: productKey,
        customerId,
        name,
        phone,
        email,
        formData: answers.length ? answers : Prisma.DbNull,
        createdAt: createdAt.getTime() > Date.now() ? new Date() : createdAt,
        adChannel: "Meta",
        status: "Neuer Lead",
        bezugAirtableId: source?.bezugAirtableId ?? null,
      },
      select: { id: true },
    });
  } catch (err) {
    // Gleichzeitiger Doppel-Eingang (Meta + Zapier) → Unique-Konflikt = Dublette.
    if (err instanceof Error && /Unique constraint|P2002/.test(err.message) && inc.externalId) {
      const dup = await prisma.lead.findUnique({ where: { externalId: inc.externalId }, select: { id: true } });
      if (dup) return { status: "duplicate", leadId: dup.id };
    }
    throw err;
  }

  if (source?.leadPrice && Number(source.leadPrice) > 0) {
    await prisma.revenue.create({
      data: { amount: source.leadPrice, occurredAt: createdAt, customerId, leadId: lead.id, cancelled: false },
    });
  }
  if (source) await prisma.leadSource.update({ where: { id: source.id }, data: { lastLeadAt: new Date() } });

  await processNewLead(lead.id).catch((err) => reportError(err, "lead-intake-process", { lead: lead.id }));
  return { status: "created", leadId: lead.id };
}

/** Alles, was ein neuer Lead sofort auslösen soll. */
export async function processNewLead(leadId: string) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, name: true, source: true, customerId: true, customer: { select: { plan: true } } },
  });
  if (!lead) return;
  // Team (Großkunden): gleichmäßig zuteilen, Push nur an den Zuständigen.
  await assignLead(lead.id).catch((err) => reportError(err, "lead-intake-assign"));
  await attachLeadToContact(lead.id).catch((err) => reportError(err, "lead-intake-attach"));
  await notifyLeadPush(lead.id, {
    title: `🆕 Neuer Lead: ${lead.name ?? "ohne Name"}`,
    body: lead.source ?? "",
    tag: `lead-buyer:${lead.id}`,
    url: "/buyer",
  });
  {
    await emailLeads(new Date(), lead.customerId).catch((err) => reportError(err, "lead-intake-email"));
  }
  // WhatsApp-Erstanschreiben: sofort, wenn keine Wartezeit eingestellt ist
  // (sonst übernimmt der Cron nach Ablauf der Wartezeit).
  const agent = await prisma.agentConfig.findUnique({ where: { customerId: lead.customerId }, select: { outreachEnabled: true, outreachDelayMin: true, active: true } });
  if (agent?.active && agent.outreachEnabled && agent.outreachDelayMin === 0) {
    await runOutreach(lead.customerId).catch((err) => reportError(err, "lead-intake-outreach"));
  }
}

/** Formular zuordnen und alle wartenden Leads dieses Formulars übernehmen. */
export async function assignPendingLeads(formId: string): Promise<number> {
  const pending = await prisma.unassignedLead.findMany({ where: { formId, resolvedAt: null }, orderBy: { createdAt: "asc" } });
  let n = 0;
  for (const p of pending) {
    const res = await ingestLead(p.payload as unknown as IncomingLead, p.via === "meta" ? "meta" : "zapier");
    if (res.status !== "unassigned") {
      await prisma.unassignedLead.update({ where: { id: p.id }, data: { resolvedAt: new Date() } });
      n++;
    }
  }
  return n;
}
