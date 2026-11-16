"use client";

import { useActionState } from "react";
import { slackTestAction, type SlackTestState } from "./actions";

/** Pay-per-Lead-Kopf: Slack-Status und „Slack testen“ (Testnachricht an SLACK_PPL_WEBHOOK_URL). */
export function SlackTest({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState<SlackTestState, FormData>(slackTestAction, {});
  const result =
    state.state === "gesendet"
      ? { text: "Slack: gesendet", cls: "text-emerald-700" }
      : state.state === "nicht eingerichtet"
        ? { text: "Slack: nicht eingerichtet (SLACK_PPL_WEBHOOK_URL fehlt)", cls: "text-amber-700" }
        : state.state === "fehler"
          ? { text: `Slack: Fehler${state.status ? ` ${state.status}` : ""}${state.error ? `, ${state.error}` : ""}`, cls: "text-rose-700" }
          : null;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <button
        disabled={pending}
        className="inline-flex h-7 items-center rounded-full border border-[color:var(--border)] bg-white px-2.5 text-xs font-medium text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
        title={configured ? "Testnachricht an den Slack-Kanal senden" : "SLACK_PPL_WEBHOOK_URL ist nicht gesetzt"}
      >
        {pending ? "Sendet …" : configured ? "Slack testen" : "Slack testen (nicht eingerichtet)"}
      </button>
      {result ? <span className={`text-xs ${result.cls}`}>{result.text}</span> : null}
    </form>
  );
}
