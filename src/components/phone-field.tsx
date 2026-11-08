"use client";

import { useMemo, useState } from "react";

// Telefonfeld wie bei Calendly: Länderflagge + Vorwahl vorne, dahinter die
// Nummer. Abgeschickt wird ein verstecktes Feld `name` im internationalen
// Format (+49151…). Tippt jemand trotzdem „0151…" oder „+49 151…" bzw.
// „0049…", wird das sauber übernommen statt doppelt vorgewählt.

type Country = { code: string; flag: string; dial: string; label: string };

const COUNTRIES: Country[] = [
  { code: "DE", flag: "🇩🇪", dial: "49", label: "Deutschland" },
  { code: "AT", flag: "🇦🇹", dial: "43", label: "Österreich" },
  { code: "CH", flag: "🇨🇭", dial: "41", label: "Schweiz" },
  { code: "NL", flag: "🇳🇱", dial: "31", label: "Niederlande" },
  { code: "BE", flag: "🇧🇪", dial: "32", label: "Belgien" },
  { code: "LU", flag: "🇱🇺", dial: "352", label: "Luxemburg" },
  { code: "FR", flag: "🇫🇷", dial: "33", label: "Frankreich" },
  { code: "IT", flag: "🇮🇹", dial: "39", label: "Italien" },
  { code: "ES", flag: "🇪🇸", dial: "34", label: "Spanien" },
  { code: "PL", flag: "🇵🇱", dial: "48", label: "Polen" },
  { code: "DK", flag: "🇩🇰", dial: "45", label: "Dänemark" },
  { code: "CZ", flag: "🇨🇿", dial: "420", label: "Tschechien" },
  { code: "TR", flag: "🇹🇷", dial: "90", label: "Türkei" },
  { code: "GB", flag: "🇬🇧", dial: "44", label: "Vereinigtes Königreich" },
  { code: "US", flag: "🇺🇸", dial: "1", label: "USA / Kanada" },
];

/** Eingabe + Land → internationale Nummer (+…) oder "" wenn leer. */
export function toInternational(raw: string, dial: string): string {
  const t = raw.trim();
  if (!t) return "";
  const digits = t.replace(/\D/g, "");
  if (t.startsWith("+")) return `+${digits}`;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  // Nationale Schreibweise: führende 0 entfällt (0151 → 151).
  return `+${dial}${digits.replace(/^0+/, "")}`;
}

export function PhoneField({
  name,
  label,
  required = true,
  defaultInternational,
}: {
  name: string;
  label: string;
  required?: boolean;
  /** Vorbelegung als internationale Ziffern, z. B. „491711234567". */
  defaultInternational?: string;
}) {
  const initial = (() => {
    const digits = (defaultInternational ?? "").replace(/\D/g, "");
    if (!digits) return { country: COUNTRIES[0], rest: "" };
    const match = [...COUNTRIES]
      .sort((a, b) => b.dial.length - a.dial.length)
      .find((c) => digits.startsWith(c.dial));
    return match
      ? { country: match, rest: digits.slice(match.dial.length) }
      : { country: COUNTRIES[0], rest: digits };
  })();
  const [country, setCountry] = useState<Country>(initial.country);
  const [value, setValue] = useState(initial.rest);
  const international = useMemo(() => toInternational(value, country.dial), [value, country]);

  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[color:var(--muted)]">{label}</span>
      <div className="flex items-stretch overflow-hidden rounded-lg border border-[color:var(--border)] bg-white focus-within:border-[color:var(--brand)]">
        <div className="relative flex items-center gap-1 border-r border-[color:var(--border)] pl-3 pr-2">
          <span aria-hidden="true" className="text-xl leading-none">
            {country.flag}
          </span>
          <span aria-hidden="true" className="text-[10px] text-[color:var(--muted)]">
            ▾
          </span>
          {/* Natives Select über der Flagge: zugänglich + mobil gut bedienbar */}
          <select
            aria-label="Land / Vorwahl"
            value={country.code}
            onChange={(e) =>
              setCountry(COUNTRIES.find((c) => c.code === e.target.value) ?? COUNTRIES[0])
            }
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.label} (+{c.dial})
              </option>
            ))}
          </select>
        </div>
        <span className="flex select-none items-center pl-3 text-base text-[color:var(--foreground)]">
          +{country.dial}
        </span>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          required={required}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="151 23456789"
          className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-base focus:outline-none"
        />
      </div>
      <input type="hidden" name={name} value={international} />
    </label>
  );
}
