// Du/Sie gegenüber dem Vermittler laden und im Admin ändern (Regeln: lib/vermittler-ansprache.ts).

import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { vermittlerDuAus } from "@/lib/vermittler-ansprache";

/** Einstellung am Kunden und (als Rückfall) die Anrede im angenommenen Angebot. */
export async function ladeVermittlerAnrede(customerId: string): Promise<{ kunde: boolean | null; angebot: boolean | null; du: boolean }> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { vermittlerDu: true, onboarding: { select: { offerId: true } } } });
  const kunde = c?.vermittlerDu ?? null;
  // Angebot nur nachladen, wenn am Kunden nichts steht (Altkunden vor dem Backfill, Konten ohne Angebot)
  const angebot =
    kunde === null && c?.onboarding?.offerId
      ? ((await prisma.offer.findUnique({ where: { id: c.onboarding.offerId }, select: { mailDu: true } }).catch(() => null))?.mailDu ?? null)
      : null;
  return { kunde, angebot, du: vermittlerDuAus({ kunde, angebot }) };
}

/** true = Du, false = Sie. */
export async function vermittlerDu(customerId: string): Promise<boolean> {
  return (await ladeVermittlerAnrede(customerId)).du;
}

/** Admin: Anrede gegenüber dem Kunden setzen (mit Eintrag im Änderungsprotokoll). false = unverändert. */
export async function setzeVermittlerDu(customerId: string, du: boolean, actor?: AuditActor): Promise<boolean> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { vermittlerDu: true } });
  if (!c || c.vermittlerDu === du) return false;
  await prisma.customer.update({ where: { id: customerId }, data: { vermittlerDu: du } });
  await audit("customer.vermittler_du", {
    entity: "Customer",
    entityId: customerId,
    customerId,
    details: { von: c.vermittlerDu === null ? "unbekannt" : c.vermittlerDu ? "du" : "sie", nach: du ? "du" : "sie", durch: "admin" },
    ...(actor ? { actor } : {}),
  });
  return true;
}
