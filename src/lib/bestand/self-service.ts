// Bestandskunden-Modul im Kundenbereich selbst buchen und kündigen.
// Gebucht wird über dieselbe Logik wie im Admin (setBestandModule): Stripe-Abo-Position
// „Bestandskunden-Modul“, anteilig ab heute. Ohne laufendes Abo mit Zahlungsart (oder bei
// Nur-Betreuung / Zahlungsverzug) bleibt der bisherige Weg „Modul anfragen“.
import { prisma } from "@/lib/prisma";
import { PRICE_LIST, eur } from "@/lib/offer-pricing";
import { PROVIDER } from "@/lib/legal-texts";
import { sendCustomerMail, getAppUrl } from "@/lib/email";
import { sendToAdmins } from "@/lib/push";
import { reportError } from "@/lib/monitoring";
import { scheduleBestandCancel, selfServiceBillingBlocker, setBestandModule } from "@/lib/billing";
import type { AuditActor } from "@/lib/audit";
import { bestandTerms } from "@/lib/bestand/terms";

export type SelfBookCustomer = {
  plan: string | null;
  paymentOverdueSince: Date | null;
  existingCustomersEnabled: boolean;
  bestandCancelAt?: Date | null;
};

/** Gründe ohne Stripe-Abfrage (rein aus der Kundenakte). null = weiter prüfen. */
export function selfBookBlocker(c: SelfBookCustomer): string | null {
  if (c.plan === "service") return "Das Modul gibt es nur im Paket mit Software.";
  if (c.paymentOverdueSince) return "Es ist noch eine Rechnung offen.";
  if (c.existingCustomersEnabled && !c.bestandCancelAt) return "Das Modul ist bereits gebucht.";
  return null;
}

/** Darf der Kunde das Modul jetzt selbst buchen? Sonst Grund (→ Anfrage-Weg). */
export async function canSelfBookBestand(customerId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { plan: true, paymentOverdueSince: true, existingCustomersEnabled: true, bestandCancelAt: true, stripeCustomerId: true },
  });
  if (!c) return { ok: false, reason: "Konto nicht gefunden." };
  const local = selfBookBlocker(c);
  if (local) return { ok: false, reason: local };
  const billing = await selfServiceBillingBlocker(c.stripeCustomerId);
  return billing ? { ok: false, reason: billing } : { ok: true };
}

const fmtDate = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

/** Selbst buchen (bzw. eine Kündigung zurücknehmen). Prüft alle Voraussetzungen erneut. */
export async function selfBookBestand(customerId: string, actor: AuditActor & { email?: string | null }): Promise<{ ok: true } | { ok: false; error: string; fallback?: boolean }> {
  const check = await canSelfBookBestand(customerId);
  if (!check.ok) return { ok: false, error: check.reason, fallback: true };
  const before = await prisma.customer.findUnique({ where: { id: customerId }, select: { name: true, bestandCancelAt: true, billingInterval: true } });
  if (!before) return { ok: false, error: "Konto nicht gefunden." };
  const withdraw = !!before.bestandCancelAt && before.bestandCancelAt > new Date();
  // Kündigung zurückgenommen: laufender Zeitraum ist bezahlt → Position ohne anteilige Berechnung
  const res = await setBestandModule(customerId, "book", { requireStripe: true, proration: withdraw ? "none" : "create_prorations", actor });
  if (!res.ok) return { ok: false, error: res.error, fallback: true };
  const price = PRICE_LIST.bestandModuleMonthly;
  const terms = bestandTerms({ annual: before.billingInterval === "year", monthlyNet: price, freeMonths: PRICE_LIST.annualFreeMonths });
  await notify({
    customerId,
    name: before.name,
    email: actor.email ?? null,
    adminTitle: withdraw ? `Modul-Kündigung zurückgenommen: ${before.name}` : `Bestandskunden-Modul selbst gebucht: ${before.name}`,
    adminBody: withdraw ? "Bestandskunden-Modul läuft weiter" : `${eur(price)} netto im Monat, Stripe-Abo angepasst${res.note ? ` (${res.note.replace(/\.$/, "")})` : ""}`,
    customerSubject: withdraw ? "Ihr Bestandskunden-Modul läuft weiter" : "Ihr Bestandskunden-Modul ist gebucht",
    customerParagraphs: withdraw
      ? ["Ihre Kündigung des Bestandskunden-Moduls ist zurückgenommen. Das Modul läuft wie bisher weiter."]
      : [
          `vielen Dank – das Bestandskunden-Modul ist ab sofort für Sie freigeschaltet (${eur(price)} netto im Monat). ${
            res.note?.startsWith("Berechnet ab Abo-Start") ? res.note.replace(/\.$/, "") : terms.charge
          }. ${terms.cancel}.`,
          `Laden Sie jetzt Ihre Kundenliste hoch: Die App zeigt Ihnen Lücken, Jahresgespräche, Geburtstage und auslaufende Verträge. WhatsApp-Gebühren für bis zu ${PRICE_LIST.bestandIncludedMessages} Kampagnen-Nachrichten im Monat sind inklusive.`,
        ],
  });
  return { ok: true };
}

