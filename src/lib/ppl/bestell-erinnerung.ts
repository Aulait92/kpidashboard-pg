// Donnerstags-Erinnerung (Ole, 22.11.2026): Wer Wochenbestellungen aufgibt (Kunde selbst oder Hauptkunde für seine
// Vertriebspartner, lib/ppl/bestellkonto.ts), bekommt donnerstags ab 10 Uhr eine Mail und eine Mitteilung, wenn für
// nächste Woche noch nichts bestellt ist und auch keine automatische Verlängerung am Freitag ansteht.
// Einmal je Zahler und Woche (Eintrag im Änderungsprotokoll „ppl.bestellerinnerung“).

import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { fmtWeek, weekRange } from "@/lib/ppl/periods";

const AKTION = "ppl.bestellerinnerung";
const TIPP = "Tipp: Mit „Jede Woche wiederholen“ läuft Ihre Bestellung automatisch weiter, bis Sie sie ändern.";
/** Bestellungen, die für die Woche zählen (offen = Rechnung läuft, wartet = erste Woche vor der Prüfung). */
const BESTELLT = ["paid", "processing", "open", "wartet"];

/** Donnerstag ab 10 Uhr Berliner Zeit. */
export function erinnerungFaellig(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  return parts.find((p) => p.type === "weekday")?.value === "Thu" && Number(parts.find((p) => p.type === "hour")?.value) >= 10;
}

export type ErinnerungOffen = { zahlerId: string; zahlerName: string; bezuege: { id: string; titel: string }[] };

/** Wer muss für nächste Woche noch bestellen? Gruppiert nach Zahler (Hauptkunde bzw. Kunde selbst). */
export async function offeneBestellungen(now = new Date()): Promise<ErinnerungOffen[]> {
  const aktuell = weekRange(now).start;
  const naechste = weekRange(now, 1).start;
  const subs = await prisma.leadSubscription.findMany({
    where: {
      active: true,
      period: "week",
      customer: { dormantSince: null, isTest: false },
      // nichts für nächste Woche bestellt …
      orders: {
        none: {
          OR: [
            { periodStart: naechste, status: { in: BESTELLT } },
            // … und keine Verlängerung am Freitag (laufende Woche bezahlt mit „Jede Woche wiederholen“)
            { periodStart: aktuell, autoRenew: true, status: { in: ["paid", "processing"] } },
          ],
        },
      },
    },
    include: { customer: { select: { id: true, name: true, bestelltUeber: { select: { id: true, name: true, dormantSince: true } } } } },
    orderBy: [{ customer: { name: "asc" } }, { createdAt: "asc" }],
  });
  const gruppen = new Map<string, ErinnerungOffen>();
  for (const s of subs) {
    const haupt = s.customer.bestelltUeber;
    if (haupt?.dormantSince) continue;
    const zahler = haupt ?? s.customer;
    const produkt = s.label ?? s.productKey;
    const g = gruppen.get(zahler.id) ?? { zahlerId: zahler.id, zahlerName: zahler.name, bezuege: [] };
    g.bezuege.push({ id: s.id, titel: haupt ? `${s.customer.name}: ${produkt}` : produkt });
    gruppen.set(zahler.id, g);
  }
  return [...gruppen.values()];
}

/** Erinnerungen verschicken (Cron, jede Minute aufgerufen; wirkt nur donnerstags ab 10 Uhr, je Zahler einmal je Woche). */
export async function bestellErinnerungen(now = new Date()): Promise<{ gesendet: number }> {
  if (!erinnerungFaellig(now)) return { gesendet: 0 };
  const offen = await offeneBestellungen(now);
  if (!offen.length) return { gesendet: 0 };
  const woche = fmtWeek(weekRange(now, 1).start);
  // Schon erinnert für diese Bestellwoche? (Eintrag mit derselben Woche, Suche auf die letzten 14 Tage begrenzt)
  const schon = new Set(
    (
      await prisma.auditLog.findMany({
        where: { action: AKTION, at: { gte: new Date(Date.now() - 14 * 86_400_000) }, entityId: { in: offen.map((o) => o.zahlerId) }, details: { path: ["woche"], equals: woche } },
        select: { entityId: true },
      })
    ).map((a) => a.entityId),
  );
  const { getAppUrl, sendCustomerMail } = await import("@/lib/email");
  const { sendToUser } = await import("@/lib/push");
  const url = `${getAppUrl()}/buyer/bestellen`;
  let gesendet = 0;
  for (const o of offen) {
    if (schon.has(o.zahlerId)) continue;
    // Erst eintragen, dann senden: lieber eine Erinnerung zu wenig als jede Minute eine
    await audit(AKTION, { entity: "Customer", entityId: o.zahlerId, customerId: o.zahlerId, actor: { role: "system" }, details: { woche, bezuege: o.bezuege.map((b) => b.id) } });
    const logins = await prisma.user.findMany({ where: { role: "BUYER", customerId: o.zahlerId, teamRole: "owner" }, select: { id: true, email: true } });
    if (!logins.length) continue;
    const greeting = await anrede(o.zahlerId);
    const mail = await sendCustomerMail({
      to: logins.map((l) => l.email),
      subject: `Leads für nächste Woche (${woche}) bestellen`,
      greeting,
      paragraphs: [`für nächste Woche (${woche}) ist noch nichts bestellt:`],
      list: o.bezuege.map((b) => b.titel),
      textBlocks: [TIPP],
      html: `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#475569">${TIPP}</p>`,
      button: { label: "Jetzt bestellen", url },
    }).catch((err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }));
    if (!mail.ok) reportError(new Error(mail.error), "ppl-bestellerinnerung-mail", { zahler: o.zahlerId });
    for (const l of logins) {
      await sendToUser(l.id, { title: "Leads für nächste Woche bestellen", body: `${o.bezuege.length === 1 ? o.bezuege[0].titel : `${o.bezuege.length} Bezüge`}: noch nichts bestellt.`, url: "/buyer/bestellen" }).catch(() => {});
    }
    gesendet++;
  }
  return { gesendet };
}

async function anrede(customerId: string): Promise<string> {
  const c = await prisma.salesContact.findUnique({ where: { customerId }, select: { id: true } }).catch(() => null);
  if (!c) return "Guten Tag,";
  const { customerGreeting } = await import("@/lib/offer-links");
  return customerGreeting({ salesContactId: c.id }).catch(() => "Guten Tag,");
}
