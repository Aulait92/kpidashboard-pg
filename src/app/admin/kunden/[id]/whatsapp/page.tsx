import WhatsAppSettingsPage from "@/app/admin/whatsapp/settings/page";
import { WhatsAppFeesCard } from "@/components/whatsapp-fees-card";
import { Card, CardHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { toggleBestandModuleAction } from "./module-actions";

// Reiter „WhatsApp-Assistent“: die WhatsApp-Einstellungen nur für diesen Kunden
// und die weiterberechneten Meta-Gebühren.
export default async function KundenWhatsApp({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ wa?: string }> }) {
  const { id } = await params;
  const { wa } = await searchParams;
  return (
    <div className="space-y-5">
      <WhatsAppSettingsPage searchParams={Promise.resolve({ kunde: id, wa })} />
      <div className="grid max-w-5xl gap-5 lg:grid-cols-2">
        <WhatsAppFeesCard customerId={id} admin />
        <BestandModuleCard customerId={id} />
      </div>
    </div>
  );
}

async function BestandModuleCard({ customerId }: { customerId: string }) {
  const [c, count, campaigns] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { existingCustomersEnabled: true } }),
    prisma.existingCustomer.count({ where: { customerId } }),
    prisma.customerCampaign.count({ where: { customerId } }),
  ]);
  const on = !!c?.existingCustomersEnabled;
  return (
    <Card>
      <CardHeader title="Bestandskunden-Kampagnen" />
      <div className="space-y-3 px-5 pb-5 text-sm">
        <p className="text-[color:var(--muted)]">
          Zusatzmodul: Kunde lädt seinen Bestand hoch und spricht ihn per WhatsApp an (Lücken, Jahresgespräch, Geburtstag, Ablauf). Vorlagen
          „Bestandskunden: …“ oben einreichen.
        </p>
        <p>
          {on ? "Freigeschaltet" : "Aus"} · {count.toLocaleString("de-DE")} Bestandskunden · {campaigns} Kampagnen
        </p>
        <form action={toggleBestandModuleAction}>
          <input type="hidden" name="customerId" value={customerId} />
          <button className={`h-9 rounded-[var(--radius-sm)] px-3 text-sm font-semibold ${on ? "border border-[color:var(--border)] bg-white" : "bg-[color:var(--brand)] text-white"}`}>
            {on ? "Ausschalten" : "Freischalten"}
          </button>
        </form>
      </div>
    </Card>
  );
}

