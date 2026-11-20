"use client";

import { useState, useTransition } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { passwortJetztAction } from "./actions";

/**
 * „Passwort jetzt festlegen“ nach der Annahme (Ole, 20.11.2026): direkt in die Einrichtung, ohne auf die Mail zu warten
 * (Firmenpostfächer halten Einladungen manchmal zurück). Nur im Browser der Annahme sichtbar (lib/annahme-direktzugang.ts).
 */
export function PasswortJetzt({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [angemeldet, setAngemeldet] = useState(false);
  if (angemeldet) {
    return (
      <a href="/login" className="mt-4 inline-flex h-11 items-center justify-center rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-[15px] font-semibold text-white hover:bg-[color:var(--brand-dark)]">
        Zur Anmeldung
      </a>
    );
  }
  return (
    <div className="mt-4" data-passwort-jetzt>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await passwortJetztAction(token);
            if (res.url) window.location.href = res.url;
            else if (res.angemeldet) setAngemeldet(true);
            else setError(res.error ?? "Das hat gerade nicht geklappt. Bitte nutzen Sie den Link aus der E-Mail.");
          })
        }
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-[15px] font-semibold text-white shadow-[var(--shadow-sm)] hover:bg-[color:var(--brand-dark)] disabled:opacity-60 sm:w-auto"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        Passwort jetzt festlegen
      </button>
      {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
