import { connection } from "next/server";
import { requireAuth } from "@/lib/vertrieb/auth";
import { loadZahlen } from "@/lib/zahlen";
import { ZahlenView } from "@/components/admin/zahlen-view";

export const metadata = { title: "Zahlen | KPI-Dashboard" };

// Investorentaugliche Kennzahlen aus dem Umsatzbuch (lib/revenue-ledger.ts).
export default async function AdminZahlenPage() {
  await connection();
  await requireAuth();
  const data = await loadZahlen();
  return (
    <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <ZahlenView data={data} />
    </main>
  );
}
