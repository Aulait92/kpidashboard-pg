import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { OfferDocument, offerProducts, toOfferDoc } from "@/components/offer-document";
import { getCurrentSession } from "@/lib/auth";
import { getOfferByToken, markOfferViewed, offerAddOnsOf, offerSummaryInput } from "@/lib/offers";
import { zaehltAlsGeoeffnet } from "@/lib/offer-view";
import {
  abschlussBonusJetzt,
  addDaysIso,
  berlinTodayIso,
  normalizeTerm,
  offerAddOns,
  PRICE_LIST,
  setupForChoice,
  startDateBounds,
  TERM_OPTIONS,
  type OfferTerm,
} from "@/lib/offer-pricing";
import { AcceptForm, type OfferChoiceProps } from "./accept-form";
import { PayButton } from "./pay-button";
import { PayLater } from "./pay-later";
import { erinnerungsGrenzen, tagIso } from "@/lib/angebot-zahlungserinnerung";
import { billingEnabled, STRIPE_MIN_EUR } from "@/lib/billing";
import { CalendarClock, CheckCircle2, Clock } from "lucide-react";
import { entscheidungsCallStand } from "@/lib/vertrieb/entscheidungs-call-server";
import { entscheidungsCallText, type EntscheidungsCallText } from "@/lib/vertrieb/entscheidungs-call";
import { ueberweisungMoeglich } from "@/lib/ueberweisung";
import { nowMs } from "@/lib/now";

// Öffentliches Angebot per geheimem Link. ?print=1 liefert die reine
// Druckansicht (für das PDF).
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Ihr Angebot · performancegrowth",
  robots: { index: false, follow: false },
};


