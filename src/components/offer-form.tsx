"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import { Button, Card, CardHeader } from "@/components/ui";
import { createOfferAction, updateOfferDraftAction } from "@/app/admin/vertrieb/offer-actions";
import type { OfferTarget } from "@/lib/offer-links";
import {
  berlinTodayIso,
  bestandPacksText,
  computeOfferPrice,
  eur,
  PPL_SOFTWARE_TERMS,
  PPL_NUR_LEADS,
  istPpl,
  mitSoftware,
  PRICE_LIST,
  prepayPossible,
  PRODUKT_VORSCHLAEGE,
  VORAUSZAHLUNG,
  withVat,
  type OfferPackage,
  type OfferTerm,
  type OfferVermittler,
} from "@/lib/offer-pricing";
import { EMPFEHLUNG_MODULE_AVAILABLE } from "@/lib/empfehlung/shared";
import { BESTAND_MODULE_AVAILABLE } from "@/lib/bestand/sichtbar";
import { EMAIL_RE } from "@/lib/whatsapp/phone";
import { ERSTE_WOCHE_MIN, ERSTE_WOCHE_PRODUKTE, ERSTE_WOCHE_STANDARD, ersteWocheBetrag } from "@/lib/ppl/erste-woche-shared";
import { bezugSteuer, bruttoJeLead } from "@/lib/ppl/steuer";
import { KUNDENKONTO_NAME, KUNDENKONTO_VORSCHLAEGE, MINDESTBESTELLUNG_KUNDENKONTO, pruefeKundenkontoProdukte, startUmsatz, type PplModell } from "@/lib/ppl/kundenkonto";
import { formWerteZuInput, num, produktWahlMoeglich as produktWahlMoeglichAus, standardFormWerte, vorauszahlungMoeglich, wocheNettoAus, type OfferFormWerte } from "@/lib/offer-form-werte";
import { abrechnungsplan, ABRECHNUNGSTAG_MAX, ersterAbrechnungstag, VORAUSZAHLUNG_OHNE_ABRECHNUNGSTAG } from "@/lib/abrechnungstag";

const PRODUCT_SUGGESTIONS = PRODUKT_VORSCHLAEGE;

const input =
  "h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20";
const label = "text-xs font-medium text-[color:var(--muted)]";

