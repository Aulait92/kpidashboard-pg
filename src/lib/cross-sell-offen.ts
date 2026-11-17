// „Weiteres Produkt anbieten“ (Ole, 17.11.2026): eine Definition für den Tipp auf der Zahlen-Seite
// (lib/zahlen-tipps-server, Zählung) und den Filter der Kontakte-Liste (?filter=cross-selling), damit der Knopf
// „Kunden ansehen“ genau die gezählten Kunden zeigt: Kunden mit Abschluss seit mindestens 3 Wochen, die noch
// keinen weiteren (laufenden) Vertrag haben.

import type { Prisma } from "@/generated/prisma/client";
import { CLOSED_STATUS } from "@/lib/products";

/** Wert von ?filter= in der Kontakte-Liste. */
export const CROSS_SELL_FILTER = "cross-selling";
/** Ziel des Knopfs im Tipp. /buyer/leads leitet in der neuen Oberfläche mit Parametern auf /buyer/kontakte. */
export const CROSS_SELL_HREF = `/buyer/leads?filter=${CROSS_SELL_FILTER}`;
/** Beschriftung des Filter-Chips. */
export const CROSS_SELL_LABEL = "Ohne weiteres Produkt";
/** So lange nach dem Abschluss warten, bevor ein Kunde zählt. */
export const CROSS_SELL_WARTEN_TAGE = 21;

/** Kunden mit Abschluss (mindestens 3 Wochen her) ohne weiteren laufenden Vertrag. Mit leadScope bzw. customerId kombinieren. */
export function crossSellOffenWhere(now: Date): Prisma.LeadWhereInput {
  return {
    status: CLOSED_STATUS,
    erasedAt: null,
    closedAt: { lte: new Date(now.getTime() - CROSS_SELL_WARTEN_TAGE * 86_400_000) },
    contracts: { none: { primaryLeadId: null, status: "aktiv" } },
  };
}
