"use client";

import { useActionState, useState, useTransition } from "react";
import { formatEUR, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  runDryRun,
  saveCustomerBuyerSettings,
  type DryRunState,
  type SaveSettingsState,
} from "./actions";

export type CustomerSetting = {
  id: string;
  name: string;
  leadGoalWechsel: number | null;
  leadGoalNeugeschaeft: number | null;
  autopilot: boolean;
  campaignKeyword: string | null;
  maxDailyBudget: number | null;
};

export type ActionLogRow = {
  id: string;
  customerName: string;
  product: string;
  action: string;
  reason: string;
  leadsMtd: number;
  leadsGoal: number;
  projected: number;
  prevBudget: number | null;
  newBudget: number | null;
  dryRun: boolean;
  createdAt: string;
};

const ACTION_LABEL: Record<string, { label: string; cls: string }> = {
  increase: { label: "Budget ↑", cls: "bg-emerald-50 text-emerald-700" },
  decrease: { label: "Budget ↓", cls: "bg-amber-50 text-amber-700" },
  boost: { label: "Endspurt 🚀", cls: "bg-indigo-50 text-indigo-700" },
  pause: { label: "Pausiert", cls: "bg-zinc-100 text-zinc-600" },
  activate: { label: "Reaktiviert", cls: "bg-blue-50 text-blue-700" },
  none: { label: "Keine Änd.", cls: "bg-zinc-50 text-zinc-500" },
};

function ActionBadge({ action }: { action: string }) {
  const cfg = ACTION_LABEL[action] ?? ACTION_LABEL.none;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
        cfg.cls,
      )}
    >
      {cfg.label}
    </span>
  );
}

function CustomerForm({ customer }: { customer: CustomerSetting }) {
  const [state, formAction, pending] = useActionState<
    SaveSettingsState,
    FormData
  >(saveCustomerBuyerSettings, {});

  return (
    <form
      action={formAction}
      className="rounded-xl border border-[color:var(--border)] p-4"
    >
      <input type="hidden" name="customerId" value={customer.id} />
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{customer.name}</h3>
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            name="autopilot"
            defaultChecked={customer.autopilot}
            className="h-4 w-4 rounded border-[color:var(--border)]"
          />
          Autopilot
        </label>
      </div>
      <div className="mb-3 flex flex-wrap gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-600">
          Ziel Wechsel:{" "}
          {customer.leadGoalWechsel != null
            ? formatNumber(customer.leadGoalWechsel)
            : "–"}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-600">
          Ziel Neugeschäft:{" "}
          {customer.leadGoalNeugeschaeft != null
            ? formatNumber(customer.leadGoalNeugeschaeft)
            : "–"}
        </span>
        <span className="text-[color:var(--muted)]">(aus Airtable)</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--muted)]">
            Max. Budget/Tag je Produkt (€)
          </span>
          <input
            type="number"
            name="maxDailyBudget"
            min={0}
            step={5}
            defaultValue={customer.maxDailyBudget ?? ""}
            placeholder="Env-Default"
            className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm tabular-nums focus:border-[color:var(--brand)] focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--muted)]">
            Kampagnen-Keyword
          </span>
          <input
            type="text"
            name="campaignKeyword"
            defaultValue={customer.campaignKeyword ?? ""}
            placeholder={customer.name}
            className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none"
          />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[color:var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60"
        >
          {pending ? "Speichere…" : "Speichern"}
        </button>
        {state.ok ? (
          <span className="text-xs font-medium text-emerald-600">
            Gespeichert.
          </span>
        ) : null}
        {state.error ? (
          <span className="text-xs font-medium text-rose-600">
            {state.error}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function DryRunPanel() {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<DryRunState>({});

  function run() {
    startTransition(async () => {
      setState(await runDryRun());
    });
  }

  return (
    <div className="rounded-xl border border-[color:var(--border)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Trockenlauf</h3>
          <p className="text-xs text-[color:var(--muted)]">
            Zeigt, was der Buyer jetzt entscheiden würde — ohne an Meta zu
            schreiben.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="rounded-lg border border-[color:var(--brand)] px-4 py-2 text-sm font-semibold text-[color:var(--brand)] transition hover:bg-[color:var(--brand-soft)] disabled:opacity-60"
        >
          {pending ? "Simuliere…" : "Jetzt simulieren"}
        </button>
      </div>

      {state.error ? (
        <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
          {state.error}
        </div>
      ) : null}

      {state.results ? (
        state.results.length === 0 ? (
          <p className="mt-3 text-xs text-[color:var(--muted)]">
            Kein Kunde mit aktivem Autopilot und gesetztem Lead-Ziel.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {state.results.map((r) => (
              <div
                key={`${r.customerId}:${r.product}`}
                className="rounded-lg bg-zinc-50 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{r.customerName}</span>
                  <span className="text-[color:var(--muted)]">{r.product}</span>
                  <ActionBadge action={r.action} />
                  <span className="ml-auto tabular-nums text-[color:var(--muted)]">
                    {r.leadsMtd}/{r.goal} · Prog. {r.projected}
                  </span>
                </div>
                <p className="mt-1 text-[color:var(--muted)]">{r.reason}</p>
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

export function MediaBuyerAdmin({
  customers,
  log,
}: {
  customers: CustomerSetting[];
  log: ActionLogRow[];
}) {
  return (
    <div className="space-y-6">
      <DryRunPanel />

      <section>
        <h2 className="mb-3 text-base font-semibold">Kunden-Einstellungen</h2>
        <div className="space-y-3">
          {customers.map((c) => (
            <CustomerForm key={c.id} customer={c} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Letzte Entscheidungen</h2>
        {log.length === 0 ? (
          <p className="text-sm text-[color:var(--muted)]">
            Noch keine Läufe protokolliert.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[color:var(--border)]">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 text-[color:var(--muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Zeit</th>
                  <th className="px-3 py-2 font-medium">Kunde</th>
                  <th className="px-3 py-2 font-medium">Produkt</th>
                  <th className="px-3 py-2 font-medium">Aktion</th>
                  <th className="px-3 py-2 font-medium">Leads</th>
                  <th className="px-3 py-2 font-medium">Budget</th>
                  <th className="px-3 py-2 font-medium">Grund</th>
                </tr>
              </thead>
              <tbody>
                {log.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-[color:var(--border)]"
                  >
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[color:var(--muted)]">
                      {row.createdAt}
                      {row.dryRun ? " (sim)" : ""}
                    </td>
                    <td className="px-3 py-2 font-medium">{row.customerName}</td>
                    <td className="px-3 py-2 text-[color:var(--muted)]">
                      {row.product}
                    </td>
                    <td className="px-3 py-2">
                      <ActionBadge action={row.action} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      {formatNumber(row.leadsMtd)}/{formatNumber(row.leadsGoal)}
                      <span className="text-[color:var(--muted)]">
                        {" "}
                        · P{formatNumber(row.projected)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      {row.prevBudget != null && row.newBudget != null
                        ? `${formatEUR(row.prevBudget)} → ${formatEUR(row.newBudget)}`
                        : row.prevBudget != null
                          ? formatEUR(row.prevBudget)
                          : "–"}
                    </td>
                    <td className="px-3 py-2 text-[color:var(--muted)]">
                      {row.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
