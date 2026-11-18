"use client";

// Cross-Selling in der Terminvorbereitung (Ole, 16.11.2026):
// - „Chance im Termin“ (Teil A2): höchstens 2 erkannte Lücken mit Gesprächsöffner, ein Klick nimmt die Sparte als
//   „bei Bedarf“ in die Angebote (erscheint in der Präsentation auf „Ihr Schutz im Überblick“ mit „Mit anschauen“).
// - „Schutz im Überblick“ (Teil A7): je Sparte bei uns, woanders (Versicherer, Ablauf, ungefährer Beitrag), prüfen,
//   Lücke; selten gebraucht, daher in einem Fenster. Seit 18.11.2026 (Ole) als Frage „Hat Frau Becker das schon?“ mit
//   „Ja, bei mir“, „Ja, woanders“, „Weiß nicht“, „Nein“ (Präsentation behält die Ampel-Begriffe), Vorbelegung mit
//   Hinweis „aus dem Chat“, Schalter „In heutiges Angebot aufnehmen“, Live-Vorschau der Ampel, „Fertig“ statt
//   „Abbrechen“ (alles wird automatisch gespeichert).
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
import {
  ampelVorschau,
  chancen,
  SCHUTZ_ANTWORT,
  SCHUTZ_QUELLE_TEXT,
  SCHUTZ_REIHENFOLGE,
  SCHUTZ_SPARTEN,
  type SchutzEintrag,
  type SchutzStatus,
  VORSORGE_SPARTE,
  type VorsorgeThema,
} from "@/lib/schutz-ueberblick";
import type { BuendelRegel, Katalog } from "@/lib/tarifkatalog";
import { beitragsUebersicht, betrag, type Tarifauswahl } from "@/lib/tarifauswahl";

const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const Punkt = ({ farbe }: { farbe: string }) => <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: farbe }} aria-hidden />;

type Aendern = (fn: (a: Tarifauswahl) => void, extern?: boolean) => void;

/** Sparte als „bei Bedarf“ in die Angebote (oder, wenn sie schon da ist, dorthin springen). */
export type SparteAnbieten = (key: string) => void;

