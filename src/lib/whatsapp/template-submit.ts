// WhatsApp-Vorlagen automatisch bei Meta einreichen (über 360dialog, mit dem
// Channel-API-Key des Kunden) und den Freigabestatus nachziehen.
//   - direkt nach dem Verbinden (Selbst-Verbinden und Admin-Key)
//   - im WhatsApp-Cron gedrosselt (fehlende Vorlagen, offene Prüfungen)
//   - per Admin-Knopf
// Freigegeben → status „approved“ (genau das Feld, das der Admin bisher von Hand
// setzte). Abgelehnt → Admin-Aufgabe + Push mit Grund.

import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";
import { decryptSecret } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { sendToAdmins } from "@/lib/push";
import { createTemplate, listTemplates, type RemoteTemplate } from "@/lib/whatsapp/dialog360";
import {
  buildTemplateRequest,
  findRemote,
  mapRemoteStatus,
  plannedTemplates,
  purposesFor,
  requestShape,
  templateBodyFor,
  templateNameFor,
  isTemplateRevisionOf,
  TEMPLATE_LANGUAGE,
  TEMPLATE_VERSION,
  templateNamesOf,
  withoutHeader,
  type LocalStatus,
} from "@/lib/whatsapp/template-plan";
import type { CreateTemplateInput } from "@/lib/whatsapp/dialog360";

export { templateNamesOf };
import { PURPOSE_LABELS, rolleText, TEMPLATE_HEADER, variantOfName, type NoticePurpose, type TemplateForm, type TemplateNames } from "@/lib/whatsapp/templates";

/**
 * Namen für die Vorlagentexte samt Selbstbezeichnung nach Status laut Erstinformation ([Rolle]) und Beispiel-PDF
 * für den Dokument-Kopf des Erstanschreibens (öffentliche PDF-Adresse der Erstinformation dieses Kunden).
 */
async function submitContext(customerId: string, customerName: string): Promise<{ names: TemplateNames; documentExample: string | null }> {
  let role: string | undefined;
  let documentExample: string | null = null;
  try {
    const { erstinfoPdfUrlFor, loadErstinfo } = await import("@/lib/erstinformation");
    const e = await loadErstinfo(customerId);
    role = rolleText(e.daten.status, e.daten.versicherer);
    documentExample = await erstinfoPdfUrlFor(customerId);
  } catch (err) {
    reportError(err, "templates-erstinfo", { customer: customerId });
  }
  return { names: templateNamesOf(customerName, role), documentExample };
}

/**
 * Einreichen; lehnt 360dialog den Antrag mit Dokument-Kopf ab (z. B. Beispiel-PDF nicht abrufbar), einmal ohne Kopf
 * und Fußzeile. Dann geht das PDF wie bisher nach der ersten Antwort des Leads raus (lib/whatsapp/erstinfo-pdf.ts).
 */
async function createWithFallback(apiKey: string, req: CreateTemplateInput): Promise<{ hit: RemoteTemplate; req: CreateTemplateInput }> {
  try {
    return { hit: await createTemplate(apiKey, req), req };
  } catch (err) {
    if (!requestShape(req).headerFormat) throw err;
    console.error("[templates] Dokument-Kopf abgelehnt, ohne Kopf", req.name, err instanceof Error ? err.message.slice(0, 200) : err);
    const plain = withoutHeader(req);
    return { hit: await createTemplate(apiKey, plain), req: plain };
  }
}

export type SubmitSummary = {
  ok: boolean;
  submitted: string[];
  approved: string[];
  rejected: string[];
  pending: string[];
  skipped: string[];
  error?: string;
};

/** Mindestabstand zwischen zwei Abgleichen je Kunde im Cron. */
const CHECK_INTERVAL_PENDING_MS = 30 * 60 * 1000;
const CHECK_INTERVAL_IDLE_MS = 6 * 60 * 60 * 1000;

