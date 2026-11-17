"use client";

// Vergleichsblatt (Policen auslesen, Ole 18.11.2026). Wer: Vermittler vor dem Termin, oft am Handy. Aufgabe: in einer
// Minute sehen, was der Kunde schon hat (Beiträge, Kündigungstermine, Auffälliges), Werte prüfen und bei Bedarf in
// den Bestand übernehmen. Eigene, abgegrenzte Komponente (Terminvorbereitung verlinkt nur hierher).
// Oben die Zusammenfassung, darunter je Vertrag eine Karte (nur gefundene Felder; Bearbeiten zeigt alle), unten was
// nicht ausgelesen wurde, mit der nächsten Handlung. Hinweise sind Hinweise an den Vermittler, keine Beratung.

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, FileText, Pencil, Archive, RotateCcw, Loader2, CalendarClock, TriangleAlert } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { felderFuer, SPARTE_LABEL, zeigeWert, type AuslesenSparte, type Feld, type FeldWert } from "@/lib/policen/auslesen/felder";
import type { OffeneUnterlage, Vergleich, VertragKarte } from "@/lib/policen/auslesen/server";
import { auslesenAction, bestandAction, geprueftAction, korrigierenAction, sparteAction } from "@/app/buyer/termine/[id]/vorbereitung/vertraege/actions";

const euro = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const tag = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
};
const DT = "text-[color:var(--muted)]";

