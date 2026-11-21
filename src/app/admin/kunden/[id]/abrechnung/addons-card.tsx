import { Card, CardHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { freimonateBeiUmstellung, freimonateKunde, normalizeRhythmus, PRICE_LIST, RHYTHMUS_LABEL, rhythmusFaktor } from "@/lib/offer-pricing";
import { bestandQuota } from "@/lib/bestand/quota";
import { billingIntervalAction, bestandModuleAction, bestandSichtbarAction, empfehlungModuleAction, saveQuotaAction, saveSeatsAction, syncSeatsAction } from "./addon-actions";
import { moduleState } from "@/lib/empfehlung/shared";
import { BESTAND_MODULE_AVAILABLE } from "@/lib/bestand/sichtbar";
import { seatUsage } from "@/lib/seats-server";

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const fmt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const input = "h-9 w-24 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm tabular-nums";
const btn = "h-10 sm:h-9 rounded-[var(--radius-sm)] px-3 text-sm font-semibold";
const secondary = `${btn} border border-[color:var(--border)] bg-white`;

export type AddOnTeil = "verkaeufer" | "bestand" | "empfehlung" | "zahlweise";
const ALLE_TEILE: AddOnTeil[] = ["verkaeufer", "bestand", "empfehlung", "zahlweise"];

/**
 * Verkäufer-Plätze, Bestandskunden-Modul (inkl. Kontingent) und Zahlweise – mit Stripe-Abgleich.
 * `teile`/`titel`: der neue Admin (Kundenakte › Abrechnung) zeigt die Abschnitte getrennt (Zahlweise im Fenster „Vertrag
 * ändern“, Module und Verkäufer zugeklappt); ohne Angabe wie bisher alles in einer Karte.
 */
export async function AddOnsCard({
  customerId,
  message,
  failed,
  teile = ALLE_TEILE,
  titel = "Verkäufer, Module und Zahlweise",
}: {
  customerId: string;
  message: string | null;
  failed: boolean;
  teile?: AddOnTeil[];
  titel?: string;
}) {
  const zeigt = (t: AddOnTeil) => teile.includes(t);
  // Trennlinie nur zwischen sichtbaren Abschnitten
  const trenner = (t: AddOnTeil) => (teile.indexOf(t) > 0 ? "border-t border-[color:var(--border)] pt-4" : "");
  const [c, usage, quota, packHistory] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        plan: true,
        retainerMonthly: true,
        seatsIncluded: true,
        seatMonthly: true,
        seatsBilled: true,
        billingInterval: true,
        prepayFreeMonths: true,
        bestandMonthly: true,
        bestandGrandfathered: true,
        bestandRequestedAt: true,
        bestandCancelAt: true,
        bestandMessageQuota: true,
        existingCustomersEnabled: true,
        bestandSichtbar: true,
        empfehlungEnabled: true,
        empfehlungMonthly: true,
        empfehlungTrialEndsAt: true,
        empfehlungFree: true,
        empfehlungCancelAt: true,
        empfehlungSince: true,
        onboarding: { select: { offerId: true } },
      },
    }),
    seatUsage(customerId),
    bestandQuota(customerId),
    prisma.bestandMessagePack.findMany({ where: { customerId }, orderBy: { purchasedAt: "desc" }, take: 6 }),
  ]);
  if (!c) return null;
  const seatPrice = c.seatMonthly != null ? Number(c.seatMonthly) : null;
  const bestandFee = c.bestandMonthly != null ? Number(c.bestandMonthly) : 0;
  const base = c.retainerMonthly != null ? Number(c.retainerMonthly) : null;
  const empfehlungFee = c.empfehlungMonthly != null ? Number(c.empfehlungMonthly) : 0;
  const empfState = moduleState(c);
  const total = base != null ? base + c.seatsBilled * (seatPrice ?? 0) + bestandFee + empfehlungFee : null;
  // Vorauszahlung: jährlich oder 6 Monate im Voraus (Laufzeit 6 Monate, Ole 18.11.2026)
  const rhythmus = normalizeRhythmus(c.billingInterval);
  const annual = rhythmus !== "month";
  // Zahlweise vom Kunden im Angebot gewählt (Vorauszahlung angeboten, Ole 18.11.2026)
  const angebot = c.onboarding?.offerId
    ? await prisma.offer.findFirst({ where: { id: c.onboarding.offerId, status: "accepted" }, select: { number: true, annualChoice: true, annualPrepay: true, annualFreeMonths: true, term: true } })
    : null;
  // Umstellen auf Vorauszahlung: mit 6 Monaten Laufzeit 6 Monate im Voraus (1 geschenkt), sonst jährlich (3 geschenkt;
  // zurück auf die Vorauszahlung des Angebots: wie dort vereinbart)
  const halb = angebot?.term === "6m";
  const vorausZiel = halb ? "halfyear" : "year";
  const zielFrei = freimonateBeiUmstellung(angebot, vorausZiel) ?? 0;
  const gewaehlt = angebot?.annualPrepay ? (angebot.term === "6m" ? "6 Monate im Voraus" : "jährlich im Voraus") : "monatlich";
  const hidden = <input type="hidden" name="customerId" value={customerId} />;

  return (
    <Card>
      <CardHeader title={titel} />
      <div className="space-y-5 px-5 pb-5 pt-4 text-sm" data-admin-addons>
        {message ? (
          <p className={`rounded-[var(--radius-sm)] px-3 py-2 font-medium ${failed ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-900"}`}>{message}</p>
        ) : null}

        {zeigt("verkaeufer") ? (
        <section className={`space-y-2 ${trenner("verkaeufer")}`}>
          <h3 className="font-semibold">Aktive Verkäufer</h3>
          <p className="text-[color:var(--muted)]" data-admin-seats>
            {usage.active} aktiv (bekommen Leads oder heute Leads bekommen) · {usage.logins} Logins
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
              € je weiterem Verkäufer
              <input name="seatMonthly" inputMode="decimal" defaultValue={String(seatPrice ?? PRICE_LIST.seatMonthly).replace(".", ",")} className={input} />
            </label>
            <button className={secondary}>Speichern und abgleichen</button>
          </form>
          {c.seatsIncluded != null ? (
            <form action={syncSeatsAction}>
              {hidden}
              <button className={secondary}>Nur abgleichen</button>
            </form>
          ) : null}
        </section>

        ) : null}

        {zeigt("bestand") ? (
        <section className={`space-y-2 ${trenner("bestand")}`}>
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
                <button className={secondary}>Buchen ({eur(PRICE_LIST.bestandModuleMonthly)}/Monat)</button>
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
          {!BESTAND_MODULE_AVAILABLE ? (
            <form action={bestandSichtbarAction} className="flex flex-wrap items-center gap-2" data-admin-bestand-sichtbar>
              {hidden}
              <input type="hidden" name="on" value={c.bestandSichtbar ? "0" : "1"} />
              <span className="text-[color:var(--muted)]">
                Für Kunden vorerst ausgeblendet. {c.existingCustomersEnabled ? "Bei diesem Kunden aktiv, er sieht es." : c.bestandSichtbar ? "Dieser Kunde sieht es (Test)." : "Dieser Kunde sieht es nicht."}
              </span>
              <button className={secondary}>{c.bestandSichtbar ? "Wieder ausblenden" : "Für diesen Kunden einblenden"}</button>
            </form>
          ) : null}
          <form action={saveQuotaAction} className="flex flex-wrap items-end gap-2">
            {hidden}
            <label className="grid gap-1 text-xs text-[color:var(--muted)]">
              Kampagnen-Nachrichten je Monat
              <input name="quota" type="number" min={0} max={100000} placeholder={String(PRICE_LIST.bestandIncludedMessages)} defaultValue={c.bestandMessageQuota ?? ""} className={input} />
            </label>
            <button className={secondary}>Kontingent speichern</button>
            <span className="pb-2 text-xs text-[color:var(--muted)]">
              Diesen Monat {quota.sentThisMonth} verschickt ({quota.used} von {quota.limit} inklusive, {quota.packRemaining} aus Paketen frei). Leer = Standard ({PRICE_LIST.bestandIncludedMessages}).
            </span>
          </form>
          {packHistory.length ? (
            <div className="text-xs" data-admin-packs>
              <div className="font-medium">Zusatzpakete (vom Kunden gebucht, eigener Rechnungsposten)</div>
              <ul className="mt-1 space-y-0.5 text-[color:var(--muted)]">
                {packHistory.map((p) => (
                  <li key={p.id}>
                    {fmt(p.purchasedAt)}: +{p.messages} Nachrichten, {eur(Number(p.amount))} netto{p.source === "auto" ? " (automatisch)" : ""}, gültig bis {fmt(p.expiresAt)} · Stripe {p.stripeStatus}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        ) : null}

        {zeigt("empfehlung") ? (
        <section className={`space-y-2 ${trenner("empfehlung")}`}>
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
                <button className={secondary}>Buchen ({eur(PRICE_LIST.empfehlungModuleMonthly)}/Monat, sofort)</button>
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

        ) : null}

        {zeigt("zahlweise") ? (
        <section className={`space-y-2 ${trenner("zahlweise")}`}>
          <h3 className="font-semibold">Zahlweise</h3>
          <p className="text-[color:var(--muted)]" data-admin-interval>
            {RHYTHMUS_LABEL[rhythmus]}
            {total != null ? ` · ${eur(total)}/Monat gesamt${annual ? ` · ${eur(total * rhythmusFaktor(rhythmus, freimonateKunde(c, angebot)))} ${rhythmus === "halfyear" ? "je 6 Monate" : "im Jahr"}` : ""}` : ""}
          </p>
          {angebot?.annualChoice ? (
            <p className="text-xs text-[color:var(--muted)]" data-admin-zahlweise-gewaehlt>
              Im Angebot {angebot.number} vom Kunden gewählt: {gewaehlt}
              {annual !== angebot.annualPrepay ? ", seitdem umgestellt" : ""}.
            </p>
          ) : null}
          <form action={billingIntervalAction} className="flex flex-wrap items-center gap-2">
            {hidden}
            <input type="hidden" name="interval" value={annual ? "month" : vorausZiel} />
            <button className={secondary}>
              {annual
                ? "Auf monatlich umstellen"
                : halb
                  ? `Auf 6 Monate im Voraus umstellen (${zielFrei} ${zielFrei === 1 ? "Monat" : "Monate"} geschenkt)`
                  : `Auf jährlich umstellen (${zielFrei} ${zielFrei === 1 ? "Monat" : "Monate"} geschenkt)`}
            </button>
            <span className="text-xs text-[color:var(--muted)]">Stripe stellt sofort um und verrechnet anteilig.</span>
          </form>
        </section>
        ) : null}
      </div>
    </Card>
  );
}
