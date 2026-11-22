// „Ihre erste Woche“ (Ole, 20.11.2026): Angebot Pay-per-Lead + Software mit Lead-Produkt, Preis und Anzahl.
//
// Ablauf:
//   1. Annahme (lib/offers.ts acceptOffer): Kunde wählt die Anzahl (ab 5), gibt seine Registernummer an und ob jede
//      Woche wiederholt wird. Gespeichert am Angebot.
//   2. Onboarding (lib/onboarding.ts startOnboarding, nach der Bezahlseite): ersteWocheAnlegen legt den Bezug an
//      (Lieferung in die App, Wochenbestellung, Preis aus dem Angebot), übernimmt die Registernummer an den Kunden
//      (Status „zu prüfen“: Nummer da, Prüfdatum leer) und legt die erste Bestellung im Stand „wartet“ an.
//   3. Ole prüft das Register (Admin → Pay-per-Lead → Bezug → „Umsatzsteuer und Vermittlerregister“). Danach
//      wartendeFreigeben: mit Zahlungsart Abbuchung über placeOrder (Steuer nach lib/ppl/steuer.ts) und Lieferung.
//      Fehlt die Zahlungsart noch, bleibt die Bestellung „wartet“, bis sie hinterlegt ist (Stripe-Webhook).
// Bis dahin keine Lieferung: die Verteilung (lib/ppl/engine.ts) beliefert nur bezahlte Bestellungen.
// Software (349 €) läuft als eigenes Abo mit eigenen Rechnungen; Leads immer auf eigener Rechnung (chargeNow).

import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { sendToAdmins } from "@/lib/push";
import { normalizeRegisterNummer } from "@/lib/erstinformation-shared";
import { weekRange } from "@/lib/ppl/periods";
import { bestellBetrag, bezugSteuer } from "@/lib/ppl/steuer";
import { ersteWocheAus } from "@/lib/ppl/erste-woche-shared";

/** Admin-Seite zum Bezug (Registerprüfung eintragen). */
export const bezugAdminPfad = (subscriptionId: string) => `/admin/neu/leads/ppl/bezug/${subscriptionId}`;

/** Wochenende (Berlin): Freigabe am Sa/So startet mit der nächsten Woche statt mit dem Rest der laufenden. */
function berlinWochenende(now: Date): boolean {
  const wd = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short" }).format(now);
  return wd === "Sat" || wd === "Sun";
}

/**
 * Bezug und erste Bestellung aus dem angenommenen Angebot anlegen (idempotent: je Angebot höchstens einmal).
 * Gibt die Bezugs-ID zurück (null = Angebot ohne erste Woche).
 */
export async function ersteWocheAnlegen(offerId: string, customerId: string, now = new Date()): Promise<{ subscriptionId: string; orderId: string; created: boolean } | null> {
  const offer = await prisma.offer.findUnique({ where: { id: offerId } });
  if (!offer || offer.status !== "accepted") return null;
  const w = ersteWocheAus(offer);
  if (!w) return null;
  const marker = `Angebot ${offer.number}`;
  const existing = await prisma.leadSubscription.findFirst({ where: { customerId, productKey: w.productKey, label: w.label ?? marker }, include: { orders: { take: 1, orderBy: { createdAt: "asc" } } } });
  if (existing?.orders[0]) return { subscriptionId: existing.id, orderId: existing.orders[0].id, created: false };

  const sub =
    existing ??
    (await prisma.leadSubscription.create({
      data: {
        customerId,
        productKey: w.productKey,
        // Bezeichnung aus dem Angebot; ohne eigene Bezeichnung die Angebotsnummer (macht die Anlage idempotent)
        label: w.label ?? marker,
        period: "week",
        delivery: "app",
        price: w.price,
        active: true,
      },
    }));
  // Registernummer übernehmen (Status „zu prüfen“): nur, wenn noch nicht geprüft
  const nr = normalizeRegisterNummer(offer.pplRegisterNr);
  const kunde = await prisma.customer.findUnique({ where: { id: customerId }, select: { vermittlerGeprueftAt: true, vermittlerRegisterNr: true } });
  if (nr && !kunde?.vermittlerGeprueftAt) {
    await prisma.customer.update({ where: { id: customerId }, data: { vermittlerRegisterNr: nr, vermittlerRegisterStatus: null } });
  }
  const { start, end } = weekRange(now, berlinWochenende(now) ? 1 : 0);
  const betrag = bestellBetrag({ price: w.price, quantity: w.quantity, credit: 0, steuer: bezugSteuer(sub) });
  const order = await prisma.leadOrder.create({
    data: { subscriptionId: sub.id, periodStart: start, periodEnd: end, quantity: w.quantity, amount: betrag.netto, autoRenew: offer.pplAutoRenew, status: "wartet" },
  });
  await audit("ppl.erste_woche", { entity: "LeadSubscription", entityId: sub.id, customerId, actor: { role: "system" }, details: { offer: offer.number, quantity: w.quantity, price: w.price, autoRenew: offer.pplAutoRenew, registerNr: nr } });
  // Schon geprüft (Bestandskunde): gleich freigeben
  if (kunde?.vermittlerGeprueftAt) await wartendeFreigeben(customerId, { role: "system" }, now);
  return { subscriptionId: sub.id, orderId: order.id, created: true };
}

