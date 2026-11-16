import { getCurrentSession } from "@/lib/auth";
import { packageLabel } from "@/lib/customer-package";
import { prisma } from "@/lib/prisma";
import { phoneQuery } from "@/lib/telefonsuche";
import { searchPhonesAdmin, type AdminSearchHit } from "@/lib/telefonsuche-server";

// Globale Admin-Suche (Cmd+K): Kunden, Vertriebskontakte, Leads und Logins der Kunden (E-Mail, Name).
// Telefonnummern (Ole, 16.11.2026) in jeder Schreibweise und über die Endziffern, in allen Nummernfeldern
// und in Signaturen eingehender Mails (lib/telefonsuche-server.ts).
// Genutzt von der alten (components/command-palette.tsx) und der neuen Oberfläche (components/admin-neu/rahmen/suche.tsx).
export const dynamic = "force-dynamic";

export type SearchHit = AdminSearchHit;

export async function GET(req: Request): Promise<Response> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return Response.json({ hits: [] });
  const pq = phoneQuery(q);
  // Reine Telefonnummer: nur die Telefonsuche (Namen und E-Mails enthalten keine solchen Ziffernfolgen)
  if (pq) return Response.json({ hits: await searchPhonesAdmin(pq) });
  const text = { contains: q, mode: "insensitive" as const };

  const [customers, contacts, leads, logins] = await Promise.all([
    prisma.customer.findMany({
      where: { name: text, plan: { not: "internal" } },
      take: 5,
      orderBy: { name: "asc" },
      select: { id: true, name: true, archived: true, plan: true, retainerMonthly: true, onboarding: { select: { id: true } } },
    }),
    prisma.salesContact.findMany({
      where: {
        customerId: null,
        OR: [{ name: text }, { email: text }, { city: text }, { firstName: text }, { lastName: text }],
      },
      take: 6,
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, city: true, email: true },
    }),
    prisma.lead.findMany({
      where: { OR: [{ name: text }, { email: text }] },
      take: 6,
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, source: true, customer: { select: { id: true, name: true } } },
    }),
    // Logins (früher nur über /admin/buyers zu finden): nur Kunden-Logins mit Kunde
    prisma.user.findMany({
      where: { role: "BUYER", customerId: { not: null }, OR: [{ email: text }, { displayName: text }] },
      take: 5,
      orderBy: { lastLoginAt: { sort: "desc", nulls: "last" } },
      select: { id: true, email: true, displayName: true, teamRole: true, customer: { select: { id: true, name: true } } },
    }),
  ]);

  const short = (n: string) => n.replace(/^Allianz\s+/i, "");
  const hits: SearchHit[] = [
    ...customers.map((c) => ({
      kind: "kunde" as const,
      id: c.id,
      title: short(c.name),
      subtitle: `Kunde${c.archived ? " (archiviert)" : ""} · ${packageLabel(c)}`,
      href: `/admin/kunden/${c.id}`,
    })),
    ...contacts.map((c) => ({
      kind: "kontakt" as const,
      id: c.id,
      title: short(c.name),
      subtitle: `Vertriebskontakt${c.city ? ` · ${c.city}` : ""}`,
      href: `/admin/vertrieb/kontakte/${c.id}`,
    })),
    ...leads.map((l) => ({
      kind: "lead" as const,
      id: l.id,
      title: l.name ?? "Lead ohne Name",
      subtitle: `Lead · ${short(l.customer.name)}${l.source ? ` · ${l.source}` : ""}`,
      href: `/admin/leads?kunde=${l.customer.id}&q=${encodeURIComponent(l.name ?? "")}`,
    })),
    ...logins.flatMap((u) =>
      u.customer
        ? [
            {
              kind: "login" as const,
              id: u.id,
              title: u.email,
              subtitle: `Login · ${short(u.customer.name)}${u.displayName ? ` · ${u.displayName}` : ""}${u.teamRole === "advisor" ? " · Berater" : ""}`,
              href: `/admin/kunden/${u.customer.id}/logins`,
            },
          ]
        : [],
    ),
  ];
  return Response.json({ hits });
}
