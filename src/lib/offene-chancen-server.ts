// Abfragen für die offenen Chancen auf „Wachstum“ (Rechnung rein in lib/offene-chancen.ts).

import { prisma } from "@/lib/prisma";
import { beitragEffektiv, cleanAngebote, gewaehlte } from "@/lib/angebote-daten";
import { bewerteChancen, eigeneQuoten, STANDARD_QUOTEN, type ChanceLead, type Chancen, type QuotenFall } from "@/lib/offene-chancen";
import type { ProvisionOverrides } from "@/lib/provision";

const DAY = 86_400_000;
const ANGEBOT_STATUS = ["Angebot gesendet", "Angebot verschickt", "Angebot raus"];
const VERLOREN_STATUS = ["Kein Interesse", "Disqualifiziert", "Disqualified", "Nicht qualifiziert"];
const TERMIN_STATUS = ["In Beratung", "Termin vereinbart", "Angebot/Beratung läuft", ...ANGEBOT_STATUS];

/** Standardquoten aus dem Admin (Einstellungen → Laufende Kosten), sonst die eingebauten. */
export async function loadStandardQuoten(): Promise<{ angebot: number; termin: number }> {
  const s = await prisma.kpiSettings.findUnique({ where: { id: "default" }, select: { chanceQuoteAngebot: true, chanceQuoteTermin: true } }).catch(() => null);
  const ok = (v: unknown, std: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 && n <= 1 ? n : std;
  };
  return { angebot: ok(s?.chanceQuoteAngebot, STANDARD_QUOTEN.angebot), termin: ok(s?.chanceQuoteTermin, STANDARD_QUOTEN.termin) };
}

/** Entschiedene und offene Fälle der letzten 12 Monate (Testleads und gelöschte nicht). */
async function quotenFaelle(customerId: string, now: Date): Promise<QuotenFall[]> {
  const leads = await prisma.lead.findMany({
    where: { customerId, isTest: false, erasedAt: null, createdAt: { gte: new Date(now.getTime() - 365 * DAY) } },
    select: { id: true, status: true, closedAt: true, lostAt: true, appointments: { select: { status: true } } },
  });
  if (!leads.length) return [];
  // Verlauf: Angebot gesendet bzw. Termin (Status „Termin vereinbart“, gebucht oder von Hand eingetragen). So zählt ein
  // verlorener Lead, der einen Termin hatte, auch ohne Termin-Eintrag im Kalender in der Termin-Quote mit.
  const verlauf = await prisma.leadHistory.findMany({
    where: {
      customerId,
      leadId: { in: leads.map((l) => l.id) },
      OR: [
        { text: { contains: "Angebot gesendet" } },
        { text: { startsWith: "Status: Termin vereinbart" } },
        { text: { startsWith: "Termin gebucht" } },
        { text: { startsWith: "Termin von Hand eingetragen" } },
      ],
    },
    select: { leadId: true, text: true },
  });
  const angebotVerlauf = new Set(verlauf.filter((h) => h.text.includes("Angebot gesendet")).map((h) => h.leadId));
  const terminVerlauf = new Set(verlauf.filter((h) => !h.text.includes("Angebot gesendet")).map((h) => h.leadId));
  return leads.map((l) => {
    const abschluss = l.status === "Abschluss" || !!l.closedAt;
    const verloren = !abschluss && (!!l.lostAt || VERLOREN_STATUS.includes(l.status ?? ""));
    const hatteAngebot = angebotVerlauf.has(l.id) || ANGEBOT_STATUS.includes(l.status ?? "");
    // Abschluss zählt als Termin (wie der Trichter, lib/kpis TERMIN_PHASE_KEYS)
    const hatteTermin =
      abschluss || hatteAngebot || terminVerlauf.has(l.id) || TERMIN_STATUS.includes(l.status ?? "") || l.appointments.some((a) => a.status === "booked" || a.status === "completed");
    return { hatteTermin, hatteAngebot, abschluss, verloren };
  });
}

/** Offene Chancen eines Kunden (Stand jetzt), mit eigenen bzw. Standardquoten. */
export async function loadOffeneChancen(customerId: string, rates: ProvisionOverrides | undefined, now = new Date(), opts: { produkt?: string | null } = {}): Promise<Chancen> {
  const [standard, faelle, rows] = await Promise.all([
    loadStandardQuoten(),
    quotenFaelle(customerId, now),
    prisma.lead.findMany({
      where: {
        customerId,
        isTest: false,
        erasedAt: null,
        closedAt: null,
        lostAt: null,
        ...(opts.produkt ? { source: opts.produkt } : {}),
        OR: [{ status: { in: ANGEBOT_STATUS } }, { appointments: { some: { status: "booked" } } }, { followUpAt: { not: null } }],
      },
      select: {
        id: true,
        name: true,
        source: true,
        status: true,
        reached: true,
        followUpAt: true,
        followUpNote: true,
        closedAt: true,
        lostAt: true,
        erasedAt: true,
        stornoState: true,
        appointments: { select: { startsAt: true, status: true, offersJson: true }, orderBy: { startsAt: "desc" }, take: 5 },
      },
      take: 500,
    }),
  ]);
  const leads: ChanceLead[] = rows.map((l) => ({
    ...l,
    termine: l.appointments.map((a) => ({
      startsAt: a.startsAt,
      status: a.status,
      angebote: gewaehlte(cleanAngebote(a.offersJson)).map((i) => ({ sparte: i.sparte, beitragMonat: beitragEffektiv(i) })),
    })),
  }));
  return bewerteChancen(leads, eigeneQuoten(faelle, standard), rates, now);
}
