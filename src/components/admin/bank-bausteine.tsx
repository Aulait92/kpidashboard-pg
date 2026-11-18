import { prisma } from "@/lib/prisma";
import type { Building2 } from "lucide-react";
import { enableBankingConfigured } from "@/lib/bank/enable-banking";
import { ACTION_LABEL, COST_ACTIONS, overlappingRecurring, type CostAction } from "@/lib/bank/rules";
import { BANK_REMIND_DAYS, bankRedirectUrl } from "@/lib/bank/server";
import { connectBankAction, deleteRuleAction, disconnectBankAction, saveRuleAction } from "@/app/admin/einstellungen/bank/actions";
import { SyncButton } from "@/app/admin/einstellungen/bank/forms";
import { KEINE_ANGABE } from "@/lib/platzhalter";

// Bank & Karten: gemeinsame Bausteine für /admin/einstellungen/bank und /admin/neu/zahlen/kosten
// (Laden, Karte je Bank mit Verbinden/Abrufen/Trennen, Regeln).



/** Alles, was die Bank-Seite braucht. */
export async function ladeBank() {
  const now = new Date();
  const [conns, open, rules, recurring, assigned, counts] = await Promise.all([
    prisma.bankConnection.findMany({ where: { status: { not: "pending" } }, orderBy: { createdAt: "desc" } }),
    prisma.bankTransaction.count({ where: { status: "neu" } }),
    prisma.costRule.findMany({ orderBy: { pattern: "asc" } }),
    prisma.recurringCost.findMany({ select: { id: true, name: true, endsAt: true } }),
    prisma.bankTransaction.findMany({ where: { status: "zugeordnet", bookingDate: { gte: new Date(now.getTime() - 60 * 86400000) } }, select: { counterparty: true, purpose: true, bookingDate: true } }),
    prisma.bankTransaction.groupBy({ by: ["accountKey"], _count: true, _max: { bookingDate: true } }),
  ]);
  const configured = enableBankingConfigured();
  let redirectUrl = "";
  try {
    redirectUrl = bankRedirectUrl();
  } catch {
    redirectUrl = "https://app.performancegrowth.de/api/bank/callback";
  }
  const overlap = overlappingRecurring(recurring, assigned, now);
  const visible = conns.filter((c, i) => c.status === "active" || conns.findIndex((x) => x.aspspName === c.aspspName) === i);
  const byBank = (name: RegExp) => visible.find((c) => name.test(c.aspspName));
  const csvCount = (k: string) => counts.find((c) => c.accountKey === k);
  const commerz = byBank(/commerzbank/i);
  const amex = byBank(/american express|amex/i);
  const soonOf = (c: BankVerbindung | undefined) => !!(c?.status === "active" && c.validUntil && c.validUntil.getTime() - now.getTime() < BANK_REMIND_DAYS * 86400000);

  return { now, open, rules, overlap, configured, redirectUrl, commerz, amex, csvCount, soonOf };
}

const fmt = (d: Date | null | undefined, time = false) =>
  d ? d.toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) }) : KEINE_ANGABE;
const card = "rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 shadow-[var(--shadow-sm)] sm:p-5";
const sel = "h-9 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm";

type Acc = { uid: string; name?: string | null; iban?: string | null };

export type BankVerbindung = { id: string; aspspName: string; status: string; validUntil: Date | null; accounts: unknown; lastSyncAt: Date | null; lastError: string | null };

export function BankKarte({
  title,
  icon: Icon,
  aspsp,
  c,
  csv,
  csvHint,
  configured,
  soon,
}: {
  title: string;
  icon: typeof Building2;
  aspsp: string;
  c: BankVerbindung | undefined;
  csv: { _count: number; _max: { bookingDate: Date | null } } | undefined;
  /** leer = kein Hinweis (neuer Admin: kein CSV-Upload mehr) */
  csvHint?: string;
  configured: boolean;
  soon: boolean;
}) {
  return (
    <section className={card}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-slate-100 text-slate-700">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{title}</h2>
          {c?.status === "active" ? (
            <div className="mt-1 space-y-0.5 text-sm text-[color:var(--muted)]">
              <p>
                <span className="font-medium text-emerald-700">Verbunden</span> bis {fmt(c.validUntil)}
                {soon ? <span className="ml-1 font-medium text-amber-700">· bitte bald neu verbinden</span> : null}
              </p>
              <p>Konten: {((c.accounts as Acc[] | null) ?? []).map((a) => [a.name, a.iban].filter(Boolean).join(" ")).join(", ") || KEINE_ANGABE}</p>
              <p>Letzter Abruf: {fmt(c.lastSyncAt, true)}</p>
              {c.lastError ? <p className="text-rose-600">Fehler: {c.lastError}</p> : null}
            </div>
          ) : c ? (
            <p className="mt-1 text-sm text-[color:var(--muted)]">
              {c.status === "expired" ? "Zustimmung abgelaufen. Bitte neu verbinden." : c.status === "revoked" ? "Getrennt." : `Nicht verbunden${c.lastError ? `: ${c.lastError}` : "."}`}
            </p>
          ) : (
            <p className="mt-1 text-sm text-[color:var(--muted)]">Nicht verbunden.</p>
          )}
          {csv ? <p className="mt-1 text-sm text-[color:var(--muted)]">Per CSV: {csv._count} Buchungen, letzte vom {fmt(csv._max.bookingDate)}.</p> : null}
          <div className="mt-3 flex flex-wrap items-start gap-2">
            <form action={connectBankAction}>
              <input type="hidden" name="aspsp" value={aspsp} />
              <button className={c?.status === "active" ? "btn-ghost text-sm" : "btn-primary text-sm"} disabled={!configured}>
                {c?.status === "active" ? "Neu verbinden" : "Verbinden"}
              </button>
            </form>
            {c?.status === "active" ? (
              <>
                <SyncButton id={c.id} />
                <form action={disconnectBankAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="btn-ghost text-sm text-rose-600">Trennen</button>
                </form>
              </>
            ) : null}
          </div>
          {csvHint ? <p className="mt-2 text-sm text-[color:var(--muted)]">{csvHint}</p> : null}
        </div>
      </div>
    </section>
  );
}

/** Regeln: Muster → Zweck, Name in der BWA, inkl. USt; Speichern und Löschen. */
export function BankRegeln({ rules }: { rules: Awaited<ReturnType<typeof ladeBank>>["rules"] }) {
  return (
    <>
      {rules.length ? (
        <ul className="divide-y divide-[color:var(--border)]">
          {rules.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="min-w-[140px] flex-1 font-medium">„{r.pattern}“</span>
              <form action={saveRuleAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={r.id} />
                <input name="label" defaultValue={r.label ?? ""} placeholder="Name in der BWA" title="Name in der BWA" className="input h-9 w-44 text-sm" />
                <select name="action" defaultValue={r.action} className={sel}>
                  {COST_ACTIONS.map((a) => (
                    <option key={a} value={a}>{ACTION_LABEL[a as CostAction]}</option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" name="vat" defaultChecked={r.vatIncluded} /> inkl. USt
                </label>
                <button className="btn-ghost h-9 text-xs">Speichern</button>
              </form>
              <form action={deleteRuleAction}>
                <input type="hidden" name="id" value={r.id} />
                <button className="text-xs text-rose-600 hover:underline">Löschen</button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[color:var(--muted)]">Noch keine Regeln. Beim ersten Import werden Standardregeln angelegt (z. B. Anthropic → Software, Instantly → Kundengewinnung, Meta/Stripe/Amex-Abrechnung → ignorieren).</p>
      )}
    </>
  );
}
