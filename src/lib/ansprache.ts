// Ansprache von Leads und Kunden: Sie (Standard) oder Du – je Kunde einstellbar (Ole, 14.11.2026).
// Gilt für E-Mail-Vorlagen, WhatsApp-Assistent und -Vorlagen, Termin-Nachrichten und öffentliche Seiten.
// Die Oberfläche für Vermittler bleibt unverändert (Sie-Form).

export type Ansprache = "sie" | "du";

export const ANSPRACHE_LABEL: Record<Ansprache, string> = { sie: "Sie (förmlich)", du: "Du (persönlich)" };

export function asAnsprache(v: unknown): Ansprache {
  return v === "du" ? "du" : "sie";
}

/** Text je Ansprache wählen: a(ansprache, "Hast du …", "Haben Sie …"). */
export function a(ansprache: Ansprache, du: string, sie: string): string {
  return ansprache === "du" ? du : sie;
}

/**
 * Begrüßung: Du → „Hallo Anna“, Sie → „Hallo Anna Beispiel“ bzw. „Guten Tag“, wenn kein Nachname bekannt ist
 * (Geschlecht ist meist unbekannt, daher keine „Frau/Herr“-Anrede).
 */
export function begruessung(ansprache: Ansprache, name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (ansprache === "du") return parts[0] ? `Hallo ${parts[0]}` : "Hallo";
  return parts.length >= 2 ? `Hallo ${parts.join(" ")}` : "Guten Tag";
}
