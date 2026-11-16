import { connection } from "next/server";
import { requireAuth } from "@/lib/vertrieb/auth";
import { countNeueBuchungen } from "@/lib/admin-buchungen-neu";
import { reportError } from "@/lib/monitoring";
import { ZahlenTabs } from "@/components/admin/zahlen-tabs";
import { LebenszyklusAnsicht } from "@/components/admin/lebenszyklus-ansicht";
import { loadLebenszyklus } from "@/lib/lebenszyklus";

export const metadata = { title: "Kündigung & Rückkehr | performancegrowth Admin" };

// Kündigung, Ruhephase und Rückkehr. Inhalt gemeinsam mit dem neuen Admin (components/admin/lebenszyklus-ansicht.tsx).
export default async function LebenszyklusPage() {
  await connection();
  const session = await requireAuth();
  const [d, neu] = await Promise.all([
    loadLebenszyklus(),
    countNeueBuchungen(session.userId).catch((err) => {
      reportError(err, "admin-neue-buchungen");
      return 0;
    }),
  ]);
  return (
    <main className="mx-auto w-full max-w-[1360px] flex-1 space-y-5 px-4 py-6 sm:px-6 lg:px-8" data-admin-lebenszyklus>
      <ZahlenTabs neueBuchungen={neu} />
      <LebenszyklusAnsicht d={d} />
    </main>
  );
}