/** Selbst kündigen – zum Ende des Abrechnungszeitraums. */
export async function selfCancelBestand(customerId: string, actor: AuditActor & { email?: string | null }): Promise<{ ok: true; until: Date } | { ok: false; error: string }> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { name: true, bestandCancelAt: true, bestandMonthly: true, existingCustomersEnabled: true } });
  if (!c) return { ok: false, error: "Konto nicht gefunden." };
  if (!c.existingCustomersEnabled || c.bestandMonthly == null) return { ok: false, error: "Das Modul ist nicht gebucht – bitte bei uns melden." };
  if (c.bestandCancelAt) return { ok: true, until: c.bestandCancelAt };
  const res = await scheduleBestandCancel(customerId, actor);
  if (!res.ok) return res;
  await notify({
    customerId,
    name: c.name,
    email: actor.email ?? null,
    adminTitle: `Bestandskunden-Modul gekündigt: ${c.name}`,
    adminBody: `Zum ${fmtDate(res.until)}${res.note ? ` · ${res.note}` : ""}`,
    customerSubject: "Kündigung Ihres Bestandskunden-Moduls",
    customerParagraphs: [
      `wir bestätigen die Kündigung des Bestandskunden-Moduls zum ${fmtDate(res.until)}. Bis dahin können Sie es wie gewohnt nutzen, danach wird es nicht mehr berechnet.`,
      "Sie können die Kündigung bis dahin jederzeit im Kundenbereich unter „Konto & Rechnungen“ zurücknehmen.",
    ],
  });
  return { ok: true, until: res.until };
}

async function notify(o: {
  customerId: string;
  name: string;
  email: string | null;
  adminTitle: string;
  adminBody: string;
  customerSubject: string;
  customerParagraphs: string[];
}) {
  await sendToAdmins({ title: o.adminTitle, body: o.adminBody, url: `/admin/kunden/${o.customerId}/abrechnung`, tag: `bestand-self:${o.customerId}` }).catch((err) =>
    reportError(err, "bestand-self-push"),
  );
  const adminMail = process.env.ADMIN_EMAIL?.trim() || PROVIDER.email;
  await sendCustomerMail({
    to: adminMail,
    subject: o.adminTitle,
    greeting: "Hallo,",
    paragraphs: [`${o.name}${o.email ? ` (${o.email})` : ""}: ${o.adminBody}.`, "Selbst im Kundenbereich ausgelöst – nichts weiter zu tun."],
    signature: PROVIDER.brand,
    replyTo: o.email,
  }).catch((err) => reportError(err, "bestand-self-admin-mail"));
  if (o.email) {
    let url: string | null = null;
    try {
      url = `${getAppUrl()}/buyer/bestand`;
    } catch {
      url = null; // ohne APP_URL (z. B. Tests) Mail ohne Knopf
    }
    await sendCustomerMail({
      to: o.email,
      subject: o.customerSubject,
      greeting: "Guten Tag,",
      paragraphs: o.customerParagraphs,
      ...(url ? { button: { label: "Zum Bestand", url } } : {}),
    }).catch((err) => reportError(err, "bestand-self-customer-mail"));
  }
}
