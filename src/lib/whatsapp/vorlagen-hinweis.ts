// Hinweise zu WhatsApp-Vorlagen im Kundenbereich (Ole, 14.11.2026): Vorlagen reichen wir automatisch ein
// (beim Verbinden der Nummer und beim Buchen bzw. Freischalten eines Moduls). Der Kunde sieht deshalb nie
// „Melden Sie sich bei uns“, sondern genau einen passenden Hinweis:
//   Nummer nicht verbunden → nur „Verbinden Sie Ihre WhatsApp-Nummer …“ mit Knopf
//   eingereicht bzw. noch nicht eingereicht → „ist bei Meta zur Freigabe eingereicht …“ (fehlt sie, reichen wir sie gleich ein)
//   abgelehnt → „Meta hat die Vorlage abgelehnt, wir kümmern uns darum“ (Admin-Aufgabe gibt es schon)
// Rein, ohne Datenbank.

export type TemplateState = "freigegeben" | "eingereicht" | "abgelehnt" | "fehlt";

export const TEMPLATE_STATE_LABEL: Record<TemplateState, string> = {
  freigegeben: "freigegeben",
  eingereicht: "eingereicht",
  abgelehnt: "abgelehnt",
  fehlt: "wird eingereicht",
};

/** Stand der Vorlagen eines Zwecks: freigegeben vor eingereicht vor abgelehnt. */
export function templateState(rows: { purpose: string; status: string }[], purpose: string): TemplateState {
  const own = rows.filter((r) => r.purpose === purpose);
  if (own.some((r) => r.status === "approved")) return "freigegeben";
  if (own.some((r) => r.status === "pending")) return "eingereicht";
  if (own.some((r) => r.status === "rejected" || r.status === "paused")) return "abgelehnt";
  return "fehlt";
}

export const CONNECT_TEXT = "Verbinden Sie Ihre WhatsApp-Nummer, danach reichen wir die Vorlagen automatisch bei Meta ein.";
export const CONNECT_HREF = "/buyer/einrichtung#whatsapp";

export type TemplateNotice =
  | { kind: "connect"; text: string; href: string }
  | { kind: "pending"; text: string }
  | { kind: "rejected"; text: string }
  | null;

/**
 * Ein Hinweis für eine Stelle mit Vorlagen (Kampagne, Empfehlungen). purposes = Zwecke, die dort gebraucht werden.
 * context „kampagne“: Kampagne lässt sich vorbereiten und startet nach der Freigabe automatisch.
 */
export function templateNotice(connected: boolean, rows: { purpose: string; status: string }[], purposes: string[], context: "kampagne" | "empfehlung"): TemplateNotice {
  if (!connected) return { kind: "connect", text: CONNECT_TEXT, href: CONNECT_HREF };
  const states = purposes.map((p) => templateState(rows, p));
  if (states.every((s) => s === "freigegeben")) return null;
  if (states.includes("abgelehnt")) {
    return { kind: "rejected", text: "Meta hat die Vorlage abgelehnt, wir kümmern uns darum. Sobald eine neue Fassung freigegeben ist, geht es automatisch weiter." };
  }
  return {
    kind: "pending",
    text:
      context === "kampagne"
        ? "Vorlage ist bei Meta zur Freigabe eingereicht (meist Minuten bis wenige Stunden). Sie können die Kampagne schon vorbereiten, sie startet nach der Freigabe automatisch."
        : "Die Vorlagen sind bei Meta zur Freigabe eingereicht (meist Minuten bis wenige Stunden). Bis dahin warten die Nachfragen, danach laufen sie automatisch.",
  };
}

/** Fehlt eine Vorlage, obwohl die Nummer verbunden ist? Dann gleich einreichen statt Hinweis. */
export function needsSubmit(connected: boolean, rows: { purpose: string; status: string }[], purposes: string[]): boolean {
  return connected && purposes.some((p) => templateState(rows, p) === "fehlt");
}
