// Name eines Kontakts (Ole, 19.11.2026). Rangfolge für den Anzeigenamen:
//   1. von Hand im Kontakt geändert (lib/lead-stammdaten.ts schreibt Lead.name und setzt contactEditedAt)
//   2. Name aus dem Leadformular (Lead.name beim Eingang)
//   3. WhatsApp-Profilname (contacts[].profile.name im Webhook), nur wenn es sonst keinen Namen gibt
// Conversation.contactName ist die Kopie für Chatliste und Chat: mit Lead gilt Lead.name, der Profilname füllt nur
// Chats ohne Lead bzw. mit einem Lead ohne Namen. Ohne Datenbank (reine Funktionen, Unit-Tests).
//
// Neue Anfrage mit derselben Nummer bzw. E-Mail (lib/lead-erneut.ts), namensWechsel entscheidet:
//   gleich         derselbe Name: wie bisher (Antworten ergänzt, kein neuer Name)
//   neuer_name     derselbe Kontakt, der Name der neuen Anfrage gilt (Verlauf „Neue Anfrage als … (vorher: …)“)
//   von_hand       Name wurde im Kontakt von Hand geändert: bleibt, der neue Name steht als weitere Angabe da
//   andere_person  beide Nachnamen bekannt und deutlich verschieden: eigener Lead, der WhatsApp-Chat geht an die neue
//                  Anfrage. Tippfehler und Schreibweisen („Meier“/„Meyer“, „Schmidt“/„Schmitt“, ein fehlender Buchstabe)
//                  gelten als dieselbe Person, sonst würde ein Vertipper den Kontakt teilen und den Chat neu starten.

import { kontaktParts } from "@/lib/ansprache";

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** Anzeigename für Chatliste und Chat: Name am Lead (von Hand bzw. Formular) vor dem Namen am Chat (Profilname). */
export function anzeigeName(o: { leadName?: string | null; contactName?: string | null }): string | null {
  return clean(o.leadName) || clean(o.contactName) || null;
}

/** Darf der WhatsApp-Profilname den Namen am Chat setzen? Nur ohne Lead bzw. mit einem Lead ohne Namen. */
export function profilNameErlaubt(lead: { name?: string | null } | null | undefined): boolean {
  return !clean(lead?.name);
}

/** Nachname zum Vergleichen: klein, Umlaute ausgeschrieben, nur Buchstaben je Namensteil. */
function nachnameTeile(name: string | null | undefined): string[] {
  const last = kontaktParts({ fullName: clean(name) }).last;
  return last
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .split(/[-\s]+/)
    .map((t) => t.replace(/[^a-z]/g, ""))
    .filter((t) => t.length > 1);
}

/** Abstand zweier Namensteile (Einfügen, Löschen, Ersetzen, Nachbarn vertauscht), früh abgebrochen ab `max + 1`. */
function abstand(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let vorvor: number[] = [];
  let vor = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const zeile = [i];
    for (let j = 1; j <= b.length; j++) {
      const gleich = a[i - 1] === b[j - 1];
      let d = Math.min(vor[j] + 1, zeile[j - 1] + 1, vor[j - 1] + (gleich ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, vorvor[j - 2] + 1);
      zeile.push(d);
    }
    vorvor = vor;
    vor = zeile;
  }
  return vor[b.length];
}

/** Derselbe Nachname trotz Tippfehler oder Schreibweise: gleich, höchstens 1 Abweichung (ab 6 Buchstaben 2). */
function aehnlich(a: string, b: string): boolean {
  if (a === b) return true;
  const kurz = Math.min(a.length, b.length);
  if (kurz < 4) return false;
  const max = kurz >= 6 ? 2 : 1;
  return abstand(a, b, max) <= max;
}

/**
 * Offensichtlich eine andere Person: beide Nachnamen bekannt und ohne gemeinsamen bzw. ähnlichen Teil
 * („Müller-Lang“ ≈ „Lang“, „Meier“ ≈ „Meyer“).
 */
export function andererNachname(alt: string | null | undefined, neu: string | null | undefined): boolean {
  const a = nachnameTeile(alt);
  const b = nachnameTeile(neu);
  if (a.length === 0 || b.length === 0) return false;
  return !a.some((t) => b.some((u) => aehnlich(t, u)));
}

export type NamensWechsel = "gleich" | "neuer_name" | "von_hand" | "andere_person";

const vergleich = (s: string | null | undefined) => clean(s).toLowerCase();

/** Was passiert mit dem Namen, wenn eine neue Anfrage zu einem bestehenden Lead passt? */
export function namensWechsel(alt: { name?: string | null; contactEditedAt?: Date | null }, neu: string | null | undefined): NamensWechsel {
  if (!clean(neu) || vergleich(alt.name) === vergleich(neu)) return "gleich";
  if (andererNachname(alt.name, neu)) return "andere_person";
  if (alt.contactEditedAt) return "von_hand";
  return "neuer_name";
}
