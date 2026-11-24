"use client";

// Vertragsseite (Policen auslesen, Paket 2 „Champions League“, 19.11.2026; Datei- und Komponentenname bleiben).
// Wer: Vermittler vor dem Termin, oft am Handy. Aufgabe: in 30 Sekunden sehen, was der Kunde zahlt und welche Fragen
// im Termin Geld bringen, Werte prüfen und danach mit einem Tipp in den Bestand übernehmen.
// Aufbau: Kopf (Beiträge im Monat und Jahr, ein K6-Satz, die eine Hauptaktion), „Fragen für den Termin“ (3 sichtbar, Rest
// unter „Mehr“, Sprung zur markierten Karte), Karten kompakt und sortiert (Gesprächsfelder und unsichere Felder sichtbar,
// Rest unter „Alle Angaben“), unten was nicht ausgelesen wurde. Hauptaktion am Handy fest unten über der Navigation.
// Fragen kommen aus festen Vorlagen (zusammenfassung.ts), keine Beratung und keine Bewertung (K8).

import { useEffect, useRef, useState, useTransition } from "react";
import { Archive, Check, ChevronDown, FileText, Loader2, Pencil, RotateCcw, ShieldCheck } from "lucide-react";
import { Badge, Button, ButtonLink, Card } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { zweiFaktorHref } from "@/components/security/zwei-faktor-hinweis";
import { felderFuer, SPARTE_LABEL, type AuslesenSparte, type Feld, type FeldWert } from "@/lib/policen/auslesen/felder";
import type { OffeneUnterlage, Vergleich, VertragKarte } from "@/lib/policen/auslesen/server";
import {
  fragenJeKarte,
  GRUND_TEXT,
  hauptaktion,
  hauptaktionText,
  K6_SATZ,
  kartenZeilen,
  kopfZeile,
  MONAT_UNBEKANNT,
  SICHTBARE_FRAGEN,
  sortiereKarten,
  SPERRE_TEXT,
  vertraegeText,
  type Hauptaktion,
  type Zeile,
} from "@/lib/policen/auslesen/vertragsseite";
import { FrageNummer, vertragAnker } from "@/components/policen-frage-nummer";
import { KiAusHinweis } from "@/components/ki-aus-hinweis";
import type { Frage } from "@/lib/policen/auslesen/zusammenfassung";
import { alleGeprueftAction, alleUebernehmenAction, auslesenAction, korrigierenAction, sparteAction } from "@/app/buyer/termine/[id]/vorbereitung/vertraege/actions";

const tag = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
};
const DT = "text-[color:var(--muted)]";
// K6 (Rechtsprüfung): ein Satz oben (K6_SATZ, gleich im Spickzettel), dazu „Bitte prüfen“ an jeder ungeprüften Karte und
// an jedem unsicheren Feld.
const anker = vertragAnker;

type Aktion = Exclude<Hauptaktion, null | { art: "fertig" }>;

