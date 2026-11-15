// Kundendaten von Ausschließlichkeitsvertretern (Anwalts-Memo, 15.11.2026). Rein, ohne Datenbank, getestet.
//
// Kundendaten aus der Vertretertätigkeit gelten als Geschäftsgeheimnis des Versicherers (BGH I ZR 28/06). Deshalb:
//   1. Vor dem ersten Import (und vor der ersten Kampagne) bestätigt ein gebundener Vertreter ausdrücklich, dass
//      Upload und Nutzung nach seinem Agenturvertrag und dem Datenschutzrecht zulässig sind. Gespeichert mit Login,
//      Zeitpunkt und Textversion (Customer.bestandAgentConfirmed*), im Änderungsprotokoll mit Wortlaut. Ändert sich
//      der Text, wird die Bestätigung mit der neuen Version erneut abgefragt.
//   2. Cross-Selling nur für Sparten, die der Ausschließlichkeitsvertreter anbietet (Profil Customer.bestandSparten,
//      sonst die Sparten aus seinem Bestand), damit die App keine Produkte anderer Versicherer vorschlägt.
// Makler: eigene Kunden, keine Einschränkung der Vorschläge; Bestätigung wie bisher vor der ersten Kampagne.

/** Version des Bestätigungstexts (bei jeder Textänderung hochsetzen). */
export const AGENT_CONFIRM_VERSION = "ao-2026-11-15";
/** Wortlaut für gebundene Vertreter (wird so angezeigt und protokolliert). */
export const AGENT_CONFIRM_TEXT = "Ich bestätige, dass Upload und Nutzung dieser Kundendaten nach meinem Agenturvertrag und dem Datenschutzrecht zulässig sind.";
/** Wortlaut für Makler (bisherige Bestätigung vor der ersten Kampagne). */
export const BROKER_CONFIRM_TEXT = "Ich darf diese Kundendaten für diese Ansprache nutzen (im Rahmen meiner Befugnisse).";

/** Gebunden an Agenturverträge (Ausschließlichkeits- bzw. Mehrfachvertreter)? */
export function isAgencyBound(typ: string | null | undefined): boolean {
  return typ !== "makler";
}

/** Ausschließlichkeitsvertreter (nur Produkte eines Versicherers)? */
export function isExclusiveAgent(typ: string | null | undefined): boolean {
  return typ === "vertreter" || typ == null || typ === "";
}

export type AgentConfirmState = { vermittlerTyp: string | null | undefined; bestandAgentConfirmedAt: Date | null | undefined; bestandAgentConfirmedVersion?: string | null };

/** Muss vor Import bzw. Kampagne (noch) bestätigt werden? Gebundene Vertreter: aktuelle Textversion nötig. */
export function needsAgentConfirm(c: AgentConfirmState): boolean {
  if (!c.bestandAgentConfirmedAt) return true;
  return isAgencyBound(c.vermittlerTyp) && c.bestandAgentConfirmedVersion !== AGENT_CONFIRM_VERSION;
}

/** Text, den der Vermittler bestätigt (je nach Typ). */
export function agentConfirmText(typ: string | null | undefined): string {
  return isAgencyBound(typ) ? AGENT_CONFIRM_TEXT : BROKER_CONFIRM_TEXT;
}

/** Version, die beim Bestätigen gespeichert wird. */
export function agentConfirmVersion(typ: string | null | undefined): string {
  return isAgencyBound(typ) ? AGENT_CONFIRM_VERSION : "makler-2026-11-14";
}

/**
 * Sparten, für die Vorschläge (Lücke schließen) gemacht werden dürfen. null = keine Einschränkung (Makler,
 * Mehrfachvertreter). Ausschließlichkeitsvertreter: das Profil, sonst die Sparten aus dem eigenen Bestand.
 */
export function offeredLines(typ: string | null | undefined, profile: readonly string[] | null | undefined, bestandLines: Iterable<string>): Set<string> | null {
  if (!isExclusiveAgent(typ)) return null;
  const src = profile?.length ? profile : [...bestandLines];
  return new Set(src.filter((l) => l && l !== "Sonstiges"));
}

/** Darf die App Cross-Selling in diese Sparte vorschlagen? */
export function mayOffer(offered: Set<string> | null, line: string): boolean {
  return offered == null || offered.has(line);
}
