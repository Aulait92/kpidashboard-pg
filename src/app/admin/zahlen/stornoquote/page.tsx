import { connection } from "next/server";
import { requireAuth } from "@/lib/vertrieb/auth";
import { countNeueBuchungen } from "@/lib/admin-buchungen-neu";
import { reportError } from "@/lib/monitoring";
import { StornoQuoteUebersicht } from "@/components/admin/storno-quote";
import { ZahlenTabs } from "@/components/admin/zahlen-tabs";

export const metadata = { title: "Stornoquote | performancegrowth Admin" };

// Tatsächliche Stornoquote der Verträge je Sparte und Kunde (lib/storno-quote), eigener Reiter unter Zahlen.
export default async function StornoquotePage() {
  await connection();
  const session = await requireAuth();
  const neu = await countNeueBuchungen(session.userId).catch((err) => {
    reportError(err, "admin-neue-buchungen");
    return 0;
  });
  return (
    <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <ZahlenTabs neueBuchungen={neu} />
      <StornoQuoteUebersicht leerHinweis />
    </main>
  );
}
