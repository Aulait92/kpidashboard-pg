import { AutomationForm } from "@/app/admin/einstellungen/kampagnen-automatik/form";
import { GlobalForm } from "@/app/admin/optimierung/ui";
import { EinstellungSeite } from "@/components/admin-neu/einstellungen/rahmen";
import { loadAutomationSettings } from "@/lib/kampagnen/settings";
import { loadOptimizationSettings } from "@/lib/optimierung/server";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Kampagnen-Automatik | performancegrowth Admin" };

// Kampagnen-Automatik (Demo „e-automatik“): Regeln des Agenten-Teams (heute /admin/einstellungen/kampagnen-automatik)
// und die globalen Schalter der Optimierung je Werbekonto (heute /admin/optimierung, Spalte „Global“). Beide Formulare
// und Server Actions unverändert; die Werbekonten selbst stehen unter Leads & Kampagnen → Werbekonten.
export default async function Page() {
  await requireAuth();
  const [s, opt] = await Promise.all([loadAutomationSettings(), loadOptimizationSettings()]);
  return (
    <EinstellungSeite pfad="/admin/neu/einstellungen/kampagnen-automatik">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Optimierung je Werbekonto</h2>
        <div data-funktion="actions-saveglobalaction--global-woechentlicher-optimierungslauf-an-aus actions-saveglobalaction--global-autopilot-fuer-alle-konten">
          <GlobalForm enabled={opt.enabled} autopilot={opt.autopilot} knopf="secondary" />
        </div>
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Agenten-Team</h2>
        <div
          data-funktion="actions-saveautomationaction--budgetaenderungen-automatisch-bei-meta-umsetzen actions-saveautomationaction--gebuchte-produkte-starten-das-agenten-team actions-saveautomationaction--muede-anzeigen-erkennen-mit-schwellen-frequenz"
        >
          <AutomationForm s={s} />
        </div>
      </section>
    </EinstellungSeite>
  );
}
