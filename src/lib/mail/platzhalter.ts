// Platzhalter in E-Mail-Vorlagen (rein, auch im Browser nutzbar).

export const PLATZHALTER = ["{vorname}", "{name}", "{produkt}", "{meinname}", "{signatur}"] as const;

export type Werte = { vorname: string; name: string; produkt: string; meinname: string; signatur?: string };

/** Ohne eigene Signatur steht an ihrer Stelle ein schlichter Gruß (Ole, 14.11.2026: Signatur standardmäßig in den Vorlagen). */
export const GRUSS_OHNE_SIGNATUR = "Viele Grüße\n{meinname}";

export function fuelle(text: string, w: Werte): string {
  const sig = (w.signatur ?? "").trim();
  return text
    .replace(/\{signatur\}/g, sig ? "{signatur}" : GRUSS_OHNE_SIGNATUR)
    .replace(/\{vorname\}/g, w.vorname)
    .replace(/\{name\}/g, w.name)
    .replace(/\{produkt\}/g, w.produkt)
    .replace(/\{meinname\}/g, w.meinname)
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
export function werteFuer(lead: { name: string | null; source: string | null }, meinname: string): Werte {
  const name = (lead.name ?? "").trim();
  return { vorname: name.split(/\s+/)[0] || "", name, produkt: (lead.source ?? "").trim() || "Ihre Versicherung", meinname };
}
