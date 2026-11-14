// Monatsbericht neu (version 2) im Kundenbereich und in der Admin-Vorschau: gleiche Abschnitte und
// Texte wie die E-Mail (lib/monatsbericht/bericht), Abschnitte ohne Daten entfallen.

import {
  barWidths,
  bestandForecastNote,
  bestandIntro,
  bestandskampagnenCells,
  BUTTON_ZAHLEN,
  empfehlungCells,
  FUNNEL_NOTE,
  rateText,
  SECTION_TITLES,
  signedEur,
  type ReportModel,
} from "@/lib/monatsbericht/bericht";
import { formatEUR, formatNumber } from "@/lib/format";

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-5 mb-2 text-[15px] font-semibold">{children}</h3>;
}

function Cells({ cells }: { cells: { label: string; value: string; sub?: (string | null)[] }[] }) {
  return (
    <div className={`grid grid-cols-2 gap-2 ${cells.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>
      {cells.map((c) => (
        <div key={c.label} className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-slate-50 px-3 py-2">
          <div className="text-xs text-[color:var(--muted)]">{c.label}</div>
          <div className="text-lg font-semibold tabular-nums">{c.value}</div>
          {(c.sub ?? [])
            .filter((s): s is string => !!s)
            .map((s) => (
              <div key={s} className="text-xs text-[color:var(--muted)]">
                {s}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

export function MonatsberichtAnsicht({ model: m, intro, links = true }: { model: ReportModel; intro: string[]; links?: boolean }) {
  return (
    <div className="text-[15px] leading-relaxed" data-monatsbericht-v2>
      <div className="space-y-2">
        {intro.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      {m.funnel ? (
        <section data-abschnitt="funnel">
          <H>{SECTION_TITLES.funnel}</H>
          <Cells cells={m.funnel.steps.map((s) => ({ label: s.label, value: formatNumber(s.value), sub: [rateText(s), s.previous != null ? `Vormonat ${formatNumber(s.previous)}` : null] }))} />
          <p className="mt-1 text-xs text-[color:var(--muted)]">{FUNNEL_NOTE}</p>
        </section>
      ) : null}

      {m.result ? (
        <section data-abschnitt="result">
          <H>{SECTION_TITLES.result}</H>
          <dl className="text-sm">
            {m.result.lines.map((l) => (
              <div key={l.key} className="flex justify-between gap-3 border-b border-[color:var(--border)] py-1.5 tabular-nums">
                <dt>{l.label}</dt>
                <dd className={l.sign === "+" ? "text-emerald-700" : ""}>{signedEur(l.amount, l.sign)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-3 border-t-2 border-[color:var(--foreground)] py-1.5 font-semibold tabular-nums">
              <dt>= Gewinn</dt>
              <dd className={m.result.gewinn >= 0 ? "text-emerald-700" : "text-red-700"}>{formatEUR(m.result.gewinn)}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      {m.bestand ? (
        <section data-abschnitt="bestand">
          <H>{SECTION_TITLES.bestand}</H>
          <p className="text-sm">{bestandIntro(m.bestand)}</p>
          <ul className="mt-2 space-y-1">
            {m.bestand.years.map((y, i) => {
              const w = barWidths(m.bestand!.years)[i];
              return (
                <li key={y.year} className="grid grid-cols-[3.5rem_1fr_6rem] items-center gap-2 text-sm">
                  <span className="text-[color:var(--muted)]">{y.year}. Jahr</span>
                  <span className="flex h-4 overflow-hidden rounded-sm bg-[color:var(--surface-sunken)]" aria-hidden="true">
                    <span className="h-4 bg-blue-900" style={{ width: `${w.existing}%` }} />
                    <span className="h-4 bg-blue-300" style={{ width: `${w.added}%` }} />
                  </span>
                  <span className="text-right font-semibold tabular-nums">{formatEUR(y.total)}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-xs text-[color:var(--muted)]">
            <span className="mr-1 inline-block h-2 w-2 bg-blue-900" /> aus bisherigen Verträgen <span className="mr-1 ml-3 inline-block h-2 w-2 bg-blue-300" /> aus neuen Verträgen im gleichen Tempo. {bestandForecastNote(m.bestand)}
          </p>
        </section>
      ) : null}

      {m.empfehlungen ? (
        <section data-abschnitt="empfehlungen">
          <H>{SECTION_TITLES.empfehlungen}</H>
          <Cells cells={empfehlungCells(m.empfehlungen)} />
        </section>
      ) : null}

      {m.bestandskampagnen ? (
        <section data-abschnitt="bestandskampagnen">
          <H>{SECTION_TITLES.bestandskampagnen}</H>
          <Cells cells={bestandskampagnenCells(m.bestandskampagnen)} />
        </section>
      ) : null}

      {m.measures.length ? (
        <section data-abschnitt="measures">
          <H>{SECTION_TITLES.measures}</H>
          <ul className="list-disc space-y-1 pl-5">
            {m.measures.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {m.tips.length ? (
        <section data-abschnitt="tips">
          <H>{SECTION_TITLES.tips}</H>
          <ul className="list-disc space-y-1 pl-5">
            {m.tips.map((t) => (
              <li key={t.key}>
                <b>{t.title}.</b> {t.text}{" "}
                {links ? (
                  <a href={t.href} className="font-semibold text-[color:var(--brand)] hover:underline">
                    {t.cta}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {links ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <a href={m.links.zahlen} className="rounded-[var(--radius-md)] bg-[color:var(--brand)] px-4 py-2 text-sm font-semibold text-white">
            {BUTTON_ZAHLEN}
          </a>
        </div>
      ) : null}
    </div>
  );
}
