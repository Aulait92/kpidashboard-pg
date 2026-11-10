import WhatsAppSettingsPage from "@/app/admin/whatsapp/settings/page";
import { WhatsAppFeesCard } from "@/components/whatsapp-fees-card";

// Reiter „WhatsApp-Assistent“: die WhatsApp-Einstellungen nur für diesen Kunden
// und die weiterberechneten Meta-Gebühren.
export default async function KundenWhatsApp({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ wa?: string }> }) {
  const { id } = await params;
  const { wa } = await searchParams;
  return (
    <div className="space-y-5">
      <WhatsAppSettingsPage searchParams={Promise.resolve({ kunde: id, wa })} />
      <div className="max-w-xl">
        <WhatsAppFeesCard customerId={id} admin />
      </div>
    </div>
  );
}
