// Hero „Rechnet sich das?“ auf Wachstum (Ole, 18.11.2026, Entwurf docs/ux/wachstum-neu): links die Antwort in einem Satz
// und der Umschalter, rechts die Rechnung (Provision, Bestand dieser Kunden, Kosten, Ergebnis) mit Balken.
// Grün nur für Geld, das reinkommt; ein negatives Ergebnis bleibt schwarz (kein Rot).

import Link from "next/link";
import { Check } from "lucide-react";
import { GewinnModusSwitch } from "@/components/gewinn-modus";
import { euroMitVorzeichen, prozent, type Rechnung } from "@/lib/wachstum";
import { cn } from "@/lib/utils";

export type RechnungZeile = { label: string; betrag: number };

export function RechnetSich({
  rechnung: r,
  antwort,
  zeilen,
  mitBestand,
  makler,
  aktion,
}: {
  rechnung: Rechnung;
  antwort: { titel: string; betont: string | null; rest: string; text: string };
  zeilen: RechnungZeile[];
  mitBestand: boolean;
  makler: boolean;
  /** Nächste Handlung, wenn noch keine Kosten erfasst sind. */
  aktion?: { href: string; label: string } | null;
}) {
  const positiv = r.ergebnis >= 0;
  return (
    <section
      className="grid gap-6 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-md)] sm:p-7 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-10"
      aria-labelledby="rechnet-sich"
      data-rechnet-sich={r.status}
    >
      <div>
        <h2 id="rechnet-sich" className="text-sm font-semibold uppercase tracking-wide text-[color:var(--brand)]">
          Rechnet sich das?
        </h2>
        <p className="mt-2 text-[22px] font-bold leading-snug tracking-tight sm:text-[28px]" data-antwort>
          {antwort.titel}
          {antwort.betont ? (
            <>
              {" "}
              <span className="whitespace-nowrap text-emerald-700">{antwort.betont}</span> {antwort.rest}
            </>
          ) : null}
        </p>
        <p className="mt-3 text-base leading-relaxed text-[color:var(--muted)] sm:text-[17px]">{antwort.text}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <GewinnModusSwitch mitBestand={mitBestand} makler={makler} />
          {aktion ? (
            <Link href={aktion.href} className="inline-flex min-h-10 items-center text-[15px] font-semibold text-[color:var(--brand)] hover:underline">
              {aktion.label}
            </Link>
          ) : null}
        </div>
      </div>

      <div data-rechnung>
        <dl className="space-y-2.5 text-[15px] sm:text-base">
          {zeilen.map((z) => (
            <div key={z.label} className="flex items-baseline justify-between gap-4">
              <dt className="min-w-0 text-[color:var(--muted)]">{z.label}</dt>
              <dd className="shrink-0 font-semibold tabular-nums">{euroMitVorzeichen(z.betrag)}</dd>
            </div>
          ))}
        </dl>
        <div className="my-4 h-px bg-[color:var(--border)]" />
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-base font-semibold">Ergebnis</span>
          <span
            className={cn("text-[38px] font-bold leading-none tracking-tight tabular-nums sm:text-[40px]", positiv ? "text-emerald-700" : "text-[color:var(--foreground)]")}
            data-ergebnis
          >
            {euroMitVorzeichen(r.ergebnis)}
          </span>
        </div>
        {r.status !== "ohne_kosten" ? (
          <>
            <div
              className="relative mt-4 h-3.5 overflow-hidden rounded-full bg-[color:var(--surface-sunken)] ring-1 ring-inset ring-[color:var(--border)]"
              role="img"
              aria-label={positiv ? "Kosten gedeckt" : `${prozent(r.gedeckt)} der Kosten gedeckt`}
            >
              <div className="absolute inset-y-0 left-0 bg-emerald-500" style={{ width: `${r.balken.provision * 100}%` }} />
              {r.balken.bestand > 0 ? (
                <div className="absolute inset-y-0 bg-emerald-200" style={{ left: `${r.balken.provision * 100}%`, width: `${r.balken.bestand * 100}%` }} />
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-[color:var(--muted)]">
              <span className="inline-flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-[3px] bg-emerald-500" aria-hidden />
                {makler ? "Courtage" : "Provision"}
              </span>
              {mitBestand ? (
                <span className="inline-flex items-center gap-1.5">
                  <i className="h-2.5 w-2.5 rounded-[3px] bg-emerald-200" aria-hidden />
                  Bestand
                </span>
              ) : null}
              {positiv ? (
                <span className="inline-flex items-center gap-1">
                  Kosten gedeckt <Check className="h-4 w-4" aria-hidden />
                </span>
              ) : (
                <span>noch offen {prozent(1 - r.gedeckt)}</span>
              )}
            </div>
            {r.ueberschuss != null ? (
              <p className="mt-2 text-[15px] font-semibold text-emerald-700" data-ueberschuss>
                Überschuss {prozent(r.ueberschuss)} über den Kosten
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
