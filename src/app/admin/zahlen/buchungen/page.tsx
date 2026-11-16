import { connection } from "next/server";
import { requireAuth } from "@/lib/vertrieb/auth";
import { BuchungenAnsicht } from "@/components/admin/buchungen-ansicht";
import { ZahlenTabs } from "@/components/admin/zahlen-tabs";

export const metadata = { title: "Buchungen | performancegrowth Admin" };

// Alle Buchungen und Änderungen aller Kunden. Inhalt gemeinsam mit dem neuen Admin (components/admin/buchungen-ansicht.tsx).
export default async function BuchungenPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection();
  const session = await requireAuth();
  const sp = await searchParams;
  return (
    <main className="mx-auto w-full max-w-[1360px] flex-1 space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <ZahlenTabs />
      <BuchungenAnsicht sp={sp} userId={session.userId} basis="/admin/zahlen/buchungen" />
    </main>
  );
}
