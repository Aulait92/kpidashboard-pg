// WhatsApp-Vorlagen automatisch bei Meta einreichen (über 360dialog, mit dem
// Channel-API-Key des Kunden) und den Freigabestatus nachziehen.
//   - direkt nach dem Verbinden (Selbst-Verbinden und Admin-Key)
//   - im WhatsApp-Cron gedrosselt (fehlende Vorlagen, offene Prüfungen)
//   - per Admin-Knopf
// Freigegeben → status „approved“ (genau das Feld, das der Admin bisher von Hand
// setzte). Abgelehnt → Admin-Aufgabe + Push mit Grund.

import { decryptSecret } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { sendToAdmins } from "@/lib/push";
import { createTemplate, listTemplates, type RemoteTemplate } from "@/lib/whatsapp/dialog360";
import {
  advisorDisplayName,
  buildTemplateRequest,
  findRemote,
  mapRemoteStatus,
  purposesFor,
  templateBodyFor,
  templateNameFor,
  TEMPLATE_LANGUAGE,
  type LocalStatus,
} from "@/lib/whatsapp/template-plan";
import { PURPOSE_LABELS, type NoticePurpose } from "@/lib/whatsapp/templates";

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
    body: `${purposeLabel}${reason ? ` – ${reason}` : ""}`.slice(0, 120),
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
  opts: { submittedAt?: Date },
): Promise<LocalStatus> {
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
    },
    update: {
      status,
      ...(remote.category ? { category: remote.category.toLowerCase() } : {}),
      rejectionReason: status === "rejected" ? remote.rejectedReason : null,
      ...(opts.submittedAt ? { submittedAt: opts.submittedAt, body } : {}),
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
      select: { id: true, name: true, existingCustomersEnabled: true, messageTemplates: { select: { name: true, purpose: true, status: true, auto: true } } },
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

  const advisor = advisorDisplayName(customer.name);
  const purposes = purposesFor({ bestand: customer.existingCustomersEnabled });
  for (const purpose of purposes) {
    const manual = customer.messageTemplates.find((t) => !t.auto && t.purpose === purpose && (t.status === "approved" || t.status === "pending"));
    if (manual) {
      summary.skipped.push(purpose);
      continue;
    }
    const name = templateNameFor(purpose);
    const req = buildTemplateRequest(purpose, advisor);
    const body = templateBodyFor(purpose, advisor);
    let hit = findRemote(remote, name);
    let submittedAt: Date | undefined;
    if (!hit) {
      try {
        hit = await createTemplate(apiKey, req);
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
    const status = await applyRemote({ id: customer.id, name: customer.name }, purpose, name, body, req.category, hit, { submittedAt });
    if (status === "approved") summary.approved.push(name);
    else if (status === "rejected") summary.rejected.push(name);
    else summary.pending.push(name);
  }

  // Ältere automatisch eingereichte Versionen (andere Namen) ebenfalls nachziehen.
  const current = new Set(purposes.map((p) => templateNameFor(p)));
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
 * Im WhatsApp-Cron: verbundene Konten abgleichen. Offene Prüfungen bzw. fehlende
 * Vorlagen alle 30 Minuten, sonst alle 6 Stunden (pausierte/deaktivierte erkennen).
 */
export async function syncTemplates(now = new Date(), opts: { force?: boolean; limit?: number } = {}): Promise<{ checked: number; submitted: number; rejected: number }> {
  const accounts = await prisma.whatsAppAccount.findMany({
    where: {
      status: "connected",
      apiKeyEnc: { not: null },
      ...(opts.force ? {} : { OR: [{ templatesCheckedAt: null }, { templatesCheckedAt: { lt: new Date(now.getTime() - CHECK_INTERVAL_PENDING_MS) } }] }),
    },
    select: {
      customerId: true,
      templatesCheckedAt: true,
      customer: { select: { existingCustomersEnabled: true, messageTemplates: { select: { name: true, purpose: true, status: true, auto: true } } } },
    },
    orderBy: { templatesCheckedAt: { sort: "asc", nulls: "first" } },
    take: opts.limit ?? 10,
  });
  let checked = 0;
  let submitted = 0;
  let rejected = 0;
  for (const acc of accounts) {
    const tpls = acc.customer.messageTemplates;
    const purposes = purposesFor({ bestand: acc.customer.existingCustomersEnabled });
    const settled = purposes.every((p) => tpls.some((t) => t.purpose === p && (t.status === "approved" || (!t.auto && t.status === "pending"))));
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
 * Abgelehnte Vorlage neu einreichen (aktueller Text aus SUGGESTED_TEMPLATE_TEXT).
 * Meta erlaubt einen Namen nur einmal, daher als Revision: pg_<zweck>_v1_r2, _r3 …
 */
export async function resubmitTemplate(customerId: string, purpose: NoticePurpose, now = new Date()): Promise<{ ok: boolean; name?: string; error?: string }> {
  const [account, customer] = await Promise.all([
    prisma.whatsAppAccount.findUnique({ where: { customerId }, select: { status: true, apiKeyEnc: true } }),
    prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true } }),
  ]);
  if (!customer || !account || account.status !== "connected" || !account.apiKeyEnc) return { ok: false, error: "WhatsApp ist nicht verbunden" };
  const base = templateNameFor(purpose);
  const existing = await prisma.messageTemplate.count({ where: { customerId, name: { startsWith: `${base}_r` } } });
  const name = `${base}_r${existing + 2}`;
  const advisor = advisorDisplayName(customer.name);
  const req = { ...buildTemplateRequest(purpose, advisor), name };
  try {
    const hit = await createTemplate(decryptSecret(account.apiKeyEnc), req);
    await applyRemote(customer, purpose, name, templateBodyFor(purpose, advisor), req.category, { ...hit, name }, { submittedAt: now });
    return { ok: true, name };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 200) : "Einreichen fehlgeschlagen" };
  }
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
