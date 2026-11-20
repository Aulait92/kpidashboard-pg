import Link from "next/link";
import { connection } from "next/server";
import { HalteForm } from "@/app/admin/einstellungen/halteangebote/form";
import { EinstellungSeite, ziel } from "@/components/admin-neu/einstellungen/rahmen";
import { loadHalteSettings } from "@/lib/halteangebote-server";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Halteangebote | performancegrowth Admin" };

// Halteangebote beim Kündigen (Demo „e-halte“, heute /admin/einstellungen/halteangebote): dasselbe Formular mit allen
// 10 Angeboten und den Regeln für Rabatte, dieselbe Server Action.
export default async function Page() {
  await connection();
  await requireAuth();
  const s = await loadHalteSettings();
  return (
    <EinstellungSeite pfad="/admin/neu/einstellungen/halteangebote">
      <div data-funktion="actions-savehalteaction--halteangebote-je-kuendigungsgrund-an-aus-mit form--regeln-fuer-rabatte-anzeige">
        <HalteForm s={s} />
      </div>
      <p className="text-sm text-[color:var(--muted)]">
        „Trotzdem kündigen“ steht auf jedem Schritt. Auswertung:{" "}
        <Link href={ziel("/admin/neu/zahlen/kunden")} className="text-[color:var(--brand)] hover:underline">
          Geld › Kündigung & Rückkehr
        </Link>
      </p>
    </EinstellungSeite>
  );
}
