import Link from "next/link";
import { ReferralSettingsForm } from "@/app/admin/einstellungen/empfehlungen/form";
import { EinstellungSeite, ziel } from "@/components/admin-neu/einstellungen/rahmen";
import { Card } from "@/components/ui";
import { loadReferralSettings } from "@/lib/kollegen";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Kollegen empfehlen | performancegrowth Admin" };

// Kollegen empfehlen (Demo „e-empfehlen“, heute /admin/einstellungen/empfehlungen): Programm, Prämie, Vorteil,
// dasselbe Formular. Übersicht und offene Prämien unter Marketing → Empfehlungen.
export default async function Page() {
  await requireAuth();
  const s = await loadReferralSettings();
  return (
    <EinstellungSeite pfad="/admin/neu/einstellungen/kollegen-empfehlen">
      <Card>
        <div className="p-5" data-funktion="actions-savereferralsettingsaction--programm-aktiv-hinweise-an-kunden-praemie-fest">
          <ReferralSettingsForm initial={s} />
        </div>
      </Card>
      <p className="text-sm text-[color:var(--muted)]">
        Empfehlungen und offene Prämien:{" "}
        <Link href={ziel("/admin/marketing/empfehlungen")} className="text-[color:var(--brand)] hover:underline">
          Marketing → Empfehlungen
        </Link>
      </p>
    </EinstellungSeite>
  );
}