export function ChanceImTermin({
  auswahl,
  ro,
  aendern,
  anbieten,
  entfernen,
  vorsorge,
  kunde,
  speichern,
}: {
  auswahl: Tarifauswahl;
  ro: boolean;
  aendern: Aendern;
  anbieten: SparteAnbieten;
  /** Sparte aus dem heutigen Angebot nehmen (Schalter im Überblick) */
  entfernen: SparteAnbieten;
  vorsorge: VorsorgeThema | null;
  /** Kunde im Satz: „Frau Becker“ bzw. „Julia Becker“ (Frage „Hat … das schon?“) */
  kunde: string;
  /** Speicherstand der Terminvorbereitung (automatisch gespeichert) */
  speichern: { status: SpeicherStand; erneut: () => void };
}) {
  const [offen, setOffen] = useState(false);
  const schutz = auswahl.schutz ?? [];
  if (!schutz.length && !vorsorge) return null;
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
      <p className="text-[13px] text-[color:var(--muted)]">Was Sie zusätzlich ansprechen können, ausgewählt aus Lebenslage und Angaben.</p>
      {liste.length ? (
        <ul className="mt-2 space-y-2">
          {liste.map((c) => (
            <li key={c.key} className="flex items-start gap-2.5" data-chance={c.key}>
              <Punkt farbe={SCHUTZ_ANTWORT[c.status].farbe} />
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-semibold">{c.label}</span>
                {/* Ole, 18.11.2026: kein Status neben der Sparte, nur bei „Nein“ klein „fehlt“ */}
                {c.status === "luecke" ? (
                  <span className="ml-1.5 text-xs font-medium text-red-700" data-chance-fehlt>
                    fehlt
                  </span>
                ) : null}
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
      ) : schutz.length ? (
        <p className="mt-1 text-[13px] text-[color:var(--muted)]">Keine Lücke erkannt. Fragen Sie im Termin kurz nach dem übrigen Schutz.</p>
      ) : null}
      {vorsorge ? (
        // Teil C2: großes Thema getrennt von den Sach-Chancen, keine Gesundheitsfragen; „Ins Angebot“ holt die Sparte
        // aus dem Tarifkatalog (erst nach „Mit anschauen“ im Vergleich, wie die Chancen)
        <div className="mt-2 flex items-start gap-2.5 border-t border-[color:var(--border)] pt-2" data-vorsorge-thema={vorsorge.key}>
          <Punkt farbe={VORSORGE_FARBE} />
          <div className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">Vorsorge: {vorsorge.label}</span>
            <p className="text-[13px] text-[color:var(--muted)]">„{vorsorge.oeffner}“</p>
          </div>
          {/* Ole, 17.11.2026: mit Gesellschaft und Tarif in die Präsentation (nur Tarifmerkmale, nie Gesundheitsangaben) */}
          {!ro ? (
            <Button size="sm" icon={Plus} onClick={() => anbieten(VORSORGE_SPARTE[vorsorge.key])} data-vorsorge-anbieten>
              Ins Angebot
            </Button>
          ) : null}
        </div>
      ) : null}
      <SchutzFenster
        open={offen}
        onClose={() => setOffen(false)}
        auswahl={auswahl}
        ro={ro}
        aendern={aendern}
        anbieten={anbieten}
        entfernen={entfernen}
        kunde={kunde}
        speichern={speichern}
      />
    </div>
  );
}

/** Speicherstand der Terminvorbereitung (neu-client.tsx). */
export type SpeicherStand = "ruhe" | "speichert" | "gespeichert" | "fehler";

/** Lila für das Vorsorge-Thema (wie bisher bg-violet-500). */
const VORSORGE_FARBE = "#8b5cf6";

/** Ausgewählte Antwort in den Ampel-Farben der Präsentation (ein Farbsystem): bei mir grün, woanders blau, Nein rot;
 *  „Weiß nicht“ nur mit orangem Umriss (erkennbar gewählt, aber keine Entscheidung). */
function antwortKlasse(st: SchutzStatus, an: boolean): string {
  if (!an) return "border-[color:var(--border)] bg-white text-[color:var(--muted)]";
  if (st === "pruefen") return "border-amber-400 bg-amber-50 text-amber-800";
  return cn("border-transparent text-white", st === "luecke" ? "bg-red-600" : st === "woanders" ? "bg-blue-600" : "bg-emerald-600");
}

function SchutzFenster({
  open,
  onClose,
  auswahl,
  ro,
  aendern,
  anbieten,
  entfernen,
  kunde,
  speichern,
}: {
  open: boolean;
  onClose: () => void;
  auswahl: Tarifauswahl;
  ro: boolean;
  aendern: Aendern;
  anbieten: SparteAnbieten;
  entfernen: SparteAnbieten;
  kunde: string;
  speichern: { status: SpeicherStand; erneut: () => void };
}) {
  const schutz = auswahl.schutz ?? [];
  const setze = (key: string, fn: (s: SchutzEintrag) => void) =>
    aendern((a) => {
      const s = a.schutz?.find((x) => x.key === key);
      if (s) fn(s);
    });
  const fehlend = Object.entries(SCHUTZ_SPARTEN).filter(([k]) => !schutz.some((s) => s.key === k));
  const vorschau = ampelVorschau(schutz, auswahl.sparten);
  const fuss = (
    <div className="flex shrink-0 items-center gap-3 border-t border-[color:var(--border)] px-5 py-3" data-schutz-fuss>
      <SpeicherHinweis status={speichern.status} ro={ro} erneut={speichern.erneut} />
      <Button variant="primary" size="md" className="ml-auto min-w-[7.5rem] justify-center" onClick={onClose} data-schutz-fertig>
        Fertig
      </Button>
    </div>
  );
  return (
    <Sheet open={open} onClose={onClose} title="Schutz im Überblick" footer={fuss}>
      {vorschau.length ? (
        // Live-Vorschau der Ampel wie auf der Folie (Begriffe der Präsentation)
        <div className="mx-5 mt-3 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-sunken)] px-3 py-2" data-ampel-vorschau>
          <div className="text-[11px] font-medium text-[color:var(--muted)]">So sieht es der Kunde</div>
          <ul className="mt-1 grid gap-y-0.5">
            {vorschau.map((z) => (
              <li key={z.key} className="flex min-w-0 items-center gap-1.5 text-[12px]" data-ampel={z.key} data-ampel-status={z.status}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: z.farbe }} aria-hidden />
                <span className="min-w-0 truncate font-medium">{z.label}</span>
                <span className="ml-auto shrink-0" style={{ color: z.farbe }}>
                  {z.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="px-5 pb-1 pt-4 text-sm font-semibold" data-schutz-frage>
        Hat {kunde} das schon?
      </div>
      <ul className="divide-y divide-[color:var(--border)]" data-schutz-liste>
        {schutz.map((s) => {
          const sp = auswahl.sparten.find((x) => x.key === s.key);
          const hinweis = s.quelle ? SCHUTZ_QUELLE_TEXT[s.quelle] : s.status === "bei-uns" ? s.seit : null;
          return (
            <li key={s.key} className="px-5 py-3" data-schutz-zeile={s.key}>
              <div className="flex items-center gap-2">
                <Punkt farbe={SCHUTZ_ANTWORT[s.status].farbe} />
                <span className="min-w-0 flex-1 text-sm font-semibold">{s.label}</span>
                {hinweis ? (
                  <span className="shrink-0 text-[11px] text-[color:var(--muted)]" data-schutz-quelle>
                    {hinweis}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1" role="radiogroup" aria-label={`Hat ${kunde} ${s.label} schon?`}>
                {SCHUTZ_REIHENFOLGE.map((st) => (
                  <button
                    key={st}
                    type="button"
                    role="radio"
                    aria-checked={s.status === st}
                    disabled={ro}
                    onClick={() =>
                      setze(s.key, (x) => {
                        x.status = st;
                        // vom Vermittler entschieden: Hinweis „aus dem Chat“ entfällt
                        delete x.quelle;
                      })
                    }
                    className={cn("h-10 whitespace-nowrap rounded-[var(--radius-sm)] border px-0.5 text-[12px] font-semibold sm:h-8", antwortKlasse(st, s.status === st))}
                    data-schutz-status={st}
                  >
                    {SCHUTZ_ANTWORT[st].label}
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
              {s.status !== "bei-uns" || sp ? (
                <div className="mt-2 flex items-center gap-3">
                  <span className="min-w-0 flex-1 text-[13px] text-[color:var(--muted)]">In heutiges Angebot aufnehmen</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!sp}
                    aria-label={`${s.label} in heutiges Angebot aufnehmen`}
                    disabled={ro}
                    onClick={() => (sp ? entfernen(s.key) : anbieten(s.key))}
                    className={cn("relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50", sp ? "bg-emerald-600" : "bg-slate-300")}
                    data-schutz-angebot
                  >
                    <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all", sp ? "left-[22px]" : "left-0.5")} />
                  </button>
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

/** Kurzer Speicherstand neben „Fertig“: „Speichert …“, „Gespeichert“, bei Fehler „Erneut versuchen“. */
function SpeicherHinweis({ status, ro, erneut }: { status: SpeicherStand; ro: boolean; erneut: () => void }) {
  if (ro) return <span className="text-xs text-[color:var(--muted)]">Vorschau</span>;
  if (status === "fehler")
    return (
      <span className="flex items-center gap-2 text-xs text-rose-700" data-schutz-speicher="fehler">
        Nicht gespeichert
        <button type="button" className="font-semibold underline" onClick={erneut}>
          Erneut versuchen
        </button>
      </span>
    );
  if (status === "speichert") return <span className="text-xs text-[color:var(--muted)]" data-schutz-speicher="speichert">Speichert …</span>;
  if (status === "gespeichert")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-700" data-schutz-speicher="gespeichert">
        <Check className="h-3.5 w-3.5" /> Gespeichert
      </span>
    );
  return null;
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
