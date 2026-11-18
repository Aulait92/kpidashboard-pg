"use client";

// Editor der Gesprächszusammenfassung (Paket M5, Ole 18.11.2026) im Blatt „Angebot senden“. Wer: Vermittler nach dem
// Termin, oft am Handy. Aufgabe: den vorbefüllten Entwurf prüfen, die Gründe ergänzen und ansehen, bevor er rausgeht
// bzw. abgelegt wird. Zwei Ansichten: Bearbeiten (zwei Felder) und Ansicht (so sieht das PDF aus, mit „PDF öffnen“).
// Senden und Ablegen gibt das Blatt erst frei, wenn die aktuelle Fassung angesehen wurde (zfBereit). „Mit KI
// formulieren“ nur, wenn der Server es erlaubt (EU-KI, keine Gesundheitssparte); das Ergebnis trägt das Kennzeichen
// „Entwurf der KI, bitte prüfen“. „Gründe vorschlagen“ am Feld Rat und Gründe: components/gruende-vorschlag.tsx.

import { useEffect, useState } from "react";
import { Eye, FileText, Loader2, PencilLine, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui";
import { GruendeVorschlag } from "@/components/gruende-vorschlag";
import { beratungsPdfInhalt, hatLuecke, zusammenfassungFehlt, GRUENDE_ERGAENZEN } from "@/lib/mail/beratung";
import type { ZusammenfassungInfo } from "@/lib/zusammenfassung-server";
import { zusammenfassungKiResult, zusammenfassungPdfResult } from "@/app/buyer/angebot-actions";

export type ZfZustand = { wuensche: string; rat: string; ki: boolean; ansicht: boolean; geprueft: boolean };

export const zfStart = (info: ZusammenfassungInfo): ZfZustand => ({ ...info.entwurf, ki: false, ansicht: false, geprueft: false });
/** Senden bzw. Ablegen erlaubt: aktuelle Fassung angesehen und nichts mehr offen. */
export const zfBereit = (z: ZfZustand) => z.geprueft && !zusammenfassungFehlt(z);
/** Hinweis unter dem Hauptknopf, solange er gesperrt ist (ein Satz). */
// Offene Stellen zeigt der Editor selbst an, hier nur das Übrige
export const zfHinweis = (z: ZfZustand): string | null =>
  hatLuecke(z.wuensche) || hatLuecke(z.rat) ? null : (zusammenfassungFehlt(z) ?? (z.geprueft ? null : "Bitte die Zusammenfassung erst ansehen."));

/** Zeilen für ein Feld ohne inneres Scrollen (Handy: etwa 40 Zeichen je Zeile), 4 bis 24. */
const zeilen = (t: string) => Math.min(24, Math.max(4, t.split("\n").reduce((n, z) => n + Math.max(1, Math.ceil(z.length / 40)), 0)));

/** PDF als Blob-Adresse (für „PDF öffnen“, Teilen und Herunterladen); null, solange etwas offen ist. */
export function useZfPdf(appointmentId: string, z: ZfZustand): { name: string; url: string } | null {
  const [pdf, setPdf] = useState<{ key: string; name: string; url: string } | null>(null);
  const key = `${z.wuensche}\u0000${z.rat}`;
  const bereit = z.ansicht && !zusammenfassungFehlt(z);
  useEffect(() => {
    if (!bereit) return;
    let weg = false;
    let url: string | null = null;
    void zusammenfassungPdfResult(appointmentId, { wuensche: z.wuensche, rat: z.rat }).then((r) => {
      if (weg || !r.ok) return;
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      setPdf({ key, name: r.fileName, url });
    });
    return () => {
      weg = true;
      if (url) URL.revokeObjectURL(url);
    };
    // key fasst wuensche und rat zusammen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId, key, bereit]);
  return bereit && pdf?.key === key ? { name: pdf.name, url: pdf.url } : null;
}

const feld =
  "w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 py-2 text-[15px] leading-relaxed focus:border-[color:var(--brand)] focus:outline-none";
const label = "mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]";

export function ZusammenfassungEditor({
  appointmentId,
  info,
  wert,
  onChange,
  onError,
  pdf,
}: {
  appointmentId: string;
  info: ZusammenfassungInfo;
  wert: ZfZustand;
  onChange: (z: ZfZustand) => void;
  onError: (m: string) => void;
  /** aus useZfPdf (vom Blatt, damit auch das Mailprogramm das PDF bekommt) */
  pdf: { name: string; url: string } | null;
}) {
  const [kiLaeuft, setKiLaeuft] = useState(false);
  const [vorschlagDa, setVorschlagDa] = useState(false);
  const aendern = (teil: Partial<Pick<ZfZustand, "wuensche" | "rat">>) => onChange({ ...wert, ...teil, geprueft: false, ansicht: false });

  const mitKi = async () => {
    setKiLaeuft(true);
    try {
      const r = await zusammenfassungKiResult(appointmentId, { wuensche: wert.wuensche, rat: wert.rat });
      if (!r.ok) return onError(r.error);
      onChange({ wuensche: r.wuensche, rat: r.rat, ki: true, ansicht: false, geprueft: false });
    } finally {
      setKiLaeuft(false);
    }
  };

  const kiHinweis = wert.ki ? (
    <p className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900" data-zf-ki-entwurf>
      <Sparkles className="h-3.5 w-3.5 shrink-0" /> Entwurf der KI, bitte prüfen
    </p>
  ) : null;

  if (wert.ansicht) {
    const p = beratungsPdfInhalt({ an: info.an, kunde: info.kopf.kunde, produkt: info.kopf.produkt, berater: info.kopf.berater, wuensche: wert.wuensche, rat: wert.rat });
    return (
      <div className="space-y-2" data-zf-ansicht>
        {kiHinweis}
        <div className="rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-4 py-3 text-sm shadow-[var(--shadow-sm)]">
          <p className="text-base font-semibold">{p.titel}</p>
          <p className="mb-3 text-xs text-[color:var(--muted)]">{p.kopf.join(" · ")}</p>
          {p.bloecke.map((b) => (
            <div key={b.ueberschrift} className="mb-3">
              <p className="font-semibold">{b.ueberschrift}</p>
              <p className="whitespace-pre-line">{b.text}</p>
            </div>
          ))}
          <p className="text-xs text-[color:var(--muted)]">{p.fuss}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button type="button" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-[color:var(--brand)]" onClick={() => onChange({ ...wert, ansicht: false })} data-zf-bearbeiten>
            <PencilLine className="h-4 w-4" /> Bearbeiten
          </button>
          {pdf ? (
            <a href={pdf.url} target="_blank" rel="noopener" download={pdf.name} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-[color:var(--brand)]" data-zf-pdf>
              <FileText className="h-4 w-4" /> PDF öffnen
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  const luecke = hatLuecke(wert.wuensche) || hatLuecke(wert.rat);
  return (
    <div className="space-y-3" data-zf-editor>
      {kiHinweis}
      <label className="block">
        <span className={label}>Wünsche und Bedürfnisse</span>
        <textarea value={wert.wuensche} onChange={(e) => aendern({ wuensche: e.target.value })} rows={zeilen(wert.wuensche)} className={feld} data-zf-wuensche />
      </label>
      <label className="block">
        <span className={label}>Rat und Gründe</span>
        <textarea value={wert.rat} onChange={(e) => aendern({ rat: e.target.value })} rows={zeilen(wert.rat)} className={feld} data-zf-rat />
      </label>
      {luecke && !vorschlagDa ? (
        <p className="flex items-center gap-1.5 text-xs text-amber-800" data-zf-luecke>
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" /> Gründe für Ihren Rat statt {GRUENDE_ERGAENZEN} eintragen.
        </p>
      ) : null}
      {info.vorschlag ? (
        <GruendeVorschlag
          appointmentId={appointmentId}
          info={info.vorschlag}
          wuensche={wert.wuensche}
          feld={wert.rat}
          titel="Gründe"
          onUebernehmen={(rat) => onChange({ ...wert, rat, ki: true, geprueft: false, ansicht: false })}
          onError={onError}
          onSichtbar={setVorschlagDa}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="md" icon={Eye} onClick={() => onChange({ ...wert, ansicht: true, geprueft: true })} data-zf-ansehen>
          Ansehen
        </Button>
        {info.ki ? (
          <Button variant="ghost" size="md" icon={kiLaeuft ? Loader2 : Sparkles} disabled={kiLaeuft} onClick={() => void mitKi()} data-zf-ki>
            {kiLaeuft ? "Formuliert …" : "Mit KI formulieren"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
