// Testkunden (Ole, 15.11.2026): aus einem Testangebot ohne Zahlung. Löschen mit einem Klick entfernt
// Kundenkonto (mit Leads, Chats, Einrichtung usw. per Cascade), Logins des Kunden und das Testangebot.
// Der Vertriebskontakt bleibt erhalten. Eine verbundene WhatsApp-Nummer läuft bei 360dialog weiter,
// bis sie dort gekündigt wird: das sagt der Hinweis vor dem Löschen.

import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export type DeleteTestResult = { ok: true; name: string } | { ok: false; error: string };

export async function deleteTestCustomer(customerId: string): Promise<DeleteTestResult> {
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true, isTest: true, onboarding: { select: { offerId: true } }, whatsAppAccount: { select: { phoneNumber: true, status: true } } },
  });
  if (!c) return { ok: false, error: "Kunde nicht gefunden." };
  if (!c.isTest) return { ok: false, error: "Nur Testkunden lassen sich so löschen." };
  const offerId = c.onboarding?.offerId ?? null;
  await prisma.$transaction(async (tx) => {
    await tx.user.deleteMany({ where: { customerId: c.id, role: "BUYER" } });
    await tx.customer.delete({ where: { id: c.id } });
    if (offerId) await tx.offer.deleteMany({ where: { id: offerId, isTest: true } });
  });
  await audit("customer.test_delete", {
    entity: "Customer",
    entityId: c.id,
    details: { name: c.name, whatsapp: c.whatsAppAccount?.phoneNumber ?? null },
  });
  return { ok: true, name: c.name };
}
