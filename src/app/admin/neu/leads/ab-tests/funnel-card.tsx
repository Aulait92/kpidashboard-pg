// Karte „PKV-Funnel“ (Admin › Liefern › A/B-Tests, Ole 20.11.2026): eigener Funnel beitrag.pkv-tarife.com, letzte
// 30 Tage. Oben die Kette bis zum Ergebnis beim Abnehmer (Haupt-Kennzahl: erreicht je Besucher), darunter der Trichter
// je Schritt und die Funnel-Tests. Nur lesen; Zahlen aus lib/funnel/auswertung.ts (auch Diagnose q=funnel).
import { funnelKennzahlen, type FunnelKennzahlen } from "@/lib/funnel/auswertung";

const pct = (z: number, n: number) => (n > 0 ? `${Math.round((z / n) * 1000) / 10} %` : "–");
const euro = (x: number) => x.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: x < 10 ? 2 : 0 });

function Kette({ k }: { k: FunnelKennzahlen }) {
  const bekannt = k.besucher - k.unbekannt;
  const zeilen: { name: string; wert: number; quote: string; hinweis?: string }[] = [
    { name: "Besucher", wert: k.besucher, quote: "" },
    { name: "Leads", wert: k.leads, quote: pct(k.leads, k.besucher) },
    { name: "Geliefert", wert: k.geliefert, quote: pct(k.geliefert, k.besucher) },
    { name: "Mit Rückmeldung", wert: k.mitRueckmeldung, quote: pct(k.mitRueckmeldung, k.geliefert), hinweis: "der gelieferten" },
    { name: "Erreicht", wert: k.erreicht, quote: pct(k.erreicht, bekannt) },
    { name: "Termin", wert: k.termin, quote: pct(k.termin, bekannt) },
    { name: "Abschluss", wert: k.abschluss, quote: pct(k.abschluss, bekannt) },
  ];
  return (
    <table className="mt-3 w-full text-sm">
      <tbody>
        {zeilen.map((z) => (
          <tr key={z.name} className={z.name === "Erreicht" ? "font-semibold" : undefined}>
            <td className="py-1 pr-2">{z.name}</td>
            <td className="py-1 pr-2 text-right tabular-nums">{z.wert}</td>
            <td className="py-1 text-right tabular-nums text-[color:var(--muted)]">
              {z.quote}
              {z.hinweis && z.quote !== "–" ? <span className="hidden sm:inline"> {z.hinweis}</span> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export async function FunnelCard() {
  const k = await funnelKennzahlen().catch(() => null);
  if (!k) return null;
  const max = Math.max(1, ...k.schritte.map((s) => s.angesehen));
  return (
    <section id="pkv-funnel" className="rounded-xl border border-[color:var(--border)] bg-white p-5 text-sm" data-pkv-funnel>
      <h2 className="text-base font-semibold">PKV-Funnel</h2>
      <p className="mt-1 text-[color:var(--muted)]">beitrag.pkv-tarife.com, letzte {k.tage} Tage. Quoten je Besucher; Leads ohne Rückmeldung in der App zählen nicht.</p>
      {k.besucher === 0 ? (
        <p className="mt-3">Noch keine Besucher. Der Funnel ist unter /f/pkv-beitrag erreichbar.</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-[color:var(--surface-sunken)] p-3">
              <div className="text-xs text-[color:var(--muted)]">Erreicht je Besucher</div>
              <div className="text-lg font-semibold tabular-nums">{pct(k.erreicht, k.besucher - k.unbekannt)}</div>
            </div>
            <div className="rounded-lg bg-[color:var(--surface-sunken)] p-3">
              <div className="text-xs text-[color:var(--muted)]">Umsatz je Besucher</div>
              <div className="text-lg font-semibold tabular-nums">{euro(k.quoten.umsatzJeBesucher)}</div>
            </div>
          </div>
          <Kette k={k} />
          <details className="mt-3">
            <summary className="cursor-pointer text-[color:var(--brand)]">Abbruch je Schritt</summary>
            <ul className="mt-2 space-y-1.5">
              {k.schritte.map((s) => (
                <li key={s.id}>
                  <div className="flex justify-between gap-2">
                    <span className="truncate">{s.name}</span>
                    <span className="shrink-0 tabular-nums text-[color:var(--muted)]">
                      {s.angesehen} · weiter {pct(s.beantwortet, s.angesehen)}
                    </span>
                  </div>
                  <div className="mt-0.5 h-1.5 rounded-full bg-[color:var(--surface-sunken)]">
                    <div className="h-full rounded-full bg-[color:var(--brand)]" style={{ width: `${Math.round((s.angesehen / max) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[color:var(--muted)]">
              Nicht passend: gesetzlich {k.abbrueche.gesetzlich}, Beitrag unter 650 € {k.abbrueche.unter_650}, Debeka {k.abbrueche.debeka}. Rückmeldung da bei {k.rueckmeldungDa} von {k.mitRueckmeldung}.
            </p>
          </details>
        </>
      )}
      {k.tests.filter((t) => t.aktiv).map((t) => (
        <div key={t.key} className="mt-3 rounded-lg border border-[color:var(--border)] p-3">
          <div className="font-medium">{t.titel}</div>
          <table className="mt-2 w-full">
            <thead className="text-xs text-[color:var(--muted)]">
              <tr>
                <th className="text-left font-normal">Fassung</th>
                <th className="text-right font-normal">Besucher</th>
                <th className="text-right font-normal">Leads</th>
                <th className="text-right font-normal">Erreicht (reif)</th>
              </tr>
            </thead>
            <tbody>
              {(["a", "b"] as const).map((v) => (
                <tr key={v}>
                  <td className="py-1">{v.toUpperCase()}</td>
                  <td className="py-1 text-right tabular-nums">{t[v].besucher}</td>
                  <td className="py-1 text-right tabular-nums">{t[v].leads}</td>
                  <td className="py-1 text-right tabular-nums">
                    {t[v].erreicht} ({pct(t[v].erreicht, t[v].reif)})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}
