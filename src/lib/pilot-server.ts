// Pilot speichern (Ole, 20.11.2026): Datum am Kunden setzen bzw. entfernen und die Erinnerungen an das Pilotende
// (7 Tage vorher, letzter Tag) neu anlegen. Reine Regeln: lib/pilot.ts.

import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { pilotAufgabenKennung, pilotErinnerungen } from "@/lib/pilot";

export async function setzePilot(customerId: string, pilotBis: Date | null, now: Date = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true, isTest: true, pilotBis: true, salesContact: { select: { id: true } } } });
  if (!c) return { ok: false, error: "Kunde nicht gefunden." };
  if (pilotBis && c.isTest) return { ok: false, error: "Testkunden können kein Pilot sein. Pilotkunden sind echte Kunden." };
  const kennung = pilotAufgabenKennung(c.id);
  await prisma.$transaction([
    prisma.customer.update({ where: { id: c.id }, data: { pilotBis } }),
    // Alte, offene Erinnerungen ersetzen (Datum geändert oder Pilot entfernt)
    prisma.salesTask.deleteMany({ where: { doneAt: null, note: kennung } }),
    ...(pilotBis
      ? [
          prisma.salesTask.createMany({
            data: pilotErinnerungen(c.name, pilotBis, now).map((t) => ({ ...t, note: kennung, type: "SONSTIGES" as const, contactId: c.salesContact?.id ?? null })),
          }),
        ]
      : []),
  ]);
  await audit(pilotBis ? "customer.pilot" : "customer.pilot_entfernt", {
    entity: "Customer",
    entityId: c.id,
    customerId: c.id,
    details: { von: c.pilotBis?.toISOString().slice(0, 10) ?? null, bis: pilotBis?.toISOString().slice(0, 10) ?? null },
  });
  return { ok: true };
}
