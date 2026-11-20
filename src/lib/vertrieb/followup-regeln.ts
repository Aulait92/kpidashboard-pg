// Regeln des Später-Follow-ups ohne Datenbank (lib/vertrieb/followup.ts): Stufen, die es beenden, und der Grund, nicht
// (mehr) zu senden. Gemeinsam genutzt vom Versand (sendFollowupStep) und von der Übersicht „Geplante Nachrichten“
// (lib/vertrieb/geplante-nachrichten-server.ts).
import type { SalesStage as Stage } from "@/generated/prisma/enums";
import { STAGE_LABEL } from "@/lib/vertrieb/crm";

export const STOP_STAGES: Stage[] = ["TERMIN", "GEWONNEN", "VERLOREN", "UNGUELTIG"];

/** Grund, das Follow-up jetzt nicht (mehr) zu senden, oder null (Reihenfolge wie im Versand). */
export function followupStoppGrund(f: { stage: Stage | null; abgemeldet: boolean; gesperrt: boolean; beantwortet: boolean }): string | null {
  if (!f.stage) return "Kontakt gelöscht";
  if (STOP_STAGES.includes(f.stage)) return `Stufe „${STAGE_LABEL[f.stage]}“`;
  if (f.abgemeldet) return "Abgemeldet";
  if (f.gesperrt) return "Sperrliste";
  return f.beantwortet ? "Antwort erhalten" : null;
}
