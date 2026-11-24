// Gemeinsames Anzeigenlernen (Ole, 24.11.2026): Kunden können widersprechen. Wer ausgenommen ist, wird weder als
// Quelle genutzt (seine Anzeigen als Muster für andere) noch als Ziel (Muster anderer für seine Anzeigen).
//
// Diese Datei ist die EINE Stelle, an der der Widerspruch abgefragt wird. Alle Wege fragen hier:
// - Start mit vorlagenVon (src/app/api/ops/kampagne/route.ts, startCampaignRun in run.ts)
// - Laden der Muster (loadCampaignContext in context.ts)
// - gespeicherte Muster bei Auffrischung, „Bild neu“ und Fortsetzen (sichereKontext in fremdvorlagen.ts)
// - Werbebibliothek: Seiten ausgenommener eigener Kunden (context.ts, ad-library.ts)

/** Liefert zu einer Liste von Kunden-IDs die Menge derer, die vom gemeinsamen Anzeigenlernen ausgenommen sind. */
export type LernSperre = (ids: string[]) => Promise<Set<string>>;

/**
 * Vom gemeinsamen Anzeigenlernen ausgenommene Kunden (Widerspruch) unter den übergebenen IDs.
 *
 * ACHTUNG: wird beim Zusammenführen an das Kundenfeld angeschlossen. Das Feld für den Widerspruch am Kunden legt ein
 * anderer Arbeitsgang an; bis dahin ist niemand ausgenommen (leere Menge). Beim Anschließen genügt es, den Rumpf
 * dieser Funktion zu ersetzen, zum Beispiel:
 *
 *   const { prisma } = await import("@/lib/prisma");
 *   const rows = await prisma.customer.findMany({ where: { id: { in: ids }, <Feld für den Widerspruch>: true }, select: { id: true } });
 *   return new Set(rows.map((r) => r.id));
 *
 * Für Tests ist die Funktion überall per Parameter bzw. Abhängigkeit ersetzbar (CampaignDeps.lernSperre,
 * loadCampaignContext({ lernSperre }), sichereKontext({ sperre })).
 */
export async function vomLernenAusgenommen(ids: string[]): Promise<Set<string>> {
  // wird beim Zusammenführen an das Kundenfeld angeschlossen
  void ids;
  return new Set<string>();
}

/** Klare Meldung, warum ein Start mit `vorlagenVon` abgelehnt wird (`ausgenommen`: Ergebnis für Ziel und Quelle). */
export function meldungLernSperre(zielId: string, ausgenommen: Set<string>): string {
  const wer = ausgenommen.size > 1 ? "Beide Kunden sind" : ausgenommen.has(zielId) ? "Dieser Kunde ist" : "Der Kunde, dessen Anzeigen als Muster dienen sollen, ist";
  return `vorlagenVon ist nicht möglich: ${wer} vom gemeinsamen Anzeigenlernen ausgenommen (Widerspruch). Bitte ohne vorlagenVon starten.`;
}

/** Ausgenommene unter den IDs (ohne leere Werte und Doppelte), mit der Standard-Abfrage oder einer ersetzten. */
export async function ausgenommeneUnter(ids: (string | null | undefined)[], sperre: LernSperre = vomLernenAusgenommen): Promise<Set<string>> {
  const eindeutig = [...new Set(ids.filter((x): x is string => !!x))];
  if (!eindeutig.length) return new Set<string>();
  const r = await sperre(eindeutig);
  // Nur IDs zurückgeben, nach denen gefragt wurde (eine ersetzte Abfrage darf nichts dazuerfinden)
  return new Set(eindeutig.filter((id) => r.has(id)));
}
