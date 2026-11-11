"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button, Card, CardHeader } from "@/components/ui";
import { createOfferAction } from "@/app/admin/vertrieb/offer-actions";
import type { OfferTarget } from "@/lib/offer-links";
import { computeOfferPrice, defaultStartDate, eur, PRICE_LIST, withVat, type OfferPackage, type OfferTerm, type OfferVermittler } from "@/lib/offer-pricing";

const PRODUCT_SUGGESTIONS = [
  "Privatschutz",
  "Tierkrankenversicherung",
  "Unfallversicherung",
  "Krankenhauszusatz",
  "Zahnzusatz",
  "Kindersparplan",
  "Berufsunfähigkeit",
  "Sterbegeld",
];

const input =
  "h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20";
const label = "text-xs font-medium text-[color:var(--muted)]";

const num = (v: string): number | null => {
  const n = Number(v.replace(",", "."));
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
};

export function OfferForm({
  target,
  backHref,
  initial,
}: {
  target: OfferTarget;
  backHref: string;
  initial: { contactName: string; company: string; email: string; product: string; street?: string; zip?: string; city?: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [contactName, setContactName] = useState(initial.contactName);
  const [company, setCompany] = useState(initial.company);
  const [email, setEmail] = useState(initial.email);
  const [street, setStreet] = useState(initial.street ?? "");
  const [zip, setZip] = useState(initial.zip ?? "");
  const [city, setCity] = useState(initial.city ?? "");
  const [products, setProducts] = useState([{ name: initial.product || "Privatschutz", daily: "30" }]);
  const [pkg, setPkg] = useState<OfferPackage>("software");
  const [term, setTerm] = useState<OfferTerm>("12m");
  const [setupOverride, setSetupOverride] = useState("");
  const [monthlyOverride, setMonthlyOverride] = useState("");
  const [introFee, setIntroFee] = useState("");
  const [introMonths, setIntroMonths] = useState("3");
  const [specialTerms, setSpecialTerms] = useState("");
  const [startDate, setStartDate] = useState(defaultStartDate());
  const [validDays, setValidDays] = useState("14");
  const [seats, setSeats] = useState(String(PRICE_LIST.seatsIncluded));
  const [annual, setAnnual] = useState(false);
  const [bestand, setBestand] = useState(false);
  const [vermittler, setVermittler] = useState<OfferVermittler>("vertreter");
  const [customerChoice, setCustomerChoice] = useState(true);

  const parsedProducts = products.map((p) => ({ name: p.name, dailyBudget: num(p.daily) ?? 0 }));
  // Berechnung ist billig – direkt pro Render statt useMemo.
  const price = computeOfferPrice({
    package: pkg,
    term,
    products: parsedProducts,
    setupOverride: num(setupOverride),
    monthlyOverride: num(monthlyOverride),
    seats: num(seats),
    annual: annual && term === "12m",
    bestandModule: bestand && pkg === "software",
  });
  const softwarePkg = pkg === "software";
  const annualPossible = term === "12m" && num(introFee) == null;

  function submit() {
    setError(null);
    start(async () => {
      const res = await createOfferAction(target, {
        contactName,
        company,
        email,
        street,
        zip,
        city,
        package: pkg,
        term,
        products: parsedProducts,
        setupOverride: num(setupOverride),
        monthlyOverride: num(monthlyOverride),
        introMonthlyFee: num(introFee),
        introMonths: num(introMonths),
        specialTerms,
        startDate: startDate || null,
        validDays: num(validDays) ?? 14,
        seats: softwarePkg ? num(seats) : null,
        annual: annual && annualPossible,
        bestandModule: bestand && softwarePkg,
        vermittlerTyp: vermittler,
        customerChoice,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`${backHref}#angebot`);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Empfänger" />
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            <Field l="Ansprechpartner *"><input className={input} value={contactName} onChange={(e) => setContactName(e.target.value)} /></Field>
            <Field l="Firma / Agentur"><input className={input} value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
            <Field l="E-Mail (für den Versand)"><input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field l="Straße und Hausnummer"><input className={input} value={street} onChange={(e) => setStreet(e.target.value)} /></Field>
            <Field l="PLZ"><input className={input} value={zip} onChange={(e) => setZip(e.target.value)} /></Field>
            <Field l="Ort"><input className={input} value={city} onChange={(e) => setCity(e.target.value)} /></Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Kunde ist …" hint="Makler: Vertrags-Garantie statt Break-even-Garantie" />
          <div className="grid grid-cols-2 gap-2 p-5" role="radiogroup" aria-label="Vertreter oder Makler">
            {(
              [
                ["vertreter", "Vertreter", "Abschlussprovision · Break-even-Garantie"],
                ["makler", "Makler", "Bestandscourtage · Vertrags-Garantie"],
              ] as const
            ).map(([k, t, s]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={vermittler === k}
                data-vermittler={k}
                onClick={() => setVermittler(k)}
                className={`min-w-0 rounded-[var(--radius-md)] border px-4 py-3 text-left text-sm transition ${vermittler === k ? "border-[color:var(--brand)] bg-[color:var(--brand-soft,#EFF6FF)] ring-2 ring-[color:var(--brand)]/20" : "border-[color:var(--border)] bg-white hover:border-[color:var(--border-strong)]"}`}
              >
                <div className="font-semibold">{t}</div>
                <div className="text-xs text-[color:var(--muted)]">{s}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Paket" />
          <div className="grid gap-2 p-5 sm:grid-cols-2">
            {(
              [
                ["software", "Betreuung + Software", "Leads, WhatsApp-Assistent, Terminbuchung, Pipeline"],
                ["service", "Nur Betreuung", `Leads per E-Mail + Kundenbereich · ${eur(PRICE_LIST.serviceOnlyMonthly)} / Monat · Pause 0 €`],
              ] as const
            ).map(([k, t, s]) => (
              <button
                key={k}
                type="button"
                onClick={() => setPkg(k)}
                className={`rounded-[var(--radius-md)] border px-4 py-3 text-left text-sm transition ${pkg === k ? "border-[color:var(--brand)] bg-[color:var(--brand-soft,#EFF6FF)] ring-2 ring-[color:var(--brand)]/20" : "border-[color:var(--border)] bg-white hover:border-[color:var(--border-strong)]"}`}
              >
                <div className="font-semibold">{t}</div>
                <div className="text-xs text-[color:var(--muted)]">{s}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Produkte und Werbebudget" hint="1. Produkt im Grundpaket, jedes weitere +990 € Setup / +350 € pro Monat" />
          <div className="space-y-3 p-5">
            <datalist id="offer-products">
              {PRODUCT_SUGGESTIONS.map((p) => <option key={p} value={p} />)}
            </datalist>
            {products.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_130px_auto] items-end gap-2">
                <Field l={i === 0 ? "Produkt" : `Weiteres Produkt ${i}`}>
                  <input className={input} list="offer-products" value={p.name} onChange={(e) => setProducts((ps) => ps.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                </Field>
                <Field l="Tagesbudget (€)">
                  <input className={input} inputMode="decimal" value={p.daily} onChange={(e) => setProducts((ps) => ps.map((x, j) => (j === i ? { ...x, daily: e.target.value } : x)))} />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label="Produkt entfernen"
                  disabled={products.length === 1}
                  onClick={() => setProducts((ps) => ps.filter((_, j) => j !== i))}
                  icon={Trash2}
                  className="h-10"
                />
              </div>
            ))}
            <Button type="button" variant="secondary" icon={Plus} onClick={() => setProducts((ps) => [...ps, { name: "", daily: "20" }])}>
              Produkt hinzufügen
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Laufzeit und Konditionen" />
          <div className="space-y-4 p-5">
            <div className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  ["12m", "12 Monate", `Setup ${eur(PRICE_LIST.setup12m)}`],
                  ["3m", "3 Monate", `Setup ${eur(PRICE_LIST.setup3m)}`],
                  ["none", "Ohne Laufzeit", `Setup ${eur(PRICE_LIST.setupNoTerm)}`],
                ] as const
              ).map(([k, t, s]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTerm(k)}
                  className={`rounded-[var(--radius-md)] border px-4 py-3 text-left text-sm transition ${term === k ? "border-[color:var(--brand)] bg-[color:var(--brand-soft,#EFF6FF)] ring-2 ring-[color:var(--brand)]/20" : "border-[color:var(--border)] bg-white hover:border-[color:var(--border-strong)]"}`}
                >
                  <div className="font-semibold">{t}</div>
                  <div className="text-xs text-[color:var(--muted)]">{s}</div>
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field l={`Setup abweichend (Liste: ${eur(price.listSetup)})`}>
                <input className={input} inputMode="decimal" placeholder="leer = Listenpreis" value={setupOverride} onChange={(e) => setSetupOverride(e.target.value)} />
              </Field>
              <Field l={`Monatlich abweichend (Liste: ${price.listMonthly == null ? "individuell" : eur(price.listMonthly)})`}>
                <input className={input} inputMode="decimal" placeholder={price.listMonthly == null ? "bitte eintragen" : "leer = Listenpreis"} value={monthlyOverride} onChange={(e) => setMonthlyOverride(e.target.value)} />
              </Field>
              <Field l="Startpreis pro Monat (optional, Rabatt zum Einstieg)">
                <input className={input} inputMode="decimal" placeholder="leer = kein Startpreis" value={introFee} onChange={(e) => setIntroFee(e.target.value)} />
              </Field>
              <Field l="Startpreis gilt für … Monate">
                <input
                  className={`${input} disabled:bg-[color:var(--surface-sunken)] disabled:text-[color:var(--muted)]`}
                  inputMode="numeric"
                  disabled={num(introFee) == null}
                  value={introMonths}
                  onChange={(e) => setIntroMonths(e.target.value)}
                />
              </Field>
              <Field l="Start * (ab dann läuft die Monatsgebühr)">
                <input className={input} type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </Field>
              <Field l="Angebot gültig (Tage)">
                <input className={input} inputMode="numeric" value={validDays} onChange={(e) => setValidDays(e.target.value)} />
              </Field>
            </div>
            <label className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-4 py-3 text-sm">
              <input
                type="checkbox"
                name="customerChoice"
                className="mt-0.5 h-4 w-4"
                checked={customerChoice}
                onChange={(e) => setCustomerChoice(e.target.checked)}
              />
              <span>
                <span className="block font-semibold">Kunde darf Laufzeit und Startdatum selbst wählen</span>
                <span className="block text-xs text-[color:var(--muted)]">
                  {num(setupOverride) != null || num(monthlyOverride) != null
                    ? "Mit Sonderpreis nur das Startdatum – die Laufzeit bleibt wie hier gewählt."
                    : "Ihre Auswahl hier ist der Vorschlag. Start frühestens in 7 Tagen, spätestens in 90 Tagen."}
                </span>
              </span>
            </label>
            <Field l="Sondervereinbarung (erscheint wörtlich im Angebot)">
              <textarea className={`${input} h-24 py-2`} value={specialTerms} onChange={(e) => setSpecialTerms(e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Logins, Zahlweise und Module" />
          <div className="space-y-4 p-5">
            {softwarePkg ? (
              <Field l={`Logins gesamt (Inhaber + Berater) · ${PRICE_LIST.seatsIncluded} inklusive, jeder weitere ${eur(PRICE_LIST.seatMonthly)} / Monat`}>
                <input className={input} inputMode="numeric" name="seats" value={seats} onChange={(e) => setSeats(e.target.value)} />
              </Field>
            ) : (
              <p className="text-sm text-[color:var(--muted)]">Logins: im Paket „Nur Betreuung“ ohne Platz-Abrechnung.</p>
            )}
            {price.seatsIndividual ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Ab {PRICE_LIST.seatIndividualFrom} Logins individuell: bitte oben „Monatlich abweichend“ eintragen (alle Logins inklusive).
              </p>
            ) : null}
            <label className={`flex items-start gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-sm ${annualPossible ? "border-[color:var(--border)] bg-white" : "border-[color:var(--border)] bg-[color:var(--surface-sunken)] text-[color:var(--muted)]"}`}>
              <input type="checkbox" name="annual" className="mt-0.5 h-4 w-4" disabled={!annualPossible} checked={annual && annualPossible} onChange={(e) => setAnnual(e.target.checked)} />
              <span>
                <span className="block font-semibold">Jährlich im Voraus zahlen: {PRICE_LIST.annualFreeMonths} Monate geschenkt</span>
                <span className="block text-xs text-[color:var(--muted)]">
                  {annualPossible ? `Jahresbetrag = ${12 - PRICE_LIST.annualFreeMonths} × Monatspreis inkl. Zusätze, fällig zum Start.` : "Nur mit 12 Monaten Laufzeit und ohne Startpreis."}
                </span>
              </span>
            </label>
            <label className={`flex items-start gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-sm ${softwarePkg ? "border-[color:var(--border)] bg-white" : "border-[color:var(--border)] bg-[color:var(--surface-sunken)] text-[color:var(--muted)]"}`}>
              <input
                type="checkbox"
                name="bestand"
                className="mt-0.5 h-4 w-4"
                disabled={!softwarePkg}
                checked={bestand && softwarePkg}
                onChange={(e) => setBestand(e.target.checked)}
              />
              <span>
                <span className="block font-semibold">
                  Bestandskunden-Modul · {eur(PRICE_LIST.bestandModuleMonthly)} / Monat
                </span>
                <span className="block text-xs text-[color:var(--muted)]">
                  Bestand importieren und per WhatsApp ansprechen, inkl. WhatsApp-Gebühren bis {PRICE_LIST.bestandIncludedMessages} Kampagnen-Nachrichten im Monat.
                </span>
              </span>
            </label>
          </div>
        </Card>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader title="Zusammenfassung" />
          <div className="space-y-3 p-5 text-sm">
            <Sum k="Werbebudget / Monat" v={`≈ ${eur(price.monthlyBudget)}`} sub={price.tierLabel} />
            <Sum k="Setup einmalig" v={eur(price.setupFee)} sub={`${eur(withVat(price.setupFee))} brutto · bei Annahme`} />
            {num(introFee) != null ? (
              <Sum k={`Monat 1–${num(introMonths) ?? "?"}`} v={eur(num(introFee)!)} sub={`${eur(withVat(num(introFee)!))} brutto`} />
            ) : null}
            <Sum
              k={startDate ? `Paket monatlich ab ${startDate.split("-").reverse().join(".")}` : "Paket monatlich"}
              v={price.monthlyFee == null ? "individuell" : eur(price.monthlyFee)}
              sub={price.monthlyFee == null ? "bitte oben eintragen" : `${eur(withVat(price.monthlyFee))} brutto · Pause: ${eur(price.softwareFee)}`}
            />
            {price.extraSeats > 0 ? (
              <Sum
                k={`${price.extraSeats} weitere ${price.extraSeats === 1 ? "Login" : "Logins"}`}
                v={price.seatsIndividual ? "inklusive" : eur(price.seatsFee)}
                sub={price.seatsIndividual ? "im individuellen Preis" : `${price.extraSeats} × ${eur(PRICE_LIST.seatMonthly)} / Monat`}
              />
            ) : null}
            {price.bestandFee > 0 ? <Sum k="Bestandskunden-Modul" v={eur(price.bestandFee)} sub="pro Monat" /> : null}
            {price.monthlyTotal != null && (price.extraSeats > 0 || price.bestandFee > 0) ? (
              <Sum k="Monatlich gesamt" v={eur(price.monthlyTotal)} sub={`${eur(withVat(price.monthlyTotal))} brutto`} />
            ) : null}
            {price.annualTotal != null ? (
              <Sum
                k="Jährlich im Voraus"
                v={eur(price.annualTotal)}
                sub={`${PRICE_LIST.annualFreeMonths} Monate geschenkt (spart ${eur(price.annualSavings)}) · ${eur(withVat(price.annualTotal))} brutto`}
              />
            ) : null}
            {error ? <p className="rounded-md bg-rose-50 px-3 py-2 text-rose-700">{error}</p> : null}
            <Button type="button" variant="primary" size="md" className="w-full" disabled={pending} onClick={submit}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Angebot erstellen
            </Button>
            <p className="text-xs text-[color:var(--muted)]">
              Die Konditionen werden beim Erstellen eingefroren. Ein früheres offenes Angebot an diesen Kontakt wird automatisch ersetzt.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Field({ l, children }: { l: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className={label}>{l}</span>
      {children}
    </label>
  );
}

function Sum({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[color:var(--border)] pb-3 last:border-0">
      <span className="text-[color:var(--muted)]">{k}</span>
      <span className="text-right">
        <span className="block font-semibold">{v}</span>
        {sub ? <span className="block text-xs text-[color:var(--muted)]">{sub}</span> : null}
      </span>
    </div>
  );
}
