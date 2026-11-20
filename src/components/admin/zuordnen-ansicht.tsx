import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ACTION_LABEL, COST_ACTIONS, netCost, suggestPattern, type CostAction } from "@/lib/bank/rules";
import { transactionsForReview } from "@/lib/bank/server";
import { assignAction } from "@/app/admin/einstellungen/bank/actions";

// Ausgaben zuordnen (Zweck wählen oder ignorieren, „immer so“ legt eine Regel an), gemeinsam für
// /admin/einstellungen/bank/zuordnen und /admin/neu/zahlen/kosten/zuordnen. ?ansicht=offen|alle.

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
const day = (d: Date) => d.toLocaleDateString("de-DE", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "2-digit" });
const sel = "h-9 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm sm:w-auto";
const STATUS_LABEL: Record<string, string> = { neu: "offen", zugeordnet: "zugeordnet", ignoriert: "ignoriert" };
const SOURCE_LABEL = (k: string) => (k === "csv:amex" ? "Amex" : k === "csv:commerzbank" ? "Commerzbank (CSV)" : k.startsWith("csv:") ? "CSV" : "Konto");

export async function ZuordnenAnsicht({ ansicht, basis }: { ansicht: "offen" | "alle"; basis: string }) {
  const rows = await transactionsForReview(ansicht);
  const openCount = ansicht === "offen" ? rows.length : await prisma.bankTransaction.count({ where: { status: "neu" } });
  return (
    <div className="space-y-4">
    <div className="flex gap-1.5" aria-label="Ansicht">
      {[
        { k: "offen", l: `Offen (${openCount})` },
        { k: "alle", l: "Alle (90 Tage)" },
      ].map((t) => (
        <Link
          key={t.k}
          href={`${basis}?ansicht=${t.k}`}
          className={`rounded-full border px-3 py-1 text-[13px] ${ansicht === t.k ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)] font-semibold text-[color:var(--brand)]" : "border-[color:var(--border)] bg-white text-[color:var(--muted)]"}`}
        >
          {t.l}
        </Link>
      ))}
    </div>
    {rows.length ? (
      <ul className="divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
        {rows.map((t) => {
          const amount = Number(t.amount);
          const pattern = suggestPattern(t);
          // Offene Buchungen: Zweck bewusst wählen (kein vorausgewählter Zweck)
          const current = t.status === "ignoriert" ? "ignore" : ((t.costPurpose as CostAction | null) ?? "");
          // Deutsche Firma (GmbH, AG …) → Rechnung enthält meist 19 % USt
          const vatGuess = t.status === "neu" ? /\b(gmbh|ag|kg|ohg|ug|e\.\s?k\.?|gbr|mbh)\b/i.test(`${t.counterparty ?? ""} ${t.purpose ?? ""}`) : t.vatIncluded;
          return (
            <li key={t.id} className="px-4 py-3" data-bank-tx={t.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="min-w-0 flex-1 font-medium">{t.counterparty ?? "(ohne Gegenpartei)"}</span>
                <span className={`font-semibold tabular-nums ${amount < 0 ? "" : "text-emerald-700"}`}>{eur(amount)}</span>
              </div>
              <div className="mt-0.5 text-sm text-[color:var(--muted)]">
                {day(t.bookingDate)} · {SOURCE_LABEL(t.accountKey)}
                {t.purpose ? ` · ${t.purpose.slice(0, 140)}` : ""}
              </div>
              {t.status !== "neu" ? (
                <div className="mt-1 text-xs">
                  <span className="font-medium">{STATUS_LABEL[t.status]}</span>
                  {t.costPurpose ? `: ${ACTION_LABEL[t.costPurpose as CostAction]}` : ""}
                  {t.status === "zugeordnet" ? ` · ${eur(netCost(amount, t.vatIncluded))} netto` : ""}
                  {t.rule ? ` · Regel „${t.rule.pattern}“` : t.note ? ` · ${t.note}` : ""}
                </div>
              ) : null}
              <form action={assignAction} className="mt-2 flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={t.id} />
                <select name="action" defaultValue={current} className={sel} aria-label="Zweck" required>
                  <option value="" disabled>
                    Zweck wählen …
                  </option>
                  {COST_ACTIONS.map((a) => (
                    <option key={a} value={a}>{ACTION_LABEL[a]}</option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" name="vat" defaultChecked={vatGuess} /> inkl. USt
                </label>
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" name="always" defaultChecked={t.status === "neu"} /> künftig automatisch bei
                </label>
                <input name="pattern" defaultValue={pattern} className="h-9 w-40 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-2 text-xs" aria-label="Muster" />
                <button className="btn-primary h-9 text-sm">{t.status === "neu" ? "Zuordnen" : "Ändern"}</button>
              </form>
            </li>
          );
        })}
      </ul>
    ) : (
      <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white px-4 py-8 text-center text-sm text-[color:var(--muted)]">
        <p>{ansicht === "offen" ? "Alles zugeordnet." : "Noch keine Buchungen von Konto oder Karte."}</p>
        <Link href={ansicht === "offen" ? `${basis}?ansicht=alle` : basis.replace(/\/zuordnen$/, "/konten")} className="mt-2 inline-flex min-h-10 items-center font-semibold text-[color:var(--brand)] hover:underline">
          {ansicht === "offen" ? "Alle Ausgaben ansehen" : "Konten verbinden"}
        </Link>
      </div>
    )}
    </div>
  );
}
