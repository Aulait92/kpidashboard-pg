// Terminarten (Ole, 18.11.2026): Termine finden per Video statt. Das bringt die meisten Termine, weil Kunden ohne Anfahrt
// teilnehmen können. Telefon bzw. ein Termin vor Ort in der Agentur nur, wenn der Lead das ausdrücklich wünscht UND der
// Vermittler es freigegeben hat (AgentConfig.allowPhone / allowOnsite, Standard aus). Sonst freundlich: Video.
// Rein (ohne DB), auch im Browser nutzbar; Laden/Speichern in lib/termin-formate-server.ts.

import { a, type Ansprache } from "@/lib/ansprache";

export type TerminFormate = { telefon: boolean; vorOrt: boolean };
export const TERMIN_FORMATE_STANDARD: TerminFormate = { telefon: false, vorOrt: false };

/** Modus eines Termins (Appointment.mode). */
export type TerminModus = "video" | "phone" | "onsite";

/** Text über den Kästchen (Einrichtung und Einstellungen), ein Satz (Ole, 19.11.2026). */
export const TERMIN_FORMATE_TEXT =
  "Ihre Termine finden per Video statt, nur auf ausdrücklichen Wunsch Ihres Kunden darf Ihr Assistent auch anbieten:";

/** Freundliche Antwort, wenn der Lead etwas anderes möchte, das nicht freigegeben ist. */
export function nurVideoSatz(an: Ansprache): string {
  return a(
    an,
    "Der Termin findet per Video statt, das geht ganz einfach an deinem Handy, ohne App.",
    "Der Termin findet per Video statt, das geht ganz einfach am Handy, ohne App.",
  );
}

/** Formate aus dem Formular bzw. aus gespeicherten Werten (alles außer true = aus). */
export function asTerminFormate(v: { telefon?: unknown; vorOrt?: unknown } | null | undefined): TerminFormate {
  return { telefon: v?.telefon === true, vorOrt: v?.vorOrt === true };
}

/**
 * Welcher Modus wird gebucht? Video immer; Telefon bzw. vor Ort nur, wenn freigegeben. Nicht freigegeben → null
 * (der Assistent bucht dann nicht, sondern sagt freundlich, dass der Termin per Video stattfindet).
 */
export function erlaubterModus(wunsch: unknown, f: TerminFormate): TerminModus | null {
  if (wunsch === "phone") return f.telefon ? "phone" : null;
  if (wunsch === "onsite") return f.vorOrt ? "onsite" : null;
  return "video";
}

/**
 * Modus einer Online-Buchung (Buchungsseite, Dankeseite des Leadformulars, Mail-Strecke): Video ist Standard. Telefon nur,
 * wenn der Lead es ausdrücklich gewählt hat UND der Vermittler es freigegeben hat; vor Ort nur freigegeben und mit
 * Anschrift (ortBekannt). Ohne bzw. mit unbekannter Wahl immer Video (Ole, 26.11.2026).
 */
export function buchungsModus(wunsch: unknown, f: TerminFormate, ortBekannt = false): TerminModus {
  if (wunsch === "phone" && f.telefon) return "phone";
  if (wunsch === "onsite" && f.vorOrt && ortBekannt) return "onsite";
  return "video";
}

/** Prompt-Zeilen zur Terminart für den Assistenten. */
export function terminArtRegel(an: Ansprache, f: TerminFormate): string {
  const andere = [f.telefon ? "Telefon (modus phone)" : "", f.vorOrt ? "einen Termin vor Ort in der Agentur (modus onsite)" : ""].filter(Boolean);
  const nein = `„${nurVideoSatz(an)}“`;
  return [
    "- Terminart: Schlag immer einen Videotermin vor (modus video) und biete von dir aus nichts anderes an, erwähne Telefon oder vor Ort nicht.",
    andere.length
      ? `- Nur wenn der Lead ausdrücklich etwas anderes wünscht, darfst du ${andere.join(" oder ")} buchen. Wünscht er etwas anderes, das hier nicht steht, antworte freundlich: ${nein}`
      : `- Wünscht der Lead ausdrücklich Telefon oder einen Termin vor Ort, antworte freundlich: ${nein} Buche trotzdem per Video.`,
  ].join("\n");
}
