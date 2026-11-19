// Splittests der Lead-Reise (lib/experimente.ts): Stand je Test, Quote der Ziel-Kennzahl je Fassung. Die bessere
// Fassung wird automatisch Standard (Cron, Audit-Log „experiment.gewinner“); hier nur lesen.
import { experimenteUebersicht, type ExperimentUebersicht } from "@/lib/experimente";
import { ALPHA } from "@/lib/whatsapp/ab-test";
import { NOCH_KEINE_DATEN } from "@/lib/platzhalter";

const ZIEL: Record<string, string> = { termin_gebucht: "Termin gebucht", komplettcheck_ja: "Komplettcheck ja", erschienen: "Erschienen" };
const pct = (z: number, n: number) => (n ? `${Math.round((z / n) * 1000) / 10} %` : NOCH_KEINE_DATEN);

function stand(e: ExperimentUebersicht): string {
  if (e.winner) return `Entschieden: Fassung ${e.winner.toUpperCase()} ist Standard.`;
  if (!e.aktiv) return "Angehalten: alle sehen Fassung A.";
  if (e.entscheidung.reason === "zu_wenig") return `Läuft: Entscheidung ab ${e.min} je Fassung.`;
  if (e.entscheidung.reason === "entschieden") return `Fassung ${e.entscheidung.winner?.toUpperCase()} liegt klar vorn, wird beim nächsten Lauf Standard.`;
  return `Läuft: noch kein klarer Unterschied (p = ${e.p.toFixed(3)}, nötig unter ${ALPHA}).`;
}

export async function ExperimenteCard() {
  const liste = await experimenteUebersicht().catch(() => []);
  if (!liste.length) return null;
  return (
    <section id="experimente" className="mt-4 rounded-xl border border-[color:var(--border)] bg-white p-5 text-sm" data-experimente>
      <h2 className="text-base font-semibold">Splittests der Lead-Reise</h2>
      <p className="mt-1 text-[color:var(--muted)]">A ist die bisherige Fassung, B die neue. Die bessere wird automatisch Standard.</p>
      <ul className="mt-3 space-y-3">
        {liste.map((e) => (
          <li key={e.key} className="rounded-lg border border-[color:var(--border)] p-3">
            <div className="font-medium">
              {e.titel} <span className="font-normal text-[color:var(--muted)]">· Ziel: {ZIEL[e.ziel] ?? e.ziel}</span>
            </div>
            <p className="mt-0.5 text-[color:var(--muted)]">{stand(e)}</p>
            <table className="mt-2 w-full max-w-xl">
              <tbody>
                {(["a", "b"] as const).map((v) => (
                  <tr key={v} className={e.winner === v ? "font-semibold text-emerald-800" : undefined}>
                    <td className="py-1 pr-3 align-top">Fassung {v.toUpperCase()}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{e.stats[v].n}</td>
                    <td className="py-1 text-right tabular-nums">
                      {e.stats[v].ziel} ({pct(e.stats[v].ziel, e.stats[v].n)})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <details className="mt-2">
              <summary className="cursor-pointer text-[color:var(--brand)]">Fassungen ansehen</summary>
              <p className="mt-1 text-[color:var(--muted)]">A: {e.a}</p>
              <p className="mt-1 text-[color:var(--muted)]">B: {e.b}</p>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
