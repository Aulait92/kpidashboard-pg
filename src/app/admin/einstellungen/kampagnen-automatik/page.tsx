import Link from "next/link";
import { loadAutomationSettings } from "@/lib/kampagnen/settings";
import { requireAuth } from "@/lib/vertrieb/auth";
import { AutomationForm } from "./form";

export const metadata = { title: "Kampagnen-Automatik | performancegrowth Admin" };

export default async function KampagnenAutomatikPage() {
  await requireAuth();
  const s = await loadAutomationSettings();
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <Link href="/admin/einstellungen" className="text-sm text-[color:var(--muted)] hover:underline">
        ← Einstellungen
      </Link>
      <h1 className="mb-1 mt-1 text-2xl font-semibold tracking-tight">Kampagnen-Automatik</h1>
      <p className="mb-6 text-sm text-[color:var(--muted)]">
        Was das KI-Agenten-Team bei Kunden-Kampagnen selbst erledigt. Bei Meta wird nie etwas aktiviert – neue Kampagnen und Anzeigen liegen immer pausiert zur Prüfung bereit.
      </p>
      <AutomationForm s={s} />
    </main>
  );
}
