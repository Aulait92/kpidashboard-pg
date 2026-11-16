// Auslieferung eines Pay-per-Lead an den Käufer:
//   app     → Kundenbereich (Push, Team-Verteilung, ggf. WhatsApp-Assistent)
//   email   → Lead-Mail an deliveryEmail (eine oder mehrere Adressen, je Adresse eine Mail):
//             Standard (lesbar), eigene Vorlage (z. B. Heinrich von Kleist) oder
//             „Standard maschinenlesbar“ (Make-Mailhook, mit lead.json)
//   webhook → JSON an webhookUrl (z. B. Convexa), Secret im Header
// Fehler beim Zustellen → Admin-Push (und Slack-Warnung in engine.deliver); der Lead bleibt beim Käufer gespeichert.
// deliverTo() liefert ohne Datenbank aus, damit der Testdatensatz denselben Weg nimmt.

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { sendCustomerMail, sendPlainMail } from "@/lib/email";
import { sendToAdmins } from "@/lib/push";
import { decryptSecret } from "@/lib/encryption";
import { machineMail, parseAddresses } from "@/lib/ppl/lead-mail";

type Sub = Prisma.LeadSubscriptionGetPayload<object>;
type Answer = { label: string; value: string };

export type DeliveryLead = {
  id: string;
  product: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  answers: Answer[];
  /** Lieferzeitpunkt (Datum in Mail und Webhook) */
  date: Date;
  /** Eingang des Funnel-Formulars (Zeitpunkt der Einwilligung) */
  consentAt: Date | null;
  test?: boolean;
};

export type DeliveryTarget = { target: string; ok: boolean; error?: string; blocked?: boolean };
export type DeliveryReport = {
  channel: "app" | "email" | "webhook";
  /** z. B. „E-Mail (maschinenlesbar)“ */
  label: string;
  targets: DeliveryTarget[];
  ok: boolean;
  error?: string;
};

/** Art der Lead-Mail am Bezug. */
export function mailKind(sub: Pick<Sub, "emailFormat" | "emailTemplate">): "maschinenlesbar" | "vorlage" | "standard" {
  if (sub.emailFormat === "maschinenlesbar") return "maschinenlesbar";
  return sub.emailTemplate ? "vorlage" : "standard";
}

