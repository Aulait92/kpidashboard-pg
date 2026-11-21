// Schalter „Nach 5 Werktagen einmal erinnern“ in der Kampagne (Bestand Paket 4). Reines Formularfeld ohne JavaScript:
// Kästchen als Schalter gestaltet, Standard an. followUpFeld zeigt dem Server, dass der Schalter im Formular war
// (sonst bliebe „aus“ von „nicht gesendet“ nicht zu unterscheiden).

import { FOLLOW_UP_LABEL } from "@/lib/bestand/nachfassen";

export function ErinnerungSchalter({ defaultOn = true, hint }: { defaultOn?: boolean; hint: string }) {
  return (
    <label className="flex min-h-[52px] cursor-pointer items-center gap-3 py-2" data-campaign-followup>
      <input type="hidden" name="followUpFeld" value="1" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{FOLLOW_UP_LABEL}</span>
        <span className="block text-xs text-[color:var(--muted)]">{hint}</span>
      </span>
      <input type="checkbox" name="followUp" value="1" defaultChecked={defaultOn} className="peer sr-only" role="switch" />
      <span
        aria-hidden
        className="relative h-7 w-12 shrink-0 rounded-full bg-slate-300 transition peer-checked:bg-[color:var(--brand)] peer-focus-visible:ring-2 peer-focus-visible:ring-[color:var(--brand)] peer-focus-visible:ring-offset-2 after:absolute after:left-0.5 after:top-0.5 after:h-6 after:w-6 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:after:left-[22px]"
      />
    </label>
  );
}
