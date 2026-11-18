"use client";

// Blatt „Beratungsdokumentation erstellen“ (Paket B, Ole 18.11.2026). Wer: Vermittler nach dem Termin, oft am Handy.
// Aufgabe: die vorbefüllte Dokumentation prüfen, ergänzen und dem Kunden in Textform schicken (Erhalt per Klick).
// Ort: Terminkarte am Kontakt (lib/termin-karte.ts), nur bei eingeschaltetem Schalter. Zwei Ansichten mit je einer
// Hauptaktion unten im Blatt: Bearbeiten → „Ansehen“, Ansicht → „Senden“ (ohne Versandweg: „Ablegen“). Stellen mit
// „[bitte ergänzen]“ sind markiert und beim Antippen markiert, damit Tippen sie ersetzt.

import { useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, Eye, FileText, Loader2, PencilLine, Send, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { BD_ABSCHNITTE, BD_PFLICHT, BD_TITEL, BD_VERANTWORTUNG, bdFehlt, bdPdfInhalt, type BdAbschnitt, type BdInhalt } from "@/lib/beratungsdoku";
import { GRUENDE_ERGAENZEN, hatLuecke } from "@/lib/mail/beratung";
import type { BdInfo } from "@/lib/beratungsdoku-server";
import { beratungsdokuAblegenResult, beratungsdokuInfoResult, beratungsdokuPdfResult, beratungsdokuSendenResult } from "@/app/buyer/beratungsdoku-actions";

export type BeratungsdokuZiel = { appointmentId: string; name: string };

const kurz = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const zeilen = (t: string) => Math.min(16, Math.max(3, t.split("\n").reduce((n, z) => n + Math.max(1, Math.ceil(z.length / 40)), 0)));
const feld =
  "w-full rounded-[var(--radius-sm)] border bg-white px-3 py-2 text-[15px] leading-relaxed focus:border-[color:var(--brand)] focus:outline-none";
const HINWEISE_PLATZHALTER = "Optional, z. B. offene Punkte oder worauf Ihr Kunde bewusst verzichtet";

type Props = { ziel: BeratungsdokuZiel | null; onClose: () => void; onDone: (message: string) => void; onError: (message: string) => void };

export function BeratungsdokuSheet(p: Props) {
  return p.ziel ? <Blatt key={p.ziel.appointmentId} {...p} ziel={p.ziel} /> : null;
}

/** Stand der letzten Fassung in einem Satz. */
export function bdStandText(l: BdInfo["letzte"]): string | null {
  if (!l) return null;
  if (l.status === "bestaetigt" && l.bestaetigtAt) return `Erhalt bestätigt am ${kurz(l.bestaetigtAt)} Uhr`;
  if (l.status === "gesendet" && l.gesendetAt) return `Gesendet am ${kurz(l.gesendetAt)} Uhr, Bestätigung steht aus`;
  if (l.status === "abgelegt") return "Abgelegt unter Dokumente, nicht gesendet";
  return null;
}

function usePdf(appointmentId: string, inhalt: BdInhalt, aktiv: boolean) {
  const [pdf, setPdf] = useState<{ key: string; name: string; url: string } | null>(null);
  const key = BD_ABSCHNITTE.map((k) => inhalt[k]).join("\u0000");
  useEffect(() => {
    if (!aktiv) return;
    let weg = false;
    let url: string | null = null;
    void beratungsdokuPdfResult(appointmentId, inhalt).then((r) => {
      if (weg || !r.ok) return;
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      setPdf({ key, name: r.fileName, url });
    });
    return () => {
      weg = true;
      if (url) URL.revokeObjectURL(url);
    };
    // key fasst den Inhalt zusammen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId, key, aktiv]);
  return aktiv && pdf?.key === key ? pdf : null;
}

function Blatt({ ziel, onClose, onDone, onError }: Props & { ziel: BeratungsdokuZiel }) {
  const id = ziel.appointmentId;
  const [info, setInfo] = useState<BdInfo | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [inhalt, setInhalt] = useState<BdInhalt | null>(null);
  const [ansicht, setAnsicht] = useState(false);
  const [busy, start] = useTransition();
  const leer: BdInhalt = { wuensche: "", beratung: "", empfehlung: "", entscheidung: "", hinweise: "" };
  const pdf = usePdf(id, inhalt ?? leer, ansicht && !!inhalt && !bdFehlt(inhalt));

  useEffect(() => {
    let weg = false;
    void beratungsdokuInfoResult(id).then((r) => {
      if (weg) return;
      if (!r.ok) return setFehler(r.error);
      setInfo(r.info);
      setInhalt(r.info.letzte?.inhalt ?? r.info.entwurf);
    });
    return () => {
      weg = true;
    };
  }, [id]);

  const fehlt = inhalt ? bdFehlt(inhalt) : null;
  const ausfuehren = (was: "senden" | "ablegen") =>
    start(async () => {
      if (!inhalt) return;
      const r = was === "senden" ? await beratungsdokuSendenResult(id, inhalt) : await beratungsdokuAblegenResult(id, inhalt);
      if (!r.ok) return onError(r.error);
      onDone(`${ziel.name}: ${r.message}`);
      onClose();
    });

  const stand = info ? bdStandText(info.letzte) : null;
  const senden = !!info?.appVersand;

  const fuss = !info || !inhalt ? undefined : (
    <div className="shrink-0 space-y-1.5 border-t border-[color:var(--border)] px-5 py-3">
      {ansicht ? (
        <>
          <Button
            variant="primary"
            icon={busy ? Loader2 : senden ? Send : FileText}
            className="h-11 w-full text-[15px]"
            disabled={busy || !!fehlt}
            onClick={() => ausfuehren(senden ? "senden" : "ablegen")}
            data-bd-haupt={senden ? "senden" : "ablegen"}
          >
            {busy ? "Einen Moment …" : senden ? "Senden" : "Ablegen"}
          </Button>
          <p className="text-center text-xs text-[color:var(--muted)]" data-bd-weg>
            {senden ? `Als PDF an ${info.email}, mit Link zur Bestätigung` : info.ohneVersand}
          </p>
          {senden ? (
            <button
              type="button"
              className="inline-flex min-h-10 w-full items-center justify-center text-sm font-medium text-[color:var(--muted)] hover:text-[color:var(--foreground)] disabled:opacity-50"
              disabled={busy || !!fehlt}
              onClick={() => ausfuehren("ablegen")}
              data-bd-nur-ablegen
            >
              Nur ablegen, nicht senden
            </button>
          ) : null}
        </>
      ) : (
        <>
          <Button variant="primary" icon={Eye} className="h-11 w-full text-[15px]" disabled={!!fehlt} onClick={() => setAnsicht(true)} data-bd-ansehen>
            Ansehen
          </Button>
          {fehlt ? (
            <p className="text-center text-xs text-amber-800" data-bd-fehlt>
              {fehlt}
            </p>
          ) : null}
        </>
      )}
    </div>
  );

  return (
    <Sheet open onClose={onClose} title={`Beratungsdokumentation: ${ziel.name}`} message={BD_VERANTWORTUNG} footer={fuss}>
      {!info || !inhalt ? (
        <div className="flex items-center gap-2 px-5 py-6 text-sm text-[color:var(--muted)]">
          {fehler ? (
            <>
              <TriangleAlert className="h-4 w-4 text-amber-600" /> {fehler}
            </>
          ) : (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Lädt …
            </>
          )}
        </div>
      ) : (
        <div data-bd-blatt={ansicht ? "ansicht" : "bearbeiten"}>
          {stand ? (
            <p
              className={cn(
                "flex items-center gap-2 border-b border-[color:var(--border)] px-5 py-2.5 text-sm font-medium",
                info.letzte?.status === "bestaetigt" ? "bg-emerald-50 text-emerald-800" : "bg-[color:var(--surface-sunken)] text-[color:var(--foreground)]",
              )}
              data-bd-stand={info.letzte?.status}
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" /> {stand}
            </p>
          ) : null}
          {ansicht ? <Ansicht info={info} inhalt={inhalt} pdf={pdf} onBearbeiten={() => setAnsicht(false)} /> : <Bearbeiten inhalt={inhalt} onChange={setInhalt} />}
        </div>
      )}
    </Sheet>
  );
}

function Bearbeiten({ inhalt, onChange }: { inhalt: BdInhalt; onChange: (i: BdInhalt) => void }) {
  const refs = useRef<Partial<Record<BdAbschnitt, HTMLTextAreaElement | null>>>({});
  // Antippen einer Stelle zum Ergänzen markiert sie, Tippen ersetzt sie
  const markieren = (k: BdAbschnitt) => {
    const el = refs.current[k];
    const i = el?.value.indexOf(GRUENDE_ERGAENZEN) ?? -1;
    if (el && i >= 0) window.setTimeout(() => el.setSelectionRange(i, i + GRUENDE_ERGAENZEN.length), 0);
  };
  return (
    <div className="space-y-4 px-5 py-4" data-bd-editor>
      {BD_ABSCHNITTE.map((k) => {
        const luecke = hatLuecke(inhalt[k]);
        return (
          <label key={k} className="block">
            <span className="mb-1 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">
              {BD_TITEL[k]}
              {BD_PFLICHT.includes(k) ? null : <span className="font-normal normal-case tracking-normal">optional</span>}
            </span>
            <textarea
              ref={(el) => {
                refs.current[k] = el;
              }}
              value={inhalt[k]}
              onChange={(e) => onChange({ ...inhalt, [k]: e.target.value })}
              onFocus={() => markieren(k)}
              rows={zeilen(inhalt[k])}
              placeholder={k === "hinweise" ? HINWEISE_PLATZHALTER : undefined}
              className={cn(feld, luecke ? "border-amber-400 bg-amber-50/40" : "border-[color:var(--border)]")}
              data-bd-feld={k}
            />
            {luecke ? (
              <span className="mt-1 flex items-center gap-1.5 text-xs text-amber-800">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" /> {GRUENDE_ERGAENZEN} durch Ihren Text ersetzen
              </span>
            ) : null}
          </label>
        );
      })}
    </div>
  );
}

function Ansicht({ info, inhalt, pdf, onBearbeiten }: { info: BdInfo; inhalt: BdInhalt; pdf: { name: string; url: string } | null; onBearbeiten: () => void }) {
  const p = bdPdfInhalt({ an: info.an, kunde: info.kopf.kunde, produkt: info.kopf.produkt, berater: info.kopf.berater, termin: new Date(info.kopf.termin), inhalt, now: new Date() });
  return (
    <div className="space-y-2 px-5 py-4" data-bd-ansicht>
      <div className="rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-4 py-3 text-sm shadow-[var(--shadow-sm)]">
        <p className="text-base font-semibold">{p.titel}</p>
        <p className="mb-3 text-xs text-[color:var(--muted)]">{p.kopf.join(" · ")}</p>
        {p.bloecke.map((b) => (
          <div key={b.ueberschrift} className="mb-3">
            <p className="font-semibold">{b.ueberschrift}</p>
            <p className="whitespace-pre-line">{b.text}</p>
          </div>
        ))}
        <p className="whitespace-pre-line text-xs text-[color:var(--muted)]">{p.fuss}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <button type="button" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-[color:var(--brand)]" onClick={onBearbeiten} data-bd-bearbeiten>
          <PencilLine className="h-4 w-4" /> Bearbeiten
        </button>
        {pdf ? (
          <a href={pdf.url} target="_blank" rel="noopener" download={pdf.name} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-[color:var(--brand)]" data-bd-pdf>
            <FileText className="h-4 w-4" /> PDF öffnen
          </a>
        ) : null}
      </div>
    </div>
  );
}
