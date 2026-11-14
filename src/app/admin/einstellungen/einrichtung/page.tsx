import Link from "next/link";
import { requireAuth } from "@/lib/vertrieb/auth";
import { loadSetupSettings, VIDEO_STEPS } from "@/lib/selbst-einrichtung";
import { SetupSettingsForm } from "./form";

export const metadata = { title: "Einrichtung | performancegrowth Admin" };

export default async function SetupSettingsPage() {
  await requireAuth();
  const s = await loadSetupSettings();
  const envHint =
    s.businessIdSource === "einstellung"
      ? "Hier eingetragen. Leer lassen, um die Env-Variable META_BUSINESS_ID zu nutzen."
      : s.businessIdSource === "env"
        ? `Aus der Env-Variable (META_BUSINESS_ID bzw. PG_META_BUSINESS_ID): ${s.businessId}. Ein Eintrag hier hat Vorrang.`
        : `Standard: ${s.businessId}. Bitte prüfen (Business Manager → Einstellungen → Unternehmensinfo).`;
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <Link href="/admin/einstellungen" className="text-sm text-[color:var(--muted)] hover:underline">
        ← Einstellungen
      </Link>
      <h1 className="mb-1 mt-1 text-2xl font-semibold tracking-tight">Einrichtung neuer Kunden</h1>
      <p className="mb-6 text-sm text-[color:var(--muted)]">
        Kunden geben uns unter Kundenbereich → Einrichtung selbst Meta-Zugriff, verbinden WhatsApp und Kalender. Die Business-ID erscheint dort in der
        Anleitung und wird für Partner-Anfragen genutzt. Videos werden beim jeweiligen Schritt eingebettet.
      </p>
      <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
        <SetupSettingsForm
          initial={{ businessId: s.businessIdSource === "einstellung" ? s.businessId : "", videos: s.videos as Record<string, string> }}
          steps={VIDEO_STEPS}
          envHint={envHint}
        />
      </div>
      <p className="mt-4 text-sm text-[color:var(--muted)]">Anleitung und Video-Vorschläge: docs/selbst-einrichtung.md</p>
    </main>
  );
}
