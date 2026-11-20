import { connection } from "next/server";
import { Gift, Settings } from "lucide-react";
import { EmpfehlungenAnsicht } from "@/components/admin/empfehlungen-ansicht";
import { ButtonLink, Card, EmptyState } from "@/components/ui";
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
      titel="Marketing"
      reiter="marketing"
      zurueck={{ href: "/admin/neu/vertrieb", label: "Verkaufen" }}
      aktionen={
        <ButtonLink href="/admin/neu/einstellungen/kollegen-empfehlen" variant="ghost" icon={Settings}>
          Prämie einstellen
        </ButtonLink>
      }
    >
      <EmpfehlungenAnsicht
        leer={
          <div data-funktion="page--kennzahlen-und-alle-empfehlungen-mit-stand-und">
            <Card>
            <EmptyState
              icon={Gift}
              title="Noch keine Empfehlungen"
              text="Kunden empfehlen Sie mit ihrem persönlichen Link. Kennzahlen und Prämien erscheinen hier mit der ersten Empfehlung."
              action={
                <ButtonLink href="/admin/neu/einstellungen/kollegen-empfehlen" variant="primary" size="md" icon={Settings}>
                  Prämie einstellen
                </ButtonLink>
              }
            />
            </Card>
          </div>
        }
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
