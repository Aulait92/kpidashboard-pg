import { Seite } from "@/components/admin-neu/ui/seite";
import { NEU, SEITEN } from "@/lib/admin-neu/navigation";
import { neuerPfad } from "@/lib/admin-neu/umzug";
import { cn } from "@/lib/utils";

// Bausteine des Bereichs Einstellungen im neuen Admin: Seitenrahmen jeder Einstellungsseite (Zurück zur Übersicht,
// Titel und ein Satz aus navigation.ts) und der Schalter für Formulare mit einem Knopf (an/aus per Server Action).

export const EINSTELLUNGEN = `${NEU}/einstellungen`;

export const WERKZEUGE = `${NEU}/werkzeuge`;

/** Rahmen einer Einstellungsseite: „Zurück“ zur Übersicht (Einstellungen bzw. Werkzeuge, je nach Bereich in
 *  navigation.ts), Titel und Untertitel aus navigation.ts, schmale Spalte. */
export function EinstellungSeite({
  pfad,
  titel,
  aktionen,
  breit,
  children,
}: {
  /** Pfad der Seite in navigation.ts (Titel und Untertitel kommen von dort) */
  pfad: string;
  /** Abweichender Titel (z. B. „Karte bearbeiten“) */
  titel?: string;
  aktionen?: React.ReactNode;
  /** Breite Seite (Tabellen, zwei Spalten) */
  breit?: boolean;
  children: React.ReactNode;
}) {
  const seite = SEITEN.find((s) => s.pfad === pfad);
  const zurueck = seite?.bereich === "werkzeuge" ? { href: WERKZEUGE, label: "Werkzeuge" } : { href: EINSTELLUNGEN, label: "Einstellungen" };
  return (
    <Seite titel={titel ?? seite?.titel ?? ""} untertitel={titel ? undefined : seite?.untertitel} zurueck={zurueck} aktionen={aktionen}>
      <div className={cn("space-y-5", breit ? "" : "max-w-3xl")}>{children}</div>
    </Seite>
  );
}

/** An/aus-Schalter als Absende-Knopf (für Formulare, die genau einen Wert umschalten). */
export function SchalterKnopf({ an, label, ...props }: { an: boolean; label: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="submit"
      role="switch"
      aria-checked={an}
      aria-label={`${label} ${an ? "ausschalten" : "einschalten"}`}
      className={cn("relative h-6 w-11 shrink-0 rounded-full transition", an ? "bg-[color:var(--brand)]" : "bg-slate-300")}
      {...props}
    >
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", an ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

/** Zeile in einer Karte: Titel, ein Satz, rechts Wert oder Aktion. */
export function Zeile({ titel, text, rechts, className, ...rest }: { titel: React.ReactNode; text?: React.ReactNode; rechts?: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLLIElement>) {
  return (
    <li className={cn("flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3", className)} {...rest}>
      <div className="min-w-[11rem] flex-1">
        <div className="text-sm font-medium">{titel}</div>
        {text ? <div className="text-sm text-[color:var(--muted)]">{text}</div> : null}
      </div>
      {rechts ? <div className="flex shrink-0 items-center gap-2">{rechts}</div> : null}
    </li>
  );
}

/** Link auf eine Seite eines anderen Bereichs: neue Seite, sobald sie fertig ist, sonst die heutige. */
export const ziel = (alt: string) => neuerPfad(alt) ?? alt;

export const LISTE = "divide-y divide-[color:var(--border)]";
