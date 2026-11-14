import { ZAHLART_HINWEIS, ZAHLART_OPTIONEN, ZAHLART_STANDARD, type Zahlart } from "@/lib/zahlart";

/**
 * Auswahl der Zahlart vor dem Weiterleiten zu Stripe: Lastschrift zuerst und vorausgewählt,
 * danach Karte mit Apple Pay und Google Pay (siehe lib/zahlart.ts). Ohne Hooks, damit sie in
 * Server-Formularen und in Client-Komponenten funktioniert. Feldname „zahlart“.
 */
export function ZahlartAuswahl({
  hint = ZAHLART_HINWEIS,
  value,
  onChange,
}: {
  hint?: string;
  /** gesteuert (Client-Komponente); sonst Lastschrift vorausgewählt */
  value?: Zahlart;
  onChange?: (z: Zahlart) => void;
}) {
  return (
    <fieldset className="space-y-2" data-zahlart-auswahl>
      <legend className="mb-2 text-sm font-medium">Zahlart</legend>
      {ZAHLART_OPTIONEN.map((o) => (
        <label
          key={o.value}
          className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-3 py-2.5 text-sm transition has-[:checked]:border-[color:var(--brand)] has-[:checked]:ring-2 has-[:checked]:ring-[color:var(--brand)]/20"
        >
          <input
            type="radio"
            name="zahlart"
            value={o.value}
            {...(value !== undefined
              ? { checked: value === o.value, onChange: () => onChange?.(o.value) }
              : { defaultChecked: o.value === ZAHLART_STANDARD })}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--brand)]"
          />
          <span className="min-w-0">
            <span className="block font-semibold">{o.label}</span>
            <span className="block text-xs text-[color:var(--muted)]">{o.detail}</span>
          </span>
        </label>
      ))}
      <p className="text-sm text-[color:var(--muted)]" data-zahlart-hinweis>
        {hint}
      </p>
    </fieldset>
  );
}
