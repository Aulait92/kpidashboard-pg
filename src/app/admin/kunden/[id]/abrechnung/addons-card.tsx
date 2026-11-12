import { Card, CardHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { annualMultiplier, PRICE_LIST } from "@/lib/offer-pricing";
import { bestandQuota } from "@/lib/bestand/quota";
import { billingIntervalAction, bestandModuleAction, empfehlungModuleAction, saveQuotaAction, saveSeatsAction, syncSeatsAction } from "./addon-actions";
import { moduleState } from "@/lib/empfehlung/shared";

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const fmt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const input = "h-9 w-24 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm tabular-nums";
const btn = "h-9 rounded-[var(--radius-sm)] px-3 text-sm font-semibold";
const primary = `${btn} bg-[color:var(--brand)] text-white`;
const secondary = `${btn} border border-[color:var(--border)] bg-white`;

/** Logins, Bestandskunden-Modul (inkl. Kontingent) und Zahlweise – mit Stripe-Abgleich. */
export async function AddOnsCard({ customerId, message, failed }: { customerId: string; message: string | null; failed: boolean }) {
  const [c, logins, quota] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        plan: true,
        retainerMonthly: true,
        seatsIncluded: true,
        seatMonthly: true,
        seatsBilled: true,
        billingInterval: true,
        bestandMonthly: true,
        bestandGrandfathered: true,
        bestandRequestedAt: true,
        bestandCancelAt: true,
        bestandMessageQuota: true,
        existingCustomersEnabled: true,
        empfehlungEnabled: true,
        empfehlungMonthly: true,
        empfehlungTrialEndsAt: true,
        empfehlungFree: true,
        empfehlungCancelAt: true,
        empfehlungSince: true,
      },
    }),
    prisma.user.count({ where: { customerId, role: "BUYER" } }),
    bestandQuota(customerId),
  ]);
  if (!c) return null;
  const seatPrice = c.seatMonthly != null ? Number(c.seatMonthly) : null;
  const bestandFee = c.bestandMonthly != null ? Number(c.bestandMonthly) : 0;
  const base = c.retainerMonthly != null ? Number(c.retainerMonthly) : null;
  const empfehlungFee = c.empfehlungMonthly != null ? Number(c.empfehlungMonthly) : 0;
  const empfState = moduleState(c);
  const total = base != null ? base + c.seatsBilled * (seatPrice ?? 0) + bestandFee + empfehlungFee : null;
  const annual = c.billingInterval === "year";
  const hidden = <input type="hidden" name="customerId" value={customerId} />;

  return (
    <Card>
      <CardHeader title="Logins, Module und Zahlweise" />
      <div className="space-y-5 px-5 pb-5 pt-4 text-sm" data-admin-addons>
        {message ? (
          <p className={`rounded-[var(--radius-sm)] px-3 py-2 font-medium ${failed ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-900"}`}>{message}</p>
        ) : null}

        <section className="space-y-2">
          <h3 className="font-semibold">Logins</h3>
          <p className="text-[color:var(--muted)]">
            {logins} Logins genutzt
            {c.seatsIncluded != null ? ` · ${c.seatsIncluded} inklusive · ${c.seatsBilled} berechnet` : " · keine Platz-Abrechnung vereinbart (Altvertrag)"}
            {seatPrice != null ? (seatPrice > 0 ? ` à ${eur(seatPrice)}/Monat` : " · Preis individuell (nicht automatisch)") : ""}
          </p>
          <form action={saveSeatsAction} className="flex flex-wrap items-end gap-2">
            {hidden}
            <label className="grid gap-1 text-xs text-[color:var(--muted)]">
              Inklusive
              <input name="seatsIncluded" type="number" min={1} max={100} defaultValue={c.seatsIncluded ?? PRICE_LIST.seatsIncluded} className={input} />
            </label>
            <label className="grid gap-1 text-xs text-[color:var(--muted)]">
              € je weiterem Login
              <input name="seatMonthly" inputMode="decimal" defaultValue={String(seatPrice ?? PRICE_LIST.seatMonthly).replace(".", ",")} className={input} />
            </label>
            <button className={primary}>Speichern und abgleichen</button>
          </form>
          {c.seatsIncluded != null ? (
            <form action={syncSeatsAction}>
              {hidden}
              <button className={secondary}>Nur abgleichen</button>
            </form>
          ) : null}
        </section>

        <section className="space-y-2 border-t border-[color:var(--border)] pt-4">
          <h3 className="font-semibold">Bestandskunden-Modul</h3>
          <p className="text-[color:var(--muted)]" data-admin-bestand-status>
            {c.existingCustomersEnabled
              ? bestandFee
                ? `Gebucht, ${eur(bestandFee)}/Monat`
                : c.bestandGrandfathered
                  ? "Frei (Bestandsschutz, ohne Aufpreis)"
                  : "Freigeschaltet ohne Preis"
              : "Nicht gebucht"}
            {c.bestandRequestedAt && !c.existingCustomersEnabled ? ` · vom Kunden angefragt am ${fmt(c.bestandRequestedAt)}` : ""}
            {c.bestandCancelAt ? ` · vom Kunden gekündigt zum ${fmt(c.bestandCancelAt)} (Stripe-Position entfernt, Zugang bis dahin)` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            {!bestandFee ? (
              <form action={bestandModuleAction}>
                {hidden}
                <input type="hidden" name="mode" value="book" />
                <button className={primary}>Buchen ({eur(PRICE_LIST.bestandModuleMonthly)}/Monat)</button>
              </form>
            ) : null}
            {!c.existingCustomersEnabled || bestandFee ? (
              <form action={bestandModuleAction}>
                {hidden}
                <input type="hidden" name="mode" value="free" />
                <button className={secondary}>Kostenlos freischalten</button>
              </form>
            ) : null}
            {c.existingCustomersEnabled ? (
              <form action={bestandModuleAction}>
                {hidden}
                <input type="hidden" name="mode" value="cancel" />
                <button className={secondary}>Abbestellen / sperren</button>
              </form>
            ) : null}
          </div>
          <form action={saveQuotaAction} className="flex flex-wrap items-end gap-2">
            {hidden}
            <label className="grid gap-1 text-xs text-[color:var(--muted)]">
              Kampagnen-Nachrichten je Monat
              <input name="quota" type="number" min={0} max={100000} placeholder={String(PRICE_LIST.bestandIncludedMessages)} defaultValue={c.bestandMessageQuota ?? ""} className={input} />
            </label>
            <button className={secondary}>Kontingent speichern</button>
            <span className="pb-2 text-xs text-[color:var(--muted)]">
              Diesen Monat {quota.used} von {quota.limit} verschickt. Leer = Standard ({PRICE_LIST.bestandIncludedMessages}).
            </span>
          </form>
        </section>

        <section className="space-y-2 border-t border-[color:var(--border)] pt-4">
          <h3 className="font-semibold">Empfehlungen &amp; Bewertungen</h3>
          <p className="text-[color:var(--muted)]" data-admin-empfehlung-status>
            {empfState === "inactive"
              ? "Nicht gebucht"
              : empfState === "trial"
                ? `Testphase bis ${fmt(c.empfehlungTrialEndsAt!)}, danach ${eur(PRICE_LIST.empfehlungModuleMonthly)}/Monat automatisch`
                : empfState === "free"
                  ? "Frei (ohne Aufpreis)"
                  : empfehlungFee
                    ? `Gebucht, ${eur(empfehlungFee)}/Monat`
                    : "Freigeschaltet ohne Preis"}
            {c.empfehlungCancelAt ? ` · gekündigt zum ${fmt(c.empfehlungCancelAt)}` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            {!empfehlungFee ? (
              <form action={empfehlungModuleAction}>
                {hidden}
                <input type="hidden" name="mode" value="book" />
                <button className={primary}>Buchen ({eur(PRICE_LIST.empfehlungModuleMonthly)}/Monat, sofort)</button>
              </form>
            ) : null}
            {!c.empfehlungFree ? (
              <form action={empfehlungModuleAction}>
                {hidden}
                <input type="hidden" name="mode" value="free" />
                <button className={secondary}>Kostenlos freischalten</button>
              </form>
            ) : null}
            {c.empfehlungEnabled ? (
              <form action={empfehlungModuleAction}>
                {hidden}
                <input type="hidden" name="mode" value="cancel" />
                <button className={secondary}>Abbestellen / sperren (sofort)</button>
              </form>
            ) : null}
          </div>
        </section>

        <section className="space-y-2 border-t border-[color:var(--border)] pt-4">
          <h3 className="font-semibold">Zahlweise</h3>
          <p className="text-[color:var(--muted)]" data-admin-interval>
            {annual ? "Jährlich im Voraus" : "Monatlich"}
            {total != null ? ` · ${eur(total)}/Monat gesamt${annual ? ` · ${eur(total * annualMultiplier())} im Jahr` : ""}` : ""}
          </p>
          <form action={billingIntervalAction} className="flex flex-wrap items-center gap-2">
            {hidden}
            <input type="hidden" name="interval" value={annual ? "month" : "year"} />
            <button className={secondary}>{annual ? "Auf monatlich umstellen" : `Auf jährlich umstellen (${PRICE_LIST.annualFreeMonths} Monate geschenkt)`}</button>
            <span className="text-xs text-[color:var(--muted)]">Stripe stellt sofort um und verrechnet anteilig.</span>
          </form>
        </section>
      </div>
    </Card>
  );
}
