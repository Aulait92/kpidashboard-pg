"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { MapPin } from "lucide-react";

/** „PLZ beginnt mit“ neben den Filter-Chips: Eingabe bestätigen (Enter oder Verlassen) setzt ?plz=. */
export function PlzFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [wert, setWert] = useState(params.get("plz") ?? "");
  const anwenden = () => {
    const v = wert.replace(/\D/g, "").slice(0, 5);
    if (v === (params.get("plz") ?? "")) return;
    const next = new URLSearchParams(params.toString());
    next.delete("seite");
    if (v) next.set("plz", v);
    else next.delete("plz");
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };
  return (
    <label className="relative flex h-10 w-32 items-center sm:h-9">
      <MapPin className="pointer-events-none absolute left-3 h-4 w-4 text-[color:var(--muted)]" />
      <input
        value={wert}
        onChange={(e) => setWert(e.target.value)}
        onBlur={anwenden}
        onKeyDown={(e) => e.key === "Enter" && anwenden()}
        inputMode="numeric"
        placeholder="PLZ"
        aria-label="PLZ beginnt mit"
        className="h-10 w-full rounded-full border border-[color:var(--border)] bg-white pl-9 pr-3 text-sm outline-none transition focus:border-[color:var(--brand)] sm:h-9"
      />
    </label>
  );
}
