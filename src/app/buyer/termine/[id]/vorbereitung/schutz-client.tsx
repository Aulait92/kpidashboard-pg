"use client";

// Cross-Selling in der Terminvorbereitung:
// - „Was hat Frau Becker schon?“ (Ole, 18.11.2026; ersetzt „Chance im Termin“ und das Fenster „Schutz im Überblick“):
//   ein Bereich direkt in Schritt 1. Wer: Vermittler vor bzw. im Termin. Aufgabe: festhalten, was der Kunde schon hat,
//   und passende Sparten mit einem Schalter ins Angebot nehmen. Je Sparte „Ja, bei mir“, „Ja, woanders“ (Versicherer und
//   Tarif aus dem Katalog), „Weiß nicht“, „Nein“; erkannte Chancen und das Vorsorge-Thema stehen als Tipp-Zeilen oben
//   (Glühbirne und Gesprächsfrage), beantwortete Zeilen klappen auf eine Zeile zu. „+ Versicherung hinzufügen“ sucht über
//   alle Sparten (auch PKV, BU, Kfz). Überall derselbe Schalter „Ins Angebot“. „So sieht es der Kunde“ zeigt die Ampel
//   der Folie zum Aufklappen. Alles wird automatisch gespeichert. Gesundheitsangaben gibt es hier nicht, nur ob und wo
//   der Kunde versichert ist.
// - Empfehlung gesamt mit Kombi-Rabatt (Rabattstufen Privatschutz-Kombi): Endbeitrag, nächste Stufe mit einem Klick,
//   Hinweis, wenn eine gewählte Stufe (Basis/Smart) den Rabatt verhindert.

import { useEffect, useId, useState } from "react";
import { Check, ChevronDown, Lightbulb, Plus, Search, Trash2, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
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
  schutzBereich,
  schutzKurzTeile,
  schutzOffen,
  spartenSuche,
  type SchutzEintrag,
  type SchutzStatus,
  type VorsorgeThema,
} from "@/lib/schutz-ueberblick";
import { gesellschaftAusText, spartenGruppiert, type BuendelRegel, type Katalog } from "@/lib/tarifkatalog";
import { beitragsUebersicht, betrag, type SparteWahl, type Tarifauswahl } from "@/lib/tarifauswahl";
import { bisherErlaubt, bisherHand } from "@/lib/bisheriger-vertrag";
import { bisherTarifeAction, type BisherTarif } from "./neu-actions";

const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const Punkt = ({ farbe }: { farbe: string }) => <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: farbe }} aria-hidden />;

type Aendern = (fn: (a: Tarifauswahl) => void, extern?: boolean) => void;

/** Sparte als „bei Bedarf“ in die Angebote (oder, wenn sie schon da ist, dorthin springen). */
export type SparteAnbieten = (key: string) => void;

/** Speicherstand der Terminvorbereitung (neu-client.tsx). */
export type SpeicherStand = "ruhe" | "speichert" | "gespeichert" | "fehler";

/**
 * Segment einer Antwort (Usability-Check 18.11.2026, Skizze nachher-n2): ein Schalter je Zeile, 14 px. Gewählt in den
 * Ampel-Farben der Präsentation (bei mir grün, woanders blau, Nein rot, „Weiß nicht“ orange umrandet); ein Vorschlag
 * aus Chat oder Formular nur umrandet, bis der Vermittler ihn bestätigt. Unbeantwortet: nichts hervorgehoben.
 */
function antwortKlasse(st: SchutzStatus, an: boolean, vorschlag: boolean): string {
  if (!an) return "bg-white text-slate-700 hover:bg-[color:var(--surface-sunken)]";
  const umrandet: Record<SchutzStatus, string> = {
    "bei-uns": "bg-emerald-50 text-emerald-800 ring-emerald-600",
    woanders: "bg-blue-50 text-blue-800 ring-blue-600",
    pruefen: "bg-amber-50 text-amber-900 ring-amber-500",
    luecke: "bg-red-50 text-red-800 ring-red-600",
  };
  if (vorschlag || st === "pruefen") return cn("relative z-10 ring-2 ring-inset", umrandet[st]);
  return cn("text-white", st === "luecke" ? "bg-red-600" : st === "woanders" ? "bg-blue-600" : "bg-emerald-700");
}

