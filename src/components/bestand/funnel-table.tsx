// Ergebnis einer Bestandskampagne (Paket 2, 20.11.2026): senkrechte Balkenliste Angeschrieben → Antwort → Termin →
// Abschluss, Quoten bezogen auf „angeschrieben“. Kanalaufteilung und Nebenzahlen (zugestellt, gelesen, abgemeldet …)
// im Aufklapper. Am Handy ohne waagerechtes Scrollen, Prozentwerte brechen nicht um.

import { ChevronDown } from "lucide-react";
import { quote, type ChannelFunnel, type Funnel } from "@/lib/bestand/statistik";

const de = (n: number) => n.toLocaleString("de-DE");
const pct = (n: number | null) => (n == null ? "" : `${n.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`);

const STEPS: { key: keyof ChannelFunnel; label: string; hint?: string }[] = [
  { key: "angeschrieben", label: "Angeschrieben" },
  { key: "geantwortet", label: "Antwort" },
  { key: "termin", label: "Termin" },
  { key: "abschluss", label: "Abschluss", hint: "60 Tage nach dem Anschreiben, letzte Kampagne zählt" },
];

const DETAILS: { key: keyof ChannelFunnel; label: string; hint?: string }[] = [
  { key: "zugestellt", label: "Zugestellt", hint: "WhatsApp laut Zustellstatus, E-Mail ohne Bounce" },
  { key: "gelesen", label: "Gelesen", hint: "nur WhatsApp (E-Mails ohne Tracking)" },
  { key: "lead", label: "Interessiert (Lead)" },
  { key: "abgemeldet", label: "Abgemeldet" },
  { key: "unzustellbar", label: "Unzustellbar" },
  { key: "fehlgeschlagen", label: "Fehlgeschlagen" },
  { key: "uebersprungen", label: "Übersprungen" },
  { key: "wartend", label: "Wartet noch" },
];

const num = (f: ChannelFunnel, k: keyof ChannelFunnel) => (f[k] as number | null) ?? 0;

/** Balkenbreite in Prozent von „angeschrieben“ (mindestens 4 %, damit kleine Werte sichtbar bleiben). Rein. */
export function barWidth(v: number, base: number): number {
  if (!base || !v) return 0;
  return Math.min(100, Math.max(4, Math.round((v / base) * 100)));
}

/** Senkrechte Balken mit Zahl und Quote, darunter Kanäle und Details im Aufklapper. */
export function FunnelBars({ funnel }: { funnel: Funnel }) {
  const g = funnel.gesamt;
  const base = g.angeschrieben;
  const channels = (["whatsapp", "email"] as const).filter((k) => funnel[k].angeschrieben || funnel[k].wartend || funnel[k].uebersprungen || funnel[k].fehlgeschlagen);
  return (
    <div data-funnel>
      <ol className="space-y-3 px-5 py-4" data-funnel-bars>
        {STEPS.map((s) => {
          const v = num(g, s.key);
          return (
            <li key={s.key} data-funnel-row={s.key} title={s.hint}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{s.label}</span>
                <span className="shrink-0 whitespace-nowrap tabular-nums">
                  <b>{de(v)}</b>
                  {s.key !== "angeschrieben" && base ? <span className="ml-1.5 text-xs text-[color:var(--muted)]">{pct(quote(v, base))}</span> : null}
                </span>
              </div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-[color:var(--surface-sunken)]">
                <div className="h-full rounded-full bg-[color:var(--brand)]" style={{ width: `${barWidth(v, base)}%` }} />
              </div>
            </li>
          );
        })}
      </ol>
      {channels.length ? (
        <details className="group border-t border-[color:var(--border)]" data-funnel-channels>
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-5 py-2 text-sm font-medium text-[color:var(--brand)] [&::-webkit-details-marker]:hidden">
            <span className="flex-1">Kanäle und Details</span>
            <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
          </summary>
          <div className="grid gap-4 px-5 pb-4 text-sm sm:grid-cols-2">
            {channels.map((k) => {
              const f = funnel[k];
              return (
                <div key={k} data-funnel-col={k}>
                  <p className="font-medium">{k === "whatsapp" ? "WhatsApp" : "E-Mail"}</p>
                  <ul className="mt-1 space-y-0.5 text-[color:var(--muted)]">
                    {[...STEPS, ...DETAILS].map((r) => {
                      const v = f[r.key] as number | null;
                      if (!v && r.key !== "angeschrieben") return null;
                      return (
                        <li key={r.key} className="flex justify-between gap-3" title={r.hint}>
                          <span className="min-w-0 truncate">{r.label}</span>
                          <span className="shrink-0 whitespace-nowrap tabular-nums">
                            {de(v ?? 0)}
                            {r.key !== "angeschrieben" && f.angeschrieben && v ? <span className="ml-1.5 text-xs">{pct(quote(v, f.angeschrieben))}</span> : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </details>
      ) : null}
    </div>
  );
}
