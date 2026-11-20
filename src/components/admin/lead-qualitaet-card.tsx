// Kundenakte: Lead-Qualität der letzten 90 Tage (Ole, 13.11.2026) – wie viele Leads disqualifiziert
// wurden und warum, je Produkt. Grundlage, um Formular oder Zielgruppe nachzuschärfen.

import { AUFKLAPP_KARTE, AufklappKopf } from "@/components/admin-neu/kunden/aufklapp";
import { prisma } from "@/lib/prisma";
import { DISQUALIFY_REASONS } from "@/lib/lead-quality";
import { LOST_REASONS } from "@/lib/lead-lost";
import { nowMs } from "@/lib/now";

export async function LeadQualitaetCard({ customerId }: { customerId: string }) {
  const since = new Date(nowMs() - 90 * 24 * 60 * 60 * 1000);
  const [total, disq] = await Promise.all([
    prisma.lead.count({ where: { customerId, createdAt: { gte: since } } }),
    prisma.lead.findMany({
      where: { customerId, createdAt: { gte: since }, status: { in: ["Disqualifiziert", "Disqualified", "Nicht qualifiziert"] } },
      select: { source: true, disqualifyReason: true },
    }),
  ]);
  if (total === 0) return null;
  const pct = (n: number) => `${Math.round((n / total) * 100)} %`;
  const byReason = new Map<string, number>();
  const bySource = new Map<string, number>();
  for (const l of disq) {
    byReason.set(l.disqualifyReason ?? "ohne", (byReason.get(l.disqualifyReason ?? "ohne") ?? 0) + 1);
    const s = l.source?.trim() || "ohne Produkt";
    bySource.set(s, (bySource.get(s) ?? 0) + 1);
  }
  const rows = [
    ...DISQUALIFY_REASONS.map((r) => ({ label: r.label, n: byReason.get(r.key) ?? 0 })),
    // Verloren-Gründe seit 14.11.2026 (lib/lead-lost.ts)
    ...LOST_REASONS.filter((r) => r.status === "Disqualifiziert").map((r) => ({ label: r.label, n: byReason.get(r.key) ?? 0 })),
    { label: "ohne Grund (vor dem 13.11. oder per Ziehen ohne Auswahl)", n: byReason.get("ohne") ?? 0 },
  ].filter((r) => r.n > 0);
  return (
    <details className={`${AUFKLAPP_KARTE} text-sm`} data-lead-qualitaet open={disq.length > 0}>
      <AufklappKopf titel="Lead-Qualität" zusammenfassung={`${disq.length} von ${total} disqualifiziert (${pct(disq.length)}), 90 Tage`} />
      <div className="border-t border-[color:var(--border)] px-5 pb-4 pt-1">
      {disq.length === 0 ? (
        <p className="mt-2 text-slate-500">Keine disqualifizierten Leads.</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-1 text-xs font-semibold text-slate-500">Gründe</h3>
            <ul className="space-y-0.5">
              {rows.map((r) => (
                <li key={r.label} className="flex justify-between gap-3">
                  <span>{r.label}</span>
                  <b className="tabular-nums">{r.n}</b>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold text-slate-500">Nach Produkt</h3>
            <ul className="space-y-0.5">
              {[...bySource.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([s, n]) => (
                  <li key={s} className="flex justify-between gap-3">
                    <span>{s}</span>
                    <b className="tabular-nums">{n}</b>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      )}
      </div>
    </details>
  );
}
