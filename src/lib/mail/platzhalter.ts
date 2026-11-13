// Platzhalter in E-Mail-Vorlagen (rein, auch im Browser nutzbar).

export const PLATZHALTER = ["{vorname}", "{name}", "{produkt}", "{meinname}", "{signatur}"] as const;

export type Werte = { vorname: string; name: string; produkt: string; meinname: string; signatur?: string };

export function fuelle(text: string, w: Werte): string {
  return text
    .replace(/\{vorname\}/g, w.vorname)
    .replace(/\{name\}/g, w.name)
    .replace(/\{produkt\}/g, w.produkt)
    .replace(/\{meinname\}/g, w.meinname)
    .replace(/\{signatur\}/g, (w.signatur ?? "").trim());
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