export function SchutzBereich({
  auswahl,
  ro,
  aendern,
  anbieten,
  entfernen,
  vorsorge,
  kunde,
  speichern,
  gesellschaften = [],
  imKatalog,
  gesundheitFrei = false,
  haupt = null,
}: {
  auswahl: Tarifauswahl;
  ro: boolean;
  aendern: Aendern;
  anbieten: SparteAnbieten;
  /** Sparte aus dem heutigen Angebot nehmen (Schalter „Ins Angebot“ aus) */
  entfernen: SparteAnbieten;
  vorsorge: VorsorgeThema | null;
  /** Kunde im Satz: „Frau Becker“ bzw. „Julia Becker“ (Überschrift „Was hat … schon?“) */
  kunde: string;
  /** Speicherstand der Terminvorbereitung (automatisch gespeichert) */
  speichern: { status: SpeicherStand; erneut: () => void };
  /** Vorschlagsliste der Versicherer (wie „Bisheriger Vertrag“) */
  gesellschaften?: { key: string; name: string }[];
  /** Sparten mit Tarifen im Katalog (nur diese können ins Angebot) */
  imKatalog: string[];
  /** Gesundheitssparten für den bisherigen Vertrag freigeschaltet (lib/bisheriger-vertrag.ts bisherErlaubt) */
  gesundheitFrei?: boolean;
  /** Sparte, für die der Lead gekommen ist (lib/terminvorbereitung-neu.ts spartenFuerTermin): nicht entfernbar */
  haupt?: string | null;
}) {
  const toast = useToast();
  const schutz = auswahl.schutz ?? [];
  const angebot = auswahl.sparten.map((s) => s.key);
  // Reihenfolge, Tipps und aufgeklappte Zeilen beim Öffnen festhalten: Zeilen springen beim Beantworten nicht herum
  const [stand] = useState(() => {
    const z = schutzBereich(schutz, angebot, vorsorge);
    return {
      order: z.map((x) => x.eintrag.key),
      tipps: Object.fromEntries(z.filter((x) => x.tipp).map((x) => [x.eintrag.key, x.tipp as string])) as Record<string, string>,
      vorlage: z.filter((x) => x.neu).map((x) => x.eintrag),
    };
  });
  // Offen: Tipps, Unbeantwortetes und Vorschläge aus Chat bzw. Formular (mit Quelle, zum Bestätigen)
  const [auf, setAuf] = useState<Set<string>>(
    () =>
      new Set(
        stand.order.filter((k) => {
          const e = schutz.find((s) => s.key === k);
          return !!stand.tipps[k] || e?.status === "pruefen" || !!e?.quelle;
        }),
      ),
  );
  // Entfernte Zeilen (auch Vorsorge-Thema und Tipps), damit sie in dieser Sitzung nicht wiederkommen
  const [weg, setWeg] = useState<string[]>([]);
  // In dieser Sitzung hinzugefügt (oben nach den Tipps, mit „Entfernen“ für Versehen)
  const [dazu, setDazu] = useState<string[]>([]);
  const klappe = (key: string, offen: boolean) =>
    setAuf((x) => {
      const n = new Set(x);
      if (offen) n.add(key);
      else n.delete(key);
      return n;
    });

  const neuSeitStart = schutz.map((s) => s.key).filter((k) => !stand.order.includes(k));
  const keys = [
    ...stand.order.filter((k) => stand.tipps[k]),
    ...[...dazu.filter((k) => neuSeitStart.includes(k)), ...neuSeitStart.filter((k) => !dazu.includes(k)).reverse()],
    ...stand.order.filter((k) => !stand.tipps[k]),
  ];
  const zeilen = keys.flatMap((k) => {
    if (weg.includes(k)) return [];
    const e =schutz.find((s) => s.key === k) ?? stand.vorlage.find((v) => v.key === k);
    return e ? [{ e, tipp: stand.tipps[k] ?? null }] : [];
  });
  if (ro && !zeilen.length) return null;

  /** Eintrag ändern; die Zeile des Vorsorge-Themas wird dabei erst angelegt. */
  const setze = (key: string, fn: (s: SchutzEintrag) => void) =>
    aendern((a) => {
      let s = a.schutz?.find((x) => x.key === key);
      if (!s) {
        const v = stand.vorlage.find((x) => x.key === key);
        if (!v) return;
        s = { ...v };
        a.schutz = [...(a.schutz ?? []), s];
      }
      fn(s);
    });
  // Bisheriger Vertrag der Sparte im Angebot (aus „Ja, woanders“); Gesundheitssparten nur mit Freischaltung
  const anSparte = (key: string, fn: (sp: SparteWahl) => void) => {
    if (!bisherErlaubt(key, gesundheitFrei)) return;
    aendern((a) => {
      const sp = a.sparten.find((x) => x.key === key);
      if (sp) fn(sp);
    });
  };
  const hinzufuegen = (key: string) => {
    const label = SCHUTZ_SPARTEN[key];
    if (!label) return;
    aendern((a) => void (a.schutz = [...(a.schutz ?? []).filter((x) => x.key !== key), { key, label, status: "pruefen" }]));
    setDazu((d) => [key, ...d.filter((k) => k !== key)]);
    setWeg((w) => w.filter((k) => k !== key));
    klappe(key, true);
  };
  /** Zeile entfernen (Ole, 18.11.2026: „Hier kann ich keine Versicherungen rauslöschen“); über „Versicherung hinzufügen“ wieder da. */
  // Mit „Rückgängig“ wie beim Entfernen einer Sparte aus dem Angebot (components/ui/toast.tsx)
  const wegnehmen = (key: string, label: string) => {
    const index = schutz.findIndex((x) => x.key === key);
    const vorher = index >= 0 ? structuredClone(schutz[index]) : null;
    const warDazu = dazu.includes(key);
    aendern((a) => void (a.schutz = (a.schutz ?? []).filter((x) => x.key !== key)));
    setDazu((d) => d.filter((k) => k !== key));
    setWeg((w) => [...w.filter((k) => k !== key), key]);
    toast.show({
      message: `${label} entfernt`,
      actionLabel: "Rückgängig",
      onAction: () => {
        if (vorher)
          aendern((a) => {
            const liste = (a.schutz ?? []).filter((x) => x.key !== key);
            liste.splice(Math.min(index, liste.length), 0, vorher);
            a.schutz = liste;
          }, true);
        if (warDazu) setDazu((d) => [key, ...d]);
        setWeg((w) => w.filter((k) => k !== key));
      },
    });
  };
  const vorschau = ampelVorschau(schutz, auswahl.sparten);

  return (
    <section className="mx-4 mt-4 sm:mx-5" data-schutz-bereich>
      {/* „Ins Angebot“ als Spaltenkopf über den Schaltern (Rand und Abstand der Zeilen: 1px + pr-1.5 bzw. sm:pr-2) */}
      <div className="flex items-end gap-3 pb-1.5 pr-[7px] sm:pr-[9px]">
        <h3 className="min-w-0 flex-1 text-[15px] font-semibold" data-schutz-frage>
          Was hat {kunde} schon?
        </h3>
        {zeilen.length ? (
          <span className="shrink-0 whitespace-nowrap text-[13px] font-medium text-[color:var(--muted)]" aria-hidden data-schutz-spaltenkopf>
            Ins Angebot
          </span>
        ) : null}
      </div>
      <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white">
        {zeilen.length ? (
          <ul className="divide-y divide-[color:var(--border)]" data-schutz-liste>
            {zeilen.map(({ e: s, tipp }) => {
              const sp = auswahl.sparten.find((x) => x.key === s.key);
              const offen = auf.has(s.key);
              const unbeantwortet = schutzOffen(s);
              const vorschlag = !!s.quelle;
              const teile = schutzKurzTeile(s);
              const schalter = (s.status !== "bei-uns" || !!sp) && (imKatalog.includes(s.key) || !!sp);
              // Entfernen (Ole, 18.11.2026): jede Zeile außer der Sparte, für die der Lead gekommen ist, solange sie nicht im
              // heutigen Angebot ist (sonst erst den Schalter ausschalten); mit Rückgängig
              const entfernbar = !ro && !sp && s.key !== haupt;
              return (
                <li
                  key={s.key}
                  className="pl-2.5 pr-1.5 sm:pl-3.5 sm:pr-2"
                  data-schutz-zeile={s.key}
                  data-zu={offen ? "nein" : "ja"}
                  data-tipp={tipp ? "ja" : undefined}
                  data-unbeantwortet={unbeantwortet ? "ja" : undefined}
                >
                  {/* Handy: Kopf und Schalter oben, Antworten darunter; ab sm alles in einer Zeile */}
                  <div className="flex flex-wrap items-center gap-x-2">
                    <button
                      type="button"
                      aria-expanded={offen}
                      onClick={() => klappe(s.key, !offen)}
                      className="flex min-h-12 min-w-0 flex-1 items-center gap-2 py-2 text-left"
                      data-schutz-kopf
                    >
                      {/* gleiche Breite für Glühbirne und Farbpunkt, damit die Namen untereinander stehen */}
                      <span className={cn("flex w-4 shrink-0 justify-center", offen && (tipp || vorschlag) && "mt-1 self-start")}>
                        {tipp ? <Lightbulb className="h-4 w-4 text-amber-600" aria-hidden /> : <Punkt farbe={unbeantwortet ? "#cbd5e1" : SCHUTZ_ANTWORT[s.status].farbe} />}
                      </span>
                      {offen ? (
                        <span className="min-w-0 flex-1">
                          <span className="block min-w-0 truncate text-[15px] font-semibold">{s.label}</span>
                          {vorschlag ? (
                            <span
                              className="mt-1 block w-fit max-w-full rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 px-2 py-1 text-[13px] leading-snug text-amber-900"
                              data-schutz-quelle
                            >
                              <span className="font-semibold">
                                {SCHUTZ_QUELLE_TEXT[s.quelle!]}
                                {s.zitat ? ":" : ""}
                              </span>
                              {s.zitat ? <> „{s.zitat}“</> : null}
                            </span>
                          ) : null}
                          {tipp ? (
                            <span className="mt-0.5 block text-[13px] text-[color:var(--muted)]" data-schutz-tipp>
                              <span className="font-medium text-amber-800">Tipp:</span> „{tipp}“
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="line-clamp-2 min-w-0 flex-1 text-[15px]" data-schutz-kurz>
                          <span className="font-semibold">{teile[0]}</span>
                          <span className="text-[color:var(--muted)]">{unbeantwortet ? " · offen" : teile.slice(1).map((t) => ` · ${t}`)}</span>
                        </span>
                      )}
                      <ChevronDown className={cn("h-4 w-4 shrink-0 text-[color:var(--muted)] transition-transform", offen && "rotate-180")} aria-hidden />
                    </button>
                    {offen ? (
                      <div
                        className="order-last mb-2.5 flex w-full divide-x divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-sm)] border border-[color:var(--border-strong)] sm:order-none sm:mb-0 sm:grid sm:w-[25rem] sm:grid-cols-4"
                        role="radiogroup"
                        aria-label={`Hat ${kunde} ${s.label} schon?`}
                        data-schutz-segmente
                      >
                        {SCHUTZ_REIHENFOLGE.map((st) => {
                          const an = s.status === st && !unbeantwortet;
                          return (
                            <button
                              key={st}
                              type="button"
                              role="radio"
                              aria-checked={an}
                              disabled={ro}
                              onClick={() => {
                                // Gewählte Antwort noch einmal antippen: wieder offen (Ole, 18.11.2026: zurücknehmen können)
                                const zurueck = an && !vorschlag;
                                setze(s.key, (x) => {
                                  x.status = zurueck ? "pruefen" : st;
                                  if (zurueck) delete x.beantwortet;
                                  else x.beantwortet = true;
                                  // vom Vermittler entschieden: Hinweis „Aus dem Chat“ entfällt
                                  delete x.quelle;
                                  delete x.zitat;
                                });
                                // beantwortet: zuklappen; „Ja, woanders“ bleibt für Versicherer und Tarif offen
                                if (!zurueck && (st === "bei-uns" || st === "luecke")) klappe(s.key, false);
                              }}
                              className={cn(
                                // Handy: Breite nach Inhalt verteilt, damit „Ja, woanders“ nicht umbricht
                                "min-h-11 flex-auto px-1.5 text-center text-[14px] font-semibold leading-tight tracking-tight transition-colors sm:min-h-10 sm:px-1",
                                antwortKlasse(st, an, vorschlag),
                              )}
                              data-schutz-status={st}
                            >
                              {SCHUTZ_ANTWORT[st].label}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                    {schalter ? (
                      <AngebotSchalter an={!!sp} label={s.label} ro={ro} onClick={() => (sp ? entfernen(s.key) : anbieten(s.key))} />
                    ) : (
                      <span className="w-12 shrink-0" aria-hidden />
                    )}
                  </div>
                  {offen && ((s.status === "woanders" && !unbeantwortet) || (s.status === "bei-uns" && s.seit) || entfernbar) ? (
                    <div className="pb-3 pr-1 sm:pl-6" data-schutz-offen>
                      {s.status === "woanders" && !unbeantwortet ? (
                        <WoandersFelder
                          s={s}
                          ro={ro}
                          gesellschaften={gesellschaften}
                          // Angaben eingetragen: gilt als Eingabe des Vermittlers (gewinnt über Chat und Police)
                          setze={(fn) =>
                            setze(s.key, (x) => {
                              fn(x);
                              delete x.quelle;
                              delete x.zitat;
                              x.beantwortet = true;
                            })
                          }
                          anSparte={(fn) => anSparte(s.key, fn)}
                        />
                      ) : null}
                      {s.status === "bei-uns" && s.seit ? <p className="mt-1.5 text-[13px] text-[color:var(--muted)]">Vertrag {s.seit}</p> : null}
                      {entfernbar ? (
                        <button
                          type="button"
                          onClick={() => wegnehmen(s.key, s.label)}
                          className="-mb-2 mt-1 inline-flex min-h-10 items-center gap-1.5 text-[13px] font-medium text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                          data-schutz-weg
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Entfernen
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-3.5 pt-3 text-[13px] text-[color:var(--muted)]" data-schutz-leer>
            Noch nichts eingetragen.
          </p>
        )}
        {!ro ? <SparteSuche ohne={[...schutz.map((s) => s.key), ...stand.vorlage.map((v) => v.key)]} dazu={hinzufuegen} /> : null}
        {vorschau.length || (!ro && speichern.status !== "ruhe") ? (
          <div className="flex items-start gap-3 border-t border-[color:var(--border)] px-3.5 py-2">
            {vorschau.length ? (
              // Ampel wie auf der Folie „Ihr Schutz im Überblick“ (Begriffe der Präsentation), selten gebraucht
              <details className="min-w-0 flex-1" data-ampel-vorschau>
                <summary className="cursor-pointer py-1 text-[12px] font-medium text-[color:var(--muted)]">So sieht es der Kunde</summary>
                <ul className="mt-1 grid max-w-sm gap-y-0.5 pb-1">
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
              </details>
            ) : (
              <span className="flex-1" />
            )}
            <span className="py-1">
              <SpeicherHinweis status={speichern.status} ro={ro} erneut={speichern.erneut} />
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Schalter „Ins Angebot“ (überall derselbe): an = Sparte im heutigen Angebot. */
function AngebotSchalter({ an, label, ro, onClick }: { an: boolean; label: string; ro: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={an}
      aria-label={`${label} ins Angebot`}
      disabled={ro}
      onClick={onClick}
      className="flex h-11 w-12 shrink-0 items-center justify-center disabled:opacity-50"
      data-schutz-angebot
    >
      <span className={cn("relative h-7 w-12 rounded-full transition", an ? "bg-emerald-600" : "bg-slate-300")}>
        <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all", an ? "left-[22px]" : "left-0.5")} />
      </span>
    </button>
  );
}

/**
 * „+ Versicherung hinzufügen“: Suchfeld über alle Sparten (auch PKV, BU, Kfz). Ohne Suchtext gruppiert, mit Suchtext die
 * Treffer (Abkürzungen wie „PKV“ oder „BU“ zählen); Eingabe übernimmt den ersten Treffer. Liste im Fluss der Seite (kein
 * schwebendes Menü), damit sie am Handy über der Tastatur bedienbar bleibt.
 */
function SparteSuche({ ohne, dazu }: { ohne: string[]; dazu: (key: string) => void }) {
  const [offen, setOffen] = useState(false);
  const [q, setQ] = useState("");
  const listeId = useId();
  const treffer = spartenSuche(q, ohne);
  const zu = () => {
    setOffen(false);
    setQ("");
  };
  const waehle = (key: string) => {
    dazu(key);
    zu();
  };
  if (!offen)
    return (
      <div className="px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => setOffen(true)}
          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-dashed border-[color:var(--border-strong)] px-3.5 text-[13px] font-medium text-[color:var(--brand)] sm:h-9"
          data-schutz-hinzufuegen
        >
          <Plus className="h-3.5 w-3.5" /> Versicherung hinzufügen
        </button>
      </div>
    );
  const option = (s: { key: string; label: string }) => (
    <li key={s.key} role="option" aria-selected={false}>
      <button
        type="button"
        onClick={() => waehle(s.key)}
        className="block min-h-11 w-full rounded-[var(--radius-sm)] px-3 py-2.5 text-left text-sm hover:bg-[color:var(--surface-sunken)]"
        data-schutz-option={s.key}
      >
        {s.label}
      </button>
    </li>
  );
  return (
    <div className="border-t border-[color:var(--border)] px-2 py-2" data-schutz-suche>
      <div className="flex items-center gap-1">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]" aria-hidden />
          <input
            type="search"
            role="combobox"
            aria-expanded
            aria-controls={listeId}
            aria-label="Versicherung suchen"
            placeholder="Suchen, z. B. PKV oder Kfz"
            autoFocus
            enterKeyHint="done"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && treffer[0]) {
                e.preventDefault();
                waehle(treffer[0].key);
              }
              if (e.key === "Escape") zu();
            }}
            className="h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border-strong)] bg-white pl-8 pr-2.5 text-base sm:h-9 sm:text-sm"
            data-schutz-suchfeld
          />
        </label>
        <button
          type="button"
          aria-label="Suche schließen"
          onClick={zu}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-[color:var(--surface-sunken)] sm:h-9 sm:w-9"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul id={listeId} role="listbox" aria-label="Versicherungen" className="mt-1 max-h-72 overflow-auto">
        {!treffer.length ? (
          <li className="px-3 py-2.5 text-[13px] text-[color:var(--muted)]">Nichts gefunden. Versuchen Sie einen anderen Begriff.</li>
        ) : q.trim() ? (
          treffer.map(option)
        ) : (
          spartenGruppiert(treffer).map((g) => (
            <li key={g.label} role="presentation" data-sparten-gruppe={g.label}>
              <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">{g.label}</div>
              <ul role="group" aria-label={g.label}>
                {g.sparten.map(option)}
              </ul>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

/** Kurzer Speicherstand am Ende des Bereichs: „Speichert …“, „Gespeichert“, bei Fehler „Erneut versuchen“. */
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

const FELD = "h-10 w-full min-w-0 rounded-[var(--radius-sm)] border border-[color:var(--border-strong)] bg-white px-2.5 text-sm sm:h-9";
const ANDERER = "__anderer__";

/**
 * „Ja, woanders“ (Ole, 18.11.2026): Versicherer und Tarif zur Auswahl aus dem Tarifkatalog (wie „Bisheriger Vertrag“),
 * eigene Eingabe nur, wenn er nicht dabei ist. Steht die Sparte im Angebot und ist dort noch kein bisheriger Vertrag
 * eingetragen, wird er von hier übernommen (keine doppelte Eingabe).
 */
function WoandersFelder({
  s,
  ro,
  gesellschaften,
  setze,
  anSparte,
}: {
  s: SchutzEintrag;
  ro: boolean;
  gesellschaften: { key: string; name: string }[];
  setze: (fn: (x: SchutzEintrag) => void) => void;
  anSparte: (fn: (sp: SparteWahl) => void) => void;
}) {
  const [tarife, setTarife] = useState<BisherTarif[] | null>(null);
  const [eigenerName, setEigenerName] = useState(false);
  const gKey = gesellschaftAusText(s.versicherer ?? null);
  useEffect(() => {
    if (!gKey) return;
    let aktuell = true;
    void bisherTarifeAction(s.key, gKey).then((r) => {
      if (aktuell) setTarife(r.ok ? r.tarife : []);
    });
    return () => {
      aktuell = false;
    };
  }, [gKey, s.key]);
  const liste = gKey ? (tarife ?? []).filter((t) => t.id.startsWith(`${gKey}/`)) : [];
  const gewaehlt = liste.find((t) => t.id === s.katalogId) ?? null;
  const freiText = eigenerName || (!!s.tarif && !gewaehlt);

  // In den bisherigen Vertrag der Sparte übernehmen, solange dort nichts von Hand steht
  const uebernehmen = (x: Pick<SchutzEintrag, "versicherer" | "tarif" | "katalogId" | "beitrag" | "ablauf">, werte: Record<string, string> = {}) =>
    anSparte((sp) => {
      // Nur ein im Formular „Bisheriger Vertrag“ selbst gepflegter Vertrag (Tarif oder Beitrag) einer anderen Gesellschaft
      // bleibt; Werte aus Chat bzw. Police ersetzt die Eingabe hier (lib/bisheriger-vertrag.ts bisherMitSchutz)
      if (sp.bisher?.quelle === "hand" && sp.bisher.gesellschaft && sp.bisher.gesellschaft !== (s.versicherer ?? null) && (sp.bisher.katalogId || sp.bisher.beitrag != null)) return;
      const b = bisherHand(sp.bisher);
      sp.bisher = {
        ...b,
        gesellschaft: x.versicherer ?? null,
        tarif: x.tarif ?? null,
        katalogId: x.katalogId ?? null,
        werte: x.katalogId ? werte : b.katalogId === (x.katalogId ?? null) ? b.werte : {},
        beitrag: x.beitrag ?? b.beitrag,
        zahlweise: x.beitrag != null ? "monat" : b.zahlweise,
        ablauf: x.ablauf ? `${x.ablauf}-01` : b.ablauf,
      };
    });

  return (
    <div className="mt-2 grid grid-cols-2 gap-x-1.5 gap-y-2" data-woanders>
      <label className="grid min-w-0 gap-0.5 text-[11px] font-medium text-[color:var(--muted)]">
        Versicherer
        <input
          list={`schutz-ges-${s.key}`}
          aria-label="Versicherer"
          placeholder="Auswählen"
          disabled={ro}
          defaultValue={s.versicherer ?? ""}
          maxLength={60}
          onChange={(e) => {
            const v = e.target.value.trim() || null;
            const andere = gesellschaftAusText(v) !== gesellschaftAusText(s.versicherer ?? null);
            setEigenerName(false);
            setze((x) => {
              x.versicherer = v;
              if (andere) {
                x.tarif = null;
                x.katalogId = null;
              }
            });
            uebernehmen({ versicherer: v, tarif: andere ? null : s.tarif, katalogId: andere ? null : s.katalogId, beitrag: s.beitrag, ablauf: s.ablauf });
          }}
          className={FELD}
          data-woanders-versicherer
        />
        <datalist id={`schutz-ges-${s.key}`}>
          {gesellschaften.map((g) => (
            <option key={g.key} value={g.name} />
          ))}
        </datalist>
      </label>
      <label className="grid min-w-0 gap-0.5 text-[11px] font-medium text-[color:var(--muted)]">
        Tarif
        {liste.length && !freiText ? (
          <select
            aria-label="Tarif"
            disabled={ro}
            value={s.katalogId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (v === ANDERER) {
                setEigenerName(true);
                setze((x) => {
                  x.katalogId = null;
                  x.tarif = null;
                });
                return;
              }
              const t = liste.find((x) => x.id === v) ?? null;
              setze((x) => {
                x.katalogId = t?.id ?? null;
                x.tarif = t?.kurz ?? null;
              });
              uebernehmen({ versicherer: s.versicherer, tarif: t?.kurz ?? null, katalogId: t?.id ?? null, beitrag: s.beitrag, ablauf: s.ablauf }, t?.werte ?? {});
            }}
            className={FELD}
            data-woanders-tarif-wahl
          >
            <option value="">Auswählen</option>
            {liste.map((t) => (
              <option key={t.id} value={t.id}>
                {t.kurz}
              </option>
            ))}
            <option value={ANDERER}>Nicht dabei</option>
          </select>
        ) : (
          <input
            aria-label="Tarif"
            placeholder={gKey ? "Tarifname" : "Erst Versicherer"}
            disabled={ro || (!gKey && !s.versicherer)}
            defaultValue={s.tarif ?? ""}
            maxLength={80}
            onChange={(e) => {
              const v = e.target.value.trim() || null;
              setze((x) => {
                x.tarif = v;
                x.katalogId = null;
              });
              uebernehmen({ versicherer: s.versicherer, tarif: v, katalogId: null, beitrag: s.beitrag, ablauf: s.ablauf });
            }}
            className={FELD}
            data-woanders-tarif
          />
        )}
      </label>
      <label className="grid min-w-0 gap-0.5 text-[11px] font-medium text-[color:var(--muted)]">
        Ablauf
        <input
          type="month"
          aria-label="Ablauf"
          title="Ablauf bzw. Hauptfälligkeit"
          disabled={ro}
          defaultValue={s.ablauf ?? ""}
          onChange={(e) => {
            const v = /^\d{4}-\d{2}$/.test(e.target.value) ? e.target.value : null;
            setze((x) => void (x.ablauf = v));
            uebernehmen({ versicherer: s.versicherer, tarif: s.tarif, katalogId: s.katalogId, beitrag: s.beitrag, ablauf: v });
          }}
          className={FELD}
        />
      </label>
      <label className="grid min-w-0 gap-0.5 text-[11px] font-medium text-[color:var(--muted)]">
        Beitrag im Monat
        <input
          inputMode="decimal"
          aria-label="Beitrag ungefähr im Monat"
          placeholder="ca. €"
          disabled={ro}
          defaultValue={s.beitrag != null ? String(s.beitrag).replace(".", ",") : ""}
          onChange={(e) => {
            const v = betrag(e.target.value);
            setze((x) => void (x.beitrag = v));
            uebernehmen({ versicherer: s.versicherer, tarif: s.tarif, katalogId: s.katalogId, beitrag: v, ablauf: s.ablauf });
          }}
          className={cn(FELD, "text-right")}
        />
      </label>
    </div>
  );
}