export function OfferForm({
  target,
  backHref,
  initial,
  referralDiscount = null,
  ueberweisungVerfuegbar = false,
  entwurf,
}: {
  target: OfferTarget;
  backHref: string;
  initial: {
    contactName: string;
    company: string;
    email: string;
    product: string;
    street?: string;
    zip?: string;
    city?: string;
    /** Vorbelegung, z. B. „Einrichtung gratis“ als Empfehlungsvorteil */
    setupOverride?: string;
    specialTerms?: string;
  };
  /** Empfohlener Kontakt: Einrichtungsrabatt (vorbelegt, übersteuerbar). */
  referralDiscount?: { amount: number; label: string; note: string | null } | null;
  /** Überweisung freigeschaltet (MAHNWESEN=on, zuerst nur Staging): Schalter „Überweisung erlauben“ zeigen */
  ueberweisungVerfuegbar?: boolean;
  /** Entwurf bearbeiten (Ole, 20.11.2026): vorbefüllt mit allen Werten, „Speichern“ aktualisiert den Entwurf */
  /** neueVersion: verschicktes Angebot als Vorlage, Speichern legt eine neue Version an (ersetzt das alte) */
  entwurf?: { offerId: string; werte: OfferFormWerte; neueVersion?: boolean; duplikat?: boolean };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Startwerte: Entwurf (Bearbeiten) oder Standard mit Vorbelegung aus dem Kontakt (lib/offer-form-werte.ts)
  const [w0] = useState<OfferFormWerte>(() => entwurf?.werte ?? standardFormWerte(initial, referralDiscount));
  const [contactName, setContactName] = useState(w0.contactName);
  const [company, setCompany] = useState(w0.company);
  const [email, setEmail] = useState(w0.email);
  const [street, setStreet] = useState(w0.street);
  const [zip, setZip] = useState(w0.zip);
  const [city, setCity] = useState(w0.city);
  const [products, setProducts] = useState(w0.products);
  const [pkg, setPkg] = useState<OfferPackage>(w0.pkg);
  const [term, setTerm] = useState<OfferTerm>(w0.term);
  const [setupOverride, setSetupOverride] = useState(w0.setupOverride);
  const [discount, setDiscount] = useState(w0.discount);
  const [monthlyOverride, setMonthlyOverride] = useState(w0.monthlyOverride);
  const [introFee, setIntroFee] = useState(w0.introFee);
  const [introMonths, setIntroMonths] = useState(w0.introMonths);
  const [specialTerms, setSpecialTerms] = useState(w0.specialTerms);
  const [startDate, setStartDate] = useState(w0.startDate);
  // Abrechnungstag (Ole, 18.11.2026): leer = wie Start; selten genutzt, daher aufklappbar unter dem Start
  const [billingDay, setBillingDay] = useState(w0.billingDay);
  const [billingFree, setBillingFree] = useState(w0.billingFree);
  const [validDays, setValidDays] = useState(w0.validDays);
  const [seats, setSeats] = useState(w0.seats);
  const [annual, setAnnual] = useState(w0.annual);
  const [bestand, setBestand] = useState(w0.bestand);
  const [empfehlung, setEmpfehlung] = useState(w0.empfehlung);
  const [vermittler, setVermittler] = useState<OfferVermittler>(w0.vermittler);
  const [customerChoice, setCustomerChoice] = useState(w0.customerChoice);
  // Kunde wählt Produkte und Tagesbudget (Ole, 19.11.2026): Standard an, nur zum Listenpreis
  const [customerProducts, setCustomerProducts] = useState(w0.customerProducts);
  // „Ich zahle später“ auf der Angebotsseite (Ole, 16.11.2026): nur für Kunden mit spätem Start, Standard aus
  const [allowPayLater, setAllowPayLater] = useState(w0.allowPayLater);
  // Zahlung nachträglich (Ole, 19.11.2026): Sonderkondition, nur monatlich (nicht mit Vorauszahlung oder Abrechnungstag)
  const [arrears, setArrears] = useState(w0.arrears);
  // Überweisung nur auf Anfrage des Kunden (Ole, 17.11.2026): Standard aus, Zahlungsziel Standard 14 Tage
  const [allowBankTransfer, setAllowBankTransfer] = useState(w0.allowBankTransfer);
  const [bankTransferDays, setBankTransferDays] = useState(w0.bankTransferDays);
  // Abschlussbonus (Ole, 21.11.2026: abgeschafft): nur noch sichtbar, wenn das bearbeitete Angebot schon einen hat
  const bonusVorhanden = w0.bonusVorhanden;
  const [bonusAn, setBonusAn] = useState(w0.bonusAn);
  const [bonusBetrag, setBonusBetrag] = useState(w0.bonusBetrag);
  const [bonusBis, setBonusBis] = useState(w0.bonusBis);
  // Testangebot (Ole, 15.11.2026): 0 €, ohne Zahlung, legt einen Testkunden an
  const [test, setTest] = useState(w0.test);
  // Erste Woche (Ole, 20.11.2026, nur Pay-per-Lead + Software): Lead-Produkt, Preis je Lead, vorausgewählte Anzahl
  const [wocheProdukt, setWocheProdukt] = useState(w0.wocheProdukt);
  const [wocheLabel, setWocheLabel] = useState(w0.wocheLabel);
  const [wochePreis, setWochePreis] = useState(w0.wochePreis);
  const [wocheBrutto, setWocheBrutto] = useState(w0.wocheBrutto);
  const [wocheMenge, setWocheMenge] = useState(w0.wocheMenge);
  // Variante (Ole, 20.11.2026): Leads aus unserem Pool (Standard, bisher) oder Kampagnen im eigenen Werbekonto
  const [pplModell, setPplModell] = useState<PplModell>(w0.pplModell);
  const [kkProdukte, setKkProdukte] = useState(w0.kkProdukte);
  const werte: OfferFormWerte = {
    contactName, company, email, street, zip, city, products, pkg, term, setupOverride, discount, monthlyOverride, introFee, introMonths,
    specialTerms, startDate, billingDay, billingFree, validDays, seats, annual, bestand, empfehlung, vermittler, customerChoice,
    customerProducts, allowPayLater, arrears, allowBankTransfer, bankTransferDays, bonusVorhanden, bonusAn, bonusBetrag, bonusBis, test,
    wocheProdukt, wocheLabel, wochePreis, wocheBrutto, wocheMenge, pplModell, kkProdukte,
  };

  const parsedProducts = products.map((p) => ({ name: p.name, dailyBudget: num(p.daily) ?? 0 }));
  // Berechnung ist billig – direkt pro Render statt useMemo.
  const price = computeOfferPrice({
    package: pkg,
    term,
    products: parsedProducts,
    setupOverride: num(setupOverride),
    monthlyOverride: num(monthlyOverride),
    seats: num(seats),
    annual: annual && prepayPossible(term),
    bestandModule: bestand && pkg !== "service",
    empfehlungModule: empfehlung && pkg !== "service",
    setupDiscount: referralDiscount ? num(discount) : null,
  });
  // Paket mit Software (Betreuung + Software oder Pay-per-Lead + Software): Verkäufer und Module buchbar
  const softwarePkg = mitSoftware(pkg);
  // Pay-per-Lead + Software (Ole, 19.11.2026): keine Produkte, kein Werbebudget, keine Einrichtung, Laufzeit ohne oder 3 Monate
  const ppl = istPpl(pkg);
  // „Nur Leads“ (Ole, 24.11.2026): Leads per Stück ohne Software und ohne Monatsgebühr, erste Bestellung Pflicht
  const nurLeads = pkg === PPL_NUR_LEADS;
  // Kurzfassung der zugeklappten „Preise und Sonderkonditionen“: was gerade vom Standard abweicht oder gilt
  const sonderText = test
    ? "Testangebot: alle Beträge 0 €"
    : [
        num(setupOverride) != null && !ppl ? `Setup ${eur(num(setupOverride)!)}` : null,
        num(monthlyOverride) != null ? `monatlich ${eur(num(monthlyOverride)!)}` : null,
        num(introFee) != null && !ppl ? `Startpreis ${eur(num(introFee)!)}` : null,
        bonusVorhanden && bonusAn && !ppl ? `Abschlussbonus ${eur(num(bonusBetrag) ?? 0)}` : null,
        customerChoice ? "Kunde wählt Start" : null,
        allowPayLater && !ppl ? "später zahlen" : null,
        arrears ? "nachträglich" : null,
        allowBankTransfer && ueberweisungVerfuegbar ? "Überweisung" : null,
        specialTerms.trim() ? "Sondervereinbarung" : null,
        (num(seats) ?? PRICE_LIST.seatsIncluded) > PRICE_LIST.seatsIncluded ? `${num(seats)} Verkäufer` : null,
        annual && !ppl && prepayPossible(term) ? "Vorauszahlung" : null,
        bestand || empfehlung ? "Module" : null,
        `gültig ${num(validDays) ?? 14} Tage`,
      ]
        .filter(Boolean)
        .join(" · ");
  const waehlePaket = (k: OfferPackage) => {
    setPkg(k);
    if (istPpl(k) && !PPL_SOFTWARE_TERMS.includes(term)) setTerm("none");
  };
  // Produktwahl durch den Kunden nur zum Listenpreis (wie lib/offers.ts createOffer)
  const produktWahlMoeglich = produktWahlMoeglichAus(werte, price.individual);
  // Vorauszahlung (Ole, 18.11.2026): mit 12 Monaten jährlich (3 geschenkt seit 19.11.2026), mit 6 Monaten 6 Monate im Voraus (1 geschenkt)
  const annualPossible = vorauszahlungMoeglich(werte);
  const voraus = VORAUSZAHLUNG[term === "6m" ? "6m" : "12m"];
  const geschenkt = (n: number) => `${n} ${n === 1 ? "Monat" : "Monate"} geschenkt`;

  // Erste Woche: Steuerkennzeichen des Produkts (lib/ppl/steuer.ts); Bruttoeingabe nur bei steuerpflichtigen Produkten
  const wocheSteuer = bezugSteuer({ productKey: wocheProdukt });
  const wocheNetto = wocheNettoAus(werte);
  // Kampagnen im eigenen Werbekonto: Startpaket (Menge × Preis je Lead, brutto) ab 1.500 €
  const kk = pkg === "ppl_software" && pplModell === "kundenkonto";
  const kkSumme = startUmsatz(kkProdukte.map((p) => ({ preis: num(p.preis) ?? 0, menge: Math.max(0, Math.round(num(p.menge) ?? 0)) })));
  const kkFehlt = Math.max(0, Math.round((MINDESTBESTELLUNG_KUNDENKONTO - kkSumme) * 100) / 100);
  const kkVorschlaege = KUNDENKONTO_VORSCHLAEGE.filter((v) => !kkProdukte.some((p) => p.name.trim().toLowerCase() === v.name.toLowerCase()));
  const setKk = (i: number, k: "name" | "preis" | "menge", v: string) => setKkProdukte((ps) => ps.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  function submit() {
    setError(null);
    if (kk) {
      const pruef = pruefeKundenkontoProdukte(kkProdukte);
      if (!pruef.ok) {
        setError(pruef.error);
        return;
      }
    }
    if (nurLeads && !wocheProdukt.trim()) {
      setError("Bei „Nur Leads“ bitte die erste Bestellung angeben (Produkt, Preis je Lead, Anzahl).");
      return;
    }
    if (ppl && !kk && wocheProdukt.trim() && (wocheNetto == null || wocheNetto <= 0)) {
      setError("Bitte einen Preis je Lead für die erste Woche angeben.");
      return;
    }
    if (!street.trim() || !zip.trim() || !city.trim()) {
      setError("Bitte die Adresse des Empfängers angeben (Straße, PLZ, Ort). Sie steht im Vertrag und auf der Rechnung.");
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError("Bitte eine gültige E-Mail-Adresse des Empfängers angeben. Daraus entsteht nach der Zahlung der Login.");
      return;
    }
    start(async () => {
      const eingabe = formWerteZuInput(werte, { referral: !!referralDiscount, ueberweisungVerfuegbar });
      const res = entwurf && !entwurf.neueVersion ? await updateOfferDraftAction(entwurf.offerId, eingabe) : await createOfferAction(target, eingabe);
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
            <Field l="E-Mail *"><input className={input} type="email" required autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            {/* Adresse ist Pflicht (Ole, 23.11.2026: „die adresse wird immer gebraucht“, Vertragspartner und Rechnung) */}
            <div className="grid gap-3 sm:col-span-2 sm:grid-cols-[2fr_1fr_2fr]" data-empfaenger-adresse>
              <Field l="Straße und Hausnummer *"><input className={input} required autoComplete="off" value={street} onChange={(e) => setStreet(e.target.value)} /></Field>
              <Field l="PLZ *"><input className={input} required inputMode="numeric" autoComplete="off" value={zip} onChange={(e) => setZip(e.target.value)} /></Field>
              <Field l="Ort *"><input className={input} required autoComplete="off" value={city} onChange={(e) => setCity(e.target.value)} /></Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Kunde ist …" hint="geht in die Erstinformation" />
          <div className="grid gap-2 p-5 sm:grid-cols-3" role="radiogroup" aria-label="Vertreter, Mehrfachvertreter oder Makler">
            {(
              [
                ["vertreter", "Vertreter (AO)", "Abschlussprovision"],
                ["mehrfachvertreter", "Mehrfachvertreter", "rechnet wie Vertreter"],
                ["makler", "Makler", "Bestandscourtage"],
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
                <div className="text-xs text-[color:var(--muted)]">{ppl ? s.split(" · ")[0] : s}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Paket" />
          <div className="grid gap-2 p-5 sm:grid-cols-2 xl:grid-cols-4" data-paket-wahl>
            {(
              [
                ["software", "Betreuung + Software", "Leads, WhatsApp-Assistent, Terminbuchung, Pipeline"],
                ["service", "Nur Betreuung", `Leads per E-Mail + Kundenbereich · ${eur(PRICE_LIST.serviceOnlyMonthly)} / Monat · Pause 0 €`],
                ["ppl_software", "Pay-per-Lead + Software", `Nur Software · ${eur(PRICE_LIST.softwareFee)} / Monat · ohne Einrichtung · Leads separat pro Stück`],
                ["ppl", "Nur Leads", "Leads per Stück · ohne Software · ohne Monatsgebühr"],
              ] as const
            ).map(([k, t, s]) => (
              <button
                key={k}
                type="button"
                data-paket={k}
                onClick={() => waehlePaket(k)}
                className={`rounded-[var(--radius-md)] border px-4 py-3 text-left text-sm transition ${pkg === k ? "border-[color:var(--brand)] bg-[color:var(--brand-soft,#EFF6FF)] ring-2 ring-[color:var(--brand)]/20" : "border-[color:var(--border)] bg-white hover:border-[color:var(--border-strong)]"}`}
              >
                <div className="font-semibold">{t}</div>
                <div className="text-xs text-[color:var(--muted)]">{s}</div>
              </button>
            ))}
          </div>
        </Card>

        {pkg === "ppl_software" ? (
          <Card>
            <CardHeader title="Woher kommen die Leads?" />
            <div className="grid gap-2 p-5 sm:grid-cols-2" role="radiogroup" aria-label="Variante Pay-per-Lead" data-ppl-modell-wahl>
              {(
                [
                  ["pool", "Aus unserem Pool", "Wie bisher: Leads per Stück, optional erste Woche"],
                  ["kundenkonto", KUNDENKONTO_NAME, `Kunde zahlt Meta, wir rechnen Preis je Lead abzüglich Meta ab · Startpaket ab ${eur(MINDESTBESTELLUNG_KUNDENKONTO)}`],
                ] as const
              ).map(([k, t, sub]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={pplModell === k}
                  data-ppl-modell={k}
                  onClick={() => setPplModell(k)}
                  className={`min-w-0 rounded-[var(--radius-md)] border px-4 py-3 text-left text-sm transition ${pplModell === k ? "border-[color:var(--brand)] bg-[color:var(--brand-soft,#EFF6FF)] ring-2 ring-[color:var(--brand)]/20" : "border-[color:var(--border)] bg-white hover:border-[color:var(--border-strong)]"}`}
                >
                  <div className="font-semibold">{t}</div>
                  <div className="text-xs text-[color:var(--muted)]">{sub}</div>
                </button>
              ))}
            </div>
          </Card>
        ) : null}

        {kk ? (
          <Card>
            <CardHeader title="Produkte und Preis je Lead" hint={`Endpreis brutto inkl. USt. (Obergrenze). Startmenge zusammen mindestens ${eur(MINDESTBESTELLUNG_KUNDENKONTO)}.`} />
            <div className="space-y-3 p-5" data-kundenkonto-admin>
              {kkProdukte.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_88px_80px_auto] items-end gap-2">
                  <Field l={i === 0 ? "Produkt" : `Produkt ${i + 1}`}>
                    <input className={input} value={p.name} onChange={(e) => setKk(i, "name", e.target.value)} placeholder="z. B. Privatschutz" />
                  </Field>
                  <Field l="€ je Lead">
                    <input className={input} inputMode="decimal" value={p.preis} onChange={(e) => setKk(i, "preis", e.target.value)} />
                  </Field>
                  <Field l="Startmenge">
                    <input className={input} inputMode="numeric" value={p.menge} onChange={(e) => setKk(i, "menge", e.target.value)} />
                  </Field>
                  <button
                    type="button"
                    aria-label="Produkt entfernen"
                    disabled={kkProdukte.length === 1}
                    onClick={() => setKkProdukte((ps) => ps.filter((_, j) => j !== i))}
                    className="mb-0.5 inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken)] disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2">
                {kkVorschlaege.map((v) => (
                  <button
                    key={v.name}
                    type="button"
                    data-kk-vorschlag={v.name}
                    onClick={() => setKkProdukte((ps) => [...ps, { name: v.name, preis: String(v.preis), menge: String(kkFehlt > 0 ? Math.ceil(kkFehlt / v.preis) : 1) }])}
                    className="inline-flex h-9 items-center gap-1 rounded-full border border-[color:var(--border)] bg-white px-3 text-xs font-semibold hover:bg-[color:var(--surface-sunken)]"
                  >
                    <Plus className="h-3.5 w-3.5" /> {v.name} {eur(v.preis)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setKkProdukte((ps) => [...ps, { name: "", preis: "", menge: "" }])}
                  className="inline-flex h-9 items-center gap-1 rounded-full border border-dashed border-[color:var(--border)] px-3 text-xs font-semibold text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken)]"
                >
                  <Plus className="h-3.5 w-3.5" /> Anderes Produkt
                </button>
              </div>
              <p className={`text-xs ${kkFehlt > 0 ? "text-rose-700" : "text-[color:var(--muted)]"}`} data-kk-summe>
                Startpaket {eur(kkSumme)}
                {kkFehlt > 0 ? `, es fehlen ${eur(kkFehlt)} bis ${eur(MINDESTBESTELLUNG_KUNDENKONTO)}.` : `. Software inklusive, solange der Kunde mindestens ${eur(MINDESTBESTELLUNG_KUNDENKONTO)} im Monat bezieht.`}
              </p>
            </div>
          </Card>
        ) : ppl ? (
          <Card>
            <CardHeader title={nurLeads ? "Erste Bestellung" : "Erste Woche"} hint={nurLeads ? "Pflicht. Die Anzahl wählt der Kunde bei der Annahme." : "Anzahl wählt der Kunde bei der Annahme. Leer = ohne."} />
            <div className="grid gap-3 p-5 sm:grid-cols-2" data-erste-woche-admin>
              <datalist id="ppl-lead-produkte">
                {ERSTE_WOCHE_PRODUKTE.map((p) => <option key={p} value={p} />)}
              </datalist>
              <Field l="Lead-Produkt (wie im Bezug)">
                <input className={input} list="ppl-lead-produkte" value={wocheProdukt} onChange={(e) => setWocheProdukt(e.target.value)} placeholder="z. B. PKV-Tarifoptimierung" />
              </Field>
              <Field l="Bezeichnung (optional)">
                <input className={input} value={wocheLabel} onChange={(e) => setWocheLabel(e.target.value)} placeholder="z. B. PKV Bayern" />
              </Field>
              <Field l={wocheBrutto && wocheSteuer === "steuerpflichtig" ? "Preis je Lead (brutto inkl. 19 %)" : "Preis je Lead (netto)"}>
                <input className={input} inputMode="decimal" value={wochePreis} onChange={(e) => setWochePreis(e.target.value)} placeholder="z. B. 17" />
              </Field>
              <Field l={`Anzahl vorausgewählt (ab ${ERSTE_WOCHE_MIN})`}>
                <input className={input} inputMode="numeric" value={wocheMenge} onChange={(e) => setWocheMenge(e.target.value)} />
              </Field>
              {wocheProdukt.trim() ? (
                <div className="space-y-2 text-xs text-[color:var(--muted)] sm:col-span-2" data-erste-woche-steuer={wocheSteuer}>
                  <p>
                    {wocheSteuer === "steuerfrei_4_11"
                      ? "Umsatzsteuerfrei nach § 4 Nr. 11 UStG, sobald der Registereintrag geprüft ist (sonst 19 %)."
                      : "Steuerpflichtig: 19 % USt. kommen dazu."}
                    {wocheNetto != null && wocheNetto > 0
                      ? ` Kunde zahlt ${eur(bruttoJeLead(wocheNetto, wocheSteuer))} je Lead, ${num(wocheMenge) ?? ERSTE_WOCHE_STANDARD} Leads = ${eur(ersteWocheBetrag({ productKey: wocheProdukt, price: wocheNetto }, num(wocheMenge) ?? ERSTE_WOCHE_STANDARD).brutto)}.`
                      : ""}
                    {wocheBrutto && wocheSteuer === "steuerpflichtig" && wocheNetto != null ? ` Gespeichert wird netto ${eur(wocheNetto)}.` : ""}
                  </p>
                  {wocheSteuer === "steuerpflichtig" ? (
                    <label className="flex items-center gap-2 text-sm text-[color:var(--foreground)]">
                      <input type="checkbox" className="h-4 w-4" checked={wocheBrutto} onChange={(e) => setWocheBrutto(e.target.checked)} />
                      Preis ist brutto kalkuliert (inkl. 19 % USt.)
                    </label>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Card>
        ) : (
        <Card>
          <CardHeader title="Produkte und Werbebudget" hint="jedes weitere +350 € / Monat" />
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
        )}

        <Card>
          <CardHeader title="Laufzeit und Konditionen" />
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(ppl
                ? ([
                    ["none", nurLeads ? "Keine Laufzeit" : "Ohne Laufzeit", nurLeads ? "ohne Monatsgebühr · ohne Einrichtung" : "monatlich kündbar · ohne Einrichtung"],
                  ] as const)
                : ([
                  ["12m", "12 Monate", `Setup ${eur(PRICE_LIST.setup12m)}`],
                  ["6m", "6 Monate", `Setup ${eur(PRICE_LIST.setup6m)}`],
                  ["3m", "3 Monate", `Setup ${eur(PRICE_LIST.setup3m)}`],
                  ["none", "Ohne Laufzeit", `Setup ${eur(PRICE_LIST.setupNoTerm)}`],
                ] as const)
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
              {referralDiscount && !ppl ? (
                <Field l={`${referralDiscount.label}: Rabatt auf die Einrichtung (netto)`}>
                  <input
                    className={input}
                    inputMode="decimal"
                    name="setupDiscount"
                    placeholder="0 = kein Rabatt"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    data-angebot-setup-rabatt
                  />
                  {referralDiscount.note ? <span className="block text-xs text-amber-700">{referralDiscount.note}</span> : null}
                  {num(discount) && price.setupDiscount === 0 ? (
                    <span className="block text-xs text-[color:var(--muted)]">„Setup abweichend“ ist günstiger, der Rabatt wird nicht zusätzlich abgezogen.</span>
                  ) : null}
                </Field>
              ) : null}
              {/* „Nur Leads“: kein Start und keine Abrechnung, geliefert wird nach der Registerprüfung */}
              {nurLeads ? null : (
              <div className="space-y-2">
                <Field l="Start * (ab dann läuft die Monatsgebühr)">
                  <input className={input} type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </Field>
                <AbrechnungstagFeld startDate={startDate} day={billingDay} setDay={setBillingDay} free={billingFree} setFree={setBillingFree} voraus={annual && annualPossible} />
              </div>
              )}
            </div>
            {/* Selten Geändertes (SUS-Prüfung 20.11.2026): Preise, Zahlungsoptionen, Test und Sondervereinbarung
                zugeklappt; die Zeile darunter zeigt, was gerade gilt. Offen, wenn ein Preis eingetragen werden muss. */}
            <details className="group rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white" open={price.listMonthly == null || price.seatsIndividual || undefined} data-sonderkonditionen>
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">Preise und Sonderkonditionen</span>
                  <span className={`block text-xs ${test ? "font-medium text-amber-700" : "text-[color:var(--muted)]"}`}>{sonderText}</span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-[color:var(--muted)] transition group-open:rotate-180" />
              </summary>
              <div className="space-y-4 border-t border-[color:var(--border)] p-4">
                <div className="grid gap-3 sm:grid-cols-2">
              {ppl ? null : (
              <Field l={`Setup abweichend (Liste: ${eur(price.listSetup)})`}>
                <input className={input} inputMode="decimal" placeholder="leer = Listenpreis" value={setupOverride} onChange={(e) => setSetupOverride(e.target.value)} />
              </Field>
              )}
              {nurLeads ? null : (
              <Field l={`Monatlich abweichend (Liste: ${price.listMonthly == null ? "individuell" : eur(price.listMonthly)})`}>
                <input className={input} inputMode="decimal" placeholder={price.listMonthly == null ? "bitte eintragen" : "leer = Listenpreis"} value={monthlyOverride} onChange={(e) => setMonthlyOverride(e.target.value)} />
              </Field>
              )}
              {ppl ? null : (
              <>
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
              </>
              )}
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
                    ? "Mit Sonderpreis nur das Startdatum, die Laufzeit bleibt wie hier gewählt."
                    : "Ihre Auswahl hier ist der Vorschlag. Start frühestens in 7 Tagen, spätestens in 90 Tagen."}
                </span>
              </span>
            </label>
            {ppl ? null : (
            <>
            <label className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-4 py-3 text-sm" data-produktwahl-toggle>
              <input
                type="checkbox"
                name="customerChoosesProducts"
                className="mt-0.5 h-4 w-4"
                checked={customerProducts && produktWahlMoeglich}
                disabled={!produktWahlMoeglich}
                onChange={(e) => setCustomerProducts(e.target.checked)}
              />
              <span>
                <span className="block font-semibold">Kunde wählt Produkte und Tagesbudget</span>
                <span className="block text-xs text-[color:var(--muted)]">
                  {produktWahlMoeglich ? "Preis nach Staffel, bis 5 Produkte, 20 bis 100 € am Tag." : "Nur zum Listenpreis mit Software, ohne Sonder- oder Startpreis."}
                </span>
              </span>
            </label>
            {bonusVorhanden ? (
            <label className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-4 py-3 text-sm" data-abschlussbonus-toggle>
              <input type="checkbox" name="abschlussBonus" className="mt-0.5 h-4 w-4" checked={bonusAn && !test} disabled={test} onChange={(e) => setBonusAn(e.target.checked)} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 font-semibold">
                  Abschlussbonus
                  <input
                    aria-label="Abschlussbonus in Euro"
                    inputMode="decimal"
                    value={bonusBetrag}
                    disabled={!bonusAn || test}
                    onChange={(e) => setBonusBetrag(e.target.value)}
                    className="h-7 w-20 rounded border border-[color:var(--border)] px-2 text-right text-sm font-normal"
                  />
                  € auf die Einrichtung, bis
                  <input
                    aria-label="Abschlussbonus gilt bis"
                    type="date"
                    value={bonusBis}
                    min={berlinTodayIso()}
                    disabled={!bonusAn || test}
                    onChange={(e) => setBonusBis(e.target.value)}
                    className="h-7 rounded border border-[color:var(--border)] px-2 text-sm font-normal"
                    data-abschlussbonus-bis
                  />
                </span>
                <span className="block text-xs text-[color:var(--muted)]">
                  Schon zugesagt, bleibt für dieses Angebot. Neue Angebote haben keinen Abschlussbonus mehr.
                </span>
                {bonusAn && !test && price.setupFee > 0 && (num(bonusBetrag) ?? 0) >= price.setupFee ? (
                  <span className="mt-1 block text-xs font-medium text-amber-700" data-abschlussbonus-ganzes-setup>
                    Der Bonus deckt das ganze Setup ({eur(price.setupFee)}): Es wird nichts eingezogen, nur die Zahlungsart gespeichert. Soll das Setup bezahlt werden, Bonus abwählen.
                  </span>
                ) : null}
              </span>
            </label>
            ) : null}
            <label className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-4 py-3 text-sm" data-pay-later-toggle>
              <input
                type="checkbox"
                name="allowPayLater"
                className="mt-0.5 h-4 w-4"
                checked={allowPayLater && !test}
                disabled={test}
                onChange={(e) => setAllowPayLater(e.target.checked)}
              />
              <span>
                <span className="block font-semibold">Später zahlen erlauben</span>
                <span className="block text-xs text-[color:var(--muted)]">
                  Nach der Annahme kann der Kunde „Ich zahle später“ wählen und den Tag der Zahlungserinnerung festlegen (spätestens 14 Tage vor dem Start).
                </span>
              </span>
            </label>
            </>
            )}
            <label className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-4 py-3 text-sm" data-zahlung-nachtraeglich-toggle>
              <input
                type="checkbox"
                name="paymentInArrears"
                className="mt-0.5 h-4 w-4"
                checked={arrears && !test}
                disabled={test || (!arrears && ((annual && annualPossible) || !!billingDay))}
                onChange={(e) => setArrears(e.target.checked)}
              />
              <span>
                <span className="block font-semibold">Zahlung nachträglich (für den abgelaufenen Monat)</span>
                <span className="block text-xs text-[color:var(--muted)]">
                  {arrears && ((annual && annualPossible) || !!billingDay)
                    ? "Geht nur monatlich: bitte Vorauszahlung und Abrechnungstag abwählen."
                    : "Erste Abbuchung einen Monat nach dem Start, nur monatlich, Start am 1. bis 28."}
                </span>
              </span>
            </label>
            {ueberweisungVerfuegbar ? (
              <label className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-4 py-3 text-sm" data-ueberweisung-toggle>
                <input
                  type="checkbox"
                  name="allowBankTransfer"
                  className="mt-0.5 h-4 w-4"
                  checked={allowBankTransfer && !test}
                  disabled={test}
                  onChange={(e) => setAllowBankTransfer(e.target.checked)}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 font-semibold">
                    Überweisung erlauben, Zahlungsziel
                    <input
                      aria-label="Zahlungsziel in Tagen"
                      inputMode="numeric"
                      value={bankTransferDays}
                      disabled={!allowBankTransfer || test}
                      onChange={(e) => setBankTransferDays(e.target.value)}
                      className="h-7 w-14 rounded border border-[color:var(--border)] px-2 text-right text-sm font-normal"
                      data-ueberweisung-tage
                    />
                    Tage
                  </span>
                  <span className="block text-xs text-[color:var(--muted)]">Nur auf Anfrage des Kunden. Sonst zahlt er wie üblich per Lastschrift oder Karte.</span>
                </span>
              </label>
            ) : null}
            <label className={`flex items-start gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-sm ${test ? "border-amber-300 bg-amber-50" : "border-[color:var(--border)] bg-white"}`}>
              <input type="checkbox" name="test" className="mt-0.5 h-4 w-4" checked={test} onChange={(e) => setTest(e.target.checked)} data-testangebot />
              <span>
                <span className="block font-semibold">Testangebot (0 €, ohne Zahlung)</span>
                <span className="block text-xs text-[color:var(--muted)]">
                  Alle Beträge 0 €, Annahme ohne Stripe, das Onboarding startet sofort. Der Kunde wird als „Test“ markiert, zählt nicht in Zahlen und Abrechnung und lässt sich in der Kundenakte löschen.
                </span>
              </span>
            </label>
            <Field l="Sondervereinbarung (erscheint wörtlich im Angebot; Absätze bleiben erhalten, **Text** wird fett)">
              <textarea className={`${input} h-24 py-2`} value={specialTerms} onChange={(e) => setSpecialTerms(e.target.value)} />
            </Field>
            <h3 className="border-t border-[color:var(--border)] pt-4 text-sm font-semibold">Verkäufer, Vorauszahlung und Module</h3>
            {softwarePkg ? (
              <Field l={`Aktive Verkäufer (bekommen Leads) · ${PRICE_LIST.seatsIncluded} inklusive, jeder weitere ${eur(PRICE_LIST.seatMonthly)} / Monat, Mitglieder ohne Leads kostenlos`}>
                <input className={input} inputMode="numeric" name="seats" value={seats} onChange={(e) => setSeats(e.target.value)} />
              </Field>
            ) : (
              <p className="text-sm text-[color:var(--muted)]">Verkäufer: im Paket „Nur Betreuung“ ohne Platz-Abrechnung.</p>
            )}
            {price.seatsIndividual ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Ab {PRICE_LIST.seatIndividualFrom} aktiven Verkäufern individuell: bitte oben „Monatlich abweichend“ eintragen (alle Verkäufer inklusive).
              </p>
            ) : null}
            {ppl ? null : (
            <label className={`flex items-start gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-sm ${annualPossible ? "border-[color:var(--border)] bg-white" : "border-[color:var(--border)] bg-[color:var(--surface-sunken)] text-[color:var(--muted)]"}`}>
              <input type="checkbox" name="annual" className="mt-0.5 h-4 w-4" disabled={!annualPossible} checked={annual && annualPossible} onChange={(e) => setAnnual(e.target.checked)} />
              <span>
                <span className="block font-semibold" data-vorauszahlung-label>
                  Vorauszahlung anbieten ({geschenkt(voraus.freeMonths)})
                </span>
                <span className="block text-xs text-[color:var(--muted)]">
                  {annualPossible
                    ? `Der Kunde wählt bei der Annahme monatlich (vorausgewählt) oder ${term === "6m" ? "6 Monate im Voraus" : "jährlich"} für ${voraus.months - voraus.freeMonths} × Monatspreis inkl. Zusätze.`
                    : "Nur mit 6 oder 12 Monaten Laufzeit und ohne Startpreis."}
                </span>
              </span>
            </label>
            )}
            {/* Bestandskunden-Modul nur, solange es für alle verfügbar ist (lib/bestand/sichtbar.ts) */}
            {BESTAND_MODULE_AVAILABLE || bestand ? (
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
                  Zusatzpakete: {bestandPacksText()}.
                </span>
              </span>
            </label>
            ) : null}
            {EMPFEHLUNG_MODULE_AVAILABLE || empfehlung ? (
            <label className={`flex items-start gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-sm ${softwarePkg ? "border-[color:var(--border)] bg-white" : "border-[color:var(--border)] bg-[color:var(--surface-sunken)] text-[color:var(--muted)]"}`}>
              <input
                type="checkbox"
                name="empfehlung"
                className="mt-0.5 h-4 w-4"
                disabled={!softwarePkg}
                checked={empfehlung && softwarePkg}
                onChange={(e) => setEmpfehlung(e.target.checked)}
              />
              <span>
                <span className="block font-semibold">
                  Empfehlungen &amp; Bewertungen · {eur(PRICE_LIST.empfehlungModuleMonthly)} / Monat
                </span>
                <span className="block text-xs text-[color:var(--muted)]">
                  Nach jedem Abschluss automatisch um eine Google-Bewertung und später um eine Empfehlung bitten. Im Angebot ohne Testphase, ab Start berechnet.
                </span>
              </span>
            </label>
            ) : null}
              </div>
            </details>
          </div>
        </Card>

      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader title="Zusammenfassung" />
          <div className="space-y-3 p-5 text-sm">
            {kk ? (
              <Sum k="Paket" v="Pay-per-Lead + Software" sub={`${KUNDENKONTO_NAME} · Startpaket ${eur(kkSumme)} · Software inklusive ab ${eur(MINDESTBESTELLUNG_KUNDENKONTO)} im Monat`} />
            ) : nurLeads ? (
              <Sum k="Paket" v="Nur Leads" sub="Leads per Stück, ohne Software, ohne Monatsgebühr" />
            ) : ppl ? (
              <Sum k="Paket" v="Pay-per-Lead + Software" sub="Leads separat pro Stück, kein Werbebudget" />
            ) : (
              <Sum k="Werbebudget / Monat" v={`≈ ${eur(price.monthlyBudget)}`} sub={price.tierLabel} />
            )}
            {ppl ? <Sum k="Einrichtung" v={eur(0)} sub="keine Einrichtungsgebühr" /> : <Sum
              k="Setup einmalig"
              v={eur(price.setupFee)}
              sub={`${price.setupDiscount > 0 ? `statt ${eur(price.listSetup)}, ${referralDiscount?.label ?? "Empfehlungsrabatt"} ${eur(price.setupDiscount)} · ` : ""}${eur(withVat(price.setupFee))} brutto · bei Annahme`}
            />}
            {num(introFee) != null ? (
              <Sum k={`Monat 1–${num(introMonths) ?? "?"}`} v={eur(num(introFee)!)} sub={`${eur(withVat(num(introFee)!))} brutto`} />
            ) : null}
            {nurLeads ? null : <Sum
              k={startDate ? `Paket monatlich ab ${ersterAbrechnungstag(startDate, num(billingDay)).split("-").reverse().join(".")}` : "Paket monatlich"}
              v={price.monthlyFee == null ? "individuell" : eur(price.monthlyFee)}
              sub={price.monthlyFee == null ? "bitte oben eintragen" : `${eur(withVat(price.monthlyFee))} brutto${ppl ? " · monatlich kündbar" : ` · Pause: ${eur(price.softwareFee)}`}`}
            />}
            {price.extraSeats > 0 ? (
              <Sum
                k={`${price.extraSeats} ${price.extraSeats === 1 ? "weiterer Verkäufer" : "weitere Verkäufer"}`}
                v={price.seatsIndividual ? "inklusive" : eur(price.seatsFee)}
                sub={price.seatsIndividual ? "im individuellen Preis" : `${price.extraSeats} × ${eur(PRICE_LIST.seatMonthly)} / Monat`}
              />
            ) : null}
            {price.bestandFee > 0 ? <Sum k="Bestandskunden-Modul" v={eur(price.bestandFee)} sub="pro Monat" /> : null}
            {price.empfehlungFee > 0 ? <Sum k="Empfehlungen & Bewertungen" v={eur(price.empfehlungFee)} sub="pro Monat" /> : null}
            {price.monthlyTotal != null && (price.extraSeats > 0 || price.bestandFee > 0 || price.empfehlungFee > 0) ? (
              <Sum k="Monatlich gesamt" v={eur(price.monthlyTotal)} sub={`${eur(withVat(price.monthlyTotal))} brutto`} />
            ) : null}
            {price.annualTotal != null ? (
              <Sum
                k={price.prepayMonths === 6 ? "Oder 6 Monate im Voraus (Kunde wählt)" : "Oder jährlich (Kunde wählt)"}
                v={eur(price.annualTotal)}
                sub={`${geschenkt(price.prepayFreeMonths)} (spart ${eur(price.annualSavings)}) · ${eur(withVat(price.annualTotal))} brutto`}
              />
            ) : null}
            {error ? <p className="rounded-md bg-rose-50 px-3 py-2 text-rose-700">{error}</p> : null}
            <Button type="button" variant="primary" size="md" className="w-full" disabled={pending} onClick={submit}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {entwurf?.duplikat ? "Als neuen Entwurf anlegen" : entwurf?.neueVersion ? "Als neue Version speichern" : entwurf ? "Speichern" : "Angebot erstellen"}
            </Button>
            <p className="text-xs text-[color:var(--muted)]">
              {entwurf?.duplikat
                ? "Neue Nummer und neuer Link. Ein noch offenes Angebot an diesen Kontakt wird dabei ersetzt."
                : entwurf?.neueVersion
                ? "Das verschickte Angebot wird ersetzt. Danach die neue Version per E-Mail senden."
                : entwurf
                ? "Nummer und Link bleiben gleich."
                : "Die Konditionen werden beim Erstellen eingefroren. Ein früheres offenes Angebot an diesen Kontakt wird automatisch ersetzt."}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

/** Abrechnungstag unter dem Start: zugeklappt „wie Start“, aufgeklappt Tag 1 bis 28 und „Zeit bis dahin gratis“. */
function AbrechnungstagFeld({
  startDate,
  day,
  setDay,
  free,
  setFree,
  voraus,
}: {
  startDate: string;
  day: string;
  setDay: (v: string) => void;
  free: boolean;
  setFree: (v: boolean) => void;
  /** Vorauszahlung angeboten: gilt nur, wenn der Kunde monatlich wählt (lib/abrechnungstag.ts) */
  voraus: boolean;
}) {
  const startDay = /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? Number(startDate.slice(8, 10)) : null;
  const plan = abrechnungsplan({ startIso: startDay ? startDate : null, billingDay: day ? Number(day) : null, freeStart: free });
  const differs = !!plan?.differs;
  return (
    <details className="group text-sm" data-abrechnungstag>
      <summary className="cursor-pointer text-xs font-medium text-[color:var(--brand)]">
        Abrechnungstag: {day ? `am ${day}.${differs ? (free ? ", kostenloser Start" : ", Zeit davor anteilig") : ""}` : "wie Start"}
      </summary>
      <div className="mt-2 space-y-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[color:var(--surface-sunken)] p-3">
        <label className="block space-y-1">
          <span className={label}>Abbuchung jeweils am</span>
          <select className={input} value={day} onChange={(e) => setDay(e.target.value)} name="billingDay">
            <option value="">Wie Start{startDay ? ` (${startDay}.)` : ""}</option>
            {Array.from({ length: ABRECHNUNGSTAG_MAX }, (_, i) => i + 1).map((d) => (
              <option key={d} value={String(d)}>
                {d}. des Monats
              </option>
            ))}
          </select>
        </label>
        <label className={`flex items-start gap-2 ${differs ? "" : "opacity-50"}`}>
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={free && differs} disabled={!differs} onChange={(e) => setFree(e.target.checked)} name="billingFreeStart" />
          <span>Zeit bis zum ersten Abrechnungstag gratis</span>
        </label>
        <p className="text-xs text-[color:var(--muted)]" data-abrechnungstag-hinweis>
          {differs
            ? `Erste Abbuchung am ${plan!.firstIso.split("-").reverse().join(".")}, ${plan!.free ? "Zeit davor kostenlos" : "Zeit davor anteilig mit der ersten Abbuchung"}. Laufzeit zählt ab dann.`
            : startDay && startDay > ABRECHNUNGSTAG_MAX
              ? "Wie bisher: in kürzeren Monaten am Monatsletzten."
              : "Wie bisher: Abbuchung am Starttag."}
          {differs && voraus ? ` ${VORAUSZAHLUNG_OHNE_ABRECHNUNGSTAG}` : ""}
        </p>
      </div>
    </details>
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