async function notifyRejected(customerId: string, customerName: string, purposeLabel: string, name: string, reason: string | null): Promise<void> {
  const contact = await prisma.salesContact.findFirst({ where: { customerId }, select: { id: true } }).catch(() => null);
  const why = reason ? ` Grund laut Meta: ${reason}.` : "";
  await prisma.salesTask
    .create({
      data: {
        title: `WhatsApp-Vorlage abgelehnt: ${customerName}`,
        note: `Meta hat die Vorlage „${purposeLabel}“ (${name}) abgelehnt.${why} Text in der Kundenakte → WhatsApp-Assistent → Vorlagen prüfen und „neu einreichen“.`,
        contactId: contact?.id ?? null,
        type: "SONSTIGES",
        dueAt: new Date(),
      },
    })
    .catch((err) => reportError(err, "template-rejected-task"));
  await sendToAdmins({
    title: `WhatsApp-Vorlage abgelehnt: ${customerName}`,
    body: `${purposeLabel}${reason ? `, ${reason}` : ""}`.slice(0, 120),
    url: "/admin/whatsapp/settings",
    tag: `tpl:${customerId}:${name}`,
  }).catch(() => {});
}

/** Lokalen Datensatz auf den Stand von 360dialog bringen; meldet neu abgelehnte. */
async function applyRemote(
  customer: { id: string; name: string },
  purpose: NoticePurpose,
  name: string,
  body: string,
  category: string,
  remote: RemoteTemplate,
  opts: { submittedAt?: Date; shape?: { headerFormat: string | null; buttons: string[] } },
): Promise<LocalStatus> {
  // Kopf und Knöpfe: wie eingereicht, sonst laut Vorlagenliste von 360dialog (z. B. nach verlorenem Datensatz)
  const known = opts.shape ?? (remote.headerFormat !== undefined ? { headerFormat: remote.headerFormat, buttons: remote.buttons ?? [] } : null);
  const shape = known ? { headerFormat: known.headerFormat, buttons: known.buttons } : {};
  const status = mapRemoteStatus(remote.status);
  const before = await prisma.messageTemplate.findUnique({
    where: { customerId_name_language: { customerId: customer.id, name, language: TEMPLATE_LANGUAGE } },
    select: { status: true },
  });
  await prisma.messageTemplate.upsert({
    where: { customerId_name_language: { customerId: customer.id, name, language: TEMPLATE_LANGUAGE } },
    create: {
      customerId: customer.id,
      name,
      language: TEMPLATE_LANGUAGE,
      purpose,
      category: category.toLowerCase(),
      status,
      body,
      auto: true,
      submittedAt: opts.submittedAt ?? null,
      rejectionReason: status === "rejected" ? remote.rejectedReason : null,
      ...shape,
    },
    update: {
      status,
      ...(remote.category ? { category: remote.category.toLowerCase() } : {}),
      rejectionReason: status === "rejected" ? remote.rejectedReason : null,
      ...(opts.submittedAt ? { submittedAt: opts.submittedAt, body } : {}),
      ...shape,
    },
  });
  if (status === "rejected" && before?.status !== "rejected") {
    await notifyRejected(customer.id, customer.name, PURPOSE_LABELS[purpose] ?? purpose, name, remote.rejectedReason);
  }
  return status;
}

/**
 * Fehlende Vorlagen einreichen und den Status aller automatisch eingereichten
 * nachziehen (ein Listen-Abruf je Aufruf). Vorlagen, die der Admin für einen
 * Zweck schon von Hand angelegt hat (freigegeben oder wartend), bleiben unberührt.
 */
