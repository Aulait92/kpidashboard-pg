// Admin: tatsächliche Stornoquote der Verträge (gekündigt bzw. storniert pro Jahr / Bestand im
// Jahresmittel), je Kunde (Kundenakte) und über alle Kunden je Sparte bzw. Kunde (Zahlen). Erst ab 20
// Verträgen, sonst „zu wenig Daten“. Rechnung: lib/storno-quote.

import { STORNO_MIN_VERTRAEGE, type RealStorno } from "@/lib/provision";
import { allStornoStats, customerStornoStats, type StornoRow } from "@/lib/storno-quote";
import { loadCustomerProvision } from "@/lib/provision-server";

const pct = (r: number) => `${(Math.round(r * 1000) / 10).toLocaleString("de-DE")} %`;
const quote = (r: RealStorno) => (r.quote != null ? pct(r.quote) : "zu wenig Daten");

function Table({ rows, first }: { rows: StornoRow[]; first: string }) {
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-[color:var(--border)] text-left text-xs text-[color:var(--muted)]">
        <tr>
          <th className="py-1.5 pr-3">{first}</th>
          <th className="px-3 py-1.5 text-right">Verträge</th>
          <th className="px-3 py-1.5 text-right" title="Gekündigt bzw. storniert in den letzten 12 Monaten">gekündigt (12 Monate)</th>
          <th className="px-3 py-1.5 text-right">Bestand im Mittel</th>
          <th className="py-1.5 pl-3 text-right">Quote pro Jahr</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[color:var(--border)] tabular-nums">
        {rows.map((r) => (
          <tr key={r.key}>
            <td className="py-1.5 pr-3">{r.label}</td>
            <td className="px-3 py-1.5 text-right">{r.real.contracts}</td>
            <td className="px-3 py-1.5 text-right">{r.real.cancelled}</td>
            <td className="px-3 py-1.5 text-right">{r.real.avgBestand.toLocaleString("de-DE")}</td>
            <td className={`py-1.5 pl-3 text-right ${r.real.quote == null ? "text-[color:var(--muted)]" : "font-semibold"}`}>{quote(r.real)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Kundenakte: eingestellte und tatsächliche Stornoquote, je Sparte. */
export async function StornoQuoteKunde({ customerId }: { customerId: string }) {
  const [stats, prov] = await Promise.all([customerStornoStats(customerId), loadCustomerProvision(customerId)]);
  return (
    <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white px-4 py-3 text-sm" data-admin-storno>
      <div className="font-semibold">
        Stornoquote: eingestellt {pct(prov.storno)} ({prov.stornoCustom ? "eigene" : "Standard"}) · tatsächlich {quote(stats.overall)}
        <span className="ml-1 font-normal text-[color:var(--muted)]">
          ({stats.overall.contracts} Verträge, {stats.overall.cancelled} gekündigt in 12 Monaten)
        </span>
      </div>
      {stats.bySparte.length > 1 ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-[color:var(--brand)]">je Sparte</summary>
          <div className="mt-2 overflow-x-auto">
            <Table rows={stats.bySparte} first="Sparte" />
          </div>
        </details>
      ) : null}
    </section>
  );
}

/** Admin-Zahlen: über alle Kunden je Sparte und je Kunde. */
export async function StornoQuoteUebersicht({ leerHinweis = false }: { leerHinweis?: boolean } = {}) {
  const s = await allStornoStats();
  if (s.overall.contracts === 0)
    return leerHinweis ? (
      <p className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border)] px-4 py-8 text-center text-sm text-[color:var(--muted)]" data-admin-storno-leer>
        Noch keine Verträge erfasst. Sobald Kunden Abschlüsse eintragen, steht hier die Stornoquote je Sparte und Kunde.
      </p>
    ) : null;
  return (
    <section className="mt-6 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]" data-admin-storno-alle>
      <h2 className="text-[15px] font-semibold">Stornoquote der Verträge (alle Kunden)</h2>
      <p className="mt-0.5 text-xs text-[color:var(--muted)]">
        Gekündigt bzw. storniert in den letzten 12 Monaten geteilt durch den Bestand im Jahresmittel. Erst ab {STORNO_MIN_VERTRAEGE} Verträgen. Gesamt:{" "}
        <b>{quote(s.overall)}</b> ({s.overall.contracts} Verträge).
      </p>
      <div className="mt-3 grid gap-6 lg:grid-cols-2">
        <div className="overflow-x-auto">
          <Table rows={s.bySparte} first="Sparte" />
        </div>
        <div className="overflow-x-auto">
          <Table rows={s.byCustomer.slice(0, 30)} first="Kunde" />
        </div>
      </div>
    </section>
  );
}
