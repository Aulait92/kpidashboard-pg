// Texte des Maskottchens Leo (components/leo.tsx), Sie-Form, ohne Gedankenstriche. Nur Aussagen, die stimmen:
// Push nur, wenn der Login Mitteilungen bekommt; „in wenigen Minuten“ nur, wenn der Assistent neue Leads selbst und
// ohne lange Wartezeit anschreibt (lib/lead-intake.ts: sofort bei Wartezeit 0, sonst der Cron nach outreachDelayMin).

/** Höchste Wartezeit des Erstanschreibens, bei der „in wenigen Minuten“ noch stimmt. */
export const LEO_WENIGE_MINUTEN = 10;

/** Begrüßung oben in der Einrichtung beim ersten Besuch. name: „Herr Becker“ (lib/vermittler-nennung.ts grussName) oder null. */
export function leoWillkommen(name: string | null | undefined): { titel: string; text: string } {
  const n = name?.trim();
  return { titel: n ? `Willkommen, ${n}!` : "Willkommen!", text: "Ich bin Leo und helfe Ihnen bei der Einrichtung." };
}

/**
 * „Heute“ ohne Aufgaben. push: Login hat Mitteilungen (Web-Push oder App). assistent: Wartezeit des Erstanschreibens in
 * Minuten, null = Assistent schreibt neue Leads nicht selbst an.
 */
export function heuteLeer(o: { push: boolean; assistentMinuten: number | null }): { titel: string; text: string; zuKontakten: boolean } {
  const saetze = [o.push ? "Neue Leads melde ich Ihnen sofort per Push." : "Neue Leads finden Sie sofort unter Kontakte."];
  if (o.assistentMinuten != null && o.assistentMinuten <= LEO_WENIGE_MINUTEN) saetze.push("Ihr Assistent schreibt sie in wenigen Minuten an.");
  return { titel: "Alles erledigt für heute.", text: saetze.join(" "), zuKontakten: !o.push };
}
