// Kennzahl-Kachel auf Wachstum (Ole, 18.11.2026): Bezeichnung, große Zahl (38 bis 40 px), eine Unterzeile.
// Farbe: Grün nur für Geld, das reinkommt; Blau für Chancen (klickbar); sonst schwarz.

import { cn } from "@/lib/utils";

export type KennzahlTon = "geld" | "chance" | "normal";

export const KENNZAHL_FARBE: Record<KennzahlTon, string> = {
  geld: "text-emerald-700",
  chance: "text-[color:var(--brand)]",
  normal: "text-[color:var(--foreground)]",
};

export function KennzahlInhalt({
  label,
  wert,
  unter,
  ton = "normal",
  ecke,
}: {
  label: string;
  wert: string;
  unter: React.ReactNode;
  ton?: KennzahlTon;
  /** Rechts neben der Bezeichnung, z. B. Pfeil bei klickbaren Kacheln. */
  ecke?: React.ReactNode;
}) {
  return (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-medium text-[color:var(--muted)]">{label}</span>
        {ecke}
      </span>
      <span className={cn("mt-1.5 block text-[32px] font-bold leading-tight tracking-tight tabular-nums sm:text-[40px]", KENNZAHL_FARBE[ton])}>{wert}</span>
      <span className="mt-1 block text-[15px] leading-snug text-[color:var(--muted)]">{unter}</span>
    </>
  );
}

export const KACHEL = "rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 shadow-[var(--shadow-md)] sm:p-6";

export function Kennzahl(props: { label: string; wert: string; unter: React.ReactNode; ton?: KennzahlTon; data?: string }) {
  return (
    <div className={KACHEL} data-kennzahl={props.data}>
      <KennzahlInhalt {...props} />
    </div>
  );
}
