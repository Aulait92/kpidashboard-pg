"use client";

// Nutzungsanalyse (lib/nutzungsanalyse.ts, Rechtsprüfung docs/rechtstexte/sitzungsaufnahme-2026-11-17.md):
// einmalige Frage im Vermittlerbereich. Erst nach „Ja“ lädt Sentry die Replay-Integration (vorher gar nicht),
// nimmt bei einem Teil der Sitzungen auf, nur unter /buyer, alles maskiert, ohne Konsolenausgaben.
// Widerruf: Schalter unter Einstellungen (AnalyseSchalter), stoppt sofort, auch in anderen Tabs.

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { setAnalyseEinwilligungAction } from "@/app/buyer/actions";
import { ANALYSE_ANTEIL, ANALYSE_TEXT, type AnalyseStatus } from "@/lib/nutzungsanalyse";
import { isReplayAllowedPath, redactDeep } from "@/lib/sentry-redact";

const KEY = "pg-analyse-sitzung";
const WIDERRUF = "pg-analyse-widerruf";
const SPAETER = "pg-analyse-spaeter";

type RecordingEvent = { data?: { tag?: string; payload?: { category?: string } } };

/** Replay-Integration nach Einwilligung laden (einmal). */
function integrationLaden() {
  if (Sentry.getReplay()) return;
  Sentry.addIntegration(
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
      // Kennungen und geheime Segmente aus Adressen entfernen, Konsolenausgaben nicht aufnehmen
      beforeAddRecordingEvent: (event) => {
        const e = event as unknown as RecordingEvent;
        if (e.data?.tag === "breadcrumb" && e.data.payload?.category === "console") return null;
        return redactDeep(event);
      },
    }),
  );
}

/** Aufnahme für diese Sitzung starten (Anteil per Zufall, je Tab einmal entschieden). */
function aufnahmeStarten(pseudonym: string | null) {
  if (!isReplayAllowedPath(window.location.pathname)) return;
  try {
    if (window.localStorage.getItem(WIDERRUF) === "1") return;
    let wahl = window.sessionStorage.getItem(KEY);
    if (!wahl) {
      wahl = Math.random() < ANALYSE_ANTEIL ? "ja" : "nein";
      window.sessionStorage.setItem(KEY, wahl);
    }
    integrationLaden();
    if (pseudonym) Sentry.setTag("nutzer", pseudonym);
    const r = Sentry.getReplay();
    if (!r || wahl !== "ja") return; // ohne Auswahl nur Fehler-Puffer (replaysOnErrorSampleRate)
    if (r.getRecordingMode() === "buffer") void r.flush();
    else r.start();
  } catch {
    /* läuft bereits bzw. kein Speicher */
  }
}

function aufnahmeStoppen() {
  try {
    window.sessionStorage.setItem(KEY, "nein");
    window.localStorage.setItem(WIDERRUF, "1");
  } catch {}
  void Sentry.getReplay()?.stop();
}

