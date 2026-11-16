import { preisPilotUmschaltenAction } from "@/app/admin/einstellungen/beitraege/actions";
import { EinstellungSeite, LISTE, SchalterKnopf, Zeile } from "@/components/admin-neu/einstellungen/rahmen";
import { Card, CardHeader } from "@/components/ui";
import { PILOT_SCHLUESSEL } from "@/lib/preise/pilot";
import { ladePreisPilot } from "@/lib/preise/pilot-server";
import { gesellschaftName, sortiereGesellschaften, sparteVon } from "@/lib/tarifkatalog";
import { ladeTarifkatalog } from "@/lib/tarifkatalog-laden";
import { requireAuth } from "@/lib/vertrieb/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tarifkatalog | performancegrowth Admin" };

// Tarifkatalog (Demo „e-tarife“): Beiträge rechnen (Pilot) je Gesellschaft und Sparte an/aus (heute
// /admin/einstellungen/beitraege, dieselbe Server Action), dazu der Katalog nur lesend (Gesellschaften, Tarife, Sparten).
// Der Katalog selbst liegt als Dateien unter data/tarifkatalog; Änderungen laufen über das Repository.
export default async function Page() {
  await requireAuth();
  const [aktiv, k] = await Promise.all([ladePreisPilot(), Promise.resolve(ladeTarifkatalog())]);

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
            An: Vermittler rechnen im eigenen Vertriebssystem und legen das Ergebnis ab. Neuigkeit für Kunden erst beim Freischalten anlegen.
          </p>
        </Card>

        <Card>
          <CardHeader title="Gesellschaften" count={gesellschaften.size} />
          <ul className={LISTE}>
            {sortiereGesellschaften([...gesellschaften.keys()]).map((key) => {
              const g = gesellschaften.get(key)!;
              return (
                <Zeile
                  key={key}
                  titel={gesellschaftName(key)}
                  text={`${[...g.sparten].join(", ")} · ${g.tarife} ${g.tarife === 1 ? "Tarif" : "Tarife"}`}
                  rechts={g.ungeprueft ? <span className="text-xs text-amber-700">{g.ungeprueft} ungeprüft</span> : null}
                />
              );
            })}
            {gesellschaften.size === 0 ? <li className="px-5 py-6 text-sm text-[color:var(--muted)]">Noch keine Tarife im Katalog.</li> : null}
          </ul>
        </Card>
      </div>
    </EinstellungSeite>
  );
}
