import WhatsAppSettingsPage from "@/app/admin/whatsapp/settings/page";
import { WhatsAppFeesCard } from "@/components/whatsapp-fees-card";
import { Card, CardHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { AvailabilityCard } from "./availability-card";

// Reiter „WhatsApp-Assistent“: die WhatsApp-Einstellungen nur für diesen Kunden
// und die Meta-Gebühren (im Preis enthalten, intern erfasst).
export default async function KundenWhatsApp({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ wa?: string }> }) {
  const { id } = await params;
  const { wa } = await searchParams;
  return (
    <div className="space-y-5">
      <WhatsAppSettingsPage searchParams={Promise.resolve({ kunde: id, wa })} />
      <AvailabilityCard customerId={id} />
      <div className="grid max-w-5xl gap-5 lg:grid-cols-2">
        <WhatsAppFeesCard customerId={id} admin />
        <BestandModuleCard customerId={id} />
      </div>
    </div>
  );
}

async function BestandModuleCard({ customerId }: { customerId: string }) {
  const [c, count, campaigns] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { existingCustomersEnabled: true, bestandMonthly: true, bestandGrandfathered: true } }),
    prisma.existingCustomer.count({ where: { customerId } }),
    prisma.customerCampaign.count({ where: { customerId } }),
  ]);
  const on = !!c?.existingCustomersEnabled;
  const status = !on ? "Nicht gebucht" : c?.bestandMonthly != null ? "Gebucht" : c?.bestandGrandfathered ? "Frei (Bestandsschutz)" : "Freigeschaltet";
  return (
    <Card>
      <CardHeader title="Bestandskunden-Kampagnen" />
      <div className="space-y-3 px-5 pb-5 text-sm">
        <p className="text-[color:var(--muted)]">
          Zusatzmodul: Kunde lädt seinen Bestand hoch und spricht ihn per WhatsApp an (Lücken, Jahresgespräch, Geburtstag, Ablauf). Vorlagen
          „Bestandskunden: …“ oben einreichen.
        </p>
        <p>
          {status} · {count.toLocaleString("de-DE")} Bestandskunden · {campaigns} Kampagnen
        </p>
        <Link href={`/admin/kunden/${customerId}/abrechnung`} className="text-sm font-medium text-[color:var(--brand)] hover:underline">
          Buchen, freischalten und Kontingent unter „Abrechnung“ →
        </Link>
      </div>
    </Card>
  );
}
