import { getCurrentSession } from "@/lib/auth";
import { packageLabel } from "@/lib/customer-package";
import { prisma } from "@/lib/prisma";

// Globale Admin-Suche (Cmd+K): Kunden, Vertriebskontakte, Leads.
export const dynamic = "force-dynamic";

export type SearchHit = { kind: "kunde" | "kontakt" | "lead"; id: string; title: string; subtitle: string; href: string };

export async function GET(req: Request): Promise<Response> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return Response.json({ hits: [] });
  const digits = q.replace(/\D/g, "");
  const text = { contains: q, mode: "insensitive" as const };
  const phone = digits.length >= 4 ? digits : null;

  const [customers, contacts, leads] = await Promise.all([
    prisma.customer.findMany({
      where: { name: text, plan: { not: "internal" } },
      take: 5,
      orderBy: { name: "asc" },
      select: { id: true, name: true, archived: true, plan: true, retainerMonthly: true, onboarding: { select: { id: true } } },
    }),
    prisma.salesContact.findMany({
      where: {
        customerId: null,
        OR: [
          { name: text },
          { email: text },
          { city: text },
          { firstName: text },
          { lastName: text },
          ...(phone ? [{ phone: { contains: phone.slice(-6) } }] : []),
        ],
      },
      take: 6,
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, city: true, email: true },
    }),
    prisma.lead.findMany({
      where: { OR: [{ name: text }, { email: text }, ...(phone ? [{ phone: { contains: phone } }] : [])] },
      take: 6,
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, source: true, customer: { select: { id: true, name: true } } },
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
  ];
  return Response.json({ hits });
}