export async function submitTemplatesForCustomer(customerId: string, now = new Date()): Promise<SubmitSummary> {
  const summary: SubmitSummary = { ok: true, submitted: [], approved: [], rejected: [], pending: [], skipped: [] };
  const [account, customer] = await Promise.all([
    prisma.whatsAppAccount.findUnique({ where: { customerId }, select: { id: true, status: true, apiKeyEnc: true } }),
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, existingCustomersEnabled: true, empfehlungEnabled: true, messageTemplates: { select: { name: true, purpose: true, status: true, auto: true } } },
    }),
  ]);
  if (!customer) return { ...summary, ok: false, error: "Kunde nicht gefunden" };
  if (!account || account.status !== "connected" || !account.apiKeyEnc) {
    return { ...summary, ok: false, error: "WhatsApp ist für diesen Kunden nicht verbunden" };
  }
  const markChecked = () => prisma.whatsAppAccount.update({ where: { id: account.id }, data: { templatesCheckedAt: now } }).catch(() => {});

  let apiKey: string;
  let remote: RemoteTemplate[];
  try {
    apiKey = decryptSecret(account.apiKeyEnc);
    remote = await listTemplates(apiKey);
  } catch (err) {
    await markChecked();
    const msg = err instanceof Error ? err.message.slice(0, 200) : "Abruf fehlgeschlagen";
    console.error("[templates] Liste", msg);
    return { ...summary, ok: false, error: msg };
  }

  const purposes = purposesFor({ bestand: customer.existingCustomersEnabled, empfehlung: customer.empfehlungEnabled });
  // Je Zweck alle Fassungen (Du, Sie, Sie ohne Namen; A/B) – unabhängig von der gewählten Ansprache, damit ein
  // Wechsel sofort greift. Bis eine neue Fassung freigegeben ist, sendet die App die bisherige freigegebene.
  const planned = plannedTemplates(purposes);
  const missing = planned.some((t) => !findRemote(remote, templateNameFor(t.purpose, TEMPLATE_VERSION, t.form, t.variant)));
  const { names, documentExample } = missing ? await submitContext(customer.id, customer.name) : { names: templateNamesOf(customer.name), documentExample: null };
  for (const { purpose, form, variant } of planned) {
    const manual = customer.messageTemplates.find((t) => !t.auto && t.purpose === purpose && (t.status === "approved" || t.status === "pending"));
    if (manual) {
      if (!summary.skipped.includes(purpose)) summary.skipped.push(purpose);
      continue;
    }
    const name = templateNameFor(purpose, TEMPLATE_VERSION, form, variant);
    let req = buildTemplateRequest(purpose, names, TEMPLATE_VERSION, form, { variant, documentExample });
    const body = templateBodyFor(purpose, names, form, variant);
    let hit = findRemote(remote, name);
    let submittedAt: Date | undefined;
    if (!hit) {
      try {
        ({ hit, req } = await createWithFallback(apiKey, req));
        submittedAt = now;
        summary.submitted.push(name);
      } catch (err) {
        summary.ok = false;
        const msg = err instanceof Error ? err.message.slice(0, 200) : "Einreichen fehlgeschlagen";
        summary.error = msg;
        console.error("[templates] Einreichen", name, msg);
        continue;
      }
    }
    const status = await applyRemote({ id: customer.id, name: customer.name }, purpose, name, body, req.category, hit, { submittedAt, ...(submittedAt ? { shape: requestShape(req) } : {}) });
    if (status === "approved") summary.approved.push(name);
    else if (status === "rejected") summary.rejected.push(name);
    else summary.pending.push(name);
  }

  // Ältere automatisch eingereichte Versionen (andere Namen, z. B. v1) ebenfalls nachziehen.
  const current = new Set(planned.map((t) => templateNameFor(t.purpose, TEMPLATE_VERSION, t.form, t.variant)));
  for (const t of customer.messageTemplates.filter((x) => x.auto && !current.has(x.name))) {
    const hit = findRemote(remote, t.name);
    if (!hit) continue;
    const status = mapRemoteStatus(hit.status);
    if (status !== t.status) {
      await prisma.messageTemplate.updateMany({
        where: { customerId, name: t.name, language: TEMPLATE_LANGUAGE },
        data: { status, rejectionReason: status === "rejected" ? hit.rejectedReason : null },
      });
    }
  }
  await markChecked();
  return summary;
}

