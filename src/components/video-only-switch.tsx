"use client";

import { useState, useTransition } from "react";
import { setVideoOnlyAction } from "@/app/buyer/kalender/actions";

/** Schalter „Nur Videotermine“ (Ole, 17.11.2026): Der Assistent bietet Leads nur Videotermine an. */
export function VideoOnlySwitch({ initial, readOnly }: { initial: boolean; readOnly: boolean }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mb-5 border-b border-[color:var(--border)] pb-5" data-video-only>
      <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0 accent-[color:var(--brand)]"
          checked={on}
          disabled={readOnly || pending}
          onChange={(e) => {
            const next = e.target.checked;
            setOn(next);
            setError(null);
            start(async () => {
              const r = await setVideoOnlyAction(next);
              if (!r.ok) {
                setOn(!next);
                setError(r.error ?? "Hat nicht geklappt.");
              }
            });
          }}
        />
        <span>
          <span className="block font-medium">Nur Videotermine</span>
          <span className="block text-[color:var(--muted)]">Telefon nur, wenn der Lead kein Video möchte.</span>
        </span>
      </label>
      {error ? <p className="mt-2 font-medium text-rose-700">{error}</p> : null}
    </div>
  );
}
