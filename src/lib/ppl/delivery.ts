// Auslieferung eines Pay-per-Lead an den Käufer:
//   app     → Kundenbereich (Push, Team-Verteilung, ggf. WhatsApp-Assistent)
//   app_pdf → wie app, danach je Adresse in deliveryEmail eine Mail mit dem Lead als PDF
//             (Kunden mit Login, die das PDF wie früher aus dem Zap per Mail wollen). Ein Mailfehler
//             macht die Lieferung in den Kundenbereich nicht rückgängig. Test: nur die PDF-Mail.
//   email   → Lead-Mail an deliveryEmail (eine oder mehrere Adressen, je Adresse eine Mail):
//             Standard (lesbar), eigene Vorlage (z. B. Heinrich von Kleist) oder
//             „Standard maschinenlesbar“ (Make-Mailhook, mit lead.json)
//   webhook → JSON an webhookUrl (z. B. Convexa), Secret im Header
// Fehler beim Zustellen → Admin-Push (und Slack-Warnung in engine.deliver); der Lead bleibt beim Käufer gespeichert.
// deliverTo() liefert ohne Datenbank aus, damit der Testdatensatz denselben Weg nimmt.

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { sendCustomerMail, sendPlainMail, sendPlainMailLatin1 } from "@/lib/email";
import { sendToAdmins } from "@/lib/push";
import { decryptSecret } from "@/lib/encryption";
import { isContactLabel, machineMail, parseAddresses } from "@/lib/ppl/lead-mail";
import { poolEinwilligung, type PoolEinwilligung } from "@/lib/ppl/einwilligung-nachweis";

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
  /**
   * Einwilligungsnachweis aus dem eigenen Funnel (PoolLead.consentData, L3): geht statt LeadSubscription.consentText
   * an den Abnehmer (Wortlaut, Fassung, Zeitpunkt, Kanäle, Knopf)
   */
  consent?: PoolEinwilligung | null;
  /** SMS-Bestätigung im Funnel (PoolLead.smsVerified), Abzeichen im PDF */
  smsVerified?: boolean;
  test?: boolean;
};

/** hinweis: zugestellt, aber mit Vorbehalt (z. B. Pivacom über Resend, weil das Versand-Postfach nicht verbunden ist) */
export type DeliveryTarget = { target: string; ok: boolean; error?: string; blocked?: boolean; hinweis?: string };
export type DeliveryChannel = "app" | "app_pdf" | "email" | "webhook";
export type DeliveryReport = {
  channel: DeliveryChannel;
  /** z. B. „E-Mail (maschinenlesbar)“ */
  label: string;
  targets: DeliveryTarget[];
  ok: boolean;
  error?: string;
  /** Hinweis trotz Zustellung (Admin-Push, Slack), z. B. „Versand-Postfach nicht verbunden“ */
  hinweis?: string;
};

/** Art der Lead-Mail am Bezug. */
export function mailKind(sub: Pick<Sub, "emailFormat" | "emailTemplate">): "maschinenlesbar" | "vorlage" | "standard" {
  if (sub.emailFormat === "maschinenlesbar") return "maschinenlesbar";
  return sub.emailTemplate ? "vorlage" : "standard";
}

const MAIL_LABEL = { maschinenlesbar: "E-Mail (maschinenlesbar)", vorlage: "E-Mail (Vorlage)", standard: "E-Mail" } as const;
/** Ziel „Kundenbereich“ in Bericht und Slack (keine Adresse). */
export const APP_TARGET = "Kundenbereich";
export const APP_PDF_LABEL = "Kundenbereich + PDF per Mail";
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

type SendResult = { ok: boolean; error?: string; blocked?: boolean; hinweis?: string };
type SendFn = (address: string) => Promise<SendResult>;

