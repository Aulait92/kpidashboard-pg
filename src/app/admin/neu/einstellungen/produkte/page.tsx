import { ProduktZeile } from "@/components/admin-neu/einstellungen/produkt-zeile";
import { EinstellungSeite } from "@/components/admin-neu/einstellungen/rahmen";
import { Card } from "@/components/ui";
import { PRICE_LIST } from "@/lib/offer-pricing";
import { loadCatalog } from "@/lib/produkt-buchen";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Produkte | performancegrowth Admin" };

const eur0 = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;

// Produkte zum Selbst-Dazubuchen (heute /admin/einstellungen/produkte): je Sparte eine Zeile zum Aufklappen (buchbar, bewährt,
// Nutzen-Text) und dieselbe Server Action.
export default async function Page() {
  await requireAuth();
  const catalog = await loadCatalog();
  const einrichtung = PRICE_LIST.extraProductSetupSelfService > 0 ? eur0(PRICE_LIST.extraProductSetupSelfService) : "kostenlos";
  return (
    <EinstellungSeite pfad="/admin/neu/einstellungen/produkte">
      <Card>
        <div
          className="divide-y divide-[color:var(--border)]"
          data-funktion="actions-savecatalogitemaction--produkt-buchbar-an-aus actions-savecatalogitemaction--produkt-als-bewaehrt-markieren-und-nutzen-text"
        >
          {catalog.map((c) => (
            <ProduktZeile key={c.key} item={c} />
          ))}
        </div>
      </Card>
      <p className="text-sm text-[color:var(--muted)]">
        Je weiteres Produkt: Einrichtung {einrichtung}, {eur0(PRICE_LIST.extraProductMonthly)} im Monat (netto). Kunden buchen unter Konto & Rechnungen → Produkte; ohne „bewährt“ erscheint
        das Abzeichen „Neu“.
      </p>
    </EinstellungSeite>
  );
}