/**
 * Nach dem Buchen bzw. Freischalten eines Moduls (Bestandskunden, Empfehlungen): dessen Vorlagen sofort
 * einreichen, nicht auf den Cron warten (Ole, 14.11.2026). Ohne verbundene Nummer passiert nichts; das
 * Verbinden reicht dann alles ein. Fehler sind still (der Cron reicht nach).
 */
export async function submitTemplatesAfterModule(customerId: string, now = new Date()): Promise<SubmitSummary | null> {
  try {
    const acc = await prisma.whatsAppAccount.findUnique({ where: { customerId }, select: { status: true, apiKeyEnc: true } });
    if (acc?.status !== "connected" || !acc.apiKeyEnc) return null;
    return await submitTemplatesForCustomer(customerId, now);
  } catch (err) {
    reportError(err, "templates-after-module", { customer: customerId });
    return null;
  }
}

/**
 * Im WhatsApp-Cron: verbundene Konten abgleichen. Offene Prüfungen bzw. fehlende
 * Vorlagen alle 30 Minuten, sonst alle 6 Stunden (pausierte/deaktivierte erkennen).
 */
export async function syncTemplates(now = new Date(), opts: { force?: boolean; limit?: number } = {}): Promise<{ checked: number; submitted: number; rejected: number }> {
  const accounts = await prisma.whatsAppAccount.findMany({
    where: {
      customerId: { not: SUPPORT_CUSTOMER_ID },
      status: "connected",
      apiKeyEnc: { not: null },
      // Ruhende Konten (lib/ruhend.ts): keine Vorlagen einreichen
      customer: { dormantSince: null },
      ...(opts.force ? {} : { OR: [{ templatesCheckedAt: null }, { templatesCheckedAt: { lt: new Date(now.getTime() - CHECK_INTERVAL_PENDING_MS) } }] }),
    },
    select: {
      customerId: true,
      templatesCheckedAt: true,
      customer: { select: { existingCustomersEnabled: true, empfehlungEnabled: true, messageTemplates: { select: { name: true, purpose: true, status: true, auto: true } } } },
    },
    orderBy: { templatesCheckedAt: { sort: "asc", nulls: "first" } },
    take: opts.limit ?? 10,
  });
  let checked = 0;
  let submitted = 0;
  let rejected = 0;
  for (const acc of accounts) {
    const tpls = acc.customer.messageTemplates;
    const purposes = purposesFor({ bestand: acc.customer.existingCustomersEnabled, empfehlung: acc.customer.empfehlungEnabled });
    // Erledigt, wenn je Zweck jede Fassung freigegeben ist (oder der Admin eine eigene angelegt hat)
    const settled = plannedTemplates(purposes).every(({ purpose: p, form, variant }) => {
      const wanted = templateNameFor(p, TEMPLATE_VERSION, form, variant);
      return tpls.some((t) => t.purpose === p && ((t.auto && isTemplateRevisionOf(t.name, wanted) && t.status === "approved") || (!t.auto && (t.status === "approved" || t.status === "pending"))));
    });
    const recent = acc.templatesCheckedAt && now.getTime() - acc.templatesCheckedAt.getTime() < CHECK_INTERVAL_IDLE_MS;
    if (!opts.force && settled && recent) continue;
    const res = await submitTemplatesForCustomer(acc.customerId, now).catch((err) => {
      reportError(err, "templates-sync", { customer: acc.customerId });
      return null;
    });
    if (!res) continue;
    checked++;
    submitted += res.submitted.length;
    rejected += res.rejected.length;
  }
  return { checked, submitted, rejected };
}

