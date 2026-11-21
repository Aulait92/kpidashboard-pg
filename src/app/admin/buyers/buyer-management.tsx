"use client";

import { useActionState } from "react";
import { cn } from "@/lib/utils";
import {
  createBuyerAccount,
  reassignBuyerCustomer,
  type CreateBuyerState,
} from "./actions";

const FELD = "mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none";

// Neuen Login anlegen. In der Kundenakte steht der Kunde fest (`kundeId`), dann gibt es kein Auswahlfeld.
// `startPasswort` (vom Server erzeugt) belegt das Passwort vor; es kann überschrieben werden.
export function CreateBuyerForm({
  customers,
  kundeId,
  startPasswort,
}: {
  customers: { id: string; name: string }[];
  kundeId?: string;
  startPasswort?: string;
}) {
  const [state, formAction, pending] = useActionState<
    CreateBuyerState,
    FormData
  >(createBuyerAccount, {});

  return (
    <form action={formAction} className="mt-3 space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">E-Mail</span>
          <input name="email" type="email" required placeholder="name@agentur.de" className={FELD} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Startpasswort</span>
          <input
            name="password"
            type="text"
            required
            minLength={8}
            defaultValue={startPasswort}
            placeholder={startPasswort ? undefined : "mindestens 8 Zeichen"}
            className={FELD}
          />
        </label>
      </div>
      {kundeId ? (
        <input type="hidden" name="customerId" value={kundeId} />
      ) : (
        <label className="block">
          <span className="text-sm font-medium">Kunde</span>
          <select name="customerId" required defaultValue="" className={FELD}>
            <option value="" disabled>
              Kunde wählen
            </option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {state.error ? (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
          {state.error}
        </div>
      ) : null}
      {state.ok && state.createdEmail ? (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
          Login für {state.createdEmail} angelegt. Senden Sie oben in der Liste die Einladung.
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[color:var(--brand)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60"
      >
        {pending ? "Lege an…" : "Login anlegen"}
      </button>
    </form>
  );
}

// Kunden-Zuordnung eines bestehenden Buyer-Logins direkt in der Tabelle ändern.
// Auswahl speichert sofort (Auto-Submit onChange) — Passwort bleibt erhalten.
// Der aktuelle Kunde steht immer in der Auswahl, auch wenn er intern oder archiviert ist
// (sonst zeigt das Feld den ersten Kunden der Liste an, z. B. beim Demo-Kunden).
export function ReassignCustomerForm({
  userId,
  current,
  customers,
  className,
}: {
  userId: string;
  current: { id: string; name: string } | null;
  customers: { id: string; name: string }[];
  className?: string;
}) {
  const options = current && !customers.some((c) => c.id === current.id) ? [current, ...customers] : customers;
  const [state, formAction, pending] = useActionState<
    CreateBuyerState,
    FormData
  >(reassignBuyerCustomer, {});

  return (
    <form action={formAction} className={cn("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1", className)}>
      <input type="hidden" name="userId" value={userId} />
      <select
        name="customerId"
        aria-label="Kunde"
        defaultValue={current?.id ?? ""}
        disabled={pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="w-full min-w-0 max-w-[220px] rounded-lg border border-[color:var(--border)] bg-white px-2 py-1 text-sm focus:border-[color:var(--brand)] focus:outline-none disabled:opacity-60"
      >
        <option value="" disabled>
          nicht zugeordnet
        </option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {pending ? (
        <span className="text-[10px] text-[color:var(--muted)]">…</span>
      ) : state.ok ? (
        <span className="text-[10px] font-medium text-emerald-700">
          ✓ {state.createdEmail}
        </span>
      ) : state.error ? (
        <span className="text-[10px] font-medium text-rose-700">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
