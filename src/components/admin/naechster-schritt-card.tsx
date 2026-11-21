// Kundenakte (Admin): „Leads mit nächstem Schritt“ (Ziel 100 %, Warnung unter 80 %) und „vorzeitig verloren“
// (nie erreicht, unter 6 Anrufversuchen auf Verloren gesetzt) je Berater, 90 Tage (Ole, 14.11.2026).

import { AUFKLAPP_KARTE, AufklappKopf } from "@/components/admin-neu/kunden/aufklapp";
import { prisma } from "@/lib/prisma";
import { NEXT_STEP_WARN_BELOW } from "@/lib/lead-next-step";
import { lostEarlyStats, nextStepRate, nextStepRatesByAdvisor } from "@/lib/lead-next-step-server";
import { CALL_ATTEMPTS_TARGET } from "@/lib/lead-lost";
import { nowMs } from "@/lib/now";

const pct = (r: number | null) => (r == null ? "keine Angabe" : `${Math.round(r * 100)} %`);

export async function NaechsterSchrittCard({ customerId }: { customerId: string }) {
  const since = new Date(nowMs() - 90 * 24 * 60 * 60 * 1000);
  const [total, byAdvisor, lost, users] = await Promise.all([
    nextStepRate(customerId),
    nextStepRatesByAdvisor(customerId),
    lostEarlyStats(customerId, since),
    prisma.user.findMany({ where: { customerId, role: "BUYER" }, select: { id: true, email: true, displayName: true } }),
  ]);
  if (total.open === 0 && lost.total.lost === 0) return null;
  const warn = total.rate != null && total.rate < NEXT_STEP_WARN_BELOW;
  const name = (id: string | null) => (id == null ? "Nicht zugeteilt" : (users.find((u) => u.id === id)?.displayName ?? users.find((u) => u.id === id)?.email ?? "Unbekannt"));
  const keys = [...new Set<string | null>([...byAdvisor.keys(), ...lost.byAdvisor.keys()])];
  return (
    <details className={`${AUFKLAPP_KARTE} text-sm`} data-naechster-schritt open={warn}>
      <AufklappKopf
        titel={`Leads mit nächstem Schritt: ${pct(total.rate)}`}
        zusammenfassung={`${total.withoutNextStep} von ${total.open} offenen ohne Schritt · vorzeitig verloren: ${lost.total.early} von ${lost.total.lost}`}
        abzeichen={warn ? <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">unter 80 %</span> : null}
      />
      <div className="overflow-x-auto border-t border-[color:var(--border)] px-5 pb-4 pt-1">
      <p className="mt-2 text-slate-500">
        Nächster Schritt = künftiger Termin, Wiedervorlage oder laufendes Bot-Gespräch (Stand jetzt). Vorzeitig verloren = nie erreicht und unter {CALL_ATTEMPTS_TARGET} Anrufversuchen auf
        Verloren gesetzt (ohne falsche Daten, „nichts angefragt“ und „kein Interesse“ im Gespräch).
      </p>
      {keys.length > 1 || (keys.length === 1 && keys[0] !== null) ? (
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1">Berater</th>
              <th className="py-1 text-right">Nächster Schritt</th>
              <th className="py-1 text-right">Ohne Schritt</th>
              <th className="py-1 text-right">Vorzeitig verloren</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {keys.map((k) => {
              const st = byAdvisor.get(k);
              const lo = lost.byAdvisor.get(k);
              return (
                <tr key={k ?? "none"} className="border-t border-slate-100">
                  <td className="py-1">{name(k)}</td>
                  <td className={`py-1 text-right ${st?.rate != null && st.rate < NEXT_STEP_WARN_BELOW ? "font-semibold text-rose-600" : ""}`}>{pct(st?.rate ?? null)}</td>
                  <td className="py-1 text-right">{st?.withoutNextStep ?? 0}</td>
                  <td className="py-1 text-right">{lo ? `${lo.early} von ${lo.lost}` : "0"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
      </div>
    </details>
  );
}
