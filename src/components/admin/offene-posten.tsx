import Link from "next/link";
import { Badge } from "@/components/ui";
import type { OffenerPosten } from "@/lib/mahnwesen-server";
import { ART_LABEL, type MahnArt } from "@/lib/mahnwesen";

// Offene Posten mit Mahnstufe (Mahnwesen, lib/mahnwesen-server.ts): eine Zeile je offener Rechnung. Genutzt in
// Zahlen → Offene Posten und in der Kundenakte unter Abrechnung (ohne Kundenspalte).

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const fmt = (iso: string) => iso.split("-").reverse().join(".");

export function MahnstufeBadge({ p }: { p: Pick<OffenerPosten, "stufe" | "stufeLabel" | "gestoppt" | "tage"> }) {
  if (p.gestoppt) return <Badge tone="neutral">Gestoppt</Badge>;
  const tone = p.stufe >= 4 ? "danger" : p.stufe >= 2 || p.tage > 0 ? "warning" : "info";
  return <Badge tone={tone}>{p.stufeLabel}</Badge>;
}

export function OffenePostenListe({ posten, mitKunde = true }: { posten: OffenerPosten[]; mitKunde?: boolean }) {
  // Kundenakte (halbe Breite): immer untereinander; Übersicht: ab sm in Spalten
  const sm = (c: string) => (mitKunde ? c : "");
  return (
    <ul className="divide-y divide-[color:var(--border)]" data-offene-posten>
      {posten.map((p) => (
        <li key={p.id} className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 px-5 py-3 text-sm ${sm("sm:grid-cols-[minmax(0,1fr)_7rem_8rem_13rem] sm:items-center")}`}>
          <div className="min-w-0">
            {mitKunde ? (
              <div className="truncate font-semibold">
                {p.customerId ? (
                  <Link href={`/admin/neu/kunden/${p.customerId}/abrechnung`} className="hover:underline">
                    {p.kunde}
                  </Link>
                ) : (
                  p.kunde
                )}
              </div>
            ) : null}
            <div className={mitKunde ? "truncate text-xs text-[color:var(--muted)]" : "truncate font-medium"}>
              {p.hostedUrl ? (
                <a href={p.hostedUrl} target="_blank" rel="noreferrer" className="hover:underline">
                  {p.nummer}
                </a>
              ) : (
                p.nummer
              )}{" "}
              · {ART_LABEL[p.art as MahnArt] ?? p.art}
            </div>
          </div>
          <div className="text-right font-semibold tabular-nums">{eur(p.betrag)}</div>
          <div className={`col-span-2 text-xs text-[color:var(--muted)] ${sm("sm:col-span-1")}`}>
            fällig {fmt(p.faellig)}
            <span className={sm("sm:block")}>
              {" · "}
              {p.tage > 0 ? <span className="font-medium text-rose-700">{p.tage} Tage drüber</span> : p.tage === 0 ? "heute" : `in ${-p.tage} Tagen`}
            </span>
          </div>
          <div className={`col-span-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 ${sm("sm:col-span-1 sm:flex-col sm:items-start")}`}>
            <MahnstufeBadge p={p} />
            <span className="text-xs text-[color:var(--muted)]">
              {p.gestoppt ? p.gestoppt : p.naechste ? `Nächste: ${p.naechste.label}, ${fmt(p.naechste.tag)}` : "Alle Stufen erledigt"}
            </span>
            {p.fehler ? <span className="text-xs text-rose-700">{p.fehler}</span> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
