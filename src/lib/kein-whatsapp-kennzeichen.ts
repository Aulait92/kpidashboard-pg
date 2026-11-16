// Kennzeichen „Kein WhatsApp“ in Pipeline und Kontaktliste (Ole, 16.11.2026).
// Ist ein Lead nicht per WhatsApp erreichbar (lib/whatsapp/kein-whatsapp.ts: Lead.waUnavailableAt bzw.
// outreachStatus „no_whatsapp“, „failed: …“, „skipped_optout“ nach 131050 oder „STOPP“), zeigen Karte und Zeile ein
// orangefarbenes Kennzeichen, ein Klick ruft an. Nur in frühen Phasen (Neuer Lead, Nicht erreicht): ab „Im Gespräch“
// ist der Lead erreicht, danach hilft das Kennzeichen nicht mehr.
// Rein (auch im Browser nutzbar), getestet in tests/unit/kein-whatsapp-kennzeichen.test.ts.

import { findPhaseForStatus } from "@/lib/products";

/** Pipeline-Phasen (lib/products.ts PIPELINE_PHASES), in denen das Kennzeichen erscheint. */
export const KEIN_WHATSAPP_PHASEN = ["neu", "nicht-erreicht"] as const;

export type KeinWhatsAppFakten = {
  status: string | null;
  phone: string | null;
  outreachStatus: string | null;
  waUnavailableAt?: Date | string | null;
  closedAt?: Date | string | null;
  erasedAt?: Date | string | null;
  /** Hat der Lead je selbst per WhatsApp geschrieben? Dann hat er WhatsApp. */
  replied?: boolean;
};

/** Steht am Lead, dass WhatsApp nicht geht (Fehler bei der ersten Nachricht, kein WhatsApp, abgemeldet)? */
export function whatsAppNichtErreichbar(f: Pick<KeinWhatsAppFakten, "outreachStatus" | "waUnavailableAt">): boolean {
  if (f.waUnavailableAt) return true;
  const s = (f.outreachStatus ?? "").trim();
  return s === "no_whatsapp" || s === "skipped_optout" || s.startsWith("failed");
}

/** Frühe Phase: Neuer Lead (auch ohne Status) oder Nicht erreicht. */
export function istFruehePhase(status: string | null | undefined): boolean {
  const s = (status ?? "").trim();
  if (!s) return true;
  const key = findPhaseForStatus(s)?.key;
  return !!key && (KEIN_WHATSAPP_PHASEN as readonly string[]).includes(key);
}

/** Kennzeichen „Kein WhatsApp“ zeigen? Nur mit Nummer (Klick ruft an), offen und in früher Phase. */
export function zeigtKeinWhatsApp(f: KeinWhatsAppFakten): boolean {
  if (!f.phone?.trim() || f.closedAt || f.erasedAt || f.replied) return false;
  return istFruehePhase(f.status) && whatsAppNichtErreichbar(f);
}
