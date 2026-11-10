// Auslieferung eines Pay-per-Lead an den Käufer:
//   app     → Kundenbereich (Push, Team-Verteilung, ggf. WhatsApp-Assistent)
//   email   → Lead-Mail an deliveryEmail (z. B. Heinrich von Kleist)
//   webhook → JSON an webhookUrl (z. B. Convexa), Secret im Header
// Fehler beim Zustellen → Admin-Push; der Lead bleibt beim Käufer gespeichert.

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { sendCustomerMail } from "@/lib/email";
import { sendToAdmins } from "@/lib/push";
import { decryptSecret } from "@/lib/encryption";

type Sub = Prisma.LeadSubscriptionGetPayload<object>;
type Answer = { label: string; value: string };

export async function sendDelivery(leadId: string, sub: Sub): Promise<void> {
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    select: { id: true, name: true, phone: true, email: true, source: true, formData: true, deliveredAt: true, customer: { select: { name: true } } },
  });
  const answers = (Array.isArray(lead.formData) ? (lead.formData as Answer[]) : []).filter((a) => a?.label && a?.value);
  const phone = lead.phone ? `+${lead.phone.replace(/^\+/, "")}` : null;

  if (sub.delivery === "app") {
    const { processNewLead } = await import("@/lib/lead-intake");
    await processNewLead(lead.id);
    return;
  }

  if (sub.delivery === "email") {
    const to = (sub.deliveryEmail ?? "").split(/[,;\s]+/).filter(Boolean);
    if (!to.length) throw new Error("Keine Liefer-E-Mail am Bezug hinterlegt.");
    if (sub.emailTemplate) {
      const { renderTemplate } = await import("@/lib/ppl/template");
      const { sendPlainMail } = await import("@/lib/email");
      const res = await sendPlainMail({
        to,
        subject: sub.emailSubject || "Neuer Lead - Performancegrowth",
        text: renderTemplate(sub.emailTemplate, { id: lead.id, name: lead.name, phone: lead.phone, email: lead.email, answers }),
      });
      if (!res.ok) return fail(lead.id, sub, `E-Mail: ${res.error}`);
      await prisma.lead.update({ where: { id: lead.id }, data: { emailedAt: new Date() } });
      return;
    }
    const res = await sendCustomerMail({
      to,
      subject: `Neuer Lead ${lead.source ?? ""}: ${lead.name ?? "Interessent"}`.trim(),
      greeting: "Hallo,",
      paragraphs: [`anbei ein neuer Lead (${lead.source ?? "Pay-per-Lead"}).`],
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
    if (!res.ok) return fail(lead.id, sub, `E-Mail: ${res.error}`);
    await prisma.lead.update({ where: { id: lead.id }, data: { emailedAt: new Date() } });
    return;
  }

  if (sub.delivery === "webhook") {
    if (!sub.webhookUrl) throw new Error("Keine Webhook-Adresse am Bezug hinterlegt.");
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
      Message: answers.map((a) => `${a.label}: ${a.value}`).join("\n") || null,
    };
    const standard = {
      id: lead.id,
      product: lead.source,
      created_at: (lead.deliveredAt ?? new Date()).toISOString(),
      name: lead.name,
      first_name: first || null,
      last_name: rest.join(" ") || null,
      phone,
      email: lead.email,
      answers: Object.fromEntries(answers.map((a) => [a.label, a.value])),
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
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
    if (error) return fail(lead.id, sub, `Webhook: ${error}`);
    await prisma.lead.update({ where: { id: lead.id }, data: { emailedAt: new Date() } });
  }
}

async function fail(leadId: string, sub: Sub, msg: string) {
  await sendToAdmins({
    title: "⚠️ Lead nicht zugestellt",
    body: `${sub.label ?? sub.productKey}: ${msg}. Lead ist gespeichert, bitte von Hand nachliefern.`,
    url: `/admin/ppl`,
    tag: `ppl-fail:${sub.id}`,
  }).catch(() => {});
  throw new Error(`${msg} (Lead ${leadId})`);
}
