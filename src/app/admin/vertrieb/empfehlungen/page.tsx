import Link from "next/link";
import { Settings } from "lucide-react";
import { Badge } from "@/components/ui";
import { adminReferralOverview } from "@/lib/kollegen";
import { REWARD_STATUS_LABEL, STAGE_LABEL, type ReferralStage } from "@/lib/kollegen-shared";
import { requireAuth } from "@/lib/vertrieb/auth";
import { markRewardDoneAction } from "./actions";

export const metadata = { title: "Empfehlungen | Vertrieb" };
export const dynamic = "force-dynamic";

const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const date = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "2-digit" }).format(d);
const TONE: Record<ReferralStage, "neutral" | "brand" | "success" | "info"> = { eingegangen: "neutral", termin: "info", kunde: "brand", praemie: "success", abgelehnt: "neutral" };

// „Kollegen empfehlen“: alle Empfehlungen, Top-Empfehler, offene Prämien.
export default async function EmpfehlungenPage() {
  await requireAuth();
  const { list, top, totals } = await adminReferralOverview();
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Empfehlungen</h1>
          <p className="text-sm text-[color:var(--muted)]">Kunden empfehlen uns an Kollegen („Kollegen empfehlen“ im Kundenbereich).</p>
        </div>
        <Link href="/admin/einstellungen/empfehlungen" className="inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--brand)] hover:underline">
          <Settings className="h-4 w-4" /> Prämie & Vorteil einstellen
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { l: "Empfehlungen", v: String(totals.referrals) },
          { l: "Kunden geworden", v: String(totals.won) },
          { l: "Neuer Monatsumsatz", v: eur(totals.newMrr) },
          { l: "Prämien gutgeschrieben", v: eur(totals.rewards) },
        ].map((k) => (
          <div key={k.l} className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4">
            <div className="text-xs text-[color:var(--muted)]">{k.l}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{k.v}</div>
          </div>
        ))}
      </div>
      {totals.openManual ? (
        <p className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {totals.openManual} Prämie{totals.openManual === 1 ? "" : "n"} von Hand gutschreiben (siehe unten, danach „Gutgeschrieben“ klicken).
        </p>
      ) : null}

      <section className="card overflow-x-auto">
        <h2 className="border-b border-[color:var(--border)] px-4 py-3 font-medium">Top-Empfehler</h2>
        {top.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[color:var(--muted)]">Noch keine Empfehlungen.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[color:var(--muted)]">
              <tr>
                <th className="px-4 py-2">Kunde</th>
                <th className="px-4 py-2 text-right">Empfehlungen</th>
                <th className="px-4 py-2 text-right">Kunden geworben</th>
                <th className="px-4 py-2 text-right">Neuer Monatsumsatz</th>
                <th className="px-4 py-2 text-right">Prämien</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border)]">
              {top.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2">
                    <Link href={`/admin/kunden/${t.id}`} className="font-medium hover:underline">
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{t.total}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{t.won}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{eur(t.newMrr)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{eur(t.rewards)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card overflow-x-auto">
        <h2 className="border-b border-[color:var(--border)] px-4 py-3 font-medium">Alle Empfehlungen</h2>
        {list.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[color:var(--muted)]">Noch keine Empfehlungen.</p>
        ) : (
          <table className="w-full text-sm" data-admin-empfehlungen>
            <thead className="text-left text-xs text-[color:var(--muted)]">
              <tr>
                <th className="px-4 py-2">Eingang</th>
                <th className="px-4 py-2">Empfohlen</th>
                <th className="px-4 py-2">von</th>
                <th className="px-4 py-2">Stand</th>
                <th className="px-4 py-2">Prämie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border)]">
              {list.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-2 text-[color:var(--muted)]">{date(r.createdAt)}</td>
                  <td className="px-4 py-2">
                    {r.contactId ? (
                      <Link href={`/admin/vertrieb/kontakte/${r.contactId}`} className="font-medium hover:underline">
                        {r.name ?? "(gelöscht)"}
                      </Link>
                    ) : (
                      <span className="font-medium">{r.name ?? "(gelöscht)"}</span>
                    )}
                    {r.company ? <span className="text-[color:var(--muted)]"> · {r.company}</span> : null}
                    {r.existingContact && r.status !== "blocked" ? <span className="block text-xs text-amber-700">war schon im CRM</span> : null}
                    {r.status === "blocked" ? <span className="block text-xs text-[color:var(--muted)]">{r.blockedReason}</span> : null}
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/admin/kunden/${r.referrer.id}`} className="hover:underline">
                      {r.referrer.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={TONE[r.stage]}>{STAGE_LABEL[r.stage]}</Badge>
                    {r.newMonthly ? <span className="block text-xs text-[color:var(--muted)]">{eur(r.newMonthly)}/Monat</span> : null}
                  </td>
                  <td className="px-4 py-2">
                    <span>{REWARD_STATUS_LABEL[r.rewardStatus] ?? r.rewardStatus}</span>
                    {r.rewardAmount != null ? <span className="tabular-nums"> · {eur(r.rewardAmount)}</span> : null}
                    {r.rewardNote ? <span className="block text-xs text-[color:var(--muted)]">{r.rewardNote}</span> : null}
                    {r.rewardStatus === "manual" ? (
                      <form action={markRewardDoneAction} className="mt-1 flex items-center gap-2">
                        <input type="hidden" name="id" value={r.id} />
                        {r.rewardAmount == null ? <input name="amount" inputMode="decimal" placeholder="Betrag €" className="input h-8 w-24 text-sm" required /> : null}
                        <button className="btn-ghost h-8 text-xs">Gutgeschrieben</button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
