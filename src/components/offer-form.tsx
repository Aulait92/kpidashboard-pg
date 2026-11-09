"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button, Card, CardHeader } from "@/components/ui";
import { createOfferAction } from "@/app/admin/crm/offer-actions";
import type { OfferTarget } from "@/lib/offer-links";
import { computeOfferPrice, eur, PRICE_LIST, withVat, type OfferTerm } from "@/lib/offer-pricing";

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
  const [term, setTerm] = useState<OfferTerm>("12m");
  const [setupOverride, setSetupOverride] = useState("");
  const [monthlyOverride, setMonthlyOverride] = useState("");
  const [introFee, setIntroFee] = useState("");
  const [introMonths, setIntroMonths] = useState("3");
  const [specialTerms, setSpecialTerms] = useState("");
  const [startDate, setStartDate] = useState("");
  const [validDays, setValidDays] = useState("14");

  const parsedProducts = products.map((p) => ({ name: p.name, dailyBudget: num(p.daily) ?? 0 }));
  // Berechnung ist billig – direkt pro Render statt useMemo.
  const price = computeOfferPrice({
    term,
    products: parsedProducts,
    setupOverride: num(setupOverride),
    monthlyOverride: num(monthlyOverride),
  });

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
        term,
        products: parsedProducts,
        setupOverride: num(setupOverride),
        monthlyOverride: num(monthlyOverride),
        introMonthlyFee: num(introFee),
        introMonths: num(introMonths),
        specialTerms,
        startDate: startDate || null,
        validDays: num(validDays) ?? 14,
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
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["12m", "12 Monate", `Setup ${eur(PRICE_LIST.setup12m)}`],
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
              <Field l="Start (optional)">
                <input className={input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </Field>
              <Field l="Angebot gültig (Tage)">
                <input className={input} inputMode="numeric" value={validDays} onChange={(e) => setValidDays(e.target.value)} />
              </Field>
            </div>
            <Field l="Sondervereinbarung (erscheint wörtlich im Angebot)">
              <textarea className={`${input} h-24 py-2`} value={specialTerms} onChange={(e) => setSpecialTerms(e.target.value)} />
            </Field>
          </div>
        </Card>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader title="Zusammenfassung" />
          <div className="space-y-3 p-5 text-sm">
            <Sum k="Werbebudget / Monat" v={`≈ ${eur(price.monthlyBudget)}`} sub={price.tierLabel} />
            <Sum k="Setup einmalig" v={eur(price.setupFee)} sub={`${eur(withVat(price.setupFee))} brutto`} />
            {num(introFee) != null ? (
              <Sum k={`Monat 1–${num(introMonths) ?? "?"}`} v={eur(num(introFee)!)} sub={`${eur(withVat(num(introFee)!))} brutto`} />
            ) : null}
            <Sum
              k="Monatlich"
              v={price.monthlyFee == null ? "individuell" : eur(price.monthlyFee)}
              sub={price.monthlyFee == null ? "bitte oben eintragen" : `${eur(withVat(price.monthlyFee))} brutto · Pause: ${eur(PRICE_LIST.softwareFee)}`}
            />
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
