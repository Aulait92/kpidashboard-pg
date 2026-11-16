import Link from "next/link";
import { connection } from "next/server";
import { AbTestCard } from "@/app/admin/whatsapp/settings/ab-test-card";
import { SupportInboxCard } from "@/app/admin/whatsapp/settings/support-card";
import { EinstellungSeite } from "@/components/admin-neu/einstellungen/rahmen";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "WhatsApp-Vorlagen & Support-Nummer | performancegrowth Admin" };

// WhatsApp, globaler Teil (Demo „e-vorlagen“, heute /admin/whatsapp/settings): Support-Nummer über 360dialog verbinden
// und die A/B-Tests der Vorlagen (beides bestehende Bausteine). Assistent, Nummer und Vorlagen je Kunde gehören in die
// Kundenakte → WhatsApp (Bereich Kunden). Der Rücksprung nach dem Verbinden führt noch auf die heutige Seite.
export default async function Page({ searchParams }: { searchParams: Promise<{ support?: string }> }) {
  await connection();
  await requireAuth();
  const { support } = await searchParams;
  return (
    <EinstellungSeite pfad="/admin/neu/einstellungen/whatsapp">
      <div className="[&>section]:mt-0 [&>section]:rounded-[var(--radius-lg)] [&>section]:shadow-[var(--shadow-md)]" data-funktion="route-get--support-whatsapp-verbinden-360dialog">
        <SupportInboxCard status={support ?? null} />
      </div>
      <div className="[&>section]:mt-0 [&>section]:rounded-[var(--radius-lg)] [&>section]:shadow-[var(--shadow-md)]" data-funktion="ab-test-card--a-b-tests-der-vorlagen-mit-antwort-und">
        <AbTestCard />
      </div>
      <p className="text-sm text-[color:var(--muted)]">
        Assistent, Nummer und Vorlagen je Kunde (bis die Kundenakte sie hat):{" "}
        <Link href="/admin/whatsapp/settings" className="text-[color:var(--brand)] hover:underline">
          WhatsApp-Assistent je Kunde
        </Link>
      </p>
    </EinstellungSeite>
  );
}
