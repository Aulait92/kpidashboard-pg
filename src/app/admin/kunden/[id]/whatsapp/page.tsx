import WhatsAppSettingsPage from "@/app/admin/whatsapp/settings/page";

// Reiter „WhatsApp-Assistent“: die WhatsApp-Einstellungen nur für diesen Kunden.
export default async function KundenWhatsApp({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ wa?: string }> }) {
  const { id } = await params;
  const { wa } = await searchParams;
  return <WhatsAppSettingsPage searchParams={Promise.resolve({ kunde: id, wa })} />;
}
