// Platzhalter in E-Mail-Vorlagen (rein, auch im Browser nutzbar).

export const PLATZHALTER = ["{vorname}", "{name}", "{produkt}", "{meinname}"] as const;

export type Werte = { vorname: string; name: string; produkt: string; meinname: string };

export function fuelle(text: string, w: Werte): string {
  return text
    .replace(/\{vorname\}/g, w.vorname)
    .replace(/\{name\}/g, w.name)
    .replace(/\{produkt\}/g, w.produkt)
    .replace(/\{meinname\}/g, w.meinname);
}

/** Werte für einen Lead (Vorname = erstes Wort des Namens). */
export function werteFuer(lead: { name: string | null; source: string | null }, meinname: string): Werte {
  const name = (lead.name ?? "").trim();
  return { vorname: name.split(/\s+/)[0] || "", name, produkt: (lead.source ?? "").trim() || "Ihre Versicherung", meinname };
}