export function Vergleichsblatt({ terminId, leadId, v, readOnly }: { terminId: string; leadId: string; v: Vergleich; readOnly: boolean }) {
  const z = v.zusammenfassung;
  const original = (docId: string) => `/api/buyer/leads/${leadId}/unterlagen/${docId}`;
  const hinweise = [...z.doppelt.map((s) => `${SPARTE_LABEL[s]} zweimal vorhanden`), ...z.bausteine.map((b) => b.text)];

  return (
    <div className="space-y-4" data-vergleichsblatt>
      {v.vertraege.length ? (
        <Card data-vergleich-zusammenfassung>
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-6">
            <div>
              <p className={`text-[13px] ${DT}`}>Beiträge im Monat</p>
              <p className="text-2xl font-semibold tracking-tight" data-monat-summe>
                {z.monatSumme != null ? euro(z.monatSumme) : "nicht bekannt"}
              </p>
              <p className={`mt-0.5 text-[13px] ${DT}`}>
                {z.vertraege} {z.vertraege === 1 ? "Vertrag" : "Verträge"}
                {z.ungeprueft ? ` · ${z.ungeprueft} noch nicht geprüft` : " · alle geprüft"}
              </p>
            </div>
            <div className="space-y-3 text-sm">
              <div data-kuendigungen>
                <p className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold">
                  <CalendarClock className="h-4 w-4 text-[color:var(--muted)]" /> Kündbar in den nächsten 3 Monaten
                </p>
                {z.kuendigungen.length ? (
                  <ul className="space-y-1">
                    {z.kuendigungen.map((k) => (
                      <li key={k.id}>
                        <span className="font-medium">{SPARTE_LABEL[k.sparte]}</span>
                        {k.versicherer ? <span className={DT}> ({k.versicherer})</span> : null}: zum {tag(k.zum)}
                        {k.bis ? <span className="font-medium text-amber-800">, Kündigung bis {tag(k.bis)}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={DT}>Keine</p>
                )}
              </div>
              {hinweise.length ? (
                <div data-hinweise>
                  <p className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold">
                    <TriangleAlert className="h-4 w-4 text-amber-600" /> Zum Ansprechen
                  </p>
                  <ul className="space-y-1">
                    {hinweise.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
          <p className={`border-t border-[color:var(--border)] px-5 py-2.5 text-xs ${DT}`}>Maschinell ausgelesen. Bitte prüfen Sie die Werte, bevor Sie sie verwenden.</p>
        </Card>
      ) : null}

      {v.vertraege.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {v.vertraege.map((k) => (
            <VertragKarteAnsicht key={k.id} terminId={terminId} k={k} href={original(k.documentId)} readOnly={readOnly} bestand={v.bestand} />
          ))}
        </div>
      ) : null}

      {v.offen.length ? <Offen terminId={terminId} v={v} href={original} readOnly={readOnly} /> : null}
    </div>
  );
}

function VertragKarteAnsicht({ terminId, k, href, readOnly, bestand }: { terminId: string; k: VertragKarte; href: string; readOnly: boolean; bestand: boolean }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [bearbeiten, setBearbeiten] = useState(false);
  const felder = felderFuer(k.sparte);
  const versicherer = typeof k.felder.versicherer?.w === "string" ? k.felder.versicherer.w : null;
  const sichtbar = felder.filter((f) => f.key !== "versicherer" && k.felder[f.key]);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      toast.show(r.ok ? { message: ok } : { message: r.error ?? "Fehler", tone: "error" });
      if (r.ok) setBearbeiten(false);
    });

  return (
    <Card data-vertrag-karte={k.sparte}>
      <div className="flex items-start justify-between gap-3 border-b border-[color:var(--border)] px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight">{SPARTE_LABEL[k.sparte]}</h2>
          <p className={`truncate text-[13px] ${DT}`}>{versicherer ?? "Versicherer nicht gefunden"}</p>
        </div>
        {k.uebernommen ? (
          <Badge tone="brand">Im Bestand</Badge>
        ) : k.geprueft ? (
          <Badge tone="success" icon={Check}>
            Geprüft
          </Badge>
        ) : (
          <Badge tone="warning">Ausgelesen, bitte prüfen</Badge>
        )}
      </div>

      {bearbeiten ? (
        <Bearbeiten
          k={k}
          felder={felder}
          pending={pending}
          onAbbrechen={() => setBearbeiten(false)}
          onSpeichern={(e) => run(() => korrigierenAction(terminId, k.id, e), "Gespeichert und als geprüft markiert")}
        />
      ) : (
        <>
          <dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-1.5 px-5 py-3.5 text-sm">
            {k.monat != null ? (
              <>
                <dt className={DT}>Im Monat</dt>
                <dd className="font-semibold">{euro(k.monat)}</dd>
              </>
            ) : null}
            {sichtbar.map((f) => {
              const x = k.felder[f.key]!;
              const pruefen = x.s === "pruefen" && !k.geprueft;
              return (
                <div key={f.key} className="contents">
                  <dt className={`break-words hyphens-auto ${DT}`}>{f.label}</dt>
                  <dd className={pruefen ? "font-medium text-amber-800" : "font-medium"} data-feld={f.key} data-pruefen={pruefen || undefined}>
                    {zeigeWert(f, x.w)}
                    {pruefen ? <span className="ml-1.5 text-xs font-normal">bitte prüfen</span> : null}
                  </dd>
                </div>
              );
            })}
            {!sichtbar.length && k.monat == null ? <p className={`col-span-2 ${DT}`}>Keine Vertragsdaten gefunden. Bitte im Original nachsehen.</p> : null}
          </dl>
          <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--border)] px-5 py-3">
            <a href={href} target="_blank" rel="noreferrer" className="mr-auto inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-[color:var(--brand)] hover:underline" data-original>
              <FileText className="h-4 w-4" /> Original
            </a>
            {readOnly || k.uebernommen ? null : (
              <>
                <Button variant="ghost" icon={Pencil} onClick={() => setBearbeiten(true)} disabled={pending} data-bearbeiten>
                  Bearbeiten
                </Button>
                {k.geprueft ? (
                  bestand ? (
                  <Button icon={Archive} onClick={() => run(() => bestandAction(terminId, k.id), "In den Bestand übernommen")} disabled={pending} data-in-bestand>
                    In Bestand übernehmen
                  </Button>
                  ) : null
                ) : (
                  <Button icon={Check} onClick={() => run(() => geprueftAction(terminId, k.id, true), "Als geprüft markiert")} disabled={pending} data-stimmt>
                    Werte stimmen
                  </Button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </Card>
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

const GRUND: Record<string, string> = {
  sparte_offen: "Welche Sparte ist das?",
  sparte_abweichend: "Die Unterlage passt nicht zur Sparte. Welche ist es?",
  gesperrt: "Diese Sparte wird nicht automatisch ausgelesen.",
  limit: "Nicht automatisch ausgelesen.",
  fehler: "Konnte nicht ausgelesen werden.",
  laeuft: "Wird ausgelesen …",
  neu: "Wird ausgelesen …",
};
const SPERRE: Record<string, string> = {
  einwilligung: "Ohne Zustimmung des Kunden zum Auslesen. Bitte im Original nachsehen.",
  aus: "Automatisches Auslesen ist gerade nicht verfügbar.",
  pause: "Automatisches Auslesen ist gerade nicht verfügbar.",
  kunde: "Automatisches Auslesen ist für Ihr Konto noch nicht freigeschaltet.",
};

function Offen({ terminId, v, href, readOnly }: { terminId: string; v: Vergleich; href: (docId: string) => string; readOnly: boolean }) {
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

  const waehle = (o: OffeneUnterlage, s: AuslesenSparte) =>
    start(async () => {
      const r = await sparteAction(terminId, o.documentId, s);
      if (!r.ok) toast.show({ message: r.error ?? "Fehler", tone: "error" });
      else if (r.status !== "ausgelesen") toast.show({ message: r.status === "sparte_abweichend" ? "Passt nicht zur gewählten Sparte. Bitte im Original nachsehen." : "Nicht ausgelesen. Bitte im Original nachsehen.", tone: "error" });
    });

  return (
    <Card data-nicht-ausgelesen>
      <div className="border-b border-[color:var(--border)] px-5 py-3.5">
        <h2 className="text-[15px] font-semibold tracking-tight">{v.vertraege.length ? "Weitere Unterlagen" : "Unterlagen vom Kunden"}</h2>
      </div>
      <ul className="divide-y divide-[color:var(--border)]">
        {v.offen.map((o) => {
          const text = v.sperre ? SPERRE[v.sperre] : (GRUND[o.status] ?? GRUND.limit);
          const waehlen = !v.sperre && !readOnly && (o.status === "sparte_offen" || o.status === "sparte_abweichend");
          const laedt = !v.sperre && (o.status === "neu" || o.status === "laeuft") && (laeuft || pending);
          return (
            <li key={o.documentId} className="px-5 py-3 text-sm" data-offen={o.status}>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-[color:var(--brand)]" />
                <a href={href(o.documentId)} target="_blank" rel="noreferrer" className="font-medium text-[color:var(--brand)] hover:underline">
                  {o.titel} vom {tag(o.datum)}
                </a>
              </div>
              <p className={`mt-1 flex items-center gap-1.5 pl-6 ${DT}`}>
                {laedt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {text}
              </p>
              {waehlen ? (
                <div className="mt-2 flex flex-wrap gap-1.5 pl-6" data-sparte-waehlen>
                  {v.sparten.map((s) => (
                    <Button key={s} onClick={() => waehle(o, s)} disabled={pending}>
                      {SPARTE_LABEL[s]}
                    </Button>
                  ))}
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
    </Card>
  );
}
