import { cookies } from "next/headers";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Wer sieht gerade den Buyer-Bereich (Kunden-CRM)?
//   - ein echter Buyer-Login → sein eigener Kunde
//   - ein Admin mit gesetztem Vorschau-Cookie → der gewählte Kunde, NUR LESEND
//     (alle Schreib-Aktionen in app/buyer/actions.ts verlangen role=BUYER und
//     lehnen die Vorschau damit automatisch ab).
// Das Cookie wirkt ausschließlich zusammen mit einer Admin-Session; für
// Buyer oder Nicht-Eingeloggte wird es ignoriert.

export const VIEW_AS_COOKIE = "kpi_view_as";

export type BuyerContext = {
  customerId: string;
  email: string;
  /** true = Admin-Vorschau („Als Kunde ansehen"), schreibgeschützt. */
  preview: boolean;
};

export async function getBuyerContext(): Promise<BuyerContext | null> {
  const session = await getCurrentSession();
  if (!session) return null;
  if (session.role === "BUYER" && session.customerId) {
    return { customerId: session.customerId, email: session.email, preview: false };
  }
  if (session.role === "ADMIN") {
    const id = (await cookies()).get(VIEW_AS_COOKIE)?.value;
    if (!id) return null;
    const customer = await prisma.customer.findUnique({
      where: { id },
      select: { id: true },
    });
    if (customer) return { customerId: customer.id, email: session.email, preview: true };
  }
  return null;
}
