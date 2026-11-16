import { Suspense } from "react";
import { KundenTabs } from "@/components/admin/kunden-tabs";
import { RememberList } from "@/components/admin/list-memory";
import { KUNDEN_LISTS } from "@/lib/admin-lists";
import { requireAuth } from "@/lib/vertrieb/auth";

export default async function KundenLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return (
    <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <Suspense fallback={null}>
        <RememberList id="kunden" paths={KUNDEN_LISTS} />
      </Suspense>
      <KundenTabs />
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Kunden</h1>
      {children}
    </main>
  );
}
