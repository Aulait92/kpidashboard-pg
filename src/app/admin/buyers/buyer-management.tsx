"use client";

import { useActionState } from "react";
import {
  createBuyerAccount,
  deleteBuyerAccount,
  reassignBuyerCustomer,
  resetBuyerPassword,
  type CreateBuyerState,
} from "./actions";

export function CreateBuyerForm({
  customers,
}: {
  customers: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<
    CreateBuyerState,
    FormData
  >(createBuyerAccount, {});

  return (
    <form action={formAction} className="mt-3 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--muted)]">
            Email
          </span>
          <input
            name="email"
            type="email"
            required
            placeholder="buyer@example.com"
            className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--muted)]">
            Passwort (min. 8 Zeichen)
          </span>
          <input
            name="password"
            type="text"
            required
            minLength={8}
            placeholder="zufällig generieren oder selber wählen"
            className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none"
          />
        </label>
      </div>
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--muted)]">
          Kunde verknüpfen
        </span>
        <select
          name="customerId"
          required
          defaultValue=""
          className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none"
        >
          <option value="" disabled>
            – Kunde wählen –
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {state.error ? (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
          {state.error}
        </div>
      ) : null}
      {state.ok && state.createdEmail ? (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
          Account für {state.createdEmail} angelegt. Schick die
          Zugangsdaten dem Buyer.
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[color:var(--brand)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60"
      >
        {pending ? "Lege an…" : "Account anlegen"}
      </button>
    </form>
  );
}

// Kunden-Zuordnung eines bestehenden Buyer-Logins direkt in der Tabelle ändern.
// Auswahl speichert sofort (Auto-Submit onChange) — Passwort bleibt erhalten.
export function ReassignCustomerForm({
  userId,
  currentCustomerId,
  customers,
}: {
  userId: string;
  currentCustomerId: string | null;
  customers: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<
    CreateBuyerState,
    FormData
  >(reassignBuyerCustomer, {});

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <select
        name="customerId"
        defaultValue={currentCustomerId ?? ""}
        disabled={pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="max-w-[220px] rounded-lg border border-[color:var(--border)] bg-white px-2 py-1 text-sm focus:border-[color:var(--brand)] focus:outline-none disabled:opacity-60"
      >
        <option value="" disabled>
          – nicht zugeordnet –
        </option>
        {customers.map((c) => (
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

export function DeleteBuyerButton({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  return (
    <form
      action={deleteBuyerAccount}
      onSubmit={(e) => {
        if (!confirm(`Buyer-Account "${email}" wirklich löschen?`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        className="text-xs font-medium text-rose-600 hover:underline"
      >
        Löschen
      </button>
    </form>
  );
}

// Inline-Passwort-Reset für Buyer aus der Admin-Übersicht. Umgeht den
// Forgot-Password-Email-Flow, wenn er nicht zustande kommt (E-Mail-Versand
// kaputt, Link verloren). Admin tippt das neue Passwort, Server-Action
// hash't es und überschreibt den passwordHash direkt.
export function ResetPasswordButton({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const [state, formAction, pending] = useActionState<
    CreateBuyerState,
    FormData
  >(resetBuyerPassword, {});

  return (
    <form
      action={formAction}
      className="inline-flex items-center gap-2"
      onSubmit={(e) => {
        const form = e.currentTarget;
        const input = form.elements.namedItem("password") as HTMLInputElement;
        const pw = prompt(
          `Neues Passwort für "${email}" (min. 8 Zeichen):`,
          "",
        );
        if (!pw || pw.length < 8) {
          e.preventDefault();
          return;
        }
        input.value = pw;
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="password" defaultValue="" />
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-medium text-[color:var(--brand)] hover:underline disabled:opacity-60"
      >
        {pending ? "Setze…" : "Passwort"}
      </button>
      {state.ok ? (
        <span className="text-[10px] font-medium text-emerald-700">gesetzt</span>
      ) : state.error ? (
        <span className="text-[10px] font-medium text-rose-700">{state.error}</span>
      ) : null}
    </form>
  );
}
