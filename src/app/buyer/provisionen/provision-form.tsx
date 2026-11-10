"use client";

import { useActionState, useMemo, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import {
  PROVISION_PRODUCTS,
  VERMITTLER_TYPEN,
  productsForTyp,
  standardRate,
  type ProductKey,
  type ProvisionOverrides,
  type RateSpec,
  type VermittlerTyp,
} from "@/lib/provision";
import { saveProvisionAction, type ProvisionFormState } from "./actions";

// Werte im Formular in „Menschen-Einheiten“: Prozent als 55, nicht 0,55.
type Row =
  | { kind: "monthly"; months: string; fallbackAmount: string }
  | { kind: "percent"; rate: string; trail: string; defaultPremium: string };

const fmt = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");
const parse = (s: string) => {
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return s.trim() === "" ? NaN : n;
};
const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function toRow(r: RateSpec): Row {
  if (r.kind === "monthly") return { kind: "monthly", months: fmt(r.months), fallbackAmount: fmt(r.fallbackAmount) };
  if (r.kind === "percent") return { kind: "percent", rate: fmt(r.rate * 100), trail: fmt((r.trail ?? 0) * 100), defaultPremium: fmt(r.defaultPremium) };
  // fester Betrag (nur über Admin/Altbestand möglich): als Monatsregel ohne Monate zeigen
  return { kind: "monthly", months: "0", fallbackAmount: fmt(r.amount) };
}

function toSpec(r: Row): RateSpec | null {
  if (r.kind === "monthly") {
    const months = parse(r.months), fallbackAmount = parse(r.fallbackAmount);
    return Number.isFinite(months) && Number.isFinite(fallbackAmount) ? { kind: "monthly", months, fallbackAmount } : null;
  }
  const rate = parse(r.rate), trail = r.trail.trim() === "" ? 0 : parse(r.trail), defaultPremium = parse(r.defaultPremium);
  return Number.isFinite(rate) && Number.isFinite(trail) && Number.isFinite(defaultPremium)
    ? { kind: "percent", rate: rate / 100, trail: trail / 100, defaultPremium }
    : null;
}

const same = (a: Row, b: Row) => JSON.stringify(a) === JSON.stringify(b);

/** Beispielrechnung für eine Zeile. */
function example(r: Row): string {
  const s = toSpec(r);
  if (!s) return "Bitte gültige Zahlen eintragen.";
  if (s.kind === "monthly") {
    const beitrag = 250;
    return `Bei ${eur(beitrag)} Monatsbeitrag: ≈ ${eur(beitrag * s.months)} Provision · ohne Angabe ${eur(s.fallbackAmount)}`;
  }
  if (s.kind === "percent") {
    const p = s.defaultPremium;
    const abschluss = p * s.rate, bestand = p * (s.trail ?? 0);
    if (abschluss === 0 && bestand > 0) return `Bei ${eur(p)} Beitrag: ≈ ${eur(bestand)} Bestandsprovision pro Jahr`;
    if (bestand > 0) return `Bei ${eur(p)} Beitrag: ≈ ${eur(abschluss + bestand)} im 1. Jahr (${eur(abschluss)} Abschluss + ${eur(bestand)} Bestand)`;
    return `Bei ${eur(p)} Beitrag: ≈ ${eur(abschluss)} Provision`;
  }
  return "";
}

export function ProvisionForm({
  typ: initialTyp,
  custom,
  known,
  canEdit,
  readOnlyReason,
}: {
  typ: VermittlerTyp;
  custom: ProvisionOverrides;
  known: ProductKey[];
  canEdit: boolean;
  readOnlyReason?: string;
}) {
  const [typ, setTyp] = useState<VermittlerTyp>(initialTyp);
  // Zeilen mit eigenem Wert behalten ihn beim Typwechsel; Standard-Zeilen folgen dem Typ.
  const [own, setOwn] = useState<Partial<Record<ProductKey, Row>>>(() =>
    Object.fromEntries(Object.entries(custom).map(([k, v]) => [k, toRow(v as RateSpec)])),
  );
  const [state, action, pending] = useActionState<ProvisionFormState, FormData>(saveProvisionAction, {});

  const visible = useMemo(() => {
    const allowed = productsForTyp(typ);
    // Nur Produkte, die der Kunde bei uns gewählt hat (leer = Hinweis statt Formular)
    return allowed.filter((p) => known.includes(p.key));
  }, [typ, known]);

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

  const payload = JSON.stringify({
    typ,
    rates: Object.fromEntries(
      PROVISION_PRODUCTS.filter((p) => isOwn(p.key)).map((p) => [p.key, toSpec(own[p.key]!) ?? { kind: own[p.key]!.kind, invalid: true }]),
    ),
  });
  const disabled = !canEdit;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="payload" value={payload} />
      {readOnlyReason ? (
        <p className="rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-4 py-3 text-sm text-[color:var(--muted)]">{readOnlyReason}</p>
      ) : null}

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
              ? "Makler: bei Sach meist keine Abschlussprovision, sondern laufende Bestandsprovision. PKV-Tarifoptimierung in Monatsbeiträgen."
              : "Vertreter: Abschlussprovision in Prozent vom Jahresbeitrag."}
          </p>
        </fieldset>
        </div>
      </Card>

      {visible.length === 0 ? (
        <Card>
          <div className="p-5 text-sm text-[color:var(--muted)]">
            Hier erscheinen deine Produkte, sobald du sie bei uns gebucht hast. Bis dahin rechnen wir mit unseren Standardwerten.
          </div>
        </Card>
      ) : null}
      {visible.map((p) => {
        const r = rowFor(p.key);
        const ownVal = isOwn(p.key);
        return (
          <Card key={p.key}>
            <div className="p-5">
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
                  <Field label="Monatsbeiträge Provision" suffix="×" value={r.months} onChange={(v) => update(p.key, { months: v })} />
                  <Field label="Ohne Beitragsangabe" suffix="€" value={r.fallbackAmount} onChange={(v) => update(p.key, { fallbackAmount: v })} />
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Abschlussprovision" suffix="%" value={r.rate} onChange={(v) => update(p.key, { rate: v })} />
                  <Field label="Bestandsprovision pro Jahr" suffix="%" value={r.trail} onChange={(v) => update(p.key, { trail: v })} />
                </div>
              )}
              <p className="mt-3 text-sm text-[color:var(--muted)]">{example(r)}</p>
            </fieldset>
            </div>
          </Card>
        );
      })}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" size="md" icon={Check} disabled={pending}>
            {pending ? "Speichere …" : "Speichern"}
          </Button>
          {state.ok ? <span className="text-sm font-medium text-emerald-700" role="status">Gespeichert. Deine Zahlen rechnen ab jetzt damit.</span> : null}
          {state.error ? <span className="text-sm font-medium text-rose-700" role="alert">{state.error}</span> : null}
        </div>
      ) : null}
    </form>
  );
}

function Field({ label, suffix, value, onChange }: { label: string; suffix: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block min-w-0">
      <span className="text-sm text-[color:var(--muted)]">{label}</span>
      <span className="mt-1 flex items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 focus-within:border-[color:var(--brand)]">
        <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none" />
        <span className="text-sm text-[color:var(--muted)]">{suffix}</span>
      </span>
    </label>
  );
}