export function Vergleichsblatt({
  terminId,
  leadId,
  v,
  readOnly,
  ohne2fa = false,
  zurueck,
  terminHref,
  inhaber = true,
}: {
  terminId: string;
  leadId: string;
  v: Vergleich;
  readOnly: boolean;
  /** Angemeldeter ist der Inhaber: nur er kann einen Widerspruch gegen Amazon Web Services in den Einstellungen ändern */
  inhaber?: boolean;
  /** Login ohne Zwei-Faktor: Original öffnet erst nach der Einrichtung (AVV § 5), das steht direkt am Link */
  ohne2fa?: boolean;
  /** Rücksprung nach der Zwei-Faktor-Einrichtung (diese Seite) */
  zurueck?: string;
  /** Terminvorbereitung: nächste Handlung, solange nichts ausgelesen ist */
  terminHref?: string;
}) {
  const z = v.zusammenfassung;
  const toast = useToast();
  const [pending, start] = useTransition();
  const original = (docId: string) => (ohne2fa ? zweiFaktorHref(zurueck ?? `/buyer/leads/${leadId}#dokumente`) : `/api/buyer/leads/${leadId}/unterlagen/${docId}`);
  const karten = sortiereKarten(v.vertraege, z.fragen);
  const nummern = fragenJeKarte(z.fragen);
  const a = hauptaktion(v.vertraege, { bestand: v.bestand, readOnly });
  const aktion: Aktion | null = a && a.art !== "fertig" ? a : null;
  const kopf = kopfZeile(z);

  const ausfuehren = (x: Aktion) =>
    start(async () => {
      const r = x.art === "pruefen" ? await alleGeprueftAction(terminId, x.ids) : await alleUebernehmenAction(terminId, x.ids);
      if (!r.ok) toast.show({ message: r.error ?? "Fehler", tone: "error" });
      else toast.show({ message: `${vertraegeText(r.anzahl ?? x.ids.length)} ${x.art === "pruefen" ? "als geprüft markiert" : "in den Bestand übernommen"}${r.error ? `. ${r.error}` : ""}` });
    });

  return (
    <div className="space-y-3" data-vergleichsblatt>
      {v.vertraege.length ? (
        <Card data-vergleich-zusammenfassung>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-5 pb-3 pt-4">
            <div className="min-w-0">
              <p className="text-2xl font-semibold tracking-tight" data-monat-summe>
                {kopf.monat ? (
                  <>
                    {kopf.monat} <span className="text-base font-medium">im Monat</span>
                  </>
                ) : (
                  MONAT_UNBEKANNT
                )}
              </p>
              <p className={`mt-0.5 text-[13px] ${DT}`} data-kopf-zeile>
                {kopf.zeile}
              </p>
            </div>
            {aktion ? (
              <div className="hidden md:block">
                <HauptaktionKnopf a={aktion} pending={pending} onClick={() => ausfuehren(aktion)} />
              </div>
            ) : a?.art === "fertig" ? (
              <Badge tone="success" icon={Check}>
                {a.text}
              </Badge>
            ) : null}
          </div>
          <p className={`px-5 pb-3.5 text-[13px] ${DT}`} data-k6>
            {K6_SATZ}
            {ohne2fa ? (
              <>
                {" "}
                <a href={zweiFaktorHref(zurueck ?? `/buyer/leads/${leadId}#dokumente`)} className="font-medium text-[color:var(--brand)] hover:underline" data-zwei-faktor-einrichten>
                  Für die Originale einmal Zwei-Faktor einrichten.
                </a>
              </>
            ) : null}
          </p>
          {z.fragen.length ? <Fragen fragen={z.fragen} /> : null}
        </Card>
      ) : null}

      {karten.length ? (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {karten.map((k) => (
            <VertragKarteAnsicht key={k.id} terminId={terminId} k={k} nummern={nummern.get(k.id) ?? []} heute={v.heute} href={original(k.documentId)} ohne2fa={ohne2fa} readOnly={readOnly} />
          ))}
        </div>
      ) : null}

      {v.offen.length ? <Offen terminId={terminId} v={v} href={original} ohne2fa={ohne2fa} readOnly={readOnly} terminHref={terminHref} inhaber={inhaber} /> : null}

      {/* Handy: die eine Hauptaktion fest unten über der Navigation (wie die Aktionsleiste der Terminvorbereitung) */}
      {aktion ? (
        <div className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-30 border-t border-[color:var(--border)] bg-white/95 px-4 py-2.5 backdrop-blur md:hidden" data-aktionsleiste>
          <HauptaktionKnopf a={aktion} pending={pending} onClick={() => ausfuehren(aktion)} className="h-11 w-full" />
        </div>
      ) : null}
    </div>
  );
}

function HauptaktionKnopf({ a, pending, onClick, className }: { a: Aktion; pending: boolean; onClick: () => void; className?: string }) {
  return (
    <Button variant="primary" size="md" icon={pending ? Loader2 : a.art === "pruefen" ? Check : Archive} onClick={onClick} disabled={pending} className={className} data-hauptaktion={a.art}>
      {hauptaktionText(a)}
    </Button>
  );
}

const Nummer = FrageNummer;

function FrageZeile({ f, n }: { f: Frage; n: number }) {
  const inhalt = (
    <>
      <Nummer n={n} />
      <span className="min-w-0 flex-1">
        {f.text}
        {f.zusatz ? <span className={`block text-[13px] ${DT}`}>{f.zusatz}</span> : null}
      </span>
    </>
  );
  return (
    <li data-frage={f.typ}>
      {f.ids.length ? (
        <a href={`#${anker(f.ids[0])}`} className="-mx-2 flex min-h-11 items-start gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 hover:bg-[color:var(--surface-sunken)]">
          {inhalt}
        </a>
      ) : (
        <div className="flex min-h-11 items-start gap-2.5 py-1.5">{inhalt}</div>
      )}
    </li>
  );
}

