// Neue Oberfläche des Kundenbereichs (Vertreter-A) – pro Kunde im Admin schaltbar.
// Pro Anfrage gecacht, damit Layout und Seite nur einmal nachfragen.

import { cache } from "react";
import { prisma } from "@/lib/prisma";

export const isNewUi = cache(async (customerId: string): Promise<boolean> => {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { newUi: true } });
  return !!c?.newUi;
});
