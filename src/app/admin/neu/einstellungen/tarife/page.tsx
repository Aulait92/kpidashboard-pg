import { ChevronDown } from "lucide-react";
import { preisPilotUmschaltenAction } from "@/app/admin/einstellungen/beitraege/actions";
import { EinstellungSeite, LISTE, SchalterKnopf, Zeile } from "@/components/admin-neu/einstellungen/rahmen";
import { Card, CardHeader } from "@/components/ui";
import { PILOT_SCHLUESSEL } from "@/lib/preise/pilot";
import { ladePreisPilot } from "@/lib/preise/pilot-server";
import { gesellschaftName, sortiereGesellschaften, sparteVon } from "@/lib/tarifkatalog";
import { ladeTarifkatalog } from "@/lib/tarifkatalog-laden";
import { requireAuth } from "@/lib/vertrieb/auth";
import { TarifVorschlaege } from "@/components/admin-neu/einstellungen/tarif-vorschlaege";
import { ladeTarifkatalogAktuell, ladeVorschlaege } from "@/lib/tarif-vorschlaege-server";
import type { VorschlagStatus } from "@/lib/tarif-vorschlaege";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tarifkatalog | performancegrowth Admin" };

// Tarifkatalog (Demo „e-tarife“): Beiträge rechnen (Pilot) je Gesellschaft und Sparte an/aus (heute
// /admin/einstellungen/beitraege, dieselbe Server Action), dazu der Katalog nur lesend (Gesellschaften, Tarife, Sparten).
// Der Katalog selbst liegt als Dateien unter data/tarifkatalog; Änderungen laufen über das Repository.
// Oben (Ole, 18.11.2026): Vorschläge von Vermittlern übernehmen bzw. ablehnen (lib/tarif-vorschlaege*.ts); Übernommenes
// liegt in der Datenbank über den Dateien und kommt per Export (scripts/tarif-vorschlaege-export.mjs) in die Dateien.
const STATUS: VorschlagStatus[] = ["offen", "uebernommen", "abgelehnt"];

export default async function Page({ searchParams }: { searchParams: Promise<{ vorschlaege?: string; alle?: string }> }) {
  await requireAuth();
  const sp = await searchParams;
  const status = STATUS.find((s) => s === sp.vorschlaege) ?? "offen";
  const kAktuell = await ladeTarifkatalogAktuell();
  const [aktiv, k, vorschlaege] = await Promise.all([ladePreisPilot(), Promise.resolve(ladeTarifkatalog()), ladeVorschlaege(status, kAktuell)]);

  const pilot = new Map<string, string[]>();
  for (const s of PILOT_SCHLUESSEL) {
    const [g] = s.split("/");
    pilot.set(g, [...(pilot.get(g) ?? []), s]);
  }

  const gesellschaften = new Map<string, { tarife: number; sparten: Set<string>; ungeprueft: number }>();
  for (const t of k.tarife) {
    const g = gesellschaften.get(t.gesellschaft) ?? { tarife: 0, sparten: new Set<string>(), ungeprueft: 0 };
    g.tarife++;
    g.sparten.add(sparteVon(k, t.sparte)?.label ?? t.sparte);
    if (t.ungeprueft) g.ungeprueft++;
    gesellschaften.set(t.gesellschaft, g);
  }

  return (
    <EinstellungSeite pfad="/admin/neu/einstellungen/tarife" breit>
      <TarifVorschlaege ansicht={vorschlaege} status={status} alle={sp.alle === "1"} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Beiträge rechnen (Pilot)" hint="in der Terminvorbereitung" />
          <div data-funktion="actions-preispilotumschaltenaction--beitraege-rechnen-pilot-rechner-je-gesellschaft" data-preis-pilot>
            {[...pilot].map(([g, liste]) => (
              <div key={g}>
                <div className="bg-[color:var(--surface-sunken)] px-5 py-1.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">{gesellschaftName(g)}</div>
                <ul className={LISTE}>
                  {liste.map((s) => {
                    const an = aktiv.includes(s);
                    const label = sparteVon(k, s.split("/")[1])?.label ?? s;
                    return (
                      <Zeile
                        key={s}
                        titel={label}
                        rechts={
                          <form action={preisPilotUmschaltenAction}>
                            <input type="hidden" name="schluessel" value={s} />
                            <input type="hidden" name="an" value={an ? "0" : "1"} />
                            <SchalterKnopf an={an} label={label} data-pilot-schalter={s} />
                          </form>
                        }
                      />
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          <p className="border-t border-[color:var(--border)] px-5 py-3 text-sm text-[color:var(--muted)]">
            An: Vermittler rechnen den Beitrag selbst und legen ihn ab. Beim Freischalten eine Neuigkeit anlegen.
          </p>
        </Card>

        {/* UX-Umbau 20.11.2026: Nachschlagen ist selten, darum eingeklappt; je Gesellschaft eine kurze Zeile (Sparten im Tooltip) */}
        <details className="group self-start rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-md)]">
          <summary className="flex min-h-12 cursor-pointer list-none [&::-webkit-details-marker]:hidden items-center px-5 text-[15px] font-semibold">
            Gesellschaften <span className="ml-1.5 font-normal text-[color:var(--muted)]">{gesellschaften.size}</span>
          <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-[color:var(--muted)] transition group-open:rotate-180" />
          </summary>
          <ul className={`${LISTE} border-t border-[color:var(--border)]`}>
            {sortiereGesellschaften([...gesellschaften.keys()]).map((key) => {
              const g = gesellschaften.get(key)!;
              return (
                <Zeile
                  key={key}
                  titel={gesellschaftName(key)}
                  text={`${g.tarife} ${g.tarife === 1 ? "Tarif" : "Tarife"} · ${g.sparten.size} ${g.sparten.size === 1 ? "Sparte" : "Sparten"}`}
                  title={[...g.sparten].join(", ")}
                  className="min-h-11 py-2"
                  rechts={g.ungeprueft ? <span className="text-xs text-amber-700">{g.ungeprueft} ungeprüft</span> : null}
                />
              );
            })}
            {gesellschaften.size === 0 ? <li className="px-5 py-6 text-sm text-[color:var(--muted)]">Noch keine Tarife im Katalog.</li> : null}
          </ul>
        </details>
      </div>
    </EinstellungSeite>
  );
}
