// Artikel vor dem Produkt in Nachrichten an Leads (Ole, 23.11.2026: „sollen wir mit Kfz-Versicherung weitermachen?“,
// es fehlte „der“). Das Thema ist meist der Produktname („Kfz-Versicherung“, „Privatschutz“, „Sterbegeld“) oder schon
// „Ihrer Anfrage“. Geschlecht nach der Endung; Unbekanntes und Aufzählungen bleiben ohne Artikel (nie raten).

type Genus = "f" | "m" | "n" | "pl";

const ENDUNGEN: [RegExp, Genus][] = [
  [/(versicherung|vorsorge|haftpflicht|rente|police|absicherung|tarifoptimierung|optimierung|beratung|finanzierung|anfrage)$/i, "f"],
  [/(schutz|zusatz|hausrat|sparplan|plan|wechsel|vergleich|check)$/i, "m"],
  [/(geld|paket|konto|sparen)$/i, "n"],
  [/(pläne|versicherungen|verträge)$/i, "pl"],
];

function genus(thema: string): Genus | null {
  const t = thema.trim();
  // Schon mit Artikel bzw. Pronomen, oder Aufzählung („Haftpflicht, Hausrat“): nichts ändern
  if (!t || /^(der|die|das|dem|den|des|ihre[mnrs]?|deine[mnrs]?|eine[mnrs]?)\s/i.test(t) || /,|\sund\s/.test(t)) return null;
  for (const [re, g] of ENDUNGEN) if (re.test(t)) return g;
  return null;
}

const ARTIKEL: Record<"dat" | "akk", Record<Genus, string>> = {
  dat: { f: "der", m: "dem", n: "dem", pl: "den" },
  akk: { f: "die", m: "den", n: "das", pl: "die" },
};

/** „mit der Kfz-Versicherung“, „für den Privatschutz“, „zur Kfz-Versicherung“, „zum Sterbegeld“; sonst ohne Artikel. */
export function mitThema(praep: "mit" | "zu" | "für", thema: string): string {
  const g = genus(thema);
  const t = thema.trim();
  if (!g) return `${praep} ${t}`;
  if (praep === "zu") return g === "f" ? `zur ${t}` : g === "pl" ? `zu den ${t}` : `zum ${t}`;
  return `${praep} ${ARTIKEL[praep === "mit" ? "dat" : "akk"][g]} ${t}`;
}
