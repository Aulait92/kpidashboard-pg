// Wie lange ein Kontakt schon wartet, für „Heute“ (UX-Runde 19.11.2026, Zeit bis Erstkontakt):
// bei neuen Leads zählt jede Minute, also „vor 4 Min.“ statt „heute“.

const MIN = 60_000;
const STD = 60 * MIN;
const TAG = 24 * STD;

/** „gerade eben“, „vor 4 Min.“, „vor 2 Std.“, „gestern“, „vor 3 Tagen“. */
export function eingangAlter(iso: string | Date, now: Date = new Date()): string {
  const ms = Math.max(0, now.getTime() - new Date(iso).getTime());
  if (ms < MIN) return "gerade eben";
  if (ms < STD) return `vor ${Math.floor(ms / MIN)} Min.`;
  if (ms < TAG) return `vor ${Math.floor(ms / STD)} Std.`;
  const d = Math.floor(ms / TAG);
  return d === 1 ? "gestern" : `vor ${d} Tagen`;
}

/** Kurzer Grund für die Karte „Neue Leads“: der Titel sagt schon „jetzt anrufen“. */
export function neuerLeadGrund(reason: string): string {
  if (/^kein whatsapp/i.test(reason)) return "Kein WhatsApp";
  // Festnetznummer (lib/whatsapp/festnetz.ts FESTNETZ_REASON)
  if (/^keine handynummer:/i.test(reason)) return "Keine Handynummer";
  return "Noch nicht kontaktiert";
}
