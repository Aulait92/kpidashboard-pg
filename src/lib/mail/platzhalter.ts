// Platzhalter in E-Mail-Vorlagen (rein, auch im Browser nutzbar).

import { begruessung, type Ansprache } from "@/lib/ansprache";

export const PLATZHALTER = ["{anrede}", "{vorname}", "{nachname}", "{name}", "{produkt}", "{terminlink}", "{meinname}", "{signatur}"] as const;

export type Werte = {
  vorname: string;
  name: string;
  produkt: string;
  meinname: string;
  signatur?: string;
  /** Nachname (letztes Wort des Namens) */
  nachname?: string;
  /** Begrüßung je Ansprache: „Hallo Anna“ bzw. „Hallo Anna Beispiel“ / „Guten Tag“ */
  anrede?: string;
  /** Persönlicher Buchungslink; leer = Satz mit {terminlink} entfällt (z. B. Termin steht schon) */
  terminlink?: string | null;
};

/** Ohne eigene Signatur steht an ihrer Stelle ein schlichter Gruß (Ole, 14.11.2026: Signatur standardmäßig in den Vorlagen). */
export const GRUSS_OHNE_SIGNATUR = "Viele Grüße\n{meinname}";

/** Satz mit {terminlink} entfernen, wenn es keinen Link gibt (z. B. Termin steht schon). */
function ohneTerminlinkSatz(text: string): string {
  return text
    .replace(/[^.!?\n]*\{terminlink\}[^\n.!?]*[.!?]?[ \t]*/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

export function fuelle(text: string, w: Werte): string {
  const sig = (w.signatur ?? "").trim();
  const link = (w.terminlink ?? "").trim();
  const base = link ? text : ohneTerminlinkSatz(text);
  return base
    .replace(/\{signatur\}/g, sig ? "{signatur}" : GRUSS_OHNE_SIGNATUR)
    .replace(/\{anrede\}/g, () => w.anrede ?? `Hallo ${w.vorname}`.trim())
    .replace(/\{vorname\}/g, () => w.vorname)
    .replace(/\{nachname\}/g, () => w.nachname ?? "")
    .replace(/\{name\}/g, () => w.name)
    .replace(/\{produkt\}/g, () => w.produkt)
    .replace(/\{terminlink\}/g, () => link)
    .replace(/\{meinname\}/g, () => w.meinname)
    .replace(/\{signatur\}/g, () => sig);
}

/**
 * Text einer Vorlage mit Signatur (Ole, 14.11.2026): steht {signatur} in der Vorlage, dort –
 * sonst automatisch darunter (nach einer Leerzeile). Ohne Signatur unverändert.
 */
export function fuelleMitSignatur(text: string, w: Werte): string {
  const filled = fuelle(text, w);
  const sig = (w.signatur ?? "").trim();
  if (!sig || text.includes("{signatur}")) return filled;
  return `${filled.trimEnd()}\n\n${sig}`;
}

/** Werte für einen Lead (Vorname = erstes Wort des Namens). */
export function werteFuer(
  lead: { name: string | null; source: string | null },
  meinname: string,
  opts: { ansprache?: Ansprache; terminlink?: string | null } = {},
): Werte {
  const name = (lead.name ?? "").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  return {
    vorname: parts[0] || "",
    nachname: parts.length >= 2 ? parts[parts.length - 1] : "",
    name,
    produkt: (lead.source ?? "").trim() || (opts.ansprache === "du" ? "deine Versicherung" : "Ihre Versicherung"),
    meinname,
    anrede: begruessung(opts.ansprache ?? "sie", name),
    terminlink: opts.terminlink ?? null,
  };
}

/** Text enthält einen Terminlink? (für „Erinnern, falls kein Termin gebucht wird“) */
export function hatTerminlink(text: string, link: string | null | undefined): boolean {
  return !!link && text.includes(link);
}
