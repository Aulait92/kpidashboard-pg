// Trichter einer Bestandskampagne bzw. eines Zeitraums, je Kanal getrennt (Ole, 14.11.2026).
// Spalten nur für Kanäle, die genutzt wurden; Quoten bezogen auf „angeschrieben“.

import { quote, type ChannelFunnel, type Funnel } from "@/lib/bestand/statistik";

const de = (n: number) => n.toLocaleString("de-DE");
const pct = (n: number | null) => (n == null ? "" : `${n.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`);

const ROWS: { key: keyof ChannelFunnel; label: string; quote?: boolean; hint?: string }[] = [
  { key: "angeschrieben", label: "Angeschrieben" },
  { key: "zugestellt", label: "Zugestellt", quote: true, hint: "WhatsApp laut Zustellstatus, E-Mail ohne Bounce" },
  { key: "gelesen", label: "Gelesen", quote: true, hint: "nur WhatsApp (E-Mails ohne Tracking)" },
  { key: "geantwortet", label: "Geantwortet", quote: true },
  { key: "lead", label: "Interessiert (Lead)", quote: true },
  { key: "termin", label: "Termin", quote: true },
  { key: "abschluss", label: "Abschluss", quote: true, hint: "60 Tage nach dem Anschreiben, letzte Kampagne zählt" },
  { key: "abgemeldet", label: "Abgemeldet", quote: true },
  { key: "unzustellbar", label: "Unzustellbar", quote: true },
  { key: "fehlgeschlagen", label: "Fehlgeschlagen" },
  { key: "uebersprungen", label: "Übersprungen" },
  { key: "wartend", label: "Wartet noch" },
];

export function FunnelTable({ funnel }: { funnel: Funnel }) {
  const cols: { key: "whatsapp" | "email" | "gesamt"; label: string }[] = [
    ...(funnel.whatsapp.angeschrieben || funnel.whatsapp.wartend || funnel.whatsapp.uebersprungen || funnel.whatsapp.fehlgeschlagen ? [{ key: "whatsapp" as const, label: "WhatsApp" }] : []),
    ...(funnel.email.angeschrieben || funnel.email.wartend || funnel.email.uebersprungen || funnel.email.fehlgeschlagen ? [{ key: "email" as const, label: "E-Mail" }] : []),
  ];
  if (cols.length !== 1) cols.push({ key: "gesamt", label: "Gesamt" });
  return (
    <div className="overflow-x-auto" data-funnel>
      <table className="w-full text-sm">
        <thead className="border-b border-[color:var(--border)] text-left text-xs text-[color:var(--muted)]">
          <tr>
            <th className="px-5 py-2 font-medium" />
            {cols.map((c) => (
              <th key={c.key} className="px-3 py-2 text-right font-medium last:pr-5" data-funnel-col={c.key}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[color:var(--border)] tabular-nums">
          {ROWS.map((r) => {
            const values = cols.map((c) => funnel[c.key][r.key] as number | null);
            if (values.every((v) => !v) && !["angeschrieben", "geantwortet", "abschluss"].includes(r.key)) return null;
            return (
              <tr key={r.key} data-funnel-row={r.key}>
                <td className="px-5 py-2" title={r.hint}>
                  {r.label}
                </td>
                {cols.map((c) => {
                  const v = funnel[c.key][r.key] as number | null;
                  return (
                    <td key={c.key} className="px-3 py-2 text-right last:pr-5">
                      {v == null ? <span className="text-[color:var(--muted)]">keine Angabe</span> : de(v)}
                      {r.quote && v != null && funnel[c.key].angeschrieben ? (
                        <span className="ml-1.5 text-xs text-[color:var(--muted)]">{pct(quote(v, funnel[c.key].angeschrieben))}</span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
