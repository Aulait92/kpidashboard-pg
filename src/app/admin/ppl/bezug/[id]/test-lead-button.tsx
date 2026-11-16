"use client";

import { useActionState } from "react";
import { Button, Card, CardHeader } from "@/components/ui";
import { sendTestLeadAction, type TestLeadState } from "../../actions";

/** Bezug → „Testdatensatz senden“ mit Rückmeldung je Lieferadresse. */
export function TestLeadButton({ subscriptionId, targets, last }: { subscriptionId: string; targets: string[]; last: string | null }) {
  const [state, action, pending] = useActionState<TestLeadState, FormData>(sendTestLeadAction, {});
  return (
    <Card>
      <CardHeader title="Lieferung testen" />
      <form action={action} className="space-y-3 px-5 py-4 text-sm">
        <input type="hidden" name="subscriptionId" value={subscriptionId} />
        <p className="text-[color:var(--muted)]">
          „TEST Lead“ mit [TEST] im Betreff an {targets.length === 1 ? targets[0] : `${targets.length} Adressen`}. Zählt nicht ins Kontingent und nicht in die Auswertung.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="md" disabled={pending}>
            {pending ? "Sendet …" : "Testdatensatz senden"}
          </Button>
          {last ? <span className="text-xs text-[color:var(--muted)]">Zuletzt: {last}</span> : null}
        </div>
        {state.message ? <p className="text-emerald-700">{state.message}</p> : null}
        {state.error ? <p className="text-rose-700">{state.error}</p> : null}
        {state.targets?.length ? (
          <ul className="space-y-1 text-xs">
            {state.targets.map((t) => (
              <li key={t.target} className={t.ok ? "text-emerald-700" : "text-rose-700"}>
                {t.ok ? "✓" : "✗"} {t.target}
                {t.blocked ? " (Testumgebung: gesperrt)" : ""}
                {t.error ? `: ${t.error}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </form>
    </Card>
  );
}