const MAIL_LABEL = { maschinenlesbar: "E-Mail (maschinenlesbar)", vorlage: "E-Mail (Vorlage)", standard: "E-Mail" } as const;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Lead über den Lieferweg des Bezugs zustellen (ohne Datenbank). Wirft nicht. */
export async function deliverTo(sub: Sub, lead: DeliveryLead): Promise<DeliveryReport> {
  const answers = lead.answers.filter((a) => a?.label && a?.value);
  const phone = lead.phone ? `+${lead.phone.replace(/^\+/, "")}` : null;
  const tag = lead.test ? "[TEST] " : "";

  if (sub.delivery === "app") {
    if (lead.test) return { channel: "app", label: "Kundenbereich", targets: [], ok: false, error: "Kein Testversand in den Kundenbereich (der Lead würde beim Kunden erscheinen)." };
    try {
      const { processNewLead } = await import("@/lib/lead-intake");
      await processNewLead(lead.id);
      return { channel: "app", label: "Kundenbereich", targets: [{ target: "Kundenbereich", ok: true }], ok: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { channel: "app", label: "Kundenbereich", targets: [{ target: "Kundenbereich", ok: false, error }], ok: false, error };
    }
  }

  if (sub.delivery === "email") {
    const kind = mailKind(sub);
    const to = parseAddresses(sub.deliveryEmail);
    if (!to.length) return { channel: "email", label: MAIL_LABEL[kind], targets: [], ok: false, error: "Keine Liefer-E-Mail am Bezug hinterlegt." };
    const tl = { id: lead.id, name: lead.name, phone: lead.phone, email: lead.email, answers };
    // Inhalt einmal bauen, dann je Adresse eine eigene Mail (Empfänger sehen sich nicht gegenseitig,
    // ein Fehler an einer Adresse hält die anderen nicht auf)
    let send: (address: string) => Promise<{ ok: boolean; error?: string; blocked?: boolean }>;
    if (kind === "maschinenlesbar") {
      const m = machineMail({ ...tl, date: lead.date, product: lead.product, consentText: sub.consentText, consentAt: lead.consentAt, test: lead.test });
      send = (address) => sendPlainMail({ to: address, subject: m.subject, text: m.text, attachments: [{ filename: m.attachment.filename, content: m.attachment.content, contentType: "application/json" }] });
    } else if (kind === "vorlage") {
      const { renderTemplate } = await import("@/lib/ppl/template");
      const text = renderTemplate(sub.emailTemplate ?? "", tl);
      const subject = `${tag}${sub.emailSubject || "Neuer Lead - Performancegrowth"}`;
      send = (address) => sendPlainMail({ to: address, subject, text: lead.test ? `TEST: Dies ist ein Testdatensatz, bitte nicht bearbeiten.\n\n${text}` : text });
    } else {
      send = (address) =>
        sendCustomerMail({
          to: address,
          subject: `${tag}Neuer Lead ${lead.product}: ${lead.name ?? "Interessent"}`.trim(),
          greeting: "Hallo,",
          paragraphs: [lead.test ? "dies ist ein Testdatensatz, bitte nicht bearbeiten." : `anbei ein neuer Lead (${lead.product || "Pay-per-Lead"}).`],
          list: [
            `Name: ${lead.name ?? "nicht angegeben"}`,
            `Telefon: ${phone ?? "nicht angegeben"}`,
            `E-Mail: ${lead.email ?? "nicht angegeben"}`,
            ...answers.map((a) => `${a.label}: ${a.value}`),
            `Lead-ID: ${lead.id}`,
          ],
          replyTo: null,
          signature: "performancegrowth",
        });
    }
    const targets: DeliveryTarget[] = [];
    for (const [i, address] of to.entries()) {
      if (i > 0) await pause(400); // Resend: wenige Anfragen je Sekunde
      const res: { ok: boolean; error?: string; blocked?: boolean } = await send(address).catch((err: unknown) => ({ ok: false, error: err instanceof Error ? err.message : String(err) }));
      targets.push({ target: address, ok: res.ok, ...(res.ok ? {} : { error: res.error }), ...(res.blocked ? { blocked: true } : {}) });
    }
    const failed = targets.filter((t) => !t.ok);
    return {
      channel: "email",
      label: MAIL_LABEL[kind],
      targets,
      ok: failed.length === 0,
      ...(failed.length ? { error: failed.map((t) => `${t.target}: ${t.error}`).join("; ") } : {}),
    };
  }

  // webhook
  if (!sub.webhookUrl) return { channel: "webhook", label: "Webhook", targets: [], ok: false, error: "Keine Webhook-Adresse am Bezug hinterlegt." };
  const [first, ...rest] = (lead.name ?? "").split(" ");
  const { templateValues } = await import("@/lib/ppl/template");
  const tv = templateValues({ id: lead.id, name: lead.name, phone: lead.phone, email: lead.email, answers });
  // Convexa: Felder wie bisher aus dem Auslieferungs-Zap; Token steckt im Pfad, kein Auth-Header.
  const convexa = {
    FirstName: tv.vorname || null,
    LastName: tv.nachname || null,
    Email: lead.email,
    Phone: phone,
    ZipCode: tv.plz || null,
    Birthday: tv.geburtsdatum || null,
    Interest: sub.productKey.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    ExternalId: lead.id,
    Message: [...(lead.test ? ["TEST: Testdatensatz, bitte nicht bearbeiten"] : []), ...answers.map((a) => `${a.label}: ${a.value}`)].join("\n") || null,
  };
  const standard = {
    id: lead.id,
    product: lead.product,
    created_at: lead.date.toISOString(),
    name: lead.name,
    first_name: first || null,
    last_name: rest.join(" ") || null,
    phone,
    email: lead.email,
    answers: Object.fromEntries(answers.map((a) => [a.label, a.value])),
    ...(lead.test ? { test: true } : {}),
  };
  const isConvexa = sub.webhookFormat === "convexa";
  const body = isConvexa ? Object.fromEntries(Object.entries(convexa).filter(([, v]) => v != null && v !== "")) : standard;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sub.webhookSecretEnc && !isConvexa) headers["X-Webhook-Secret"] = decryptSecret(sub.webhookSecretEnc);
  let error: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(sub.webhookUrl, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
      if (res.ok) {
        error = null;
        break;
      }
      error = `HTTP ${res.status}`;
      if (res.status < 500) break;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    await pause(1000 * (attempt + 1));
  }
  let host = sub.webhookUrl;
  try {
    host = new URL(sub.webhookUrl).host;
  } catch {}
  const label = isConvexa ? "Webhook (Convexa)" : "Webhook";
  return { channel: "webhook", label, targets: [{ target: host, ok: !error, ...(error ? { error } : {}) }], ok: !error, ...(error ? { error: `Webhook: ${error}` } : {}) };
}

/** Gespeicherten Lead ausliefern; bei Fehler Admin-Push. Wirft nicht, das Ergebnis geht an Slack. */
export async function sendDelivery(leadId: string, sub: Sub): Promise<DeliveryReport> {
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    select: { id: true, name: true, phone: true, email: true, source: true, formData: true, deliveredAt: true },
  });
  const pool = await prisma.poolLead.findUnique({ where: { leadId }, select: { createdAt: true } });
  const answers = (Array.isArray(lead.formData) ? (lead.formData as Answer[]) : []).filter((a) => a?.label && a?.value);
  const report = await deliverTo(sub, {
    id: lead.id,
    product: lead.source ?? sub.productKey,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    answers,
    date: lead.deliveredAt ?? new Date(),
    consentAt: pool?.createdAt ?? null,
  });
  if (report.channel !== "app" && report.targets.some((t) => t.ok)) {
    await prisma.lead.update({ where: { id: lead.id }, data: { emailedAt: new Date() } });
  }
  if (!report.ok) {
    await sendToAdmins({
      title: "⚠️ Lead nicht zugestellt",
      body: `${sub.label ?? sub.productKey}: ${report.error ?? "unbekannter Fehler"}. Lead ist gespeichert, bitte von Hand nachliefern.`,
      url: `/admin/ppl`,
      tag: `ppl-fail:${sub.id}`,
    }).catch(() => {});
  }
  return report;
}
