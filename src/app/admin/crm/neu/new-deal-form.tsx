"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button, Card, CardHeader } from "@/components/ui";
import { createDealAction, type NewDealState } from "./actions";

const input =
  "h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20";

export function NewDealForm({ statuses }: { statuses: string[] }) {
  const [state, action, pending] = useActionState<NewDealState, FormData>(createDealAction, {});
  return (
    <form action={action}>
      <Card>
        <CardHeader title="Kontakt" />
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <Field l="Name *"><input name="name" required className={input} autoFocus /></Field>
          <Field l="Firma / Agentur"><input name="company" className={input} /></Field>
          <Field l="E-Mail"><input name="email" type="email" className={input} /></Field>
          <Field l="Telefon"><input name="phone" className={input} /></Field>
          <Field l="Produkt / Interesse"><input name="product" className={input} placeholder="z. B. Privatschutz" /></Field>
          <Field l="Status">
            <select name="status" className={input} defaultValue={statuses.includes("Video-Sales-Call vereinbart") ? "Video-Sales-Call vereinbart" : statuses[0]}>
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-xs font-medium text-[color:var(--muted)]">Notiz</span>
            <textarea name="notes" className={`${input} h-20 py-2`} />
          </label>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-[color:var(--border)] px-5 py-3">
          {state.error ? <p className="text-sm text-rose-700">{state.error}</p> : <span />}
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Deal anlegen
          </Button>
        </div>
      </Card>
    </form>
  );
}

function Field({ l, children }: { l: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-[color:var(--muted)]">{l}</span>
      {children}
    </label>
  );
}
