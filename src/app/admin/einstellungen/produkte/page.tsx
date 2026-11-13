import Link from "next/link";
import { loadCatalog } from "@/lib/produkt-buchen";
import { PRICE_LIST } from "@/lib/offer-pricing";
import { requireAuth } from "@/lib/vertrieb/auth";
import { CatalogItemForm } from "./form";

export const metadata = { title: "Produkte | performancegrowth Admin" };

const eur0 = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;

export default async function ProductCatalogPage() {
  await requireAuth();
  const catalog = await loadCatalog();
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <Link href="/admin/einstellungen" className="text-sm text-[color:var(--muted)] hover:underline">
        ← Einstellungen
      </Link>
      <h1 className="mb-1 mt-1 text-2xl font-semibold tracking-tight">Produkte</h1>
      <p className="mb-6 text-sm text-[color:var(--muted)]">
        Welche Sparten Kunden unter Konto & Rechnungen → Produkte selbst dazubuchen können. Preis je weiterem Produkt: Einrichtung {PRICE_LIST.extraProductSetupSelfService > 0 ? eur0(PRICE_LIST.extraProductSetupSelfService) : "kostenlos"},
        {" "}
        {eur0(PRICE_LIST.extraProductMonthly)} im Monat (netto). „Bewährt“ zeigt den Erfahrungswert aus dem Rechner, Testprodukte zeigen „Erfahrungswert folgt“. Garantien gelten
        nur für die Katzenversicherung.
      </p>
      <div className="divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
        {catalog.map((c) => (
          <CatalogItemForm key={c.key} item={c} />
        ))}
      </div>
      <p className="mt-4 text-xs text-[color:var(--muted)]">
        Buchungen starten das KI-Agenten-Team (Kampagne pausiert anlegen; ohne Kampagnen-Automatik als Aufgabe „Kampagne aufsetzen“) und stehen in der Kundenakte → Abrechnung → Produkte. Dort auf „Gestartet“ setzen, sobald die Kampagne läuft.
      </p>
    </main>
  );
}
