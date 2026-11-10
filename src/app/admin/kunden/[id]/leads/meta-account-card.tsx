"use client";

import { useActionState } from "react";
import { Button, Card, CardHeader } from "@/components/ui";
import { setMetaAdAccountAction, type MetaAccountState } from "./meta-account-actions";

export function MetaAccountCard({ customerId, current }: { customerId: string; current: string | null }) {
  const [state, action, pending] = useActionState<MetaAccountState, FormData>(setMetaAdAccountAction, {});
  return (
    <Card>
      <CardHeader title="Meta-Werbekonto" />
      <form action={action} className="space-y-2 px-5 pb-5 text-sm">
        <p className="text-[color:var(--muted)]">Für Adspend und Kosten je Lead. ID steht im Werbeanzeigenmanager oben links bzw. in der URL (act=…).</p>
        <input type="hidden" name="customerId" value={customerId} />
        <div className="flex gap-2">
          <input
            name="account"
            defaultValue={current ?? ""}
            placeholder="z. B. 1234567890123456"
            inputMode="numeric"
            className="h-10 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3"
          />
          <Button type="submit" variant="primary" size="md" disabled={pending}>
            {pending ? "Prüfe …" : "Speichern & prüfen"}
          </Button>
        </div>
        {state.message ? <p className="text-emerald-700">{state.message}</p> : null}
        {state.error ? <p className="text-rose-700">{state.error}</p> : null}
      </form>
    </Card>
  );
}
