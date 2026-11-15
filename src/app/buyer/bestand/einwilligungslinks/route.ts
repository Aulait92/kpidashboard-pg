import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { consentUrl } from "@/lib/bestand/links";
import { toCsv } from "@/lib/export/csv";

// Einwilligung leichter einholen (Anwalts-Memo, 15.11.2026): persönliche Einwilligungslinks aller Bestandskunden
// ohne Einwilligung als CSV, z. B. für einen Serienbrief, die Gesprächsliste oder das Jahresgespräch. Der Vermittler
// gibt die Links selbst weiter; wir schreiben niemanden an. Nur Inhaber, nicht in der Vorschau.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview || !ctx.userId || ctx.teamRole !== "owner") return new Response("Nicht erlaubt.", { status: 403 });
  const c = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { existingCustomersEnabled: true } });
  if (!c?.existingCustomersEnabled) return new Response("Nicht freigeschaltet.", { status: 403 });
  const rows = await prisma.existingCustomer.findMany({
    where: {
      customerId: ctx.customerId,
      optOutAt: null,
      OR: [
        { email: { not: null }, emailConsent: null, emailOptOutAt: null },
        { phone: { not: null }, whatsappConsent: null },
      ],
    },
    orderBy: [{ lastName: { sort: "asc", nulls: "last" } }, { firstName: "asc" }],
    select: { id: true, externalNo: true, salutation: true, firstName: true, lastName: true, company: true, email: true, phone: true, emailConsent: true, whatsappConsent: true, street: true, zip: true, city: true },
    take: 50_000,
  });
  await audit("bestand.einwilligungslinks", { entity: "Customer", entityId: ctx.customerId, customerId: ctx.customerId, details: { count: rows.length } });
  const label = (v: string | null) => v ?? "unbekannt";
  const csv = toCsv(
    ["Kundennummer", "Anrede", "Vorname", "Nachname", "Firma", "Straße", "PLZ", "Ort", "E-Mail", "Mobil", "Einwilligung E-Mail", "Einwilligung WhatsApp", "Einwilligungslink"],
    rows.map((r) => [
      r.externalNo,
      r.salutation,
      r.firstName,
      r.lastName,
      r.company,
      r.street,
      r.zip,
      r.city,
      r.email,
      r.phone ? `+${r.phone}` : "",
      label(r.emailConsent),
      label(r.whatsappConsent),
      consentUrl(r.id),
    ]),
  );
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="einwilligungslinks.csv"' } });
}
