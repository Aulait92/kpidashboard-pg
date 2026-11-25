// Karte „Warum Leads verloren gehen“ auf /buyer/zahlen (Ole, 15.11.2026): Verteilung nach Verlustgrund im Zeitraum
// der Seite, Vergleich mit dem Vorzeitraum und dem anonymen Schnitt aller Kunden, Klick auf einen Grund zeigt diese
// Kontakte, bis zu zwei Tipps. Ohne verlorene Leads im Zeitraum keine Karte. Rechnung: lib/verlustgruende.ts.

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { FilterChips } from "@/components/ui/filter-chips";
import { ZahlenTippsCard } from "@/components/zahlen-tipps-card";
import { formatNumber } from "@/lib/format";
import { CALL_ATTEMPTS_TARGET } from "@/lib/lead-lost";
import { verlustKarte, type VerlustKarteDaten } from "@/lib/verlustgruende-server";
import { prozent } from "@/lib/verlustgruende";

export async function VerlustKarte({
  customerId,
  range,
  params,
  daten,
  eingebettet = false,
}: {
  customerId: string;
  range: { from: Date; to: Date };
  /** Suchparameter der Seite: Zeitraum für die Links, Filter vgp (Produkt) und vgb (Berater). */
  params: Record<string, string | undefined>;
  /** Schon geladen (Wachstum braucht den häufigsten Grund auch für den Trichter). */
  daten?: VerlustKarteDaten;
  /** Als Zeile im Kasten „Details“ auf Wachstum (Ole, 18.11.2026): ohne eigenen Rahmen. */
  eingebettet?: boolean;
}) {
  const d = daten ?? (await verlustKarte(customerId, range, { produkt: params.vgp ?? null, berater: params.vgb ?? null }));
  const filterAktiv = !!(params.vgp || params.vgb);
  if (d.verteilung.total === 0 && !filterAktiv) return null;
  const top = d.verteilung.gruende.find((g) => g.key !== "ohne") ?? d.verteilung.gruende[0];
  const keep = new URLSearchParams();
  for (const k of ["range", "from", "to"] as const) if (params[k]) keep.set(k, params[k]!);
  const kontakteHref = (key: string) => {
    const p = new URLSearchParams(keep);
    p.set("verlust", key);
    if (params.vgp) p.set("produkt", params.vgp);
    return `/buyer/kontakte?${p.toString()}`;
  };
  const max = Math.max(...d.vergleich.map((z) => z.share), 0.01);
  const mitSchnitt = d.vergleich.some((z) => z.avgShare != null);

  return (
    <details
      id="verlust"
      className={
        eingebettet
          ? "group scroll-mt-20 [&>summary::-webkit-details-marker]:hidden"
          : "group scroll-mt-20 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-md)] [&>summary::-webkit-details-marker]:hidden"
      }
      open={eingebettet ? filterAktiv : d.tipps.length > 0 || filterAktiv}
      data-verlust-karte
    >
      <summary className={`flex cursor-pointer items-center justify-between gap-3 ${eingebettet ? "px-5 py-4" : "px-5 py-3.5"}`}>
        <span className="min-w-0">
          <span className={`block font-semibold ${eingebettet ? "text-base" : "text-[15px]"}`}>Warum Leads verloren gehen</span>
          {top ? (
            <span className="block truncate text-sm text-[color:var(--muted)]">
              {formatNumber(d.verteilung.total)} verloren, am häufigsten: {top.label} ({prozent(top.share)})
            </span>
          ) : null}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[color:var(--muted)] transition group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t border-[color:var(--border)] p-5">
        {d.produkte.length || d.berater.length ? (
          <FilterChips
            noSearch
            searchKey="vgq"
            fields={[
              ...(d.produkte.length ? [{ kind: "select" as const, key: "vgp", label: "Produkt", options: d.produkte }] : []),
              ...(d.berater.length ? [{ kind: "select" as const, key: "vgb", label: "Berater", options: d.berater }] : []),
            ]}
          />
        ) : null}
        {d.verteilung.total === 0 ? (
          <p className="text-sm text-[color:var(--muted)]">Mit diesem Filter keine verlorenen Leads im Zeitraum.</p>
        ) : (
          <ul className="space-y-3" aria-label="Verlustgründe">
            {d.vergleich.map((z) => {
              const vs = [
                z.prevShare != null ? `vorher ${prozent(z.prevShare)}` : null,
                z.avgShare != null ? `Schnitt ${prozent(z.avgShare)}` : null,
              ].filter(Boolean);
              return (
                <li key={z.key} data-verlust-grund={z.key}>
                  <Link href={kontakteHref(z.key)} className="group/grund block rounded-[var(--radius-sm)] py-0.5 hover:bg-[color:var(--surface-sunken)]">
                    <span className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-medium group-hover/grund:text-[color:var(--brand)]">{z.label}</span>
                      <span className="shrink-0 tabular-nums">
                        {formatNumber(z.count)} <span className="text-[color:var(--muted)]">· {prozent(z.share)}</span>
                      </span>
                    </span>
                    <span className="relative mt-1 block h-2 rounded-full bg-[color:var(--surface-sunken)]">
                      <span
                        className={`block h-2 rounded-full ${z.key === "ohne" ? "bg-[color:var(--border-strong)]" : "bg-[color:var(--brand)]"}`}
                        style={{ width: `${Math.max(2, (z.share / max) * 100)}%` }}
                      />
                      {z.avgShare != null ? (
                        <span
                          className="absolute -top-0.5 block h-3 w-0.5 rounded bg-[color:var(--foreground)]"
                          style={{ left: `${Math.min(100, (z.avgShare / max) * 100)}%` }}
                          title={`Schnitt aller Kunden ${prozent(z.avgShare)}`}
                        />
                      ) : null}
                    </span>
                    {vs.length ? <span className="mt-0.5 block text-xs text-[color:var(--muted)]">{vs.join(" · ")}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {d.verteilung.unterVersuchen > 0 ? (
          <p className="text-sm text-[color:var(--muted)]" data-verlust-zu-frueh>
            <b className="text-[color:var(--foreground)]">{formatNumber(d.verteilung.unterVersuchen)}</b> {d.verteilung.unterVersuchen === 1 ? "Lead wurde" : "Leads wurden"} nie erreicht und
            mit weniger als {CALL_ATTEMPTS_TARGET} Anrufversuchen aufgegeben.
          </p>
        ) : null}
        <p className="text-xs text-[color:var(--muted)]">
          Vorher: Vorzeitraum.{mitSchnitt ? " Schnitt und Strich im Balken: alle Kunden, anonym, letzte 90 Tage." : ""} Grund auswählen zeigt diese Kontakte.
        </p>
        {d.tipps.length ? <ZahlenTippsCard tips={d.tipps} intro={null} canDismiss={false} /> : null}
      </div>
    </details>
  );
}
