// Kundensuche für den Betrieb (27.11.2026): Name (auch archivierte Kunden) oder Login-E-Mail → Kunde. Nur lesen.
// Zeigt Kunden-ID, Name, archiviert, Bestellkonto-Zuordnung und die Logins des Kunden (E-Mail gekürzt).
import { prisma } from "@/lib/prisma";

const kurz = (e: string) => e.replace(/^(.)[^@]*(@.*)$/, "$1…$2");

export async function kundeSucheDiagnose(p: URLSearchParams) {
  const name = (p.get("name") ?? "").trim();
  const email = (p.get("email") ?? "").trim().toLowerCase();
  if (!name && !email) return { fehler: "name=<Teil des Namens> oder email=<Login> angeben" };
  const ids = new Set<string>();
  if (email) {
    const u = await prisma.user.findMany({ where: { email: { equals: email, mode: "insensitive" } }, select: { customerId: true } });
    for (const x of u) if (x.customerId) ids.add(x.customerId);
  }
  const kunden = await prisma.customer.findMany({
    where: name ? { OR: [{ name: { contains: name, mode: "insensitive" } }, { id: { in: [...ids] } }] } : { id: { in: [...ids] } },
    take: 20,
    select: {
      id: true, name: true, archived: true, isTest: true, createdAt: true, bestelltUeberId: true,
      vermittlerRegisterStatus: true,
      _count: { select: { bestellPartner: true, leadSubscriptions: true, leads: true } },
      users: { select: { id: true, email: true, teamRole: true } },
    },
  });
  return kunden.map((k) => ({ ...k, users: k.users.map((u) => ({ id: u.id, email: kurz(u.email), teamRole: u.teamRole })) }));
}
