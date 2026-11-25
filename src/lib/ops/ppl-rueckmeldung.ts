// Diagnose q=ppl-rueckmeldung[&produkt=PKV-Tarifoptimierung&tage=30] (Ole, 21.11.2026: „ob alle Vermittler von PKV die
// Leads auf erreicht und Termin ziehen“). Je Kunde mit aktivem Bezug: gelieferte Leads im Zeitraum, davon mit Status-
// wechsel, erreicht, Termin, Abschluss, Storno, dazu letzte Anmeldung. Nur Zahlen, keine Namen von Leads.
// Dazu (25.11.2026, lib/ppl/rueckmeldung.ts): Rückmeldungen mit einem Tipp je Weg (Liefer-E-Mail ohne Login, Leadliste)
// und überfällige Wiedervorlagen (älter als 24 Stunden).
import { prisma } from "@/lib/prisma";

const DAY = 86_400_000;

export async function pplRueckmeldung(p: URLSearchParams) {
  const produkt = (p.get("produkt") ?? "PKV-Tarifoptimierung").trim();
  const tage = Math.min(180, Math.max(1, Number(p.get("tage")) || 30));
  const seit = new Date(Date.now() - tage * DAY);
  const subs = await prisma.leadSubscription.findMany({
    where: { productKey: produkt, active: true },
    select: { id: true, delivery: true, customerId: true, customer: { select: { name: true, isTest: true, users: { select: { lastLoginAt: true } } } } },
  });
  const jeKunde = new Map<string, { kunde: string; lieferung: string[]; subs: string[]; letzteAnmeldung: Date | null }>();
  for (const s of subs) {
    if (s.customer.isTest) continue;
    const k = jeKunde.get(s.customerId) ?? { kunde: s.customer.name, lieferung: [], subs: [], letzteAnmeldung: null };
    if (!k.lieferung.includes(s.delivery)) k.lieferung.push(s.delivery);
    k.subs.push(s.id);
    for (const u of s.customer.users) if (u.lastLoginAt && (!k.letzteAnmeldung || u.lastLoginAt > k.letzteAnmeldung)) k.letzteAnmeldung = u.lastLoginAt;
    jeKunde.set(s.customerId, k);
  }
  const out = [];
  for (const [customerId, k] of jeKunde) {
    const leads = await prisma.lead.findMany({
      where: { customerId, subscriptionId: { in: k.subs }, deliveredAt: { gte: seit }, isTest: false },
      select: { status: true, reached: true, closedAt: true, stornoState: true, deliveredAt: true, statusChangedAt: true, firstContactAt: true, kaeuferRueckmeldungQuelle: true, followUpAt: true, _count: { select: { appointments: true } } },
    });
    const n = leads.length;
    const statusGeaendert = leads.filter((l) => l.deliveredAt && l.statusChangedAt.getTime() - l.deliveredAt.getTime() > 60_000).length;
    const status: Record<string, number> = {};
    for (const l of leads) status[l.status ?? "(leer)"] = (status[l.status ?? "(leer)"] ?? 0) + 1;
    out.push({
      kunde: k.kunde,
      lieferung: k.lieferung,
      letzteAnmeldung: k.letzteAnmeldung,
      geliefert: n,
      statusGeaendert,
      erreicht: leads.filter((l) => l.reached).length,
      ersterKontakt: leads.filter((l) => l.firstContactAt).length,
      termin: leads.filter((l) => l._count.appointments > 0 || /termin/i.test(l.status ?? "")).length,
      abschluss: leads.filter((l) => l.closedAt).length,
      storno: leads.filter((l) => l.stornoState).length,
      rueckmeldungMail: leads.filter((l) => l.kaeuferRueckmeldungQuelle === "mail").length,
      rueckmeldungApp: leads.filter((l) => l.kaeuferRueckmeldungQuelle === "app").length,
      wiedervorlageUeber24h: leads.filter((l) => l.followUpAt && l.followUpAt.getTime() < Date.now() - DAY && !l.closedAt).length,
      status,
    });
  }
  return { produkt, tage, kunden: out.sort((a, b) => b.geliefert - a.geliefert) };
}
