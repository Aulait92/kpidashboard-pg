import AdminBuyersPage from "@/app/admin/buyers/page";

// Reiter „Logins & Team“: Kunden-Logins nur dieses Kunden.
export default async function KundenLogins({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminBuyersPage searchParams={Promise.resolve({ kunde: id })} />;
}
