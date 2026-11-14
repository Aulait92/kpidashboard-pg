"use client";

import { useActionState } from "react";
import { redraftFollowupNowAction, sendFollowupNowAction } from "@/app/admin/vertrieb/followup-actions";

/** „Jetzt senden“ mit Rückfrage und Ergebnis (sendet sofort, auch außerhalb 8–17 Uhr) */
export function FollowupSendNow({ id, step }: { id: string; step: number }) {
  const [state, action, pending] = useActionState(sendFollowupNowAction, null);
  return (
    <form action={action} className="inline-flex flex-col gap-1">
      <input type="hidden" name="id" value={id} />
      <button
        className="btn-primary"
        disabled={pending}
        onClick={(e) => {
          if (!window.confirm(`Mail ${step + 1} jetzt als Antwort im Instantly-Thread senden?`)) e.preventDefault();
        }}
      >
        {pending ? "Sende …" : `Jetzt senden (Mail ${step + 1})`}
      </button>
      {state ? <span className={`text-xs ${state.ok ? "text-emerald-700" : "text-rose-600"}`}>{state.message}</span> : null}
    </form>
  );
}

/** „Texte neu schreiben“ mit Ladeanzeige und Ergebnis */
export function FollowupRedraft({ id }: { id: string }) {
  const [state, action, pending] = useActionState(redraftFollowupNowAction, null);
  return (
    <form action={action} className="inline-flex flex-col gap-1">
      <input type="hidden" name="id" value={id} />
      <button
        className="btn-ghost"
        disabled={pending}
        title="Texte aus Originalmail und Antwort neu schreiben (überschreibt Änderungen)"
        onClick={(e) => {
          if (!window.confirm("Texte neu schreiben? Eigene Änderungen gehen dabei verloren.")) e.preventDefault();
        }}
      >
        {pending ? "Schreibe …" : "Texte neu schreiben"}
      </button>
      {state ? <span className={`text-xs ${state.ok ? "text-emerald-700" : "text-rose-600"}`}>{state.message}</span> : null}
    </form>
  );
}
