import { notFound } from "next/navigation";
import { connection } from "next/server";
import { loadAccountDetail } from "@/lib/optimierung/server";
import { requireAuth } from "@/lib/vertrieb/auth";
import { AccountView } from "../account-view";

export const metadata = { title: "Optimierung Werbekonto | performancegrowth Admin" };

// Je Werbekonto: geplante Maßnahmen mit Begründung (alle freigeben, einzeln ablehnen),
// Trockenlauf, Maßnahme von Hand eintragen, Protokoll und Meta-Änderungsprotokoll.
export default async function OptimierungKontoPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  await requireAuth();
  const { id } = await params;
  const detail = await loadAccountDetail(id);
  if (!detail) notFound();
  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <AccountView detail={detail} />
    </main>
  );
}
