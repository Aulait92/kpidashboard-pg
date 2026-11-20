"use client";

import { useState, useTransition } from "react";
import { einladungslinkAction } from "@/app/admin/vertrieb/onboarding-actions";

/**
 * Admin, Onboarding-Karte (Ole, 20.11.2026): frischen Einladungslink erzeugen und in die Zwischenablage kopieren, z. B.
 * zum Senden per WhatsApp, wenn die Mail in der Quarantäne hängt. Klappt das Kopieren nicht (Browser), steht der Link
 * zum Markieren da.
 */
export function EinladungslinkKopieren({ onboardingId }: { onboardingId: string }) {
  const [pending, start] = useTransition();
  const [stand, setStand] = useState<{ ok: boolean; text: string; url?: string } | null>(null);
  return (
    <div className="contents">
      <button
        type="button"
        className="btn-ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setStand(null);
            const res = await einladungslinkAction(onboardingId);
            if (!res.url) return setStand({ ok: false, text: res.error ?? "Link konnte nicht erzeugt werden." });
            try {
              await navigator.clipboard.writeText(res.url);
              setStand({ ok: true, text: `Link für ${res.email} kopiert.` });
            } catch {
              setStand({ ok: true, text: `Link für ${res.email}:`, url: res.url });
            }
          })
        }
      >
        {pending ? "Erzeuge Link …" : "Einladungslink kopieren"}
      </button>
      {stand ? (
        <p className={`w-full text-xs ${stand.ok ? "text-emerald-700" : "text-rose-700"}`} role="status">
          {stand.text}
          {stand.url ? <input readOnly value={stand.url} onFocus={(e) => e.currentTarget.select()} className="input mt-1 w-full text-xs" /> : null}
        </p>
      ) : null}
    </div>
  );
}
