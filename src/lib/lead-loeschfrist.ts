// Löschfrist für Leads ohne Abschluss (Datenschutz-Prüfung A5, Ole 20.11.2026: „ja“): 24 Monate nach dem letzten
// Kontakt werden Leads ohne Abschluss automatisch anonymisiert (eraseLead: Lead-Zeile bleibt anonym für Abrechnung und
// Kennzahlen, Chats, Termine, Einwilligungen weg; Beratungsdokumentation bleibt bis zu ihrer eigenen Frist).
// „Letzter Kontakt“ = jüngster Zeitpunkt aus Eingang, Statuswechsel, Erstkontakt, Wiedervorlage, Chat, Termin,
// E-Mail und Verlauf. Nicht gelöscht: Abschluss, erfasste Verträge, Maklervollmacht, Testleads. Täglich im Wartungslauf
// (app/api/whatsapp/cron), höchstens LIMIT je Lauf. Nennung in den Datenschutzhinweisen (lib/datenschutz-vermittler.ts).

import { prisma } from "@/lib/prisma";
import { eraseLead } from "@/lib/erasure";

export const LEAD_LOESCHFRIST_MONATE = 24;
const LIMIT = 200;

/** Stichtag: alles, was davor zuletzt Kontakt hatte, ist fällig (rein). */
export function loeschStichtag(now: Date, monate = LEAD_LOESCHFRIST_MONATE): Date {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - monate);
  return d;
}

/** IDs fälliger Leads (ohne Abschluss, ohne Kontakt seit dem Stichtag). */
export async function faelligeLeads(now = new Date(), limit = LIMIT): Promise<string[]> {
  const cut = loeschStichtag(now);
  const alt = (f: string) => ({ OR: [{ [f]: null }, { [f]: { lt: cut } }] });
  const rows = await prisma.lead.findMany({
    where: {
      erasedAt: null,
      isTest: false,
      createdAt: { lt: cut },
      statusChangedAt: { lt: cut },
      AND: [alt("firstContactAt"), alt("followUpAt"), alt("closedAt"), { OR: [{ status: null }, { status: { not: "Abschluss", mode: "insensitive" } }] }],
      contracts: { none: {} },
      maklervollmachten: { none: {} },
      conversations: { none: { OR: [{ lastMessageAt: { gte: cut } }, { updatedAt: { gte: cut } }] } },
      appointments: { none: { startsAt: { gte: cut } } },
      mails: { none: { createdAt: { gte: cut } } },
      history: { none: { createdAt: { gte: cut } } },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  return rows.map((r) => r.id);
}

/** Fällige Leads anonymisieren; Fehler je Lead blockieren den Rest nicht. */
export async function leadLoeschfrist(now = new Date()): Promise<{ geloescht: number; fehler: number }> {
  let geloescht = 0;
  let fehler = 0;
  for (const id of await faelligeLeads(now)) {
    try {
      if (await eraseLead(id, { email: "system:loeschfrist", role: "system" }, { grund: "frist24m" })) geloescht++;
    } catch (err) {
      fehler++;
      console.warn("[lead-loeschfrist]", id, err instanceof Error ? err.message : err);
    }
  }
  return { geloescht, fehler };
}
