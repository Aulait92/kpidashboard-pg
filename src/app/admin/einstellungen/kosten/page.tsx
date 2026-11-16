import Link from "next/link";
import { requireAuth } from "@/lib/vertrieb/auth";
import { LaufendeKostenListe, ladeKosten } from "@/components/admin/kosten-liste";
import { CostForm, KpiSettingsForm } from "./forms";
import { AdminBack } from "@/components/admin/admin-back";

export const metadata = { title: "Laufende Kosten | performancegrowth Admin" };

// Laufende Kosten (Tools, eigene Werbung) mit Zweck – Grundlage für Marge und
// Kundengewinnungskosten auf der Zahlen-Seite. Liste gemeinsam mit dem neuen Admin (components/admin/kosten-liste.tsx).
export default async function KostenPage() {
  await requireAuth();
  const { costs, settings } = await ladeKosten();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-8 sm:px-6">
      <div>
        <AdminBack href="/admin/einstellungen">Einstellungen</AdminBack>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Laufende Kosten</h1>
        <p className="text-sm text-[color:var(--muted)]">
          Monatliche Kosten mit Zweck. Direkte Kosten senken die Marge, Kundengewinnung fließt in die Kosten je Neukunde. Meta-Werbung kommt automatisch aus dem Abgleich.
        </p>
        <p className="mt-1 text-sm">
          Ausgaben, die über{" "}
          <Link href="/admin/einstellungen/bank" className="text-[color:var(--brand)] hover:underline">Bank & Karten</Link>{" "}
          kommen, hier nicht zusätzlich eintragen (sonst doppelt gezählt).
        </p>
      </div>

      <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
        <LaufendeKostenListe costs={costs} />
      </section>

      <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 shadow-[var(--shadow-sm)] sm:p-5">
        <h2 className="mb-3 font-semibold">Neue Kosten</h2>
        <CostForm cost={{ id: "", name: "", amount: "", purpose: "ppl", startsAt: today, endsAt: "" }} />
      </section>

      <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 shadow-[var(--shadow-sm)] sm:p-5">
        <h2 className="font-semibold">Kundengewinnung</h2>
        <p className="mb-3 text-sm text-[color:var(--muted)]">Gründerzeit für „Kosten je Neukunde mit Gründerzeit“ und die Meta-Kampagnen, die der eigenen Kundengewinnung dienen.</p>
        <KpiSettingsForm hours={settings.founderHoursPerWeek} rate={settings.founderHourlyRate} campaigns={settings.acquisitionCampaigns.join(", ")} pplPilotEnd={settings.pplPilotEnd} />
      </section>
    </main>
  );
}
