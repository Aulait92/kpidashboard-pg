import { SubTabs } from "@/components/admin-tabs";
import { requireAuth } from "@/lib/vertrieb/auth";

export default async function KundenLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return (
    <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="mb-3 text-2xl font-semibold tracking-tight">Kunden</h1>
      <SubTabs
        tabs={[
          { href: "/admin/kunden", label: "Übersicht", exact: true },
          { href: "/admin/kunden/pipeline", label: "Pipeline" },
        ]}
      />
      {children}
    </main>
  );
}
