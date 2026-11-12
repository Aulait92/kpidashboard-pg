import Link from "next/link";
import { loadReferralSettings } from "@/lib/kollegen";
import { requireAuth } from "@/lib/vertrieb/auth";
import { ReferralSettingsForm } from "./form";

export const metadata = { title: "Kollegen empfehlen | performancegrowth Admin" };

export default async function ReferralSettingsPage() {
  await requireAuth();
  const s = await loadReferralSettings();
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <Link href="/admin/einstellungen" className="text-sm text-[color:var(--muted)] hover:underline">
        ← Einstellungen
      </Link>
      <h1 className="mb-1 mt-1 text-2xl font-semibold tracking-tight">Kollegen empfehlen</h1>
      <p className="mb-6 text-sm text-[color:var(--muted)]">
        Kunden empfehlen uns an Kollegen weiter (persönlicher Link im Kundenbereich). Übersicht und offene Prämien:{" "}
        <Link href="/admin/vertrieb/empfehlungen" className="text-[color:var(--brand)] underline">
          Vertrieb → Empfehlungen
        </Link>
        .
      </p>
      <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
        <ReferralSettingsForm initial={s} />
      </div>
      <p className="mt-4 text-xs text-[color:var(--muted)]">
        Prämien sind Gutschriften an Geschäftskunden, keine Provision an Versicherungsnehmer. Die steuerliche Behandlung bitte mit dem Steuerberater
        abstimmen (siehe docs/kollegen-empfehlen.md).
      </p>
    </main>
  );
}
