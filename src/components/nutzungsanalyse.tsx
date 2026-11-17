"use client";

// Nutzungsanalyse (lib/nutzungsanalyse.ts): einmalige Frage im Vermittlerbereich, danach Aufnahme per Sentry Session
// Replay (maskiert) bei einem Teil der Sitzungen. Ohne „Ja“ wird nichts aufgenommen (nur wie bisher bei Fehlern).
// Widerruf: Schalter unter Einstellungen (AnalyseSchalter), stoppt sofort.

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui";
import { setAnalyseEinwilligungAction } from "@/app/buyer/actions";
import { ANALYSE_ANTEIL, ANALYSE_TEXT, type AnalyseStatus } from "@/lib/nutzungsanalyse";

const KEY = "pg-analyse-sitzung";

/** Aufnahme für diese Sitzung starten (Anteil per Zufall, je Tab einmal entschieden). */
function aufnahmeStarten() {
  try {
    let wahl = window.sessionStorage.getItem(KEY);
    if (!wahl) {
      wahl = Math.random() < ANALYSE_ANTEIL ? "ja" : "nein";
      window.sessionStorage.setItem(KEY, wahl);
    }
    if (wahl !== "ja") return;
  } catch {
    return;
  }
  const r = Sentry.getReplay();
  if (!r) return;
  try {
    // Läuft schon im Fehler-Puffer: in eine volle Aufnahme umschalten, sonst starten
    if (r.getRecordingMode() === "buffer") void r.flush();
    else r.start();
  } catch {
    /* läuft bereits */
  }
}

function aufnahmeStoppen() {
  try {
    window.sessionStorage.setItem(KEY, "nein");
  } catch {}
  void Sentry.getReplay()?.stop();
}

/** Im Layout: startet die Aufnahme bei Einwilligung bzw. zeigt einmal die Frage. */
export function Nutzungsanalyse({ status, darfFragen }: { status: AnalyseStatus; darfFragen: boolean }) {
  const [s, setS] = useState(status);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (s === "ja") aufnahmeStarten();
  }, [s]);
  if (s !== null || !darfFragen) return null;
  const antwort = (ja: boolean) =>
    start(async () => {
      setS(ja ? "ja" : "nein");
      await setAnalyseEinwilligungAction(ja);
    });
  return (
    <div className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 shadow-[var(--shadow-lg)] md:bottom-5 md:left-auto md:right-5 md:mx-0" role="dialog" aria-labelledby="analyse-titel" data-nutzungsanalyse>
      <p id="analyse-titel" className="text-[15px] font-semibold">
        {ANALYSE_TEXT.titel}
      </p>
      <p className="mt-1 text-sm text-[color:var(--muted)]">
        {ANALYSE_TEXT.text}{" "}
        <Link href={ANALYSE_TEXT.link} target="_blank" className="font-medium text-[color:var(--brand)] underline">
          {ANALYSE_TEXT.mehr}
        </Link>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" size="md" disabled={pending} onClick={() => antwort(false)} data-analyse-nein>
          {ANALYSE_TEXT.nein}
        </Button>
        <Button variant="primary" size="md" disabled={pending} onClick={() => antwort(true)} data-analyse-ja>
          {ANALYSE_TEXT.ja}
        </Button>
      </div>
    </div>
  );
}

/** Schalter unter Einstellungen (Widerruf bzw. nachträgliche Zustimmung). */
export function AnalyseSchalter({ status }: { status: AnalyseStatus }) {
  const [an, setAn] = useState(status === "ja");
  const [pending, start] = useTransition();
  const umschalten = () =>
    start(async () => {
      const neu = !an;
      setAn(neu);
      if (neu) aufnahmeStarten();
      else aufnahmeStoppen();
      await setAnalyseEinwilligungAction(neu);
    });
  return (
    <div className="flex items-center gap-3 px-4 py-3.5" data-analyse-schalter>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium">App verbessern helfen</p>
        <p className="text-sm text-[color:var(--muted)]">
          Wir sehen, wo Sie klicken und wo es hakt, nie Ihre Kunden oder Eingaben.{" "}
          <Link href={ANALYSE_TEXT.link} target="_blank" className="text-[color:var(--brand)] underline">
            {ANALYSE_TEXT.mehr}
          </Link>
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={an}
        aria-label="App verbessern helfen"
        disabled={pending}
        onClick={umschalten}
        className={`relative h-[26px] w-[46px] shrink-0 rounded-full transition ${an ? "bg-[color:var(--brand)]" : "bg-slate-300"}`}
      >
        <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all ${an ? "left-[23px]" : "left-[3px]"}`} />
      </button>
    </div>
  );
}
