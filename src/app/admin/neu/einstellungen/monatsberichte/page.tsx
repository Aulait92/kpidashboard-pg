import Link from "next/link";
import { ReportSettingsForm } from "@/app/admin/einstellungen/monatsberichte/form";
import { EinstellungSeite, ziel } from "@/components/admin-neu/einstellungen/rahmen";
import { loadReportSettings } from "@/lib/monatsbericht/server";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Monatsberichte | performancegrowth Admin" };

// Monatsberichte (Demo „e-berichte“, heute /admin/einstellungen/monatsberichte): Versand und Einstufung, dasselbe
// Formular. Die Berichte selbst liegen unter Kunden → Monatsberichte.
export default async function Page() {
  await requireAuth();
  const s = await loadReportSettings();
  return (
    <EinstellungSeite pfad="/admin/neu/einstellungen/monatsberichte">
      <div data-funktion="actions-savereportsettingsaction--gute-berichte-automatisch-senden actions-savereportsettingsaction--einstufung-gut-schwach-ziel-leadpreis-absender">
        <ReportSettingsForm s={s} />
      </div>
      <p className="text-sm text-[color:var(--muted)]">
        Mittel und schwach gehen nie automatisch raus.{" "}
        <Link href={ziel("/admin/neu/kunden/berichte")} className="text-[color:var(--brand)] hover:underline">
          Zu den Berichten
        </Link>
      </p>
    </EinstellungSeite>
  );
}
