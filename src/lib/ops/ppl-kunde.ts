// Diagnose q=ppl-kunde&kunde=<Kunden-ID> (Ole, 22.11.2026: Abgleich „wie viele Leads stehen noch zu“, z. B. Daniel Seidel).
// Nur lesend: Pay-per-Lead-Bezüge des Kunden, Bestellungen (Zeitraum, Menge, Status) und alle gelieferten Leads mit
// Lieferzeit, Name, PLZ/Ort und Storno (Status, Grund, Bemerkung, Zeitpunkte, Gutschrift). Keine Telefonnummern/E-Mails.
import { prisma } from "@/lib/prisma";

type Feld = { label?: string; value?: unknown };

function formFeld(formData: unknown, re: RegExp): string | null {
  if (!Array.isArray(formData)) return null;
  const f = (formData as Feld[]).find((x) => x && typeof x.label === "string" && re.test(x.label));
  return f && f.value != null ? String(f.value) : null;
}

export async function pplKunde(p: URLSearchParams) {
  const id = (p.get("kunde") ?? "").trim();
  if (!id) return { fehler: "kunde=<Kunden-ID> fehlt" };
  const c = await prisma.customer.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!c) return { fehler: "Kunde nicht gefunden" };
  const subs = await prisma.leadSubscription.findMany({
    where: { customerId: id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, productKey: true, label: true, active: true, status: true, period: true, goal: true, startDate: true, price: true,
      stornoDays: true, stornoReasons: true, stornoAutoApprove: true, createdAt: true, updatedAt: true,
      orders: { orderBy: { periodStart: "asc" }, select: { id: true, periodStart: true, periodEnd: true, quantity: true, amount: true, status: true, autoRenew: true, createdAt: true } },
    },
  });
  const leads = await prisma.lead.findMany({
    where: { customerId: id, OR: [{ subscriptionId: { not: null } }, { deliveredAt: { not: null } }] },
    orderBy: [{ deliveredAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true, airtableId: true, source: true, name: true, subscriptionId: true, orderId: true, deliveredAt: true, createdAt: true, isTest: true,
      status: true, stornoState: true, stornoReason: true, stornoNote: true, stornoRequestedAt: true, stornoDecidedAt: true, creditAmount: true,
      creditedAt: true, disqualifyReason: true, lostReason: true, lostNote: true, formData: true,
    },
  });
  return {
    kunde: c,
    bezuege: subs,
    leads: leads.map(({ formData, ...l }) => ({
      ...l,
      plz: formFeld(formData, /^(plz|postleitzahl)/i),
      ort: formFeld(formData, /^(ort|wohnort|stadt)/i),
      leadNr: formFeld(formData, /lead-?(id|nr)/i),
    })),
  };
}
