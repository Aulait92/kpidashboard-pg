// Wochen-Mail „Ihr Team diese Woche“ (Ole, 27.11.2026: Lohmanns Team trägt Anrufe nicht ein, Wiedervorlagen stapeln sich;
// der Inhaber soll ohne Blick ins Tool sehen, wie sein Team arbeitet). Montags ab 7 Uhr (Berlin) an Inhaber von Konten mit
// Team (mehr als ein Login), je Kunde und Woche einmal (Customer.teamWocheGesendet), abbestellbar je Inhaber
// (User.teamWocheMailOff, Einstellungen → Erinnerungen & Aufgaben). Zahlen der Vorwoche (Mo bis So) je Person:
// eingetragene Anrufe (Verlauf „anruf“), neue Termine, neue Leads; dazu jetzt fällige Wiedervorlagen.
// Zusammenstellung rein (teamWocheInhalt, tests/unit/team-woche.test.ts), Versand runTeamWochenMail.

import { prisma } from "@/lib/prisma";

export type TeamWocheZeile = { name: string; anrufe: number; termine: number; neueLeads: number; faellig: number };

const DAY = 86_400_000;
const berlin = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d);

/** Montag (YYYY-MM-DD, Berlin) der Woche von `now`, und die Vorwoche als [von, bis) in UTC (Berlin-Mitternacht ±1 Std. genügt). */
export function vorwoche(now: Date): { montag: string; von: Date; bis: Date } {
  const heute = berlin(now);
  const wd = (new Date(`${heute}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = Montag
  const montag = new Date(Date.parse(`${heute}T00:00:00Z`) - wd * DAY);
  const montagIso = montag.toISOString().slice(0, 10);
  // Berlin-Mitternacht: UTC minus 1 Std. (Winter) bzw. 2 Std. (Sommer); eine Stunde Unschärfe an den Rändern ist egal
  const bis = new Date(montag.getTime() - 60 * 60 * 1000);
  const von = new Date(bis.getTime() - 7 * DAY);
  return { montag: montagIso, von, bis };
}

/** Mail-Inhalt (rein). Personen nach Anrufen sortiert; „Niemand zugeteilt“ zuletzt. */
export function teamWocheInhalt(zeilen: TeamWocheZeile[], opts: { von: Date; bis: Date; appUrl: string }) {
  const fmt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" }).format(d);
  const sortiert = [...zeilen].sort((a, b) => Number(a.name === "Niemand zugeteilt") - Number(b.name === "Niemand zugeteilt") || b.anrufe - a.anrufe);
  const summe = (k: keyof Omit<TeamWocheZeile, "name">) => zeilen.reduce((s, z) => s + z[k], 0);
  const mz = (n: number, ein: string, viele: string) => `${n} ${n === 1 ? ein : viele}`;
  const list = sortiert.map(
    (z) => `${z.name}: ${mz(z.anrufe, "Anruf", "Anrufe")} eingetragen, ${mz(z.termine, "Termin", "Termine")}, ${mz(z.neueLeads, "neuer Lead", "neue Leads")}${z.faellig ? `, ${mz(z.faellig, "Wiedervorlage", "Wiedervorlagen")} fällig` : ""}`,
  );
  const paragraphs = [
    `so lief die Woche vom ${fmt(opts.von)} bis ${fmt(new Date(opts.bis.getTime() - DAY))} in Ihrem Team: ${mz(summe("anrufe"), "Anruf", "Anrufe")} eingetragen, ${mz(summe("termine"), "Termin", "Termine")} vereinbart, ${mz(summe("neueLeads"), "neuer Lead", "neue Leads")}.`,
  ];
  const faellig = summe("faellig");
  if (faellig) paragraphs.push(`Gerade sind ${mz(faellig, "Wiedervorlage", "Wiedervorlagen")} fällig. Am schnellsten geht es mit der Anrufliste: ein Kontakt nach dem anderen, das Ergebnis mit einem Tipp.`);
  return {
    subject: `Ihr Team diese Woche: ${mz(summe("anrufe"), "Anruf", "Anrufe")}, ${mz(summe("termine"), "Termin", "Termine")}`,
    greeting: "Guten Tag,",
    paragraphs,
    list,
    button: { label: faellig ? "Anrufliste starten" : "Kontakte öffnen", url: `${opts.appUrl}${faellig ? "/buyer?anrufliste=1" : "/buyer/kontakte"}` },
  };
}

/** Montags ab 7 Uhr: je Kunde mit Team einmal je Woche. Gibt die Zahl gesendeter Mails zurück. */
export async function runTeamWochenMail(now = new Date(), opts: { limit?: number } = {}): Promise<number> {
  const teile = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(now);
  if (teile.find((p) => p.type === "weekday")?.value !== "Mon" || Number(teile.find((p) => p.type === "hour")?.value) < 7) return 0;
  const { montag, von, bis } = vorwoche(now);
  const kunden = await prisma.customer.findMany({
    where: { isTest: false, dormantSince: null, plan: { not: "internal" }, OR: [{ teamWocheGesendet: null }, { teamWocheGesendet: { not: montag } }], users: { some: { role: "BUYER", teamRole: "advisor" } } },
    select: { id: true },
    take: opts.limit ?? 10,
  });
  const { sendCustomerMail, getAppUrl } = await import("@/lib/email");
  let gesendet = 0;
  for (const k of kunden) {
    // Erst markieren (gegen Doppelversand bei parallelen Läufen), dann senden
    const claim = await prisma.customer.updateMany({ where: { id: k.id, OR: [{ teamWocheGesendet: null }, { teamWocheGesendet: { not: montag } }] }, data: { teamWocheGesendet: montag } });
    if (!claim.count) continue;
    const users = await prisma.user.findMany({ where: { customerId: k.id, role: "BUYER" }, select: { id: true, email: true, displayName: true, teamRole: true, teamWocheMailOff: true } });
    if (users.length < 2) continue;
    const empfaenger = users.filter((u) => u.teamRole === "owner" && !u.teamWocheMailOff).map((u) => u.email);
    if (!empfaenger.length) continue;
    const [anrufe, termine, neue, faellig] = await Promise.all([
      prisma.leadHistory.groupBy({ by: ["userId"], where: { customerId: k.id, kind: "anruf", createdAt: { gte: von, lt: bis } }, _count: { _all: true } }),
      prisma.appointment.findMany({ where: { customerId: k.id, createdAt: { gte: von, lt: bis }, leadId: { not: null } }, select: { lead: { select: { assignedUserId: true } } } }),
      prisma.lead.groupBy({ by: ["assignedUserId"], where: { customerId: k.id, isTest: false, createdAt: { gte: von, lt: bis } }, _count: { _all: true } }),
      prisma.lead.groupBy({ by: ["assignedUserId"], where: { customerId: k.id, isTest: false, closedAt: null, erasedAt: null, followUpAt: { lte: now } }, _count: { _all: true } }),
    ]);
    const zeile = new Map<string, TeamWocheZeile>();
    const z = (id: string | null) => {
      const key = id ?? "ohne";
      if (!zeile.has(key)) {
        const u = users.find((x) => x.id === id);
        zeile.set(key, { name: u ? u.displayName?.trim() || u.email : "Niemand zugeteilt", anrufe: 0, termine: 0, neueLeads: 0, faellig: 0 });
      }
      return zeile.get(key)!;
    };
    for (const u of users) z(u.id);
    for (const a of anrufe) z(a.userId && users.some((u) => u.id === a.userId) ? a.userId : null).anrufe += a._count._all;
    for (const t of termine) z(t.lead?.assignedUserId ?? null).termine += 1;
    for (const n of neue) z(n.assignedUserId).neueLeads += n._count._all;
    for (const f of faellig) z(f.assignedUserId).faellig += f._count._all;
    const zeilen = [...zeile.values()].filter((r) => r.name !== "Niemand zugeteilt" || r.anrufe + r.termine + r.neueLeads + r.faellig > 0);
    const inhalt = teamWocheInhalt(zeilen, { von, bis, appUrl: getAppUrl() });
    const r = await sendCustomerMail({ to: empfaenger, ...inhalt }).catch(() => ({ ok: false }));
    if (r.ok) gesendet++;
  }
  return gesendet;
}
