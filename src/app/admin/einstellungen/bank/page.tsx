import Link from "next/link";
import { Building2, CreditCard } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { enableBankingConfigured } from "@/lib/bank/enable-banking";
import { ACTION_LABEL, COST_ACTIONS, overlappingRecurring, type CostAction } from "@/lib/bank/rules";
import { BANK_REMIND_DAYS, bankRedirectUrl } from "@/lib/bank/server";
import { connectBankAction, deleteRuleAction, disconnectBankAction, saveRuleAction } from "./actions";
import { CsvUpload, SyncButton } from "./forms";

export const metadata = { title: "Bank & Karten | performancegrowth Admin" };

const fmt = (d: Date | null | undefined, time = false) =>
  d ? d.toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) }) : "–";
const card = "rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 shadow-[var(--shadow-sm)] sm:p-5";
const sel = "h-9 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm";

type Acc = { uid: string; name?: string | null; iban?: string | null };

type Conn = { id: string; aspspName: string; status: string; validUntil: Date | null; accounts: unknown; lastSyncAt: Date | null; lastError: string | null };

function BankCard({
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
  c: Conn | undefined;
  csv: { _count: number; _max: { bookingDate: Date | null } } | undefined;
  csvHint: string;
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
              <p>Konten: {((c.accounts as Acc[] | null) ?? []).map((a) => [a.name, a.iban].filter(Boolean).join(" ")).join(", ") || "–"}</p>
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
          <p className="mt-2 text-xs text-[color:var(--muted)]">{csvHint}</p>
        </div>
      </div>
    </section>
  );
}

// Bank & Karten: Konten verbinden (Enable Banking) oder CSV hochladen; Ausgaben
// fließen nach der Zuordnung als Kosten in die Zahlen-Seite.
export default async function BankPage({ searchParams }: { searchParams: Promise<{ fehler?: string; verbunden?: string }> }) {
  await requireAuth();
  const sp = await searchParams;
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
  const soonOf = (c: Conn | undefined) => !!(c?.status === "active" && c.validUntil && c.validUntil.getTime() - now.getTime() < BANK_REMIND_DAYS * 86400000);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-8 sm:px-6">
      <div>
        <Link href="/admin/einstellungen" className="text-xs text-[color:var(--brand)] hover:underline">← Einstellungen</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Bank & Karten</h1>
        <p className="text-sm text-[color:var(--muted)]">
          Ausgaben vom Geschäftskonto und der Kreditkarte holen und als Kosten zuordnen. Zugeordnete Ausgaben fließen netto in Marge und Kundengewinnungskosten auf der Zahlen-Seite.
        </p>
      </div>

      {sp.fehler ? <p className="rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{sp.fehler}</p> : null}
      {sp.verbunden ? <p className="rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Verbunden. Die Umsätze der letzten 90 Tage wurden abgerufen.</p> : null}

      {open > 0 ? (
        <Link href="/admin/einstellungen/bank/zuordnen" className="flex items-center justify-between rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>
            <b>{open}</b> {open === 1 ? "Ausgabe wartet" : "Ausgaben warten"} auf eine Zuordnung.
          </span>
          <span className="font-semibold">Zuordnen →</span>
        </Link>
      ) : (
        <Link href="/admin/einstellungen/bank/zuordnen" className="block text-sm text-[color:var(--brand)] hover:underline">Zugeordnete Ausgaben ansehen →</Link>
      )}

      {overlap.length ? (
        <p className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Möglicherweise doppelt gezählt: {overlap.map((o) => o.name).join(", ")} {overlap.length === 1 ? "steht" : "stehen"} unter „Laufende Kosten“ und kommt jetzt auch über die Bank. Bitte dort ein Enddatum setzen.{" "}
          <Link href="/admin/einstellungen/kosten" className="font-semibold underline">Laufende Kosten</Link>
        </p>
      ) : null}

      {!configured ? (
        <p className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-sunken)] px-4 py-3 text-sm text-[color:var(--muted)]">
          Für die direkte Verbindung fehlen noch <code>ENABLE_BANKING_APP_ID</code> und <code>ENABLE_BANKING_PRIVATE_KEY</code> in Railway. Bis dahin funktioniert der CSV-Import. Weiterleitungs-Adresse für Enable Banking: <code>{redirectUrl}</code>
        </p>
      ) : null}

      <BankCard title="Commerzbank (Geschäftskonto)" icon={Building2} aspsp="Commerzbank" c={commerz} csv={csvCount("csv:commerzbank")} configured={configured} soon={soonOf(commerz)} csvHint="Ohne Verbindung: Online-Banking → Umsätze → Export „CSV“ und unten hochladen. Die Bank-Zustimmung gilt höchstens 180 Tage; 7 Tage vorher kommt eine Erinnerung." />
      <BankCard title="American Express" icon={CreditCard} aspsp="American Express" c={amex} csv={csvCount("csv:amex")} configured={configured} soon={soonOf(amex)} csvHint="Amex ist über Open Banking in Deutschland meist nicht verfügbar. Dann: amex.de → Umsätze → „Herunterladen“ → Format „CSV“ und unten hochladen (am besten einmal im Monat nach der Abrechnung)." />

      <section className={card}>
        <h2 className="mb-1 font-semibold">CSV hochladen</h2>
        <p className="mb-3 text-sm text-[color:var(--muted)]">Doppelt hochladen schadet nicht: schon vorhandene Buchungen werden übersprungen.</p>
        <CsvUpload />
      </section>

      <section className={card}>
        <h2 className="mb-1 font-semibold">Regeln</h2>
        <p className="mb-3 text-sm text-[color:var(--muted)]">
          Enthält Gegenpartei oder Verwendungszweck das Muster, wird die Ausgabe automatisch zugeordnet. Neue Regeln entstehen beim Zuordnen mit „immer so“. „inkl. USt“: Betrag enthält 19 % Umsatzsteuer und wird netto gerechnet (ausländische Tools ohne deutsche USt: aus).
        </p>
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
      </section>
    </main>
  );
}
