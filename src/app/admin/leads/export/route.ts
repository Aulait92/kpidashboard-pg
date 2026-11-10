import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isStorno, leadSelect, leadWhere, priceOf, type LeadFilter } from "@/lib/admin-leads";
import { audit } from "@/lib/audit";

// CSV-Export der gefilterten Leads (Semikolon, UTF-8 mit BOM → Excel-tauglich).
export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return new Response("Nicht erlaubt.", { status: 403 });
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries()) as LeadFilter;
  const leads = await prisma.lead.findMany({ where: leadWhere(sp), select: leadSelect, orderBy: { createdAt: "desc" }, take: 20000 });
  await audit("lead.export", { entity: "Lead", customerId: sp.kunde ?? null, details: { count: leads.length, filter: sp } });
  const date = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
  const header = ["Datum", "Name", "Telefon", "E-Mail", "Kunde", "Produkt", "Status", "Storno", "Preis netto", "Kanal", "Formularangaben"];
  const rows = leads.map((l) => {
    const answers = Array.isArray(l.formData) ? (l.formData as { label: string; value: string }[]).map((a) => `${a.label}: ${a.value}`).join(" | ") : "";
    const storno = isStorno(l.status);
    return [
      date(l.createdAt),
      l.name,
      l.phone ? `+${l.phone}` : "",
      l.email,
      l.customer.name,
      l.source,
      l.status,
      storno ? "ja" : "",
      storno ? "0" : priceOf(l).toFixed(2).replace(".", ","),
      l.adChannel,
      answers,
    ].map(cell).join(";");
  });
  const csv = "﻿" + [header.join(";"), ...rows].join("\r\n");
  const name = `leads${sp.monat ? `-${sp.monat}` : ""}.csv`;
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"` },
  });
}