export default async function OfferPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ print?: string; zahlung?: string }>;
}) {
  const { token } = await params;
  const { print, zahlung } = await searchParams;
  const offer = await getOfferByToken(token);
  if (!offer) notFound();
  const doc = toOfferDoc(offer);

  // Druckansicht für das PDF: Deckblatt (randlos) und Inhalt (mit Rändern)
  // werden getrennt gerendert und im PDF-Endpunkt zusammengefügt.
  if (print === "cover" || print === "body") {
    return (
      <main className="bg-white">
        <style>{`
          @page { size: A4; margin: ${print === "cover" ? "0" : "16mm 18mm 20mm"}; }
          html, body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .offer-doc { max-width: none !important; }
          .offer-doc table { table-layout: fixed; }
          .offer-doc td, .offer-doc th { overflow-wrap: anywhere; }
        `}</style>
        <OfferDocument offer={doc} part={print} />
      </main>
    );
  }

  // Als „geöffnet“ zählt nur der Interessent: nicht eingeloggte Admins oder Vermittler, nicht Link-Vorschauen
  // und Scanner (lib/offer-view.ts, Ole 18.11.2026).
  const session = await getCurrentSession().catch(() => null);
  const ua = (await headers().catch(() => null))?.get("user-agent") ?? null;
  if (zaehltAlsGeoeffnet({ sessionRole: session?.role ?? null, userAgent: ua })) await markOfferViewed(offer.id);

  const expired = offer.validUntil.getTime() < nowMs();
  const canAccept = (offer.status === "draft" || offer.status === "sent") && !expired && offer.termsUrl && offer.dpaUrl;
  // Abschlussbonus (Ole, 16.11.2026): nur echte Angebote mit Online-Zahlung, solange die Frist läuft
  const bonus = !offer.isTest && billingEnabled() ? abschlussBonusJetzt(offer, new Date(nowMs())) : null;
  // Entscheidungs-Call (Ole, 17.11.2026), geprüft beim Aufruf: schon gebucht → Termin mit Link zum Verschieben,
  // sonst Buchungslink. Nach der Annahme nur noch ein gebuchter Termin, kein Buchungslink mehr.
  const call = offer.salesContactId && offer.status !== "superseded" && !offer.ohneEntscheidungsCall ? await entscheidungsCallStand(offer.salesContactId, new Date(nowMs())).catch(() => null) : null;
  const callText = call && (offer.status !== "accepted" || call.art === "gebucht") ? entscheidungsCallText(call) : null;

  return (
    <main className="min-h-screen bg-[#eef2f8] px-3 py-6 sm:px-4 sm:py-12">
      <div className="mx-auto max-w-[920px]">
        <div className="mb-4 flex justify-end">
          <a
            href={`/angebot/${token}/pdf`}
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm font-semibold shadow-[var(--shadow-sm)] hover:bg-[color:var(--surface-sunken)]"
          >
            <Download className="h-4 w-4" /> Als PDF herunterladen
          </a>
        </div>
        {offer.status === "accepted" && offer.isTest ? (
          <div className="mx-auto mb-6 flex max-w-[880px] items-start gap-3 rounded-[20px] border border-emerald-200 bg-emerald-50 px-6 py-5 text-emerald-900 sm:px-10" data-testangebot-angenommen>
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <div className="font-semibold">Testangebot angenommen</div>
              <p className="mt-1 text-sm">Ohne Zahlung. Sie bekommen gleich eine E-Mail mit Ihrem Zugang und können direkt mit der Einrichtung beginnen.</p>
            </div>
          </div>
        ) : offer.status === "accepted" ? (
          <PaymentBox
            token={token}
            status={offer.paymentStatus}
            returned={zahlung ?? null}
            enabled={billingEnabled()}
            payLater={payLaterProps(offer)}
            bonus={bonus}
            ueberweisungTage={ueberweisungMoeglich(offer) ? offer.bankTransferDays : null}
            ueberweisung={offer.zahlweise === "ueberweisung" ? { iban: offer.ueberweisungIban, tage: offer.bankTransferDays } : null}
            rechnung={Number(offer.setupFee) - Number(offer.abschlussBonusGewaehrt ?? 0) >= STRIPE_MIN_EUR}
          />
        ) : null}
        <OfferDocument offer={doc} collapseAgb />
        {callText ? <EntscheidungsCallBox text={callText} /> : null}
        {offer.status === "accepted" ? null : (
          <div id="annehmen" className="mx-auto mt-6 max-w-[880px] scroll-mt-4 rounded-[20px] border border-[#e5e7eb] bg-white px-6 py-8 sm:px-12">
            <section>
              <h2 className="text-lg font-bold">Angebot annehmen</h2>
              {offer.status === "superseded" ? (
                <p className="mt-2 text-sm text-[color:var(--muted)]">
                  Dieses Angebot wurde durch eine neuere Version ersetzt. Bitte nutzen Sie den Link aus der letzten E-Mail.
                </p>
              ) : expired ? (
                <p className="mt-2 text-sm text-[color:var(--muted)]">
                  Dieses Angebot ist abgelaufen. Melden Sie sich gern, wir schicken Ihnen ein aktuelles.
                </p>
              ) : canAccept ? (
                <div className="mt-4">
                  {bonus ? <BonusHinweis bonus={bonus} spaeter={offer.allowPayLater} /> : null}
                  <AcceptForm
                    token={token}
                    termsUrl={offer.termsUrl!}
                    dpaUrl={offer.dpaUrl!}
                    defaultName={offer.contactName}
                    defaultCompany={offer.company ?? ""}
                    pricing={offerSummaryInput(offer)}
                    choice={choiceProps(offer)}
                    payment={billingEnabled() && !offer.isTest && !offer.allowPayLater}
                    payLater={billingEnabled() && !!payLaterProps(offer)}
                    ueberweisungTage={ueberweisungMoeglich(offer) ? offer.bankTransferDays : null}
                  />
                </div>
              ) : (
                <p className="mt-2 text-sm text-[color:var(--muted)]">
                  Bitte bestätigen Sie das Angebot kurz per E-Mail oder im Gespräch, wir schalten die Online-Annahme in
                  Kürze frei.
                </p>
              )}
            </section>
          </div>
        )}
        {canAccept && offer.status !== "accepted" ? (
          // Immer sichtbar: direkt zur Annahme springen (die Seite ist lang).
          <>
            <div className="h-20" />
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#e5e7eb] bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur">
              <div className="mx-auto flex max-w-[880px] items-center justify-between gap-3">
                <span className="hidden text-sm text-[#374151] sm:block">
                  {bonus ? `Abschlussbonus: ${eurBonus(bonus.betrag)} weniger Setup ${fristText(bonus.bis)}` : "Alles klar? Dann hier annehmen."}
                </span>
                <a
                  href="#annehmen"
                  className="inline-flex h-12 w-full items-center justify-center rounded-[var(--radius-md)] bg-[color:var(--brand)] px-6 text-[15px] font-semibold text-white hover:bg-[color:var(--brand-dark)] sm:w-auto"
                >
                  Angebot annehmen
                </a>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}

const TERM_CHOICE_LABEL: Record<OfferTerm, string> = { "12m": "12 Monate", "3m": "3 Monate", none: "Ohne Laufzeit" };

/** Vorberechnete Wahl für die Angebotsseite (null = feste Konditionen wie bisher). */
function choiceProps(offer: NonNullable<Awaited<ReturnType<typeof getOfferByToken>>>): OfferChoiceProps | null {
  if (!offer.customerChoosesTerm && !offer.customerChoosesStart && !offer.annualChoice) return null;
  const count = offerProducts(offer.products).length || 1;
  const fixedTerm = normalizeTerm(offer.term);
  const add = offerAddOns(offerAddOnsOf(offer));
  // Empfehlungsrabatt gilt für jede Laufzeit (Listenpreis durchgestrichen)
  const discount = offer.setupDiscount == null ? null : Number(offer.setupDiscount);
  const fixedList = offer.setupListFee == null ? null : Number(offer.setupListFee);
  return {
    choosesTerm: offer.customerChoosesTerm,
    choosesStart: offer.customerChoosesStart,
    initialTerm: fixedTerm,
    options: (offer.customerChoosesTerm ? TERM_OPTIONS : [fixedTerm]).map((t) => ({
      term: t,
      label: TERM_CHOICE_LABEL[t],
      setup: offer.customerChoosesTerm ? setupForChoice(t, count, discount) : Number(offer.setupFee),
      list: discount ? (offer.customerChoosesTerm ? setupForChoice(t, count) : fixedList) : null,
    })),
    monthlyTotal: add.monthlyTotal,
    annualOffered: offer.annualPrepay || offer.annualChoice,
    // „Jahreszahlung anbieten“: Kunde wählt monatlich oder jährlich (Vorauswahl monatlich, Ole 18.11.2026)
    choosesAnnual: offer.annualChoice,
    initialAnnual: offer.annualPrepay,
    freeMonths: offer.annualFreeMonths ?? PRICE_LIST.annualFreeMonths,
    start: startDateBounds(berlinTodayIso(new Date(nowMs())), offer.startDate ? offer.startDate.toISOString().slice(0, 10) : null),
  };
}

/** Kasten zum Entscheidungs-Call: gebuchter Termin (Link zum Verschieben) bzw. Buchungslink. */
function EntscheidungsCallBox({ text }: { text: EntscheidungsCallText }) {
  return (
    <div className="mx-auto mt-6 flex max-w-[880px] items-start gap-3 rounded-[20px] border border-[#e5e7eb] bg-white px-6 py-5 sm:px-12" data-entscheidungs-call>
      <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--brand)]" />
      <div className="min-w-0 text-sm text-[#374151]">
        <div className="font-semibold text-[#0b1220]">Ihr Entscheidungs-Call</div>
        <p className="mt-1">
          {text.satz}{" "}
          {text.url ? (
            <a href={text.url} className="font-semibold text-[color:var(--brand)] underline">
              {text.linkLabel}
            </a>
          ) : null}
        </p>
      </div>
    </div>
  );
}

/** „Ich zahle später“ nur, wenn Ole es am Angebot erlaubt hat und der Start nicht zu nah ist. */
function payLaterProps(offer: NonNullable<Awaited<ReturnType<typeof getOfferByToken>>>) {
  if (!offer.allowPayLater || offer.isTest) return null;
  const bounds = erinnerungsGrenzen(berlinTodayIso(new Date(nowMs())), tagIso(offer.startDate));
  return bounds ? { ...bounds, current: tagIso(offer.paymentReminderAt) } : null;
}

const eurBonus = (n: number) => `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n)} €`;
const TAG_FMT = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "long" });

