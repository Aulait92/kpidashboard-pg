// Meta-Gebühren für WhatsApp über alle Kunden (Admin v2, Paket A5 „Zusammenlegen“, F186): bisher nur je Kunde in der
// Kundenakte › WhatsApp, jetzt zusätzlich gesammelt unter Werkzeuge › Meta-Gebühren. Gleiche Preise wie dort
// (lib/whatsapp/fees.ts: priceCounts), nur lesend. Gebühren sind im Preis enthalten, also interne Kosten.

import { prisma } from "@/lib/prisma";
import { berlinMonth, monthRange, priceCounts } from "@/lib/whatsapp/fees";

export type GebuehrZeile = { kundeId: string; kategorie: string | null; anzahl: number };
export type GebuehrKunde = { kundeId: string; name: string; monat: number; vormonat: number; nachrichten: number };

/** Zählungen je Kunde und Kategorie → Betrag je Kunde (Preise wie in der Kundenakte). Rein, getestet. */
export function betragJeKunde(zeilen: GebuehrZeile[]): Map<string, { betrag: number; nachrichten: number }> {
  const roh = new Map<string, Record<string, number>>();
  for (const z of zeilen) {
    const r = roh.get(z.kundeId) ?? {};
    const k = z.kategorie ?? "marketing";
    r[k] = (r[k] ?? 0) + z.anzahl;
    roh.set(z.kundeId, r);
  }
  return new Map([...roh].map(([id, r]) => [id, { betrag: priceCounts(r).amount, nachrichten: Object.values(r).reduce((s, n) => s + n, 0) }]));
}

async function zaehle(month: string): Promise<GebuehrZeile[]> {
  const { from, to } = monthRange(month);
  const rows = await prisma.$queryRaw<{ kundeId: string; kategorie: string | null; anzahl: bigint }[]>`
    SELECT c."customerId" AS "kundeId", m."pricingCategory" AS "kategorie", COUNT(*) AS "anzahl"
    FROM "Message" m JOIN "Conversation" c ON c."id" = m."conversationId"
    WHERE m."billable" = true AND m."direction" = 'outbound' AND m."createdAt" >= ${from} AND m."createdAt" < ${to}
    GROUP BY 1, 2`;
  return rows.map((r) => ({ ...r, anzahl: Number(r.anzahl) }));
}

/** Laufender Monat und Vormonat je Kunde, teuerste zuerst. */
export async function ladeMetaGebuehren(now = new Date()): Promise<{ monat: string; vormonat: string; kunden: GebuehrKunde[] }> {
  const monat = berlinMonth(now);
  const vormonat = berlinMonth(now, -1);
  const [jetzt, vorher] = await Promise.all([zaehle(monat).then(betragJeKunde), zaehle(vormonat).then(betragJeKunde)]);
  const ids = [...new Set([...jetzt.keys(), ...vorher.keys()])];
  const namen = new Map((await prisma.customer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const kunden = ids
    .map((id) => ({ kundeId: id, name: namen.get(id) ?? id, monat: jetzt.get(id)?.betrag ?? 0, vormonat: vorher.get(id)?.betrag ?? 0, nachrichten: jetzt.get(id)?.nachrichten ?? 0 }))
    .sort((a, b) => b.monat - a.monat || b.vormonat - a.vormonat || a.name.localeCompare(b.name));
  return { monat, vormonat, kunden };
}