/**
 * Vorschlag für die Registernummer: geprüfte bzw. hinterlegte Nummer am Kundenkonto, sonst aus der Erstinformation
 * (diese übernimmt auch die Nummer aus dem Impressum). Ohne Kundenkonto am Kontakt: null.
 */
export async function registerVorschlag(salesContactId: string | null | undefined, customerId?: string | null): Promise<string | null> {
  const id = customerId ?? (salesContactId ? (await prisma.salesContact.findUnique({ where: { id: salesContactId }, select: { customerId: true } }))?.customerId : null);
  if (!id) return null;
  const [c, e] = await Promise.all([
    prisma.customer.findUnique({ where: { id }, select: { vermittlerRegisterNr: true } }),
    prisma.erstinformation.findUnique({ where: { customerId: id }, select: { registerNummer: true } }),
  ]);
  return normalizeRegisterNummer(c?.vermittlerRegisterNr) ?? normalizeRegisterNummer(e?.registerNummer) ?? null;
}

/** Nach der Registerprüfung (Admin): wartende Bestellungen freigeben. */
export async function registerGeprueft(customerId: string, actor?: AuditActor) {
  return wartendeFreigeben(customerId, actor);
}

export type FreigabeErgebnis = { released: number; waiting: number; failed: number; reason?: string };

/**
 * Wartende Bestellungen (Stand „wartet“) des Kunden abbuchen, wenn das Register geprüft ist und eine Zahlungsart
 * hinterlegt ist. Die Woche rückt auf die laufende (am Wochenende die nächste) vor, damit nichts rückwirkend gilt.
 */
export async function wartendeFreigeben(customerId: string, actor: AuditActor = { role: "system" }, now = new Date()): Promise<FreigabeErgebnis> {
  const orders = await prisma.leadOrder.findMany({
    // Bestellkonto (lib/ppl/bestellkonto.ts): Prüfung am Hauptkunden gibt auch die Bestellungen seiner Partner frei
    where: { status: "wartet", subscription: { active: true, period: "week", OR: [{ customerId }, { customer: { bestelltUeberId: customerId } }] } },
    orderBy: { periodStart: "asc" },
  });
  if (!orders.length) return { released: 0, waiting: 0, failed: 0 };
  const zahlerFelder = { name: true, stripeCustomerId: true, vermittlerGeprueftAt: true } as const;
  const konto = await prisma.customer.findUnique({ where: { id: customerId }, select: { ...zahlerFelder, bestelltUeber: { select: zahlerFelder } } });
  const kunde = konto?.bestelltUeber ?? konto;
  if (!kunde?.vermittlerGeprueftAt) return { released: 0, waiting: orders.length, failed: 0, reason: "Registernummer noch nicht geprüft" };
  const billing = await import("@/lib/billing");
  if (!billing.billingEnabled() || !(await billing.hasPaymentMethod(kunde.stripeCustomerId).catch(() => false))) {
    return { released: 0, waiting: orders.length, failed: 0, reason: "Zahlungsart fehlt" };
  }
  const { placeOrder } = await import("@/lib/ppl/orders");
  const offset: 0 | 1 = berlinWochenende(now) ? 1 : 0;
  const target = weekRange(now, offset);
  let released = 0;
  let failed = 0;
  for (const o of orders) {
    if (o.periodStart.getTime() < target.start.getTime()) {
      const clash = await prisma.leadOrder.findUnique({ where: { subscriptionId_periodStart: { subscriptionId: o.subscriptionId, periodStart: target.start } } });
      if (clash && clash.id !== o.id) {
        // Für die Woche gibt es schon eine Bestellung: die wartende verfällt
        await prisma.leadOrder.update({ where: { id: o.id }, data: { status: "cancelled" } });
        continue;
      }
      await prisma.leadOrder.update({ where: { id: o.id }, data: { periodStart: target.start, periodEnd: target.end } });
    }
    const weekOffset: 0 | 1 = o.periodStart.getTime() > target.start.getTime() ? 1 : offset;
    const r = await placeOrder({ subscriptionId: o.subscriptionId, weekOffset, quantity: o.quantity, autoRenew: o.autoRenew, actor, now, freigabe: true });
    if (r.ok) released++;
    else {
      failed++;
      reportError(new Error(r.error), "ppl-erste-woche-freigabe", { order: o.id });
      await sendToAdmins({ title: `⚠️ Erste Woche nicht abgebucht: ${kunde.name}`, body: r.error, url: bezugAdminPfad(o.subscriptionId) }).catch(() => {});
    }
  }
  return { released, waiting: 0, failed };
}
