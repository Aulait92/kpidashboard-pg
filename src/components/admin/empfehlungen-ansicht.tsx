import Link from "next/link";
import { Badge } from "@/components/ui";
import { adminReferralOverview, backfillReferralDiscounts } from "@/lib/kollegen";
import { REWARD_STATUS_LABEL, STAGE_LABEL, type ReferralStage } from "@/lib/kollegen-shared";
import { applyReferralDiscountsAction, markRewardDoneAction } from "@/app/admin/marketing/empfehlungen/actions";

// „Kollegen empfehlen“: Kennzahlen, offene Angebote ohne Empfehlungsrabatt, Top-Empfehler, alle Empfehlungen mit Prämie.
// Gemeinsam für /admin/marketing/empfehlungen und /admin/neu/marketing/empfehlungen.

const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const date = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "2-digit" }).format(d);
const TONE: Record<ReferralStage, "neutral" | "brand" | "success" | "info"> = { eingegangen: "neutral", termin: "info", kunde: "brand", praemie: "success", abgelehnt: "neutral" };

export async function EmpfehlungenAnsicht({
  funktionen = {},
  leer,
}: {
  funktionen?: Partial<Record<"kennzahlen" | "rabatt" | "top" | "liste" | "praemie", string>>;
  /** Statt Nullkacheln und leerer Tabellen, solange es keine Empfehlung gibt (leerer Zustand mit nächster Handlung) */
  leer?: React.ReactNode;
}) {
  const { list, top, totals } = await adminReferralOverview();
  // Trockenlauf: offene Angebote an Empfohlene ohne Empfehlungsrabatt (Knopf übernimmt)
  const backfill = await backfillReferralDiscounts({ apply: false });
  const toApply = backfill.filter((r) => r.skip == null);
  if (leer && list.length === 0 && backfill.length === 0) return <>{leer}</>;
  return (
    <div className="space-y-6">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5" data-funktion={funktionen.kennzahlen}>
      {[
        { l: "Empfehlungen", v: String(totals.referrals) },
        { l: "Kunden geworden", v: String(totals.won) },
        { l: "Neuer Monatsumsatz", v: eur(totals.newMrr) },
        { l: "Prämien gutgeschrieben", v: eur(totals.rewards) },
        { l: "Setup-Rabatte (Minderung)", v: eur(totals.setupDiscounts) },
      ].map((k) => (
        <div key={k.l} className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4">
          <div className="text-sm text-[color:var(--muted)]">{k.l}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{k.v}</div>
        </div>
      ))}
    </div>
    {totals.openManual ? (
      <p className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {totals.openManual} Prämie{totals.openManual === 1 ? "" : "n"} von Hand gutschreiben (siehe unten, danach „Gutgeschrieben“ klicken).
      </p>
    ) : null}

    {backfill.length ? (
      <section className="card overflow-x-auto" data-admin-rabatt-nachziehen data-funktion={funktionen.rabatt}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border)] px-4 py-3">
          <h2 className="font-medium">Offene Angebote an Empfohlene ohne Empfehlungsrabatt</h2>
          {toApply.length ? (
            <form action={applyReferralDiscountsAction}>
              <button className="btn-primary h-9 text-sm">Rabatt in {toApply.length} Angebot{toApply.length === 1 ? "" : "e"} übernehmen</button>
            </form>
          ) : null}
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-[color:var(--muted)]">
            <tr>
              <th className="px-4 py-2">Angebot</th>
              <th className="px-4 py-2">Kontakt</th>
              <th className="px-4 py-2 text-right">Setup bisher</th>
              <th className="px-4 py-2 text-right">Setup neu</th>
              <th className="px-4 py-2">Hinweis</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--border)]">
            {backfill.map((r) => (
              <tr key={r.offerId}>
                <td className="px-4 py-2 tabular-nums">{r.number}</td>
                <td className="px-4 py-2">
                  <Link href={`/admin/neu/vertrieb/kontakte/${r.contactId}`} className="hover:underline">
                    {r.company}
                  </Link>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{eur(r.oldSetup)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.newSetup != null ? eur(r.newSetup) : "unverändert"}</td>
                <td className="px-4 py-2 text-[color:var(--muted)]">{r.skip ?? `${r.label}: ${eur(r.discount ?? 0)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    ) : null}

    <section className="card overflow-x-auto" data-funktion={funktionen.top}>
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
                  <Link href={`/admin/neu/kunden/${t.id}`} className="font-medium hover:underline">
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

    <section className="card overflow-x-auto" data-funktion={funktionen.liste}>
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
                    <Link href={`/admin/neu/vertrieb/kontakte/${r.contactId}`} className="font-medium hover:underline">
                      {r.name ?? "(gelöscht)"}
                    </Link>
                  ) : (
                    <span className="font-medium">{r.name ?? "(gelöscht)"}</span>
                  )}
                  {r.company ? <span className="text-[color:var(--muted)]"> · {r.company}</span> : null}
                  {r.existingContact && r.status !== "blocked" ? <span className="block text-xs text-amber-700">war schon im CRM</span> : null}
                  {r.status === "blocked" ? <span className="block text-sm text-[color:var(--muted)]">{r.blockedReason}</span> : null}
                </td>
                <td className="px-4 py-2">
                  <Link href={`/admin/neu/kunden/${r.referrer.id}`} className="hover:underline">
                    {r.referrer.name}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  <Badge tone={TONE[r.stage]}>{STAGE_LABEL[r.stage]}</Badge>
                  {r.newMonthly ? <span className="block text-sm text-[color:var(--muted)]">{eur(r.newMonthly)}/Monat</span> : null}
                </td>
                <td className="px-4 py-2">
                  <span>{REWARD_STATUS_LABEL[r.rewardStatus] ?? r.rewardStatus}</span>
                  {r.rewardAmount != null ? <span className="tabular-nums"> · {eur(r.rewardAmount)}</span> : null}
                  {r.rewardNote ? <span className="block text-sm text-[color:var(--muted)]">{r.rewardNote}</span> : null}
                  {r.rewardStatus === "manual" ? (
                    <form action={markRewardDoneAction} className="mt-1 flex items-center gap-2" data-funktion={funktionen.praemie}>
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
