"use client";

// „Gründe vorschlagen“ (Ole, 18.11.2026: „Kann die KI Rat und Gründe auch ausfüllen oder zumindest per Klick?“).
// Wer: Vermittler nach dem Termin, oft am Handy, im Feld „Rat und Gründe“ (Gesprächszusammenfassung) bzw. „Empfehlung
// mit Begründung“ (Beratungsdokumentation). Aufgabe: die Gründe nicht selbst tippen müssen. Der Rat (gewählte Tarife)
// steht schon ohne KI im Feld. Ist das Feld frisch (Zeile „Gründe: [bitte ergänzen]“), holt das Blatt den Vorschlag
// von selbst; er steht gelb markiert unter dem Feld und kommt erst mit „Übernehmen“ ins Feld (dort änderbar),
// gespeichert wird mit dem normalen Senden bzw. Ablegen. Ohne Tarif bzw. Bedarf: Knopf aus, ein Satz, was fehlt.

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui";
import { gruendeEinsetzen, gruendeOffen, gruendePlatzhalter, vorschlagGrund, type VorschlagInfo } from "@/lib/mail/beratung";
import { gruendeVorschlagResult } from "@/app/buyer/beratungsdoku-actions";

// Je Termin und Feld: Vorschlag merken (Wechsel Ansehen/Bearbeiten lädt nicht neu) und nur einmal von selbst holen
const gemerkt = new Map<string, string>();
const vonSelbst = new Set<string>();

export function GruendeVorschlag({
  appointmentId,
  info,
  wuensche,
  feld,
  titel,
  onUebernehmen,
  onError,
  onSichtbar,
}: {
  appointmentId: string;
  info: NonNullable<VorschlagInfo>;
  /** aktueller Text „Wünsche und Bedürfnisse“ (Quelle für den Vorschlag) */
  wuensche: string;
  /** aktueller Text des Feldes mit Rat und Gründen */
  feld: string;
  titel: "Gründe" | "Begründung";
  onUebernehmen: (neu: string) => void;
  onError: (m: string) => void;
  /** Steht gerade ein Vorschlag da? (das Feld blendet dann seinen Hinweis „[bitte ergänzen] ersetzen“ aus) */
  onSichtbar?: (da: boolean) => void;
}) {
  const key = `${appointmentId}:${titel}`;
  const [vorschlag, setVorschlag] = useState<string | null>(() => gemerkt.get(key) ?? null);
  const grund = vorschlagGrund(info, wuensche);
  // Frischer Entwurf (Zeile „Gründe: [bitte ergänzen]“): beim Öffnen von selbst holen, einmal je Termin und Feld
  const [auto] = useState(() => !grund && !gemerkt.has(key) && !vonSelbst.has(key) && gruendePlatzhalter(feld));
  const [laeuft, setLaeuft] = useState(auto);
  useEffect(() => onSichtbar?.(!!vorschlag), [vorschlag, onSichtbar]);

  const fertig = useCallback(
    (r: Awaited<ReturnType<typeof gruendeVorschlagResult>>, vonAllein: boolean) => {
      setLaeuft(false);
      // Von selbst geholt: kein Fehlerhinweis, der Knopf bleibt zum erneuten Versuch
      if (!r.ok) return vonAllein ? undefined : onError(r.error);
      gemerkt.set(key, r.gruende);
      setVorschlag(r.gruende);
    },
    [key, onError],
  );

  const erstellen = () => {
    setLaeuft(true);
    void gruendeVorschlagResult(appointmentId, wuensche)
      .then((r) => fertig(r, false))
      .catch(() => fertig({ ok: false, error: "Der Vorschlag hat nicht geklappt. Bitte erneut versuchen." }, false));
  };

  useEffect(() => {
    if (!auto || vonSelbst.has(key)) return;
    vonSelbst.add(key);
    void gruendeVorschlagResult(appointmentId, wuensche)
      .then((r) => fertig(r, true))
      .catch(() => setLaeuft(false));
    // nur beim Öffnen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const weg = () => {
    gemerkt.delete(key);
    setVorschlag(null);
  };

  if (vorschlag) {
    return (
      <div className="rounded-[var(--radius-sm)] border border-amber-300 bg-amber-50 px-3 py-2.5" data-gruende-vorschlag>
        <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
          <Sparkles className="h-3.5 w-3.5 shrink-0" /> Vorschlag für die {titel}, bitte prüfen
        </p>
        <p className="mt-1.5 whitespace-pre-line text-[15px] leading-relaxed">{vorschlag}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button
            variant="secondary"
            size="md"
            icon={Check}
            onClick={() => {
              onUebernehmen(gruendeEinsetzen(feld, vorschlag, titel));
              weg();
            }}
            data-gruende-uebernehmen
          >
            Übernehmen
          </Button>
          <button
            type="button"
            className="inline-flex min-h-10 items-center text-sm font-medium text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
            onClick={weg}
            data-gruende-verwerfen
          >
            Verwerfen
          </button>
        </div>
      </div>
    );
  }

  // Gründe stehen schon da: nichts anbieten
  if (!gruendeOffen(feld)) return null;
  return (
    <div data-gruende-knopf>
      <Button
        variant="secondary"
        size="md"
        icon={laeuft ? Loader2 : Sparkles}
        disabled={!!grund || laeuft}
        onClick={erstellen}
        data-gruende-erstellen
      >
        {laeuft ? "Schlägt vor …" : `${titel} vorschlagen`}
      </Button>
      {grund ? (
        <p className="mt-1 text-xs text-[color:var(--muted)]" data-gruende-grund>
          {grund}
        </p>
      ) : null}
    </div>
  );
}