function Fragen({ fragen }: { fragen: Frage[] }) {
  const sichtbar = fragen.slice(0, SICHTBARE_FRAGEN);
  const rest = fragen.slice(SICHTBARE_FRAGEN);
  return (
    <div className="border-t border-[color:var(--border)] px-5 py-3 text-sm" data-fragen>
      <h2 className="text-[13px] font-semibold">Zum Ansprechen im Termin</h2>
      <ol className="mt-1">
        {sichtbar.map((f, i) => (
          <FrageZeile key={f.text} f={f} n={i + 1} />
        ))}
      </ol>
      {rest.length ? (
        <details className="group">
          <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1 text-[13px] font-medium text-[color:var(--brand)] [&::-webkit-details-marker]:hidden" data-fragen-mehr>
            Mehr ({rest.length}) <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
          </summary>
          <ol>
            {rest.map((f, i) => (
              <FrageZeile key={f.text} f={f} n={SICHTBARE_FRAGEN + i + 1} />
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}

/** Lange Werte (Beitrag laut Unterlage, Laufzeit, Bausteine) über die ganze Breite, sonst zwei Kacheln je Reihe. */
const BREIT = new Set(["beitrag_laut", "laufzeit", "bausteine", "unterversicherungsverzicht"]);

function Zeilen({ zeilen, geprueft }: { zeilen: Zeile[]; geprueft: boolean }) {
  // Beschriftung über dem Wert (keine Silbentrennung am Handy), zwei Spalten, damit die Karte kurz bleibt
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
      {zeilen.map((z) => {
        const pruefen = z.pruefen && !geprueft;
        return (
          <div key={z.key} className={BREIT.has(z.key) || z.wert.length > 20 ? "col-span-2 min-w-0" : "min-w-0"}>
            <dt className={`break-words text-[13px] leading-5 ${DT}`}>{z.label}</dt>
            <dd className={pruefen ? "font-medium text-amber-800" : "font-medium"} data-feld={z.key} data-pruefen={pruefen || undefined}>
              <span className="whitespace-nowrap">{z.wert}</span>
              {pruefen ? <span className="ml-1.5 whitespace-nowrap text-xs font-normal">bitte prüfen</span> : null}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function OriginalLink({ href, ohne2fa }: { href: string; ohne2fa: boolean }) {
  // Ohne Zwei-Faktor-Login führt der Link zur Einrichtung (Schild statt Dokument); die Erklärung steht im Kopf der Seite
  return ohne2fa ? (
    <a href={href} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-[color:var(--brand)] hover:underline" title="Zum Öffnen Zwei-Faktor einrichten" data-original data-zwei-faktor-einrichten>
      <ShieldCheck className="h-4 w-4 shrink-0" /> Original
    </a>
  ) : (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-[color:var(--brand)] hover:underline" data-original>
      <FileText className="h-4 w-4" /> Original
    </a>
  );
}

function VertragKarteAnsicht({
  terminId,
  k,
  nummern,
  heute,
  href,
  ohne2fa,
  readOnly,
}: {
  terminId: string;
  k: VertragKarte;
  nummern: number[];
  heute: string;
  href: string;
  ohne2fa: boolean;
  readOnly: boolean;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [bearbeiten, setBearbeiten] = useState(false);
  const [alle, setAlle] = useState(false);
  const felder = felderFuer(k.sparte);
  const versicherer = typeof k.felder.versicherer?.w === "string" ? k.felder.versicherer.w : null;
  const { sichtbar, mehr } = kartenZeilen(k, heute, k.monat);
  const speichern = (e: Record<string, unknown>) =>
    start(async () => {
      const r = await korrigierenAction(terminId, k.id, e);
      toast.show(r.ok ? { message: "Gespeichert und als geprüft markiert" } : { message: r.error ?? "Fehler", tone: "error" });
      if (r.ok) setBearbeiten(false);
    });

  return (
    <section
      id={anker(k.id)}
      className="scroll-mt-20 overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-md)] target:ring-2 target:ring-amber-300"
      data-vertrag-karte={k.sparte}
    >
      {/* Kopf als Umschalter: zu sehen sind die Gesprächswerte; ein Tipp zeigt alle Angaben, Original und Bearbeiten */}
      <button
        type="button"
        onClick={() => setAlle((x) => !x)}
        aria-expanded={alle}
        disabled={bearbeiten}
        className="flex w-full items-start justify-between gap-3 px-5 pt-2.5 text-left"
        data-karte-umschalten
      >
        <span className="flex min-w-0 items-start gap-2">
          {nummern.length ? (
            <span className="mt-0.5 flex shrink-0 gap-1" data-karte-fragen={nummern.join(",")}>
              {nummern.map((n) => (
                <Nummer key={n} n={n} />
              ))}
            </span>
          ) : null}
          <span className="min-w-0 text-[15px] font-semibold tracking-tight">
            {SPARTE_LABEL[k.sparte]}
            <span className={`font-normal ${DT}`}> · {versicherer ?? "Versicherer nicht gefunden"}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {k.uebernommen ? (
            <Badge tone="brand">Im Bestand</Badge>
          ) : k.geprueft ? (
            <Badge tone="success" icon={Check}>
              Geprüft
            </Badge>
          ) : (
            <Badge tone="warning">Bitte prüfen</Badge>
          )}
          {bearbeiten ? null : <ChevronDown className={`h-4 w-4 text-[color:var(--muted)] transition ${alle ? "rotate-180" : ""}`} aria-label={alle ? "Weniger" : "Alle Angaben, Original, Bearbeiten"} />}
        </span>
      </button>

      {bearbeiten ? (
        <Bearbeiten k={k} felder={felder} pending={pending} onAbbrechen={() => setBearbeiten(false)} onSpeichern={speichern} />
      ) : (
        <>
          <div className="px-5 pb-2.5 pt-1.5">
            {sichtbar.length ? <Zeilen zeilen={sichtbar} geprueft={k.geprueft} /> : <p className={`text-sm ${DT}`}>Keine Vertragsdaten gefunden. Bitte im Original nachsehen.</p>}
            {alle && mehr.length ? (
              <div className="mt-2 border-t border-dashed border-[color:var(--border)] pt-2" data-alle-angaben-offen>
                <Zeilen zeilen={mehr} geprueft={k.geprueft} />
              </div>
            ) : null}
          </div>
          {alle ? (
            <div className="flex items-center gap-3 border-t border-[color:var(--border)] px-5 py-0.5" data-karte-aktionen>
              <OriginalLink href={href} ohne2fa={ohne2fa} />
              <span className="flex-1" />
              {readOnly || k.uebernommen ? null : (
                <Button variant="ghost" icon={Pencil} onClick={() => setBearbeiten(true)} disabled={pending} className="-mr-3" data-bearbeiten>
                  Bearbeiten
                </Button>
              )}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

const INPUT = "h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm focus:border-[color:var(--brand)] focus:outline-none";

function startwert(f: Feld, w: FeldWert | undefined): string | string[] {
  if (w === undefined) return f.typ === "liste" ? [] : "";
  if (f.typ === "janein") return w ? "ja" : "nein";
  if (f.typ === "liste") return w as string[];
  if (f.typ === "betrag" || f.typ === "zahl") return String(w).replace(".", ",");
  return String(w);
}

function Bearbeiten({
  k,
  felder,
  pending,
  onAbbrechen,
  onSpeichern,
}: {
  k: VertragKarte;
  felder: Feld[];
  pending: boolean;
  onAbbrechen: () => void;
  onSpeichern: (eingaben: Record<string, unknown>) => void;
}) {
  const [werte, setWerte] = useState<Record<string, string | string[]>>(() => Object.fromEntries(felder.map((f) => [f.key, startwert(f, k.felder[f.key]?.w)])));
  const setze = (key: string, v: string | string[]) => setWerte((x) => ({ ...x, [key]: v }));
  const speichern = () => {
    const out: Record<string, unknown> = {};
    for (const f of felder) {
      const v = werte[f.key];
      if (f.typ === "liste") out[f.key] = (v as string[]).length ? v : null;
      else if (v === "") out[f.key] = null;
      else if (f.typ === "janein") out[f.key] = v === "ja";
      else if (f.typ === "betrag" || f.typ === "zahl" || f.typ === "ganzzahl") out[f.key] = Number(String(v).replace(/\./g, "").replace(",", "."));
      else out[f.key] = v;
    }
    onSpeichern(out);
  };
  return (
    <form
      className="space-y-3 px-5 py-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        speichern();
      }}
      data-bearbeiten-form
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {felder.map((f) => (
          <label key={f.key} className="block text-sm">
            <span className={`mb-1 block text-[13px] ${DT}`}>
              {f.label}
              {f.einheit && f.typ !== "betrag" ? ` (${f.einheit})` : f.einheit && f.einheit !== "€" ? ` (${f.einheit})` : ""}
            </span>
            {f.typ === "janein" || f.typ === "auswahl" ? (
              <select className={INPUT} value={werte[f.key] as string} onChange={(e) => setze(f.key, e.target.value)}>
                <option value="">nicht angegeben</option>
                {f.typ === "janein" ? (
                  <>
                    <option value="ja">ja</option>
                    <option value="nein">nein</option>
                  </>
                ) : (
                  f.optionen?.map((o) => (
                    <option key={o.wert} value={o.wert}>
                      {o.label}
                    </option>
                  ))
                )}
              </select>
            ) : f.typ === "liste" ? (
              <span className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
                {f.optionen?.map((o) => {
                  const an = (werte[f.key] as string[]).includes(o.wert);
                  return (
                    <span key={o.wert} className="inline-flex min-h-8 items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={an}
                        onChange={() => setze(f.key, an ? (werte[f.key] as string[]).filter((x) => x !== o.wert) : [...(werte[f.key] as string[]), o.wert])}
                      />
                      {o.label}
                    </span>
                  );
                })}
              </span>
            ) : (
              <input
                className={INPUT}
                type={f.typ === "datum" ? "date" : "text"}
                inputMode={f.typ === "betrag" || f.typ === "zahl" ? "decimal" : f.typ === "ganzzahl" ? "numeric" : undefined}
                value={werte[f.key] as string}
                onChange={(e) => setze(f.key, e.target.value)}
                placeholder={f.key === "versicherungsnummer" ? "letzte 4 Stellen" : undefined}
              />
            )}
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="md" disabled={pending} data-speichern>
          Speichern
        </Button>
        <Button type="button" variant="ghost" size="md" onClick={onAbbrechen} disabled={pending}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

const GRUND = GRUND_TEXT;
const SPERRE = SPERRE_TEXT;

/** Sparten, die beim Wählen direkt sichtbar sind; alle anderen hinter „Weitere“. */
const HAEUFIG: readonly AuslesenSparte[] = ["haftpflicht", "hausrat", "kfz", "wohngebaeude", "rechtsschutz", "unfall"];

function Offen({ terminId, v, href, ohne2fa, readOnly, terminHref, inhaber }: { terminId: string; v: Vergleich; href: (docId: string) => string; ohne2fa: boolean; readOnly: boolean; terminHref?: string; inhaber: boolean }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [laeuft, setLaeuft] = useState(false);
  const gestartet = useRef(false);
  const neue = v.offen.some((o) => o.status === "neu" || o.status === "laeuft");
  // Neue Unterlagen (z. B. Zustimmung kam nach den Unterlagen) gleich beim Öffnen auslesen
  useEffect(() => {
    if (readOnly || v.sperre || !neue || gestartet.current) return;
    gestartet.current = true;
    setLaeuft(true);
    void auslesenAction(terminId).finally(() => setLaeuft(false));
  }, [readOnly, v.sperre, neue, terminId]);

  // Gewählte Sparte je Unterlage: Auslesen dauert einige Sekunden, solange Hinweis und Spinner statt nur grauer Knöpfe
  // (Ole, 19.11.2026: „wenn ich hier draufklicke, passiert nichts und die Buttons werden grau“)
  const [gewaehlt, setGewaehlt] = useState<{ doc: string; sparte: AuslesenSparte | "andere" } | null>(null);
  const label = (s: AuslesenSparte | "andere") => (s === "andere" ? "Andere" : SPARTE_LABEL[s]);
  // Häufige Sparten direkt, der Rest hinter „Weitere“ (je Unterlage)
  const [mehr, setMehr] = useState<string | null>(null);
  const waehle = (o: OffeneUnterlage, s: AuslesenSparte | "andere") => {
    setGewaehlt({ doc: o.documentId, sparte: s });
    start(async () => {
      const r = await sparteAction(terminId, o.documentId, s);
      if (!r.ok) toast.show({ message: r.error ?? "Fehler", tone: "error" });
      else if (r.status === "ausgelesen") toast.show({ message: `${SPARTE_LABEL[s as AuslesenSparte]} ausgelesen` });
      else if (r.status === "andere") toast.show({ message: "Als andere Sparte vermerkt" });
      else toast.show({ message: r.status === "sparte_abweichend" ? `Passt nicht zu ${label(s)}. Bitte andere Sparte wählen oder im Original nachsehen.` : "Nicht ausgelesen. Bitte im Original nachsehen.", tone: "error" });
    });
  };

  return (
    <Card data-nicht-ausgelesen>
      <div className="border-b border-[color:var(--border)] px-5 py-3">
        <h2 className="text-[15px] font-semibold tracking-tight">{v.vertraege.length ? "Weitere Unterlagen" : "Unterlagen vom Kunden"}</h2>
        {/* Sperre (z. B. „ohne KI“) einmal oben statt an jeder Unterlage; die Unterlagen selbst bleiben zu öffnen */}
        {v.sperre === "widerspruch" && v.widerspruchAm ? (
          // Vermittler hat Amazon Web Services widersprochen: ruhiger Hinweis mit Datum und Weg zu den Einstellungen
          <div data-sperre={v.sperre}>
            <KiAusHinweis was="Automatisches Auslesen" hinweis={{ am: v.widerspruchAm, inhaber }} className="mt-0.5" />
          </div>
        ) : v.sperre ? (
          <p className={`mt-0.5 text-[13px] ${DT}`} data-sperre={v.sperre}>{SPERRE[v.sperre]}</p>
        ) : null}
      </div>
      <ul className="divide-y divide-[color:var(--border)]">
        {v.offen.map((o) => {
          const text = v.sperre ? null : (GRUND[o.status] ?? GRUND.limit);
          const waehlen = !v.sperre && !readOnly && (o.status === "sparte_offen" || o.status === "sparte_abweichend");
          const diese = pending && gewaehlt?.doc === o.documentId ? gewaehlt : null;
          const laedt = (!v.sperre && (o.status === "neu" || o.status === "laeuft") && (laeuft || pending)) || !!diese;
          return (
            <li key={o.documentId} className="px-5 py-2.5 text-sm" data-offen={o.status}>
              <a href={href(o.documentId)} {...(ohne2fa ? {} : { target: "_blank", rel: "noreferrer" })} className="flex min-h-10 items-center gap-2 font-medium text-[color:var(--brand)] hover:underline">
                {ohne2fa ? <ShieldCheck className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
                <span className="min-w-0">
                  {o.status === "sparte_abweichend" || o.status === "andere" ? "Unterlage" : o.titel} vom {tag(o.datum)}
                  {ohne2fa ? <span className={`block text-xs font-normal ${DT}`}>Zum Öffnen Zwei-Faktor einrichten</span> : null}
                </span>
              </a>
              {text || diese ? (
                <p className={`flex items-center gap-1.5 pl-6 ${DT}`}>
                  {laedt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {diese ? (diese.sparte === "andere" ? "Wird gespeichert …" : `${label(diese.sparte)} wird ausgelesen, das dauert einige Sekunden …`) : text}
                </p>
              ) : null}
              {waehlen ? (
                <div className="mt-2 flex flex-wrap gap-1.5 pl-6" data-sparte-waehlen>
                  {v.sparten
                    .filter((s) => mehr === o.documentId || HAEUFIG.includes(s) || diese?.sparte === s)
                    .map((s) => (
                      <Button key={s} variant={diese?.sparte === s ? "primary" : undefined} onClick={() => waehle(o, s)} disabled={pending} data-sparte={s}>
                        {label(s)}
                      </Button>
                    ))}
                  {mehr !== o.documentId && v.sparten.some((s) => !HAEUFIG.includes(s)) ? (
                    <Button variant="ghost" onClick={() => setMehr(o.documentId)} disabled={pending} data-weitere-sparten>
                      Weitere …
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {!v.sperre && !readOnly && o.status === "fehler" ? (
                <div className="mt-2 pl-6">
                  <Button icon={RotateCcw} onClick={() => start(async () => void (await auslesenAction(terminId)))} disabled={pending}>
                    Erneut versuchen
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {/* Ohne ausgelesene Verträge: eine klare nächste Handlung statt Sackgasse */}
      {!v.vertraege.length && terminHref ? (
        <div className="border-t border-[color:var(--border)] px-5 py-3" data-hauptaktion="termin">
          <ButtonLink href={terminHref} variant="primary" size="md" className="w-full sm:w-auto">
            Zur Terminvorbereitung
          </ButtonLink>
        </div>
      ) : null}
    </Card>
  );
}