/** Je Adresse eine eigene Mail (Empfänger sehen sich nicht, ein Fehler hält die anderen nicht auf). */
async function sendEach(to: string[], send: SendFn): Promise<DeliveryTarget[]> {
  const targets: DeliveryTarget[] = [];
  for (const [i, address] of to.entries()) {
    if (i > 0) await pause(400); // Resend: wenige Anfragen je Sekunde
    const res: SendResult = await send(address).catch((err: unknown) => ({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    targets.push({ target: address, ok: res.ok, ...(res.ok ? {} : { error: res.error }), ...(res.blocked ? { blocked: true } : {}), ...(res.hinweis ? { hinweis: res.hinweis } : {}) });
  }
  return targets;
}

export const VERSAND_NICHT_VERBUNDEN = "Versand-Postfach nicht verbunden";

/**
 * Latin-1-Mail (Pivacom): über das Microsoft-365-Versand-Postfach (lib/ppl/versand-postfach.ts), weil Resend den
 * Zeichensatz auf utf-8 umschreibt. Ist es nicht verbunden: wie bisher über Resend-SMTP, mit Hinweis bzw. Fehlertext.
 */
async function sendLatin1(mail: { to: string; subject: string; text: string }): Promise<SendResult> {
  const v = await import("@/lib/ppl/versand-postfach");
  if (await v.versandPostfachVerbunden()) return v.sendViaVersandPostfach(mail);
  const r = await sendPlainMailLatin1(mail);
  if (r.blocked) return r;
  const hinweis = `${VERSAND_NICHT_VERBUNDEN}, über Resend gesendet (Pivacom lehnt das wahrscheinlich ab)`;
  return r.ok ? { ok: true, hinweis } : { ok: false, error: `${VERSAND_NICHT_VERBUNDEN}, Ersatzweg Resend: ${r.error ?? "Fehler"}` };
}

/**
 * Rückmeldung mit einem Klick (Ole, 25.11.2026, lib/ppl/rueckmeldung.ts): drei Knöpfe je Lead in der lesbaren Lead-Mail
 * und in der PDF-Mail. Nicht in Vorlagen und maschinenlesbaren Mails (die liest ein System aus), nicht bei Tests,
 * nicht ohne App-Adresse bzw. AUTH_SECRET (lokal).
 */
export async function rueckmeldungBlock(sub: Pick<Sub, "customerId">, lead: Pick<DeliveryLead, "id" | "test">): Promise<{ html: string; text: string[] } | null> {
  if (lead.test) return null;
  try {
    const { getAppUrl } = await import("@/lib/email");
    const { rueckmeldungMailBlock } = await import("@/lib/ppl/rueckmeldung");
    const { rueckmeldungToken } = await import("@/lib/ppl/rueckmeldung-token");
    return rueckmeldungMailBlock(getAppUrl(), rueckmeldungToken(lead.id, sub.customerId));
  } catch {
    return null;
  }
}

const failText = (targets: DeliveryTarget[]) =>
  targets
    .filter((t) => !t.ok)
    .map((t) => `${t.target}: ${t.error}`)
    .join("; ");

/** Lead in den Kundenbereich (Push, Team, WhatsApp-Assistent). */
async function deliverApp(leadId: string): Promise<DeliveryTarget> {
  try {
    const { processNewLead } = await import("@/lib/lead-intake");
    await processNewLead(leadId);
    return { target: APP_TARGET, ok: true };
  } catch (err) {
    return { target: APP_TARGET, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Lead-PDF an alle Adressen des Bezugs (kurze Mail, PDF im Anhang). */
async function sendPdfMails(sub: Sub, lead: DeliveryLead, answers: Answer[]): Promise<DeliveryTarget[] | string> {
  const to = parseAddresses(sub.deliveryEmail);
  if (!to.length) return "Keine Liefer-E-Mail für das PDF am Bezug hinterlegt.";
  const { leadPdf, leadPdfMail, leadPdfName } = await import("@/lib/ppl/lead-pdf");
  const c = einwilligungFuer(sub, lead);
  const pdf = Buffer.from(await leadPdf({ ...lead, answers, consentText: c.text, consentAt: c.at, consentDetail: c.detail }));
  const filename = `${lead.test ? "TEST_" : ""}${leadPdfName(lead)}`;
  const mail = leadPdfMail(lead);
  // Rückmeldung mit einem Klick nach den Schlusssätzen
  const rm = await rueckmeldungBlock(sub, lead);
  if (rm) {
    mail.html = `${mail.html}${rm.html}`;
    mail.textBlocks = [...mail.textBlocks, "", ...rm.text];
  }
  return sendEach(to, (address) =>
    sendCustomerMail({
      to: address,
      ...mail,
      replyTo: null,
      signature: "performancegrowth",
      attachments: [{ filename, content: pdf, contentType: "application/pdf" }],
    }),
  );
}

/**
 * Einwilligung, die an den Abnehmer geht: Nachweis am Lead (eigener Funnel, L3) vor dem Text am Bezug.
 * detail = Fassung und Kanäle (nur mit Nachweis).
 */
export function einwilligungFuer(sub: Pick<Sub, "consentText">, lead: Pick<DeliveryLead, "consent" | "consentAt">): { text: string | null; at: Date | null; detail: string | null; nachweis: PoolEinwilligung | null } {
  const n = lead.consent ?? null;
  if (!n) return { text: sub.consentText, at: lead.consentAt, detail: null, nachweis: null };
  const detail = [n.version && `Fassung ${n.version}`, n.kanaele.length && `Kanäle: ${n.kanaele.join(", ")}`].filter(Boolean).join(" · ") || null;
  return { text: n.text, at: new Date(n.at), detail, nachweis: n };
}

/** Lead über den Lieferweg des Bezugs zustellen (ohne Datenbank). Wirft nicht. */
export async function deliverTo(sub: Sub, lead: DeliveryLead): Promise<DeliveryReport> {
  const answers = lead.answers.filter((a) => a?.label && a?.value);
  const phone = lead.phone ? `+${lead.phone.replace(/^\+/, "")}` : null;
  const tag = lead.test ? "[TEST] " : "";
  const einw = einwilligungFuer(sub, lead);

  if (sub.delivery === "app") {
    if (lead.test) return { channel: "app", label: "Kundenbereich", targets: [], ok: false, error: "Kein Testversand in den Kundenbereich (der Lead würde beim Kunden erscheinen)." };
    const t = await deliverApp(lead.id);
    return { channel: "app", label: "Kundenbereich", targets: [t], ok: t.ok, ...(t.ok ? {} : { error: t.error }) };
  }

  if (sub.delivery === "app_pdf") {
    // Test: nie in den Kundenbereich, nur die PDF-Mail
    const app = lead.test ? null : await deliverApp(lead.id);
    const mails = await sendPdfMails(sub, lead, answers).catch((err: unknown) => `PDF-Mail: ${err instanceof Error ? err.message : String(err)}`);
    const targets = [...(app ? [app] : []), ...(typeof mails === "string" ? [] : mails)];
    const errors = [
      ...(app && !app.ok ? [`Kundenbereich: ${app.error}`] : []),
      ...(typeof mails === "string" ? [mails] : failText(mails) ? [`PDF-Mail: ${failText(mails)}`] : []),
    ];
    return { channel: "app_pdf", label: APP_PDF_LABEL, targets, ok: errors.length === 0, ...(errors.length ? { error: errors.join("; ") } : {}) };
  }

  if (sub.delivery === "email") {
    const kind = mailKind(sub);
    const to = parseAddresses(sub.deliveryEmail);
    if (!to.length) return { channel: "email", label: MAIL_LABEL[kind], targets: [], ok: false, error: "Keine Liefer-E-Mail am Bezug hinterlegt." };
    const tl = {
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      answers,
      consent: einw.nachweis ? { text: einw.nachweis.text, at: einw.nachweis.at, version: einw.nachweis.version, kanaele: einw.nachweis.kanaele } : null,
    };
    // Inhalt einmal bauen, dann je Adresse eine eigene Mail (Empfänger sehen sich nicht gegenseitig,
    // ein Fehler an einer Adresse hält die anderen nicht auf)
    let send: SendFn;
    if (kind === "maschinenlesbar") {
      const n = einw.nachweis;
      const m = machineMail({
        ...tl,
        date: lead.date,
        product: lead.product,
        consentText: einw.text,
        consentAt: einw.at,
        ...(n ? { consentVersion: n.version, consentChannels: n.kanaele, consentButton: n.knopf, consentFunnel: n.funnel } : {}),
        test: lead.test,
      });
      send = (address) => sendPlainMail({ to: address, subject: m.subject, text: m.text, attachments: [{ filename: m.attachment.filename, content: m.attachment.content, contentType: "application/json" }] });
    } else if (kind === "vorlage") {
      const { renderTemplate } = await import("@/lib/ppl/template");
      const text = renderTemplate(sub.emailTemplate ?? "", tl);
      const subject = `${tag}${sub.emailSubject || "Neuer Lead - Performancegrowth"}`;
      const body = lead.test ? `TEST: Dies ist ein Testdatensatz, bitte nicht bearbeiten.\n\n${text}` : text;
      // Pivacom (HvK) nimmt nur ISO-8859-1 an (Ole, 17.11.2026): für diese Empfänger eigene Latin-1-Mail
      const { brauchtLatin1 } = await import("@/lib/mail/latin1");
      send = (address) => (brauchtLatin1(address) ? sendLatin1({ to: address, subject, text: body }) : sendPlainMail({ to: address, subject, text: body }));
    } else {
      const rm = await rueckmeldungBlock(sub, lead);
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
            ...answers.filter((a) => !isContactLabel(a.label)).map((a) => `${a.label}: ${a.value}`),
            ...(einw.nachweis ? [`Einwilligung (${einw.detail ?? ""}, ${einw.nachweis.at}): „${einw.nachweis.text}“`] : []),
            `Lead-ID: ${lead.id}`,
          ],
          ...(rm ? { html: rm.html, textBlocks: rm.text } : {}),
          replyTo: null,
          signature: "performancegrowth",
        });
    }
    const targets = await sendEach(to, send);
    const error = failText(targets);
    const hinweis = [...new Set(targets.flatMap((t) => (t.hinweis ? [`${t.target}: ${t.hinweis}`] : [])))].join("; ");
    return { channel: "email", label: MAIL_LABEL[kind], targets, ok: !error, ...(error ? { error } : {}), ...(hinweis ? { hinweis } : {}) };
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
    Message:
      [
        ...(lead.test ? ["TEST: Testdatensatz, bitte nicht bearbeiten"] : []),
        ...answers.map((a) => `${a.label}: ${a.value}`),
        ...(einw.nachweis ? [`Einwilligung (${einw.detail ?? ""}, ${einw.nachweis.at}): ${einw.nachweis.text}`] : []),
      ].join("\n") || null,
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
    ...(einw.nachweis
      ? { consent: { text: einw.nachweis.text, version: einw.nachweis.version, at: einw.nachweis.at, channels: einw.nachweis.kanaele, button: einw.nachweis.knopf, funnel: einw.nachweis.funnel } }
      : {}),
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
  const pool = await prisma.poolLead.findUnique({ where: { leadId }, select: { createdAt: true, smsVerified: true, consentData: true } });
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
    consent: poolEinwilligung(pool?.consentData),
    smsVerified: pool?.smsVerified ?? false,
  });
  // emailedAt: Lead ging per Mail/Webhook raus (bei app_pdf zählt nur die PDF-Mail, nicht der Kundenbereich)
  if (report.channel !== "app" && report.targets.some((t) => t.ok && t.target !== APP_TARGET)) {
    await prisma.lead.update({ where: { id: lead.id }, data: { emailedAt: new Date() } });
  }
  if (!report.ok) {
    await sendToAdmins({
      title: "⚠️ Lead nicht zugestellt",
      body: `${sub.label ?? sub.productKey}: ${report.error ?? "unbekannter Fehler"}. Lead ist gespeichert, bitte von Hand nachliefern.`,
      url: `/admin/neu/leads/ppl`,
      tag: `ppl-fail:${sub.id}`,
    }).catch(() => {});
  } else if (report.hinweis) {
    await sendToAdmins({
      title: `⚠️ ${VERSAND_NICHT_VERBUNDEN}`,
      body: `${sub.label ?? sub.productKey}: ${report.hinweis}. Bitte unter Pay-per-Lead › HvK-Abrechnungen verbinden und den Lead nochmal zustellen.`,
      url: `/admin/neu/leads/ppl?ansicht=hvk`,
      tag: "ppl-versand-postfach",
    }).catch(() => {});
  }
  return report;
}
