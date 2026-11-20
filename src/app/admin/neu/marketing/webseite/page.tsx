import { connection } from "next/server";
import { ExternalLink } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { Seite } from "@/components/admin-neu/ui/seite";
import { RechnerForm } from "@/app/admin/einstellungen/rechner/form";
import { cplFromData, loadRechnerConfig } from "@/lib/rechner-server";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Webseite & Rechner | performancegrowth Admin" };

// Marketing → Webseite & Rechner (früher Einstellungen → Rechner und „Rechner öffnen“ in der Marketing-Leiste):
// öffentlicher Break-even-Rechner mit Produkten, Erfahrungswerten, Texten, Kontakt-Link und Garantien.
// Gleiches Formular und gleiche Server Action wie /admin/einstellungen/rechner.
// Umbau 19.11.2026: Einrichtung statt Alltag, darum kein Reiter mehr (Zugang: Unterlagen → „Rechner einrichten“, „Mehr“ in
// Verkaufen, Suche). Formular kompakt: Produkte und Garantien, Texte zugeklappt mit Zusammenfassung, ein Speichern-Knopf darunter.
export default async function Page() {
  await connection();
  await requireAuth();
  const config = await loadRechnerConfig();
  const data = await Promise.all(config.products.map((p) => cplFromData(p).catch(() => null)));
  const dataInfo = Object.fromEntries(config.products.map((p, i) => [p.key, data[i]]));
  return (
    <Seite
      titel="Webseite & Rechner"
      zurueck={{ href: "/admin/neu/marketing/unterlagen", label: "Unterlagen" }}
      aktionen={
        <span data-funktion="nav--oeffentlichen-rechner-oeffnen">
          <ButtonLink href="/rechner" external icon={ExternalLink}>
            Rechner öffnen
          </ButtonLink>
        </span>
      }
    >
      <div className="max-w-3xl" data-funktion="actions-saverechneraction--rechner-produkte-quoten-kosten-garantien-texte">
        <RechnerForm config={config} dataInfo={dataInfo} kompakt />
      </div>
    </Seite>
  );
}
