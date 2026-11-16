import { cookies, headers } from "next/headers";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { istDemoAnsicht } from "@/lib/app-demo/anfrage";
import { APP_DEMO_HEADER } from "@/lib/app-demo/marke";
import { APP_DEMO_KUNDE_ID, demoDatenbankGeprueft } from "@/lib/app-demo/db";

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
  /** Login-ID (null in der Admin-Vorschau). */
  userId: string | null;
  /** Team: owner = Inhaber (sieht alles), advisor = Berater (nur eigene Leads). */
  teamRole: "owner" | "advisor";
  /**
   * Öffentliche App-Demo (/app-demo, src/lib/app-demo): Demo-Kunde aus der eigenen Demo-Datenbank, nur lesend,
   * ohne Login. Immer zusammen mit preview = true; im Unterschied zur Admin-Vorschau ist hier gar nichts beschreibbar.
   */
  demo?: boolean;
};

/** Demo-Sicht: nur beim Rendern einer /app-demo-Seite (signiertes Kennzeichen der Middleware), nie in einer Server Action. */
async function getAppDemoContext(): Promise<BuyerContext | null | undefined> {
  const h = await headers();
  if (!h.get(APP_DEMO_HEADER)) return undefined;
  // Kennzeichen da, aber ungültig oder in einer Action: keine Sicht, auch kein Rückfall auf eine Sitzung
  if (!istDemoAnsicht(h)) return null;
  if (!(await demoDatenbankGeprueft())) return null;
  return { customerId: APP_DEMO_KUNDE_ID, email: "demo@example.com", preview: true, userId: null, teamRole: "owner", demo: true };
}

export async function getBuyerContext(): Promise<BuyerContext | null> {
  const demo = await getAppDemoContext();
  if (demo !== undefined) return demo;
  const session = await getCurrentSession();
  if (!session) return null;
  if (session.role === "BUYER" && session.customerId) {
    const u = await prisma.user.findUnique({ where: { id: session.userId }, select: { teamRole: true, customerId: true, customer: { select: { dormantSince: true } } } });
    // Login gelöscht oder Kunde gewechselt → keine Sicht mehr.
    if (!u || u.customerId !== session.customerId) return null;
    // Ruhendes Konto (Vertrag beendet, lib/ruhend.ts): kein Zugang außer Export und Reaktivierung (getDormantContext)
    if (u.customer?.dormantSince) return null;
    return {
      customerId: session.customerId,
      email: session.email,
      preview: false,
      userId: session.userId,
      teamRole: u.teamRole === "advisor" ? "advisor" : "owner",
    };
  }
  if (session.role === "ADMIN") {
    const id = (await cookies()).get(VIEW_AS_COOKIE)?.value;
    if (!id) return null;
    const customer = await prisma.customer.findUnique({
      where: { id },
      select: { id: true },
    });
    if (customer) return { customerId: customer.id, email: session.email, preview: true, userId: null, teamRole: "owner" };
  }
  return null;
}

export type DormantContext = { customerId: string; email: string; userId: string; teamRole: "owner" | "advisor"; dormantSince: Date };

/**
 * Login eines ruhenden Kontos (Vertrag beendet, Daten noch aufbewahrt): nur Seite /buyer/ruhend, Datenexport und
 * Reaktivierung (lib/ruhend.ts). Null für alle anderen (auch für die Admin-Vorschau, die normal weiterläuft).
 */
export async function getDormantContext(): Promise<DormantContext | null> {
  const session = await getCurrentSession();
  if (!session || session.role !== "BUYER" || !session.customerId) return null;
  const u = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { teamRole: true, customerId: true, customer: { select: { dormantSince: true, dataDeletedAt: true } } },
  });
  if (!u || u.customerId !== session.customerId || !u.customer?.dormantSince || u.customer.dataDeletedAt) return null;
  return { customerId: session.customerId, email: session.email, userId: session.userId, teamRole: u.teamRole === "advisor" ? "advisor" : "owner", dormantSince: u.customer.dormantSince };
}
