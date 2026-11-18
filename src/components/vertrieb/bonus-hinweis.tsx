import { bonusZeile, type BonusStand } from "@/lib/vertrieb/angebote-uebersicht";

/** Abschlussbonus unter „Gültig bis“ (Ole, 18.11.2026): läuft = grün, sonst grau. */
export function BonusHinweis({ b }: { b: BonusStand }) {
  const ton = b.stand === "laeuft" ? "font-medium text-emerald-700" : "text-[color:var(--muted)]";
  return (
    <span className={`mt-1 block whitespace-nowrap text-xs ${ton}`} data-bonus={b.stand}>
      {bonusZeile(b)}
    </span>
  );
}