/** Im Layout: startet die Aufnahme bei Einwilligung bzw. zeigt einmal die Frage. */
export function Nutzungsanalyse({ status, darfFragen, pseudonym }: { status: AnalyseStatus; darfFragen: boolean; pseudonym: string | null }) {
  const [s, setS] = useState(status);
  const [pending, start] = useTransition();
  const toast = useToast();
  useEffect(() => {
    if (s === "ja") {
      try {
        window.localStorage.removeItem(WIDERRUF);
      } catch {}
      aufnahmeStarten(pseudonym);
    }
    // Widerruf in einem anderen Tab: hier sofort stoppen
    const onStorage = (e: StorageEvent) => {
      if (e.key === WIDERRUF && e.newValue === "1") void Sentry.getReplay()?.stop();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [s, pseudonym]);
  // Erst nach einem Erfolgsmoment fragen (Termin gebucht, Abschluss), wenn die Bestätigung schon zu sehen war;
  // ohne Entscheidung geschlossen: frühestens nach 7 Tagen wieder (Rechtsprüfung Abschnitt 7)
  const [zeigen, setZeigen] = useState(false);
  useEffect(() => {
    if (s !== null || !darfFragen) return;
    try {
      const zu = Number(window.localStorage.getItem(SPAETER) ?? 0);
      if (zu && Date.now() - zu < 7 * 24 * 60 * 60 * 1000) return;
    } catch {}
    let t: ReturnType<typeof setTimeout> | null = null;
    const onErfolg = () => {
      if (t) return;
      t = setTimeout(() => setZeigen(true), 2500);
    };
    window.addEventListener("pg:erfolg", onErfolg);
    return () => {
      window.removeEventListener("pg:erfolg", onErfolg);
      if (t) clearTimeout(t);
    };
  }, [s, darfFragen]);
  if (s !== null || !darfFragen || !zeigen) return null;
  const spaeter = () => {
    try {
      window.localStorage.setItem(SPAETER, String(Date.now()));
    } catch {}
    setZeigen(false);
  };
  const antwort = (ja: boolean) =>
    start(async () => {
      setS(ja ? "ja" : "nein");
      await setAnalyseEinwilligungAction(ja);
      if (ja) toast.show({ message: ANALYSE_TEXT.danke });
    });
  return (
    <div className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 shadow-[var(--shadow-lg)] md:bottom-5 md:left-auto md:right-5 md:mx-0" role="region" aria-labelledby="analyse-titel" data-nutzungsanalyse>
      <button type="button" onClick={spaeter} aria-label="Später entscheiden" className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken)]" data-analyse-spaeter>
        <X className="h-4 w-4" />
      </button>
      <p id="analyse-titel" className="pr-8 text-[15px] font-semibold">
        {ANALYSE_TEXT.titel}
      </p>
      <p className="mt-1 text-sm text-[color:var(--muted)]">{ANALYSE_TEXT.text}</p>
      <p className="mt-1.5 text-xs text-[color:var(--muted)]">{ANALYSE_TEXT.unterzeile}</p>
      <Link href={ANALYSE_TEXT.link} target="_blank" className="mt-1 inline-flex min-h-9 items-center text-sm font-medium text-[color:var(--brand)] underline">
        {ANALYSE_TEXT.mehr}
      </Link>
      {/* Beide Knöpfe gleich gestaltet (Rechtsprüfung: kein hervorgehobenes Ja) */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button variant="secondary" size="md" disabled={pending} onClick={() => antwort(true)} data-analyse-ja>
          {ANALYSE_TEXT.ja}
        </Button>
        <Button variant="secondary" size="md" disabled={pending} onClick={() => antwort(false)} data-analyse-nein>
          {ANALYSE_TEXT.nein}
        </Button>
      </div>
    </div>
  );
}

/** Schalter unter Einstellungen (Widerruf bzw. nachträgliche Zustimmung). */
export function AnalyseSchalter({ status, pseudonym }: { status: AnalyseStatus; pseudonym: string | null }) {
  const [an, setAn] = useState(status === "ja");
  const [pending, start] = useTransition();
  const umschalten = () =>
    start(async () => {
      const neu = !an;
      setAn(neu);
      if (neu) {
        try {
          window.localStorage.removeItem(WIDERRUF);
        } catch {}
        aufnahmeStarten(pseudonym);
      } else aufnahmeStoppen();
      await setAnalyseEinwilligungAction(neu);
    });
  return (
    <div className="flex items-center gap-3 px-4 py-3.5" data-analyse-schalter>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium">{ANALYSE_TEXT.schalter}</p>
        <p className="text-sm text-[color:var(--muted)]">
          {ANALYSE_TEXT.schalterHinweis}{" "}
          <Link href={ANALYSE_TEXT.link} target="_blank" className="text-[color:var(--brand)] underline">
            {ANALYSE_TEXT.mehr}
          </Link>
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={an}
        aria-label={ANALYSE_TEXT.schalter}
        disabled={pending}
        onClick={umschalten}
        className={`relative h-[26px] w-[46px] shrink-0 rounded-full transition ${an ? "bg-[color:var(--brand)]" : "bg-slate-300"}`}
      >
        <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all ${an ? "left-[23px]" : "left-[3px]"}`} />
      </button>
    </div>
  );
}
