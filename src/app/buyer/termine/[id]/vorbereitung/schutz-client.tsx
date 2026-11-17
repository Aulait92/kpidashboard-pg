"use client";

// Cross-Selling in der Terminvorbereitung (Ole, 16.11.2026):
// - „Chance im Termin“ (Teil A2): höchstens 2 erkannte Lücken mit Gesprächsöffner, ein Klick nimmt die Sparte als
//   „bei Bedarf“ in die Angebote (erscheint in der Präsentation auf „Ihr Schutz im Überblick“ mit „Mit anschauen“).
// - „Schutz im Überblick“ (Teil A7): je Sparte bei uns, woanders (Versicherer, Ablauf, ungefährer Beitrag), prüfen,
//   Lücke; selten gebraucht, daher in einem Fenster.
// - Empfehlung gesamt mit Kombi-Rabatt (Rabattstufen Privatschutz-Kombi): Endbeitrag, nächste Stufe mit einem Klick,
//   Hinweis, wenn eine gewählte Stufe (Basis/Smart) den Rabatt verhindert.
// Wer: Vermittler vor dem Termin. Wo: im bestehenden Angebote-Bereich, keine neue Karte.

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { tarifMitSparte } from "@/lib/praesentation";
import { naechsteText, prozentMit } from "@/lib/kombi-rabatt";
import { chancen, SCHUTZ_REIHENFOLGE, SCHUTZ_SPARTEN, SCHUTZ_STATUS, type SchutzEintrag, type SchutzStatus } from "@/lib/schutz-ueberblick";
import type { BuendelRegel, Katalog } from "@/lib/tarifkatalog";
import { beitragsUebersicht, betrag, type Tarifauswahl } from "@/lib/tarifauswahl";

const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const Punkt = ({ status }: { status: SchutzStatus }) => <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SCHUTZ_STATUS[status].farbe }} aria-hidden />;

type Aendern = (fn: (a: Tarifauswahl) => void, extern?: boolean) => void;

/** Sparte als „bei Bedarf“ in die Angebote (oder, wenn sie schon da ist, dorthin springen). */
export type SparteAnbieten = (key: string) => void;

