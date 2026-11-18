// Vermittler-Nennung gegenüber Leads und Kunden (Ole, 17.11.2026), zentral für WhatsApp-Assistent, Vorlagen,
// Buchungsbestätigung, Erinnerungen, Policen-Nachricht, Kalendereintrag und Mails an Leads:
//   Sie  → immer „Herr/Frau Nachname“, richtig gebeugt: „Herr Kannapinn zeigt Ihnen …“ (nom), „der digitale Assistent
//          von Herrn Kannapinn“, „Termin mit Herrn Kannapinn“, „für Herrn Kannapinn“ (dat bzw. akk, bei Herr gleich)
//          Nie „Vorname Nachname“. Quelle: Anrede in den Anbieterangaben (Einrichtung, Erstinformation.anrede).
//          Anrede fehlt oder bewusst keine (divers): Vor- und Nachname. Ohne Personennamen: der Agenturname.
//   Du   → der Vorname („Ole zeigt dir …“).
// Ausnahmen: Dateiname der Erstinformation, Signaturen und Absendername von Mails (dort steht die Person mit vollem Namen).
// Rein, ohne Datenbank.

import type { Ansprache, Salutation } from "@/lib/ansprache";
import { vornameAus } from "@/lib/advisor-name";

/** Der Vermittler gegenüber Leads: nom „Herr Kannapinn“, dat „Herrn Kannapinn“ (mit, von, für), Du „Ole“. */
export type VermittlerName = { nom: string; dat: string };

/**
 * Vermittler als Person: Sie „Herr/Frau Nachname“ mit Anrede aus den Anbieterangaben, ohne Anrede Vor- und Nachname;
 * Du der Vorname. Der Agenturname (fallback) nur, wenn kein Personenname bekannt ist.
 */
export function vermittlerName(an: Ansprache, opts: { name?: string | null; anrede?: Salutation | null; fallback: string }): VermittlerName {
  const name = (opts.name ?? "").replace(/\s+/g, " ").trim();
  const words = name.split(" ").filter(Boolean);
  const person = words.length >= 2 && !!vornameAus(name);
  if (an === "du") {
    const v = vornameAus(name);
    const n = v ?? opts.fallback;
    return { nom: n, dat: n };
  }
  if (!person) return { nom: opts.fallback, dat: opts.fallback };
  if (opts.anrede) {
    const last = words.at(-1)!;
    return { nom: `${opts.anrede} ${last}`, dat: `${opts.anrede === "Herr" ? "Herrn" : "Frau"} ${last}` };
  }
  return { nom: name, dat: name };
}

/** Wird der Vermittler mit Herr/Frau genannt (dann gilt die Regel „nie Vorname Nachname“)? */
export function mitAnrede(person: VermittlerName): boolean {
  return /^(Herr|Frau) \S/.test(person.nom);
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Wörter, nach denen der Name gebeugt steht (Dativ bzw. Akkusativ: bei „Herr“ beide „Herrn“). */
const GEBEUGT_NACH =
  /(?:^|[\s(„"])(mit|von|vom|bei|für|an|zu|gegenüber|über|durch|ohne|um|nach|aus|seit|vor|hinter|neben|auf|dem|den|habe|hat|haben|erreichen|erreicht|kontaktieren|fragen|informiere|informiert)\s+$/i;

/**
 * Sicherheitsnetz (wie ohneGedankenstriche): ersetzt „Ole Kannapinn“ (auch „Herr Ole Kannapinn“) in einem Text an einen
 * gesiezten Lead durch „Herr Kannapinn“ bzw. nach Präposition „Herrn Kannapinn“. Nur wenn die Anrede bekannt ist
 * (sonst ist Vor- und Nachname richtig). Dateinamen (…pdf) und Adressen bleiben unverändert. Rein.
 */
export function vermittlerNennungKorrigieren(text: string, o: { voll: string | null | undefined; person: VermittlerName; an: Ansprache }): string {
  const voll = (o.voll ?? "").replace(/\s+/g, " ").trim();
  if (o.an !== "sie" || !text || !mitAnrede(o.person) || voll.split(" ").length < 2) return text;
  const re = new RegExp(`(?:\\b(?:Herrn?|Frau)\\s+)?${esc(voll).replace(/ /g, "\\s+")}(?![\\w.-]*\\.pdf)(?![\\w-])`, "g");
  return text.replace(re, (hit, offset: number, all: string) => {
    const vor = all.slice(Math.max(0, offset - 40), offset);
    // Teil einer Adresse oder eines Dateinamens: lassen
    if (/[/_=]$/.test(vor) || /https?:\/\/\S*$/.test(vor)) return hit;
    return GEBEUGT_NACH.test(vor) ? o.person.dat : o.person.nom;
  });
}

/**
 * Prompt-Regel für den Assistenten (feste Regel, Ole 17.11.2026). voll = Vor- und Nachname des Vermittlers.
 */
export function nennungsRegel(an: Ansprache, person: VermittlerName, voll: string | null | undefined): string {
  const name = (voll ?? "").trim();
  if (an === "du") return `- Den Vermittler nennst du beim Vornamen („${person.nom}“), nie mit Vor- und Nachnamen.`;
  if (!mitAnrede(person)) return `- Den Vermittler nennst du „${person.nom}“.`;
  return [
    `- Feste Regel (hat Vorrang): Den Vermittler nennst du immer „${person.nom}“ (Nominativ: „${person.nom} zeigt Ihnen …“), nach mit, von, für, bei: „${person.dat}“ („Termin mit ${person.dat}“).`,
    name && name !== person.nom ? `  Nie „${name}“, nie den Vornamen allein, nie „${person.nom.split(" ")[0]} ${name}“.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

