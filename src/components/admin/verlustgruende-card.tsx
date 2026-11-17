// Admin: Verlustgründe (Ole, 15.11.2026), dieselbe Auswertung wie „Warum Leads verloren gehen“ im Kundenbereich
// (lib/verlustgruende.ts), 90 Tage. Mit customerId für die Kundenakte, ohne als Übersicht über alle Kunden.
// „Anzeigen prüfen“: viele Leads ohne Interesse, mit falschen Daten oder ohne Anfrage liegen eher an der Kampagne
// als am Vermittler (Hinweis für die wöchentliche Optimierung je Werbekonto).

import { nowMs } from "@/lib/now";
import { CALL_ATTEMPTS_TARGET } from "@/lib/lead-lost";
import { schnittVerluste, verlustAdmin } from "@/lib/verlustgruende-server";
import { kampagnenHinweis, prozent, VERLUST_LABEL, type VerlustKey, type VerlustVerteilung } from "@/lib/verlustgruende";

const anteil = (v: VerlustVerteilung, k: VerlustKey) => v.gruende.find((g) => g.key === k)?.share ?? 0;

export async function VerlustgruendeCard({ customerId }: { customerId?: string }) {
  const now = new Date(nowMs());
  const range = { from: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000), to: now };
  const [{ gesamt, kunden }, avg] = await Promise.all([verlustAdmin(range, customerId), schnittVerluste(now)]);

  if (customerId) {
    const v = kunden[0]?.verteilung;
    if (!v?.total) return null;
    const hinweis = kampagnenHinweis(v);
    return (
      <details className="card px-4 py-3 text-sm" data-verlustgruende-admin open={!!hinweis}>
        <summary className="cursor-pointer font-medium">
          Verlustgründe (90 Tage): {v.total} verloren
          {hinweis ? <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">Anzeigen prüfen</span> : null}
        </summary>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1">Grund</th>
              <th className="py-1 text-right">Anzahl</th>
              <th className="py-1 text-right">Anteil</th>
              <th className="py-1 text-right">Schnitt alle</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {v.gruende.map((g) => (
              <tr key={g.key} className="border-t border-slate-100">
                <td className="py-1">{g.label}</td>
                <td className="py-1 text-right">{g.count}</td>
                <td className="py-1 text-right">{prozent(g.share)}</td>
                <td className="py-1 text-right text-slate-500">{avg && g.key !== "ohne" ? prozent(avg[g.key] ?? 0) : "k. A."}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-slate-500">
          Nie erreicht und unter {CALL_ATTEMPTS_TARGET} Anrufversuchen aufgegeben: {v.unterVersuchen}.
          {hinweis ? ` ${prozent(hinweis.anteil)} ohne Interesse, mit falschen Daten oder ohne Anfrage: Zielgruppe, Anzeigentext und Formular prüfen.` : ""}
        </p>
      </details>
    );
  }

  if (!gesamt.total) return null;
  const spalten: VerlustKey[] = ["nicht_erreichbar", "kein_interesse", "schon_versichert", "passt_nicht", "falsche_daten", "nicht_angefragt"];
  return (
    <section className="card overflow-x-auto p-4 text-sm" data-verlustgruende-admin-alle>
      <h2 className="mb-1 font-medium">Verlustgründe aller Kunden (90 Tage)</h2>
      <p className="mb-3 text-slate-500">
        Anteil je Grund an den verlorenen Leads. „Anzeigen prüfen“: mindestens 40 % ohne Interesse, falsche Daten oder ohne Anfrage (ab 10 verlorenen Leads).
      </p>
      <table className="w-full min-w-[720px]">
        <thead className="text-left text-xs text-slate-500">
          <tr>
            <th className="py-1">Kunde</th>
            <th className="py-1 text-right">Verloren</th>
            {spalten.map((k) => (
              <th key={k} className="py-1 text-right">
                {VERLUST_LABEL[k]}
              </th>
            ))}
            <th className="py-1 text-right">Unter {CALL_ATTEMPTS_TARGET} Versuchen</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          <tr className="border-t border-slate-200 font-semibold">
            <td className="py-1">Alle Kunden</td>
            <td className="py-1 text-right">{gesamt.total}</td>
            {spalten.map((k) => (
              <td key={k} className="py-1 text-right">
                {prozent(anteil(gesamt, k))}
              </td>
            ))}
            <td className="py-1 text-right">{gesamt.unterVersuchen}</td>
          </tr>
          {kunden.map((c) => (
            <tr key={c.customerId} className="border-t border-slate-100">
              <td className="py-1">
                <a href={`/admin/neu/kunden/${c.customerId}/leads`} className="hover:underline">
                  {c.name}
                </a>
                {c.kampagne ? <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">Anzeigen prüfen</span> : null}
              </td>
              <td className="py-1 text-right">{c.verteilung.total}</td>
              {spalten.map((k) => (
                <td key={k} className="py-1 text-right">
                  {prozent(anteil(c.verteilung, k))}
                </td>
              ))}
              <td className="py-1 text-right">{c.verteilung.unterVersuchen}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
