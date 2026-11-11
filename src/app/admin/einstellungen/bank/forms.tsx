"use client";

import { useActionState } from "react";
import { syncBankAction, uploadCsvAction, type BankState } from "./actions";

function Result({ state }: { state: BankState }) {
  if (!state) return null;
  if (state.error) return <p className="text-sm text-rose-600">{state.error}</p>;
  if (state.message) return <p className="text-sm text-emerald-700">{state.message}</p>;
  return null;
}

export function SyncButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<BankState, FormData>(syncBankAction, null);
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="id" value={id} />
      <button className="btn-ghost text-sm" disabled={pending}>{pending ? "Rufe ab …" : "Jetzt abrufen"}</button>
      <Result state={state} />
    </form>
  );
}

const input = "mt-1 h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm outline-none focus:border-[color:var(--brand)]";

export function CsvUpload() {
  const [state, action, pending] = useActionState<BankState, FormData>(uploadCsvAction, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
      <label className="text-sm">
        CSV-Datei
        <input type="file" name="file" accept=".csv,text/csv" className={`${input} py-1.5`} required />
      </label>
      <label className="text-sm">
        Herkunft
        <select name="source" defaultValue="auto" className={input}>
          <option value="auto">Automatisch erkennen</option>
          <option value="commerzbank">Commerzbank</option>
          <option value="amex">American Express</option>
        </select>
      </label>
      <button className="btn-primary h-10" disabled={pending}>{pending ? "Importiere …" : "Importieren"}</button>
      <div className="sm:col-span-3">
        <Result state={state} />
      </div>
    </form>
  );
}
