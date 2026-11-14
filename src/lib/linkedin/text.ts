// Text-Regeln für LinkedIn-Posts (Ole, 14.11.2026): keine Gedankenstriche, keine Hashtags.
// Die KI bekommt die Regeln im Prompt; das hier ist das Sicherheitsnetz vor dem Speichern.

import { ohneGedankenstriche as zentral } from "@/lib/gedankenstriche";

/** Gedankenstriche (– —) entfernen: Spannen „3–5“ → „3-5“, Aufzählungsstriche → „•“, sonst Komma. */
export function ohneGedankenstriche(t: string): string {
  // LinkedIn: Spannen „3–5“ als „3-5“, sonst wie überall (lib/gedankenstriche.ts)
  return zentral(t.replace(/(\d)[ \t]*[–—][ \t]*(\d)/g, "$1-$2"));
}

/** Hashtags entfernen: reine Hashtag-Zeilen fallen weg, „#Wort“ im Satz wird zu „Wort“. */
export function ohneHashtags(t: string): string {
  return t
    .split("\n")
    .filter((line) => !/^\s*(#[\p{L}\p{N}_]+\s*)+$/u.test(line))
    .join("\n")
    .replace(/(^|[^\p{L}\p{N}_&])#(\p{L}[\p{L}\p{N}_]*)/gu, "$1$2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function postText(t: string): string {
  return ohneHashtags(ohneGedankenstriche(t));
}
