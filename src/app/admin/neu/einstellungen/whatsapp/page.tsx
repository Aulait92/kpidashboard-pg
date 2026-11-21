import { connection } from "next/server";
import { FlaskConical, Receipt, Smartphone } from "lucide-react";
import { SupportInboxCard } from "@/app/admin/whatsapp/settings/support-card";
import { EinstellungSeite, LinkZeile, LISTE } from "@/components/admin-neu/einstellungen/rahmen";
import { Card } from "@/components/ui";
import { NEU } from "@/lib/admin-neu/navigation";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "WhatsApp | performancegrowth Admin" };

// Einstellungen › Technik › WhatsApp (Demo „e-vorlagen“, heute /admin/whatsapp/settings): oben die Support-Nummer über
// 360dialog (bestehender Baustein), darunter die Wege zu allem anderen rund um WhatsApp: Meta-Gebühren (Unterseite,
// bis 20.11.2026 eigener Punkt unter Werkzeuge), A/B-Tests der Vorlagen (Liefern) und Nummer/Vorlagen je Kunde (Kundenakte).
export default async function Page({ searchParams }: { searchParams: Promise<{ support?: string }> }) {
  await connection();
  await requireAuth();
  const { support } = await searchParams;
  return (
    <EinstellungSeite pfad="/admin/neu/einstellungen/whatsapp">
      <div className="[&>section]:mt-0 [&>section]:rounded-[var(--radius-lg)] [&>section]:shadow-[var(--shadow-md)]" data-funktion="route-get--support-whatsapp-verbinden-360dialog">
        <SupportInboxCard status={support ?? null} />
      </div>
      <Card>
        <ul className={LISTE}>
          <LinkZeile href={`${NEU}/werkzeuge/meta-gebuehren`} icon={Receipt} titel="Meta-Gebühren" text="Kosten je Kunde und Monat" />
          <LinkZeile href={`${NEU}/leads/ab-tests`} icon={FlaskConical} titel="A/B-Tests der Vorlagen" text="Liefern › A/B-Tests" />
          <LinkZeile href={`${NEU}/kunden`} icon={Smartphone} titel="Nummer und Vorlagen je Kunde" text="In der Kundenakte unter WhatsApp" />
        </ul>
      </Card>
    </EinstellungSeite>
  );
}
