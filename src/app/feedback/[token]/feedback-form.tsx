"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { submitFeedbackAction, type FeedbackState } from "./actions";

const SMILEYS = ["😞", "🙁", "😐", "🙂", "😃"];
const LABELS = ["sehr unzufrieden", "unzufrieden", "geht so", "zufrieden", "sehr zufrieden"];

export function FeedbackForm({ token, initialScore }: { token: string; initialScore: number | null }) {
  const [score, setScore] = useState<number | null>(initialScore);
  const [state, action, pending] = useActionState<FeedbackState, FormData>(submitFeedbackAction.bind(null, token), {});
  if (state.ok) {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-emerald-50 px-5 py-4 text-emerald-900">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <div className="font-semibold">Vielen Dank für Ihr Feedback!</div>
          <p className="mt-1 text-sm">{score != null && score <= 3 ? "Wir melden uns kurzfristig bei Ihnen." : "Das freut uns sehr."}</p>
        </div>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="score" value={score ?? ""} />
      <div className="grid grid-cols-5 gap-1.5">
        {SMILEYS.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => setScore(i + 1)}
            aria-label={LABELS[i]}
            className={`flex min-w-0 flex-col items-center gap-1 rounded-xl border px-0.5 py-3 text-[28px] transition ${score === i + 1 ? "border-[color:var(--brand)] bg-[#EFF6FF] ring-2 ring-[color:var(--brand)]/20" : "border-[color:var(--border)] bg-white hover:border-[color:var(--border-strong)]"}`}
          >
            {s}
            <span className="text-center text-[10px] leading-tight text-[color:var(--muted)]">{LABELS[i]}</span>
          </button>
        ))}
      </div>
      <div>
        <label htmlFor="comment" className="text-sm font-medium">
          {score != null && score <= 3 ? "Was können wir besser machen?" : "Möchten Sie noch etwas ergänzen? (optional)"}
        </label>
        <textarea
          id="comment"
          name="comment"
          rows={3}
          className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 py-2 text-[15px] outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20"
        />
      </div>
      {state.error ? <p className="text-sm font-medium text-rose-700">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending || score == null}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-[15px] font-semibold text-white transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Feedback senden
      </button>
    </form>
  );
}
