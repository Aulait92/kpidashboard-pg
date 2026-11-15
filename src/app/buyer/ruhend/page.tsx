import { redirect } from "next/navigation";
import { Download, TrendingUp } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { getBuyerContext, getDormantContext } from "@/lib/buyer-context";
import { loadRetentionView } from "@/lib/ruhend";
import { todayBerlin } from "@/lib/pause";
import { Aufbewahrung } from "../konto/aufbewahrung";
import { dormantRetentionAction } from "./actions";
import { Reaktivieren } from "./reaktivieren";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ihr Konto ruht | performancegrowth" };

const fmt = (iso: string) => iso.split("-").reverse().join(".");

// Ruhendes Konto (Vertrag beendet, lib/ruhend.ts): die einzige Seite im Kundenbereich. Daten herunterladen, Konto
// reaktivieren, Aufbewahrung ändern (auch sofort löschen). Berater sehen nur den Hinweis.
export default async function RuhendPage() {
  const ctx = await getDormantContext();
  if (!ctx) redirect((await getBuyerContext()) ? "/buyer" : "/login");
  const view = await loadRetentionView(ctx.customerId);
  if (!view) redirect("/login");
  const owner = ctx.teamRole === "owner";
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-[color:var(--surface-sunken)]">
      <header className="px-5 pt-5 sm:px-8 sm:pt-7">
        <span className="inline-flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--brand)] text-white">
            <TrendingUp className="h-4 w-4" strokeWidth={2.75} aria-hidden="true" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">
            performance<span className="text-[color:var(--brand)]">growth</span>
          </span>
        </span>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-5 px-4 py-8 sm:px-6" data-ruhend>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ihr Konto ruht</h1>
          <p className="mt-2 text-[15px] text-[color:var(--muted)]">
            {view.endIso ? `Ihr Vertrag endete am ${fmt(view.endIso)}. ` : ""}
            Ihre Kampagnen sind gestoppt. Ihre Daten speichern wir nur noch und verarbeiten sie nicht weiter, damit Sie jederzeit zurückkommen können.
            {view.lastDayIso && view.choice !== "sofort" ? ` Am ${fmt(nextDay(view.lastDayIso))} löschen wir sie endgültig.` : ""}
          </p>
        </div>

        {owner ? (
          <>
            <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5" id="reaktivieren">
              <h2 className="text-base font-semibold">Konto reaktivieren</h2>
              <p className="mt-1 text-sm text-[color:var(--muted)]">
                Ihr Konto ist sofort wieder aktiv, alle Leads, Kunden und Einstellungen sind unverändert da. Wir melden uns, um Paket, Preis und den Start
                Ihrer Kampagnen mit Ihnen abzustimmen. Kosten entstehen erst, wenn Sie dem zugestimmt haben.
              </p>
              <div className="mt-3">
                <Reaktivieren />
              </div>
            </section>

            <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5" id="export">
              <h2 className="text-base font-semibold">Daten exportieren</h2>
              <p className="mt-1 text-sm text-[color:var(--muted)]">
                Alle Ihre Leads, Abschlüsse, Termine, Chats, Bestandskunden mit Verträgen und das Einwilligungsprotokoll als ZIP mit Excel-Dateien (CSV).
              </p>
              <a href="/buyer/konto/export" className={`${buttonClass("secondary", "md")} mt-3`} data-ruhend-export>
                <Download className="h-4 w-4" /> Daten herunterladen (ZIP)
              </a>
            </section>

            {view.endIso && view.choice ? (
              <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5">
                <h2 className="mb-2 text-base font-semibold">Aufbewahrung Ihrer Daten</h2>
                <Aufbewahrung endIso={view.endIso} choice={view.choice} todayIso={todayBerlin()} dormant action={dormantRetentionAction} />
              </section>
            ) : null}
          </>
        ) : (
          <p className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 text-sm">
            Der Inhaber Ihres Kontos kann die Daten herunterladen oder das Konto reaktivieren. Bitte wenden Sie sich an ihn.
          </p>
        )}

        <form action="/api/auth/logout" method="post">
          <button type="submit" className="text-sm font-medium text-[color:var(--muted)] underline">
            Abmelden
          </button>
        </form>
      </main>
    </div>
  );
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
