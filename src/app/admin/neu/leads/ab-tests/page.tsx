import { connection } from "next/server";
import { AbTestCard } from "@/app/admin/whatsapp/settings/ab-test-card";
import { ExperimenteCard } from "@/app/admin/whatsapp/settings/experimente-card";
import { FunnelCard } from "./funnel-card";
import { Seite } from "@/components/admin-neu/ui/seite";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "A/B-Tests | performancegrowth Admin" };

// Liefern → A/B-Tests (Ole, 19.11.2026: „die A/B-Test-Ergebnisse und Tests möchte ich im Admin sehen“). Eine Seite für
// alle Tests der Lead-Reise: Vorlagen (Antwort- und Terminquote je Fassung, lib/whatsapp/ab-test.ts) und Splittests
// (Terminvorschlag, Komplettcheck, Buchungsseite, Präsentation, lib/experimente.ts). Vorher nur versteckt unter
// Einstellungen › WhatsApp-Vorlagen. Hypothesen und Lehren: docs/firma/ab-tests.md (A/B-Test-Labor). Dazu die Karte
// „PKV-Funnel“ (eigener Funnel beitrag.pkv-tarife.com, lib/funnel).
export default async function Page() {
  await connection();
  await requireAuth();
  return (
    <Seite titel="Liefern" reiter="liefern">
      <div className="space-y-4 [&>section]:mt-0 [&>section]:rounded-[var(--radius-lg)] [&>section]:shadow-[var(--shadow-md)]" data-funktion="ab-test-card--a-b-tests-der-vorlagen-mit-antwort-und">
        <AbTestCard />
        <ExperimenteCard />
        <FunnelCard />
      </div>
    </Seite>
  );
}
