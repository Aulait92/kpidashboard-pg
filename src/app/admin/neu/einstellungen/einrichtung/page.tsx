import { CalendarDays, CheckCircle2 } from "lucide-react";
import { SetupSettingsForm } from "@/app/admin/einstellungen/einrichtung/form";
import { EinstellungSeite } from "@/components/admin-neu/einstellungen/rahmen";
import { Badge, Card, CardHeader, buttonClass } from "@/components/ui";
import { teamCalendarStatus } from "@/lib/help-call";
import { loadSetupSettings, VIDEO_STEPS } from "@/lib/selbst-einrichtung";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Einrichtung neuer Kunden | performancegrowth Admin" };

// Einrichtung neuer Kunden (Demo „e-einrichtung“): Meta-Business-ID und Erklärvideos je Schritt (heute
// /admin/einstellungen/einrichtung) und der Team-Kalender für 15-Minuten-Hilfetermine (heute unter Anbindungen).
export default async function Page() {
  await requireAuth();
  const [s, team] = await Promise.all([loadSetupSettings(), teamCalendarStatus()]);
  const envHint =
    s.businessIdSource === "einstellung"
      ? "Hier eingetragen. Leer lassen, um die Env-Variable META_BUSINESS_ID zu nutzen."
      : s.businessIdSource === "env"
        ? `Aus der Env-Variable (META_BUSINESS_ID bzw. PG_META_BUSINESS_ID): ${s.businessId}. Ein Eintrag hier hat Vorrang.`
        : `Standard: ${s.businessId}. Bitte prüfen (Business Manager → Einstellungen → Unternehmensinfo).`;
  return (
    <EinstellungSeite pfad="/admin/neu/einstellungen/einrichtung">
      <Card>
        <CardHeader
          title="Hilfetermin-Kalender"
          icon={CalendarDays}
          actions={team.connected ? <Badge tone="success" icon={CheckCircle2}>verbunden</Badge> : <Badge tone="warning">nicht verbunden</Badge>}
        />
        <div className="flex flex-wrap items-center gap-3 p-5 text-sm" data-funktion="page-team-kalender--team-kalender-fuer-hilfetermine-der-kunden">
          <span className="min-w-0 flex-1 text-[color:var(--muted)]">{team.connected ? (team.accountEmail ?? "Team-Kalender verbunden") : "Für 15-Minuten-Hilfetermine der Kunden."}</span>
          <a href={`/api/google/connect?customerId=${team.teamId}`} className={buttonClass("secondary", "md")}>
            {team.connected ? "Neu verbinden" : "Google-Kalender verbinden"}
          </a>
        </div>
      </Card>
      <Card>
        <CardHeader title="Anleitung im Kundenbereich" />
        <div className="p-5" data-funktion="actions-savesetupsettingsaction--meta-business-id-und-erklaervideos-je-schritt">
          <SetupSettingsForm
            initial={{ businessId: s.businessIdSource === "einstellung" ? s.businessId : "", videos: s.videos as Record<string, string> }}
            steps={VIDEO_STEPS}
            envHint={envHint}
          />
        </div>
      </Card>
    </EinstellungSeite>
  );
}