/** „heute bis 23:59 Uhr“, „morgen bis 23:59 Uhr“ oder „bis Dienstag, 17. November, 23:59 Uhr“. */
function fristText(bis: Date): string {
  const tag = berlinTodayIso(bis);
  const heute = berlinTodayIso(new Date(nowMs()));
  if (tag === heute) return "heute bis 23:59 Uhr";
  if (tag === addDaysIso(heute, 1)) return "morgen bis 23:59 Uhr";
  return `bis ${TAG_FMT.format(bis)}, 23:59 Uhr`;
}

/** Hinweis zum Abschlussbonus über der Annahme bzw. der Zahlung. Keine Gedankenstriche (Text an Kunden). */
function BonusHinweis({ bonus, zahlung = false, spaeter = false }: { bonus: { betrag: number; bis: Date; gesichert: boolean }; zahlung?: boolean; spaeter?: boolean }) {
  const text = bonus.gesichert
    ? "Ihr Bonus ist gesichert und wird bei der Zahlung abgezogen, auch wenn Sie später zahlen."
    : zahlung
      ? `Zahlen Sie das Setup ${fristText(bonus.bis)}, dann ist der Bonus schon abgezogen. Ihren Start wählen Sie trotzdem frei.`
      : spaeter
        ? `Wenn Sie ${fristText(bonus.bis)} annehmen. Bezahlen können Sie auch später, der Bonus bleibt. Ihren Start wählen Sie trotzdem frei.`
        : `Wenn Sie ${fristText(bonus.bis)} annehmen und das Setup bezahlen. Ihren Start wählen Sie trotzdem frei.`;
  return (
    <div className="mb-4 rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900" data-abschlussbonus>
      <div className="font-semibold">Abschlussbonus: {eurBonus(bonus.betrag)} weniger Setup</div>
      <p className="mt-0.5 text-sm">{text}</p>
    </div>
  );
}

