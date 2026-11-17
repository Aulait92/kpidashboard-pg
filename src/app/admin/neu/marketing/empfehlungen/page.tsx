import { connection } from "next/server";
import { Settings } from "lucide-react";
import { EmpfehlungenAnsicht } from "@/components/admin/empfehlungen-ansicht";
import { ButtonLink } from "@/components/ui";
import { Seite } from "@/components/admin-neu/ui/seite";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Empfehlungen | performancegrowth Admin" };

// Marketing → Empfehlungen („Kollegen empfehlen“, früher /admin/marketing/empfehlungen): gleicher Baustein
// components/admin/empfehlungen-ansicht.tsx mit denselben Server Actions. Prämie einstellen liegt unter Einstellungen.
export default async function Page() {
  await connection();
  await requireAuth();
  return (
    <Seite
      titel="Verkaufen"
      reiter="marketing"
      aktionen={
        <ButtonLink href="/admin/einstellungen/empfehlungen" variant="ghost" icon={Settings}>
          Prämie einstellen
        </ButtonLink>
      }
    >
      <EmpfehlungenAnsicht
        funktionen={{
          kennzahlen: "page--kennzahlen-und-alle-empfehlungen-mit-stand-und",
          liste: "page--kennzahlen-und-alle-empfehlungen-mit-stand-und",
          praemie: "actions-markrewarddoneaction--praemie-als-gutgeschrieben-markieren",
          rabatt: "actions-applyreferraldiscountsaction--empfehlungsrabatt-auf-offene-angebote-anwenden",
          top: "page-top-empfehler--top-empfehler-mit-geworbenen-kunden-umsatz",
        }}
      />
    </Seite>
  );
}