/**
 * Abgelehnte Vorlage neu einreichen (aktueller Text aus TEMPLATE_BODY). Meta erlaubt einen Namen nur
 * einmal, daher als Revision: pg_<zweck>_v2_r2, _r3 … Ohne Fassung: alle abgelehnten bzw. fehlenden
 * Fassungen des Zwecks (bei „Du“ zuerst die Du-Fassung).
 */
export async function resubmitTemplate(customerId: string, purpose: NoticePurpose, now = new Date(), form?: TemplateForm): Promise<{ ok: boolean; name?: string; error?: string }> {
  const [account, customer] = await Promise.all([
    prisma.whatsAppAccount.findUnique({ where: { customerId }, select: { status: true, apiKeyEnc: true } }),
    prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true, messageTemplates: { where: { purpose }, select: { name: true, status: true, headerFormat: true } } } }),
  ]);
  if (!customer || !account || account.status !== "connected" || !account.apiKeyEnc) return { ok: false, error: "WhatsApp ist nicht verbunden" };
  const { names, documentExample } = await submitContext(customer.id, customer.name);
  const planned = plannedTemplates([purpose]).filter((t) => !form || t.form === form);
  // Fassungen, deren letzte Revision abgelehnt bzw. pausiert ist (ohne Angabe: sonst die erste)
  const latest = (base: string) => customer.messageTemplates.filter((t) => isTemplateRevisionOf(t.name, base)).sort((x, y) => revisionNo(y.name) - revisionNo(x.name))[0];
  const todo = planned.filter((t) => {
    const l = latest(templateNameFor(purpose, TEMPLATE_VERSION, t.form, t.variant));
    return !!form || !l || l.status === "rejected" || l.status === "paused";
  });
  const chosen = todo[0] ?? planned[0];
  if (!chosen) return { ok: false, error: "Keine Fassung zum Einreichen" };
  const base = templateNameFor(purpose, TEMPLATE_VERSION, chosen.form, chosen.variant);
  const existing = customer.messageTemplates.filter((t) => t.name.startsWith(`${base}_r`) && isTemplateRevisionOf(t.name, base)).length;
  const name = `${base}_r${existing + 2}`;
  // Wurde die letzte Revision mit PDF im Kopf abgelehnt: ohne Kopf neu einreichen (das PDF geht dann nach der ersten Antwort)
  const prev = latest(base);
  const dropHeader = !!TEMPLATE_HEADER[purpose] && prev?.status === "rejected" && prev.headerFormat === "DOCUMENT";
  const full = { ...buildTemplateRequest(purpose, names, TEMPLATE_VERSION, chosen.form, { variant: chosen.variant, documentExample: dropHeader ? null : documentExample }), name };
  try {
    const { hit, req } = await createWithFallback(decryptSecret(account.apiKeyEnc), full);
    await applyRemote(customer, purpose, name, templateBodyFor(purpose, names, chosen.form, variantOfName(name)), req.category, { ...hit, name }, { submittedAt: now, shape: requestShape(req) });
    return { ok: true, name };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 200) : "Einreichen fehlgeschlagen" };
  }
}

function revisionNo(name: string): number {
  const m = /_r(\d+)$/.exec(name);
  return m ? Number(m[1]) : 1;
}

/** Kurzfassung für Admin-Meldungen. */
export function summaryText(s: SubmitSummary): string {
  if (!s.ok && s.error && !s.submitted.length && !s.approved.length && !s.pending.length) return `Nicht möglich: ${s.error}`;
  const parts = [
    s.submitted.length ? `${s.submitted.length} eingereicht` : null,
    s.approved.length ? `${s.approved.length} freigegeben` : null,
    s.pending.length ? `${s.pending.length} in Prüfung` : null,
    s.rejected.length ? `${s.rejected.length} abgelehnt` : null,
    s.skipped.length ? `${s.skipped.length} von Hand angelegt` : null,
  ].filter(Boolean);
  return (parts.join(" · ") || "Nichts zu tun") + (s.error ? ` (Fehler: ${s.error})` : "");
}