function PaymentBox({
  token,
  status,
  returned,
  enabled,
  payLater,
  bonus,
  rechnung,
  ueberweisungTage = null,
  ueberweisung = null,
}: {
  token: string;
  status: string;
  returned: string | null;
  enabled: boolean;
  payLater: { min: string; max: string | null; current: string | null } | null;
  bonus: { betrag: number; bis: Date; gesichert: boolean } | null;
  /** Setup-Rechnung entsteht nur, wenn nach Rabatt und Bonus etwas zu zahlen war. */
  rechnung: boolean;
  /** Überweisung am Angebot freigegeben: Zahlungsziel in Tagen (dritte Zahlart) */
  ueberweisungTage?: number | null;
  /** Kunde hat „Per Überweisung zahlen“ gewählt: virtuelle IBAN und Zahlungsziel */
  ueberweisung?: { iban: string | null; tage: number } | null;
}) {
  const box = "mx-auto mb-6 max-w-[880px] rounded-[20px] border px-6 py-5 sm:px-10";
  if (ueberweisung && status !== "paid") {
    return (
      <div className={`${box} flex items-start gap-3 border-sky-200 bg-sky-50 text-sky-900`} data-ueberweisung-bestaetigt>
        <Clock className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <div className="font-semibold">Vielen Dank! Ihre Rechnung kommt per E-Mail.</div>
          <p className="mt-1 text-sm">
            {rechnung
              ? `Bitte überweisen Sie das Setup innerhalb von ${ueberweisung.tage} Tagen. Die laufende Vergütung bekommen Sie ab dem Start ebenfalls als Rechnung.`
              : "Die laufende Vergütung bekommen Sie ab dem Start als Rechnung."}{" "}
            Ihren Zugang zur Einrichtung erhalten Sie gleich per E-Mail.
          </p>
          {ueberweisung.iban ? (
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-sky-800">IBAN</dt>
              <dd className="font-mono font-semibold tabular-nums">{ueberweisung.iban.replace(/(.{4})/g, "$1 ").trim()}</dd>
              <dt className="text-sky-800">Verwendungszweck</dt>
              <dd>Rechnungsnummer (steht auf der Rechnung)</dd>
            </dl>
          ) : null}
        </div>
      </div>
    );
  }
  if (status === "paid") {
    return (
      <div className={`${box} flex items-start gap-3 border-emerald-200 bg-emerald-50 text-emerald-900`}>
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <div className="font-semibold">Zahlung erhalten, vielen Dank!</div>
          <p className="mt-1 text-sm">
            Sie bekommen gleich eine E-Mail mit Ihrem Zugang. Die Einrichtung dauert ca. 20 bis 30 Minuten, Sie können
            jederzeit unterbrechen; auf Wunsch helfen wir Ihnen in einem 15-Minuten-Termin.{rechnung ? " Ihre Rechnung kommt per E-Mail." : ""}
          </p>
        </div>
      </div>
    );
  }
  if (status === "processing" || returned === "ok") {
    return (
      <div className={`${box} flex items-start gap-3 border-sky-200 bg-sky-50 text-sky-900`}>
        <Clock className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <div className="font-semibold">Zahlung eingerichtet. Vielen Dank!</div>
          <p className="mt-1 text-sm">
            Sie bekommen gleich eine E-Mail mit Ihrem Zugang und können direkt mit der Einrichtung (ca. 20 bis 30 Minuten,
            jederzeit unterbrechbar) beginnen. Bei SEPA-Lastschrift dauert die Bestätigung der Bank ein paar Tage.
          </p>
        </div>
      </div>
    );
  }
  if (!enabled) return null;
  return (
    <div id="zahlung" className={`${box} scroll-mt-4 border-[#e5e7eb] bg-white`}>
      <div className="font-semibold">
        {returned === "abgebrochen" ? "Die Zahlung wurde nicht abgeschlossen." : "Angebot angenommen. Es fehlt nur noch die Zahlung."}
      </div>
      <p className="mb-4 mt-1 text-sm text-[color:var(--muted)]">
        Richten Sie jetzt die Zahlung ein. Fällig ist jetzt nur das Setup; die laufende Vergütung (monatlich bzw. bei Jahreszahlung jährlich) wird ab dem Startdatum automatisch eingezogen. Die Zahlung läuft sicher über Stripe.
      </p>
      {bonus ? <BonusHinweis bonus={bonus} zahlung /> : null}
      <PayButton token={token} ueberweisungTage={ueberweisungTage} />
      {payLater ? <PayLater token={token} {...payLater} /> : null}
    </div>
  );
}
