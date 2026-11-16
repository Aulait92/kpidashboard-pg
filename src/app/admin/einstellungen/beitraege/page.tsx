import Link from "next/link";
import { requireAuth } from "@/lib/vertrieb/auth";
import { ladePreisPilot } from "@/lib/preise/pilot-server";
import { PILOT_SCHLUESSEL } from "@/lib/preise/pilot";
import { ladeTarifkatalog } from "@/lib/tarifkatalog-laden";
import { gesellschaftName, sparteVon } from "@/lib/tarifkatalog";
import { cn } from "@/lib/utils";
import { preisPilotUmschaltenAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Beiträge rechnen | performancegrowth Admin" };

// Pilot „Beiträge rechnen“ (Ole, 16.11.2026; docs/preise-pilot.md): Schalter je Gesellschaft und Sparte, Standard aus.
// An heißt: In der Terminvorbereitung erscheint „Beiträge rechnen“ (offizieller Rechner, Angaben zum Kopieren), und aus
// einem abgelegten Angebot gelesene Beiträge sind ein Richtwert, bis der Vermittler bestätigt.
export default async function BeitraegePage() {
  await requireAuth();
  const [aktiv, k] = await Promise.all([ladePreisPilot(), Promise.resolve(ladeTarifkatalog())]);
  const gruppen = new Map<string, string[]>();
  for (const s of PILOT_SCHLUESSEL) {
    const [g] = s.split("/");
    gruppen.set(g, [...(gruppen.get(g) ?? []), s]);
  }
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <Link href="/admin/einstellungen" className="text-sm text-[color:var(--muted)] hover:underline">
        ← Einstellungen
      </Link>
      <h1 className="mb-1 mt-1 text-2xl font-semibold tracking-tight">Beiträge rechnen (Pilot)</h1>
      <p className="mb-6 text-sm text-[color:var(--muted)]">
        Ohne automatische Abfrage (Nutzungsbedingungen der Gesellschaft): Vermittler öffnen den offiziellen Rechner, kopieren die Angaben und legen das Ergebnis
        als Screenshot ab. Details: docs/preise-pilot.md.
      </p>
      {[...gruppen].map(([g, liste]) => (
        <section key={g} className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">{gesellschaftName(g)}</h2>
          <ul className="divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]" data-preis-pilot>
            {liste.map((s) => {
              const an = aktiv.includes(s);
              const label = sparteVon(k, s.split("/")[1])?.label ?? s;
              return (
                <li key={s} className="flex min-h-14 items-center gap-3 px-5 py-2">
                  <span className={cn("min-w-0 flex-1 text-sm font-medium", !an && "text-[color:var(--muted)]")}>{label}</span>
                  <form action={preisPilotUmschaltenAction} className="shrink-0">
                    <input type="hidden" name="schluessel" value={s} />
                    <input type="hidden" name="an" value={an ? "0" : "1"} />
                    <button
                      type="submit"
                      role="switch"
                      aria-checked={an}
                      aria-label={`${label} ${an ? "ausschalten" : "einschalten"}`}
                      className={cn("relative h-6 w-11 rounded-full transition", an ? "bg-[color:var(--brand)]" : "bg-slate-300")}
                      data-pilot-schalter={s}
                    >
                      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", an ? "left-[22px]" : "left-0.5")} />
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="text-sm text-[color:var(--muted)]">Jede Änderung steht im Änderungsprotokoll. Neuigkeit für Kunden erst beim Freischalten anlegen.</p>
    </main>
  );
}
