import Link from "next/link";
import { requireAuth } from "@/lib/vertrieb/auth";
import { loadReportSettings } from "@/lib/monatsbericht/server";
import { ReportSettingsForm } from "./form";

export const metadata = { title: "Monatsberichte | performancegrowth Admin" };

export default async function ReportSettingsPage() {
  await requireAuth();
  const s = await loadReportSettings();
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <Link href="/admin/einstellungen" className="text-sm text-[color:var(--muted)] hover:underline">← Einstellungen</Link>
      <h1 className="mb-1 mt-1 text-2xl font-semibold tracking-tight">Monatsberichte</h1>
      <p className="mb-6 text-sm text-[color:var(--muted)]">
        Ab dem 2. des Monats entsteht für jeden aktiven Kunden ein Bericht über den Vormonat. Die Einstufung (gut, mittel, schwach) sieht nur ihr. Mittel und
        schwach gehen nie automatisch raus. <Link href="/admin/monatsberichte" className="underline">Zu den Berichten</Link>
      </p>
      <ReportSettingsForm s={s} />
    </main>
  );
}
