// Diagnose-Abfrage „angebot“ (Ole, 23.11.2026: doppelt angenommene Angebote prüfen). Nur lesend.
//   GET /api/ops/diagnose?q=angebot&nummer=PG-2026-0164   (alle Angebote desselben Kontakts bzw. derselben E-Mail)
// Gibt je Angebot Status, Version, Annahme (Zeit, Name, Firma, IP gekürzt), Zahlung und Stripe-Bezug aus, dazu die
// Annahme-Einträge im Audit-Log.

import { prisma } from "@/lib/prisma";

const ipKurz = (ip: string | null) => (ip ? ip.replace(/(\d+\.\d+)\.\d+\.\d+/, "$1.x.x").slice(0, 40) : null);

export async function angebotDiagnose(p: URLSearchParams) {
  const nummer = (p.get("nummer") ?? "").trim();
  if (!nummer) return { fehler: "nummer=<Angebotsnummer> fehlt" };
  const o = await prisma.offer.findFirst({ where: { number: nummer }, select: { id: true, salesContactId: true, email: true } });
  if (!o) return { gefunden: false };
  const or = [{ id: o.id }, ...(o.salesContactId ? [{ salesContactId: o.salesContactId }] : []), ...(o.email ? [{ email: o.email }] : [])];
  const offers = await prisma.offer.findMany({
    where: { OR: or },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, number: true, version: true, status: true, company: true, contactName: true, createdAt: true, sentAt: true,
      acceptedAt: true, acceptedName: true, acceptedCompany: true, acceptedIp: true, monthlyFee: true, setupFee: true,
      paymentStatus: true, stripeCustomerId: true, stripeCheckoutSessionId: true, stripeSubscriptionId: true, salesContactId: true, isTest: true,
    },
  });
  const audits = await prisma.auditLog.findMany({
    where: { entity: "Offer", entityId: { in: offers.map((x) => x.id) } },
    orderBy: { at: "asc" },
    select: { at: true, action: true, actorEmail: true, actorRole: true, entityId: true, details: true },
    take: 200,
  });
  const nr = new Map(offers.map((x) => [x.id, x.number]));
  return {
    angebote: offers.map((x) => ({ ...x, acceptedIp: ipKurz(x.acceptedIp), monthlyFee: Number(x.monthlyFee), setupFee: Number(x.setupFee), stripeCustomerId: !!x.stripeCustomerId, stripeCheckoutSessionId: !!x.stripeCheckoutSessionId, stripeSubscriptionId: !!x.stripeSubscriptionId })),
    verlauf: audits.map((a) => {
      const d = (a.details ?? {}) as Record<string, unknown>;
      return { at: a.at, action: a.action, angebot: nr.get(a.entityId ?? "") ?? null, rolle: a.actorRole, wer: a.actorEmail, name: d.name ?? null, ip: ipKurz(typeof d.ip === "string" ? d.ip : null), company: d.company ?? null };
    }),
  };
}
