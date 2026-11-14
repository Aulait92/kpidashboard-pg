"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { Check, RotateCcw } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import {
  beitragssummeExample,
  PKV_MAX_MONTHS,
  PROVISION_PRODUCTS,
  STORNO_PRO_JAHR,
  VERMITTLER_TYPEN,
  productsForTyp,
  standardRate,
  type ProductKey,
  type ProvisionOverrides,
  type RateSpec,
  type VermittlerTyp,
} from "@/lib/provision";
import { saveProvisionAction, saveStornoAction, type ProvisionFormState } from "./actions";

// Werte im Formular in „Menschen-Einheiten“: Prozent als 55, nicht 0,55. storno = eigene Stornoquote der
// Sparte in % (leer = allgemeine Quote).
type Row =
  | { kind: "monthly"; months: string; fallbackAmount: string; storno: string }
  | { kind: "percent"; rate: string; trail: string; defaultPremium: string; storno: string }
  | { kind: "beitragssumme"; promille: string; trail: string; defaultMonthly: string; defaultYears: string; defaultEndAge: string; haftungMonate: string; storno: string }
  | { kind: "honorar"; months: string; fixedAmount: string; defaultSavings: string; storno: string };

const fmt = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");
const parse = (s: string) => {
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return s.trim() === "" ? NaN : n;
};
const opt = (s: string) => (s.trim() === "" ? null : parse(s));
const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const pct = (r: number) => `${(Math.round(r * 1000) / 10).toLocaleString("de-DE")} %`;

function toRow(r: RateSpec): Row {
  const storno = r.storno != null ? fmt(r.storno * 100) : "";
  if (r.kind === "monthly") return { kind: "monthly", months: fmt(r.months), fallbackAmount: fmt(r.fallbackAmount), storno };
  if (r.kind === "percent") return { kind: "percent", rate: fmt(r.rate * 100), trail: fmt((r.trail ?? 0) * 100), defaultPremium: fmt(r.defaultPremium), storno };
  if (r.kind === "beitragssumme") {
    return {
      kind: "beitragssumme",
      promille: fmt(r.promille),
      trail: fmt(r.trail * 100),
      defaultMonthly: fmt(r.defaultMonthly),
      defaultYears: fmt(r.defaultYears),
      defaultEndAge: r.defaultEndAge ? fmt(r.defaultEndAge) : "",
      haftungMonate: fmt(r.haftungMonate),
      storno,
    };
  }
  if (r.kind === "honorar") return { kind: "honorar", months: fmt(r.months), fixedAmount: r.fixedAmount ? fmt(r.fixedAmount) : "", defaultSavings: fmt(r.defaultSavings), storno };
  // fester Betrag (nur über Admin/Altbestand möglich): als Monatsregel ohne Monate zeigen
  return { kind: "monthly", months: "0", fallbackAmount: fmt(r.amount), storno };
}

function toSpec(r: Row): RateSpec | null {
  const storno = opt(r.storno);
  if (storno != null && !Number.isFinite(storno)) return null;
  const withStorno = <T extends RateSpec>(x: T): T => (storno != null ? { ...x, storno: storno / 100 } : x);
  if (r.kind === "monthly") {
    const months = parse(r.months), fallbackAmount = parse(r.fallbackAmount);
    return Number.isFinite(months) && Number.isFinite(fallbackAmount) ? withStorno({ kind: "monthly", months, fallbackAmount }) : null;
  }
  if (r.kind === "beitragssumme") {
    const promille = parse(r.promille), trail = r.trail.trim() === "" ? 0 : parse(r.trail), defaultMonthly = parse(r.defaultMonthly);
    const defaultYears = parse(r.defaultYears), defaultEndAge = opt(r.defaultEndAge), haftungMonate = parse(r.haftungMonate);
    if (![promille, trail, defaultMonthly, defaultYears, haftungMonate].every(Number.isFinite) || (defaultEndAge != null && !Number.isFinite(defaultEndAge))) return null;
    return withStorno({ kind: "beitragssumme", promille, trail: trail / 100, defaultMonthly, defaultYears, ...(defaultEndAge ? { defaultEndAge } : {}), haftungMonate });
  }
  if (r.kind === "honorar") {
    const months = parse(r.months), fixedAmount = opt(r.fixedAmount), defaultSavings = parse(r.defaultSavings);
    if (!Number.isFinite(months) || !Number.isFinite(defaultSavings) || (fixedAmount != null && !Number.isFinite(fixedAmount))) return null;
    return withStorno({ kind: "honorar", months, defaultSavings, ...(fixedAmount ? { fixedAmount } : {}) });
  }
  const rate = parse(r.rate), trail = r.trail.trim() === "" ? 0 : parse(r.trail), defaultPremium = parse(r.defaultPremium);
  return Number.isFinite(rate) && Number.isFinite(trail) && Number.isFinite(defaultPremium)
    ? withStorno({ kind: "percent", rate: rate / 100, trail: trail / 100, defaultPremium })
    : null;
}