export function ChanceImTermin({ auswahl, ro, aendern, anbieten }: { auswahl: Tarifauswahl; ro: boolean; aendern: Aendern; anbieten: SparteAnbieten }) {
  const [offen, setOffen] = useState(false);
  const schutz = auswahl.schutz ?? [];
  if (!schutz.length) return null;
  const keys = auswahl.sparten.map((s) => s.key);
  const liste = chancen(schutz, keys);
  return (
    <div className="mx-4 mt-3 rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-3.5 py-2.5 sm:mx-5" data-chance-im-termin>
      <div className="flex items-center gap-2">
        <h3 className="text-[13px] font-semibold">Chance im Termin</h3>
        <button type="button" onClick={() => setOffen(true)} className="-my-2 ml-auto py-2 text-[13px] font-medium text-[color:var(--brand)] hover:underline" data-schutz-oeffnen>
          Schutz im Überblick
        </button>
      </div>
      {liste.length ? (
        <ul className="mt-1.5 space-y-2">
          {liste.map((c) => (
            <li key={c.key} className="flex items-start gap-2.5" data-chance={c.key}>
              <Punkt status={c.status} />
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-semibold">{c.label}</span>{" "}
                <span className="text-[13px]" style={{ color: SCHUTZ_STATUS[c.status].farbe }}>
                  {SCHUTZ_STATUS[c.status].kurz}
                </span>
                {c.oeffner ? <p className="text-[13px] text-[color:var(--muted)]">„{c.oeffner}“</p> : null}
              </div>
              {!ro ? (
                <Button size="sm" icon={Plus} onClick={() => anbieten(c.key)} data-chance-anbieten>
                  Ins Angebot
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[13px] text-[color:var(--muted)]">Keine Lücke erkannt. Fragen Sie im Termin kurz nach dem übrigen Schutz.</p>
      )}
      <SchutzFenster open={offen} onClose={() => setOffen(false)} auswahl={auswahl} ro={ro} aendern={aendern} anbieten={anbieten} />
    </div>
  );
}

function SchutzFenster({ open, onClose, auswahl, ro, aendern, anbieten }: { open: boolean; onClose: () => void; auswahl: Tarifauswahl; ro: boolean; aendern: Aendern; anbieten: SparteAnbieten }) {
  const schutz = auswahl.schutz ?? [];
  const keys = auswahl.sparten.map((s) => s.key);
  const setze = (key: string, fn: (s: SchutzEintrag) => void) =>
    aendern((a) => {
      const s = a.schutz?.find((x) => x.key === key);
      if (s) fn(s);
    });
  const fehlend = Object.entries(SCHUTZ_SPARTEN).filter(([k]) => !schutz.some((s) => s.key === k));
  return (
    <Sheet open={open} onClose={onClose} title="Schutz im Überblick" message="Erscheint so in der Präsentation. Was hat der Kunde und wo?">
      <ul className="divide-y divide-[color:var(--border)]" data-schutz-liste>
        {schutz.map((s) => {
          const imAngebot = keys.includes(s.key);
          return (
            <li key={s.key} className="px-5 py-3" data-schutz-zeile={s.key}>
              <div className="flex items-center gap-2">
                <Punkt status={imAngebot ? "bei-uns" : s.status} />
                <span className="min-w-0 flex-1 text-sm font-semibold">{s.label}</span>
                {imAngebot ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                    <Check className="h-3.5 w-3.5" /> Im Angebot
                  </span>
                ) : !ro ? (
                  <Button size="sm" icon={Plus} onClick={() => anbieten(s.key)}>
                    Ins Angebot
                  </Button>
                ) : null}
              </div>
              {/* Vier Zustände wie auf der Folie (Ampel) */}
              <div className="mt-2 grid grid-cols-4 gap-1" role="radiogroup" aria-label={`${s.label}: Stand`}>
                {SCHUTZ_REIHENFOLGE.map((st) => (
                  <button
                    key={st}
                    type="button"
                    role="radio"
                    aria-checked={s.status === st}
                    disabled={ro}
                    onClick={() => setze(s.key, (x) => void (x.status = st))}
                    className={cn(
                      "h-10 rounded-[var(--radius-sm)] border px-1 text-xs font-semibold sm:h-8",
                      s.status === st ? "border-transparent text-white" : "border-[color:var(--border)] bg-white text-[color:var(--muted)]",
                    )}
                    style={s.status === st ? { background: SCHUTZ_STATUS[st].farbe } : undefined}
                    data-schutz-status={st}
                  >
                    {SCHUTZ_STATUS[st].kurz}
                  </button>
                ))}
              </div>
              {s.status === "woanders" ? (
                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-1.5" data-woanders>
                  <input
                    aria-label="Versicherer"
                    placeholder="Versicherer"
                    disabled={ro}
                    defaultValue={s.versicherer ?? ""}
                    onChange={(e) => setze(s.key, (x) => void (x.versicherer = e.target.value.trim() || null))}
                    className="h-10 min-w-0 rounded-[var(--radius-sm)] border border-[color:var(--border-strong)] px-2.5 text-sm sm:h-9"
                  />
                  <input
                    type="month"
                    aria-label="Ablauf"
                    title="Ablauf bzw. Hauptfälligkeit"
                    disabled={ro}
                    defaultValue={s.ablauf ?? ""}
                    onChange={(e) => setze(s.key, (x) => void (x.ablauf = /^\d{4}-\d{2}$/.test(e.target.value) ? e.target.value : null))}
                    className="h-10 w-[8.5rem] rounded-[var(--radius-sm)] border border-[color:var(--border-strong)] px-2 text-sm sm:h-9"
                  />
                  <input
                    inputMode="decimal"
                    aria-label="Beitrag ungefähr im Monat"
                    placeholder="ca. €/Mon."
                    disabled={ro}
                    defaultValue={s.beitrag != null ? String(s.beitrag).replace(".", ",") : ""}
                    onChange={(e) => setze(s.key, (x) => void (x.beitrag = betrag(e.target.value)))}
                    className="h-10 w-24 rounded-[var(--radius-sm)] border border-[color:var(--border-strong)] px-2 text-right text-sm sm:h-9"
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {fehlend.length && !ro ? (
        <div className="flex flex-wrap gap-1.5 border-t border-[color:var(--border)] px-5 py-3">
          {fehlend.slice(0, 6).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => aendern((a) => void (a.schutz = [...(a.schutz ?? []), { key: k, label, status: "pruefen" }]))}
              className="inline-flex h-9 items-center gap-1 rounded-full border border-dashed border-[color:var(--border-strong)] px-3 text-[13px] font-medium text-[color:var(--muted)]"
            >
              <Plus className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      ) : null}
    </Sheet>
  );
}

/**
 * Empfehlung gesamt mit Kombi-Rabatt (unter der Live-Vorschau): Endbeitrag, „statt … Kombi-Rabatt 10 %“, nächste Stufe
 * mit einem Klick („Mit Unfall: 15 %“) und Hinweis, wenn Basis bzw. Smart den Rabatt verhindert.
 */
export function BeitragGesamt({
  auswahl,
  katalog,
  ro,
  anbieten,
  aendern,
}: {
  auswahl: Tarifauswahl;
  katalog: Katalog;
  ro: boolean;
  anbieten: SparteAnbieten;
  aendern: Aendern;
}) {
  const buendel: Record<string, BuendelRegel> = katalog.buendel;
  const u = beitragsUebersicht(auswahl, buendel);
  const k = u.kombi;
  const gewaehlt = auswahl.sparten.filter((s) => !s.zusatz).map((s) => s.key);
  // Nächste Stufe: zuerst vorbereitete Sparten „bei Bedarf“, dann erkannte Chancen, dann übrige Sparten der Regel
  const kandidaten = k
    ? [...auswahl.sparten.filter((s) => s.zusatz).map((s) => s.key), ...chancen(auswahl.schutz ?? [], auswahl.sparten.map((s) => s.key), 6).map((c) => c.key), ...k.regel.sparten]
    : [];
  const vorschlag = k?.naechste ? kandidaten.find((key) => !gewaehlt.includes(key) && prozentMit(k, key, gewaehlt) && katalog.sparten.some((s) => s.key === key)) : undefined;
  const vorschlagLabel = vorschlag ? (auswahl.sparten.find((s) => s.key === vorschlag)?.label ?? SCHUTZ_SPARTEN[vorschlag] ?? katalog.sparten.find((s) => s.key === vorschlag)?.label ?? vorschlag) : null;
  const naechste = k ? naechsteText(k) : null;
  // Gewählte Stufe verhindert den Rabatt: eine passende Stufe derselben Sparte anbieten
  const blockiert = (k?.blockiert ?? []).flatMap((b) => {
    const sp = auswahl.sparten.find((s) => s.label === b.sparte);
    const besser = sp?.tarife.find((t) => t.zeigen && t.gesellschaftKey === k!.regel.gruppe && k!.regel.linien.some((l) => l.toLowerCase() === (t.linie ?? t.kurz).toLowerCase()));
    return sp ? [{ sp, b, besser }] : [];
  });
  return (
    <div className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-3 py-2.5 text-[13px]" data-empfehlung-gesamt>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[color:var(--muted)]">Empfehlung gesamt</span>
        {u.endbeitrag != null ? (
          <>
            <b className="text-lg tabular-nums">{eur(u.endbeitrag)}</b>
            <span className="text-[color:var(--muted)]">im Monat</span>
          </>
        ) : (
          <span className="font-semibold text-amber-700">Beitrag fehlt</span>
        )}
      </div>
      {u.rabatt && u.einzelSumme != null ? (
        <p className="font-medium text-emerald-700" data-kombi-rabatt>
          statt {eur(u.einzelSumme)}: Kombi-Rabatt {u.rabatt.prozent} % (−{eur(u.rabatt.euro)})
        </p>
      ) : null}
      {naechste ? (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1" data-kombi-naechste>
          <span className="font-medium text-[color:var(--brand-dark)]">{naechste}</span>
          {vorschlag && !ro ? (
            <button type="button" onClick={() => anbieten(vorschlag)} className="-my-2 inline-flex items-center gap-1 py-2 font-semibold text-[color:var(--brand)] hover:underline">
              <Plus className="h-3.5 w-3.5" />
              {/* „Mit Unfall: 15 %“ */}
              Mit {vorschlagLabel}: {prozentMit(k!, vorschlag, gewaehlt)} %
            </button>
          ) : null}
        </div>
      ) : null}
      {blockiert.map(({ sp, b, besser }) => (
        <div key={sp.key} className="mt-1 flex flex-wrap items-center gap-x-2 text-amber-800" data-kombi-blockiert>
          <span>
            {tarifMitSparte(b)} zählt nicht zum Kombi-Rabatt{b.grund === "linie" ? ` (nur ${k!.regel.linien.join(" oder ")})` : " (Laufzeit)"}.
          </span>
          {besser && !ro ? (
            <button type="button" onClick={() => aendern((a) => void (a.sparten.find((s) => s.key === sp.key)!.empfohlen = besser.id))} className="-my-2 py-2 font-semibold text-[color:var(--brand)] hover:underline">
              {besser.kurz} empfehlen
            </button>
          ) : null}
        </div>
      ))}
      {k ? <p className="mt-1 text-xs text-[color:var(--muted)]">Beiträge ohne Kombi-Rabatt eintragen, den Rabatt rechnen wir.</p> : null}
    </div>
  );
}