const same = (a: Row, b: Row) => JSON.stringify(a) === JSON.stringify(b);

/** Beispielrechnung für eine Zeile. */
function example(r: Row, typ: VermittlerTyp): string {
  const s = toSpec(r);
  if (!s) return "Bitte gültige Zahlen eintragen.";
  if (s.kind === "monthly") {
    if (s.months > PKV_MAX_MONTHS) return `Höchstens ${fmt(PKV_MAX_MONTHS)} Monatsbeiträge (§ 50 VAG).`;
    const beitrag = 250;
    return `Bei ${eur(beitrag)} Monatsbeitrag: ≈ ${eur(beitrag * s.months)} Provision · ohne Angabe ${eur(s.fallbackAmount)}`;
  }
  if (s.kind === "beitragssumme") return beitragssummeExample(s, typ);
  if (s.kind === "honorar") {
    if (s.fixedAmount) return `Honorar (vom Kunden): fest ${eur(s.fixedAmount)} je Abschluss, keine Bestandsprovision`;
    return `Bei ${eur(s.defaultSavings)} Ersparnis im Monat: ≈ ${eur(s.defaultSavings * s.months)} Honorar (vom Kunden), keine Bestandsprovision`;
  }
  if (s.kind === "percent") {
    if (s.defaultPremium <= 0) return "Bitte einen typischen Jahresbeitrag über 0 € eintragen.";
    const p = s.defaultPremium;
    const abschluss = p * s.rate, bestand = p * (s.trail ?? 0);
    if (abschluss === 0 && bestand > 0) return `Bei ${eur(p)} Beitrag: ≈ ${eur(bestand)} Bestandsprovision pro Jahr ab dem 1. Jahr`;
    // Vertreter: Bestand erst ab dem 2. Jahr
    if (bestand > 0 && typ === "vertreter") return `Bei ${eur(p)} Beitrag: ≈ ${eur(abschluss)} Provision, ab dem 2. Jahr ≈ ${eur(bestand)} Bestand pro Jahr`;
    if (bestand > 0) return `Bei ${eur(p)} Beitrag: ≈ ${eur(abschluss + bestand)} im 1. Jahr (${eur(abschluss)} Abschluss + ${eur(bestand)} Bestand)`;
    return `Bei ${eur(p)} Beitrag: ≈ ${eur(abschluss)} Provision`;
  }
  return "";
}

export function ProvisionForm({
  typ: initialTyp,
  typKnown = false,
  custom,
  known,
  canEdit,
  readOnlyReason,
  storno: initialStorno,
  real,
}: {
  typ: VermittlerTyp;
  /** Typ steht im Angebot: nur anzeigen, Ändern auf Klick. */
  typKnown?: boolean;
  custom: ProvisionOverrides;
  known: ProductKey[];
  canEdit: boolean;
  readOnlyReason?: string;
  /** Eigene Stornoquote (Anteil) oder null = Standard. */
  storno: number | null;
  /** Tatsächliche Stornoquote (Anteil), null = zu wenig Daten. */
  real: { quote: number | null; contracts: number; cancelled: number };
}) {
  const toast = useToast();
  const [typ, setTyp] = useState<VermittlerTyp>(initialTyp);
  const [changeTyp, setChangeTyp] = useState(!typKnown);
  // Zeilen mit eigenem Wert behalten ihn beim Typwechsel; Standard-Zeilen folgen dem Typ.
  const [own, setOwn] = useState<Partial<Record<ProductKey, Row>>>(() =>
    Object.fromEntries(Object.entries(custom).map(([k, v]) => [k, toRow(v as RateSpec)])),
  );
  const [storno, setStorno] = useState(initialStorno != null ? fmt(initialStorno * 100) : "");
  const [state, action, pending] = useActionState<ProvisionFormState, FormData>(saveProvisionAction, {});
  const [taking, startTake] = useTransition();

  // Produkte, die der Kunde bei uns gewählt hat (auch Tarifoptimierung beim Vertreter, wenn er solche Leads hat)
  const visible = useMemo(() => PROVISION_PRODUCTS.filter((p) => known.includes(p.key)), [known]);
  // Weitere Sparten (Cross-Selling, Ole 14.11.2026): alle übrigen, eingeklappt
  const more = useMemo(() => {
    const allowed = new Set(productsForTyp(typ).map((p) => p.key));
    return PROVISION_PRODUCTS.filter((p) => !known.includes(p.key) && (allowed.has(p.key) || !!own[p.key]));
  }, [typ, known, own]);

  const rowFor = (k: ProductKey): Row => own[k] ?? toRow(standardRate(k, typ));
  const isOwn = (k: ProductKey) => !!own[k] && !same(own[k]!, toRow(standardRate(k, typ)));

  function update(k: ProductKey, patch: Partial<Record<string, string>>) {
    setOwn((o) => ({ ...o, [k]: { ...rowFor(k), ...patch } as Row }));
  }
  function reset(k: ProductKey) {
    setOwn((o) => {
      const n = { ...o };
      delete n[k];
      return n;
    });
  }

  const stornoNum = opt(storno);
  const stornoValid = stornoNum == null || (Number.isFinite(stornoNum) && stornoNum >= 0 && stornoNum <= 50);
  const payload = JSON.stringify({
    typ,
    rates: Object.fromEntries(
      PROVISION_PRODUCTS.filter((p) => isOwn(p.key)).map((p) => [p.key, toSpec(own[p.key]!) ?? { kind: own[p.key]!.kind, invalid: true }]),
    ),
    storno: stornoNum == null ? null : stornoValid ? stornoNum / 100 : "ungültig",
  });
  const disabled = !canEdit;

  function takeReal() {
    if (real.quote == null) return;
    const q = real.quote;
    startTake(async () => {
      const res = await saveStornoAction(q);
      if (!res.ok) return toast.show({ message: res.error, tone: "error" });
      setStorno(fmt(q * 100));
      toast.show({ message: "Stornoquote übernommen. Ihre Prognosen rechnen ab jetzt damit." });
    });
  }

  function renderRow(p: (typeof PROVISION_PRODUCTS)[number]) {
    const r = rowFor(p.key);
    const ownVal = isOwn(p.key);
    const stornoField =
      r.kind === "percent" || r.kind === "beitragssumme" ? (
        <Field
          label="Stornoquote pro Jahr für diese Sparte (optional)"
          suffix="%"
          value={r.storno}
          placeholder={`allgemein ${fmt((stornoNum != null && stornoValid ? stornoNum / 100 : STORNO_PRO_JAHR) * 100)}`}
          onChange={(v) => update(p.key, { storno: v })}
        />
      ) : null;
    return (
      <Card key={p.key}>
        <div className="p-5" data-provision-row={p.key}>
          <fieldset className="min-w-0" disabled={disabled}>
            <legend className="sr-only">{p.label}</legend>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold">{p.label}</h2>
              <div className="flex items-center gap-2">
                <Badge tone={ownVal ? "info" : "neutral"}>{ownVal ? "Eigener Wert" : "Standard"}</Badge>
                {ownVal && canEdit ? (
                  <button type="button" onClick={() => reset(p.key)} className="inline-flex items-center gap-1 text-sm font-medium text-[color:var(--brand)]">
                    <RotateCcw className="h-3.5 w-3.5" /> Auf Standard
                  </button>
                ) : null}
              </div>
            </div>
            {r.kind === "monthly" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label={p.key === "pkv" ? `Monatsbeiträge Provision (höchstens ${fmt(PKV_MAX_MONTHS)})` : "Monatsbeiträge Provision"}
                  suffix="×"
                  value={r.months}
                  onChange={(v) => update(p.key, { months: v })}
                />
                <Field label="Ohne Beitragsangabe" suffix="€" value={r.fallbackAmount} onChange={(v) => update(p.key, { fallbackAmount: v })} />
                {p.key === "pkv" ? (
                  <p className="text-xs text-[color:var(--muted)] sm:col-span-2">
                    Nach § 50 VAG höchstens 3,3 % der Bruttobeitragssumme über 25 Jahre, also höchstens {fmt(PKV_MAX_MONTHS)} Monatsbeiträge.
                  </p>
                ) : null}
              </div>
            ) : r.kind === "beitragssumme" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={typ === "makler" ? "Abschlusscourtage" : "Abschlussprovision"} suffix="‰ der Beitragssumme" value={r.promille} onChange={(v) => update(p.key, { promille: v })} />
                <Field label="Bestands- bzw. Betreuungsprovision pro Jahr (ab dem 1. Jahr)" suffix="% vom Jahresbeitrag" value={r.trail} onChange={(v) => update(p.key, { trail: v })} />
                <Field label="Typischer Monatsbeitrag (wenn keiner eingetragen ist)" suffix="€" value={r.defaultMonthly} onChange={(v) => update(p.key, { defaultMonthly: v })} />
                <Field label="Laufzeit ohne Angabe" suffix="Jahre" value={r.defaultYears} onChange={(v) => update(p.key, { defaultYears: v })} />
                <Field label="Endalter, wenn das Alter bekannt ist (optional)" suffix="Jahre" value={r.defaultEndAge} onChange={(v) => update(p.key, { defaultEndAge: v })} />
                <Field label="Stornohaftungszeit" suffix="Monate" value={r.haftungMonate} onChange={(v) => update(p.key, { haftungMonate: v })} />
                {stornoField}
                <p className="text-xs text-[color:var(--muted)] sm:col-span-2">
                  Beitragssumme = Monatsbeitrag × 12 × Laufzeit. Wird der Vertrag innerhalb der Stornohaftungszeit gekündigt, schlagen wir eine anteilige Rückbelastung
                  vor (verbleibende Monate geteilt durch die Haftungszeit).
                </p>
              </div>
            ) : r.kind === "honorar" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Honorar (vom Kunden): Monate Ersparnis" suffix="×" value={r.months} onChange={(v) => update(p.key, { months: v })} />
                <Field label="Oder fester Betrag je Abschluss (optional)" suffix="€" value={r.fixedAmount} onChange={(v) => update(p.key, { fixedAmount: v })} />
                <Field label="Monatliche Ersparnis ohne Angabe" suffix="€" value={r.defaultSavings} onChange={(v) => update(p.key, { defaultSavings: v })} />
                <p className="text-xs text-[color:var(--muted)] sm:col-span-2">
                  Bei der Tarifoptimierung nach § 204 VVG zahlt der Kunde ein Honorar, es gibt keine Bestandsprovision. Es zählt im Gewinn als Ertrag. Bitte mit Ihrer
                  Honorarvereinbarung abgleichen.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Abschlussprovision" suffix="%" value={r.rate} onChange={(v) => update(p.key, { rate: v })} />
                <Field
                  label={typ === "vertreter" && parse(r.rate) > 0 ? "Bestandsprovision pro Jahr (ab 2. Jahr)" : "Bestandsprovision pro Jahr"}
                  suffix="%"
                  value={r.trail}
                  onChange={(v) => update(p.key, { trail: v })}
                />
                <Field label="Typischer Jahresbeitrag (wenn keiner eingetragen ist)" suffix="€" value={r.defaultPremium} onChange={(v) => update(p.key, { defaultPremium: v })} />
                {stornoField}
              </div>
            )}
            <p className="mt-3 text-sm text-[color:var(--muted)]">{example(r, typ)}</p>
          </fieldset>
        </div>
      </Card>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="payload" value={payload} />
      {readOnlyReason ? (
        <p className="rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-4 py-3 text-sm text-[color:var(--muted)]">{readOnlyReason}</p>
      ) : null}
      <p className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-erfahrungswerte>
        Standardwerte sind Erfahrungswerte. Bitte mit Ihrer Provisionsliste abgleichen.
      </p>

      {changeTyp ? (
        <Card>
          <div className="p-5">
            <fieldset className="min-w-0" disabled={disabled}>
              <legend className="mb-3 text-[15px] font-semibold">Ich arbeite als</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {VERMITTLER_TYPEN.map((t) => (
                  <label
                    key={t.key}
                    className={`flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-[15px] ${
                      typ === t.key ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)]" : "border-[color:var(--border)]"
                    } ${disabled ? "cursor-default opacity-80" : ""}`}
                  >
                    <input type="radio" name="typ" value={t.key} checked={typ === t.key} onChange={() => setTyp(t.key)} className="h-4 w-4" />
                    {t.label}
                  </label>
                ))}
              </div>
              <p className="mt-3 text-sm text-[color:var(--muted)]">
                {typ === "makler"
                  ? "Makler: bei Sach meist keine Abschlussprovision, sondern laufende Bestandscourtage. Leben und BU in Promille der Beitragssumme."
                  : "Vertreter: bei Sach Abschlussprovision in Prozent vom Jahresbeitrag, Leben und BU in Promille der Beitragssumme."}
              </p>
            </fieldset>
          </div>
        </Card>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-md)] bg-[color:var(--surface-sunken,#f8fafc)] px-4 py-3 text-[15px]" data-typ-known>
          <input type="hidden" name="typ" value={typ} />
          <span>
            Sie arbeiten als <b>{typ === "makler" ? "Makler" : "Vertreter"}</b>, die Sätze sind passend vorausgefüllt.
          </span>
          {!disabled ? (
            <button type="button" onClick={() => setChangeTyp(true)} className="text-sm font-semibold text-[color:var(--brand)]">
              Ändern
            </button>
          ) : null}
        </div>
      )}

      <Card>
        <div className="p-5" id="storno" data-stornoquote>
          <fieldset className="min-w-0" disabled={disabled}>
            <legend className="mb-1 text-[15px] font-semibold">Stornoquote pro Jahr</legend>
            <p className="mb-3 text-sm text-[color:var(--muted)]">
              So viele Verträge fallen pro Jahr im Schnitt weg. Damit rechnen alle Prognosen: Bestandsprovision in 5 Jahren, das Diagramm, der Gewinn mit künftigem
              Bestand und der Monatsbericht. Leer = Standard {fmt(STORNO_PRO_JAHR * 100)} %. Für einzelne Sparten können Sie unten eine eigene Quote eintragen.
            </p>
            <div className="max-w-xs">
              <Field label="Stornoquote pro Jahr (0 bis 50 %)" suffix="%" value={storno} placeholder={fmt(STORNO_PRO_JAHR * 100)} onChange={setStorno} />
            </div>
            {!stornoValid ? <p className="mt-2 text-sm text-rose-700">Bitte einen Wert zwischen 0 und 50 % eintragen.</p> : null}
            <p className="mt-3 text-sm text-[color:var(--muted)]" data-storno-real>
              {real.quote != null ? (
                <>
                  Ihre tatsächliche Quote: <b className="text-[color:var(--foreground)]">{pct(real.quote)}</b> ({real.cancelled}{" "}
                  {real.cancelled === 1 ? "Vertrag" : "Verträge"} in 12 Monaten gekündigt bzw. storniert).{" "}
                  {canEdit ? (
                    <button type="button" onClick={takeReal} disabled={taking} className="font-semibold text-[color:var(--brand)]">
                      {taking ? "Übernehme …" : "Übernehmen?"}
                    </button>
                  ) : null}
                </>
              ) : (
                <>Ihre tatsächliche Quote zeigen wir ab 20 Verträgen (bisher {real.contracts}): zu wenig Daten.</>
              )}
            </p>
          </fieldset>
        </div>
      </Card>

      {visible.length === 0 ? (
        <Card>
          <div className="p-5 text-sm text-[color:var(--muted)]">
            Hier erscheinen Ihre Produkte, sobald Sie sie bei uns gebucht haben. Bis dahin rechnen wir mit unseren Standardwerten.
          </div>
        </Card>
      ) : null}
      {visible.map((p) => renderRow(p))}

      {more.length ? (
        <details className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white" open={more.some((p) => isOwn(p.key))} data-weitere-sparten>
          <summary className="cursor-pointer px-5 py-4 text-[15px] font-semibold">Weitere Sparten (Cross-Selling)</summary>
          <div className="space-y-4 border-t border-[color:var(--border)] p-4">
            <p className="text-sm text-[color:var(--muted)]">
              Für weitere Abschlüsse bei Ihren Kunden, z. B. Haftpflicht zum Tierschutz oder eine BU. Vorausgefüllt mit üblichen Werten je Sparte. Tragen Sie Ihre
              Sätze ein, damit die Schätzung passt.
            </p>
            {more.map((p) => renderRow(p))}
          </div>
        </details>
      ) : null}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" size="md" icon={Check} disabled={pending || !stornoValid}>
            {pending ? "Speichere …" : "Speichern"}
          </Button>
          {state.ok ? <span className="text-sm font-medium text-emerald-700" role="status">Gespeichert. Ihre Zahlen rechnen ab jetzt damit.</span> : null}
          {state.error ? <span className="text-sm font-medium text-rose-700" role="alert">{state.error}</span> : null}
        </div>
      ) : null}
    </form>
  );
}

function Field({ label, suffix, value, onChange, placeholder }: { label: string; suffix: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block min-w-0">
      <span className="text-sm text-[color:var(--muted)]">{label}</span>
      <span className="mt-1 flex items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 focus-within:border-[color:var(--brand)]">
        <input inputMode="decimal" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none" />
        <span className="shrink-0 text-sm text-[color:var(--muted)]">{suffix}</span>
      </span>
    </label>
  );
}
