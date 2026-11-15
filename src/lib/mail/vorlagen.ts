// E-Mail-Vorlagen der Vermittler (Ole, 13.11.2026). Beim ersten Öffnen mit Standardvorlagen gefüllt.
// Platzhalter: {anrede}, {vorname}, {nachname}, {name}, {produkt}, {terminlink}, {meinname}, {signatur} (Signatur sonst automatisch darunter)
// und die Zusatz-Platzhalter aus lib/mail/platzhalter.ts (z. B. {termin_datum}, {fehlende_unterlagen}), die der Dialog füllt.

import { prisma } from "@/lib/prisma";
import { asAnsprache, type Ansprache } from "@/lib/ansprache";
import { STANDARD_VORLAGEN_STAND2 } from "@/lib/mail/vorlagen-alt";

export { PLATZHALTER, ZUSATZ_PLATZHALTER, fuelle, fuelleMitSignatur, werteFuer, type Werte } from "@/lib/mail/platzhalter";

/** Fester Schlüssel je Standardvorlage (bleibt, auch wenn der Kunde Name oder Text ändert). */
export type VorlageKey =
  | "nicht_erreicht"
  | "angebot"
  | "nachfassen_angebot"
  | "nach_abschluss"
  | "termin_vorbereitung"
  | "nicht_erschienen"
  | "beratungsdoku"
  | "unterlagen_fehlen"
  | "willkommen"
  | "kuendigung"
  | "wie_besprochen"
  | "tuer_offen";

/**
 * Stand der Standardvorlagen (Customer.mailVorlagenStand). Kommt eine neue Standardvorlage dazu,
 * bekommt sie den nächsten Stand; bestehende Kunden erhalten sie beim nächsten Laden (ohne Doppelungen,
 * eigene Vorlagen bleiben). 1 = die ersten vier (13.11.2026), 2 = acht neue (14.11.2026),
 * 3 = alle Texte verkaufsstärker (15.11.2026): unverändert gespeicherte Standardvorlagen werden beim nächsten Laden
 * auf die neue Fassung gehoben (neueFassungen), selbst geänderte bleiben.
 */
export const VORLAGEN_STAND = 3;
export const STAND_JE_VORLAGE: Record<VorlageKey, number> = {
  nicht_erreicht: 1,
  angebot: 1,
  nachfassen_angebot: 1,
  nach_abschluss: 1,
  termin_vorbereitung: 2,
  nicht_erschienen: 2,
  beratungsdoku: 2,
  unterlagen_fehlen: 2,
  willkommen: 2,
  kuendigung: 2,
  wie_besprochen: 2,
  tuer_offen: 2,
};

type Std = { key: VorlageKey; name: string; subject: string; body: string };

// Standardvorlagen je Ansprache (Ole, 14.11.2026): Sie ist Standard. Ohne Gedankenstriche.
// Stand 3 (Ole, 15.11.2026, verkaufsstärker): eine E-Mail, ein Ziel, kurz; persönlicher Betreff mit Namen und Produkt
// ({betreff_name}{ihr_produkt}: „Frau Schneider, kurz zu Ihrer Zahnzusatzversicherung“, ohne Namen „Kurz zu …“);
// „Nicht erreicht“ mit zwei Rückrufzeiten und Buchungslink; Angebot mit drei Vorteilen (füllt der Vermittler) und
// festem nächsten Schritt („Ich rufe Sie am … kurz an, passt das?“); Nachfassen mit einer konkreten Frage.
// {anrede} = „Guten Tag Frau Beispiel“ bzw. „Guten Tag Anna Beispiel“ / „Guten Tag“ (Sie) oder „Hallo Anna“ (Du), siehe lib/ansprache.ts.
// {terminlink} = persönlicher Buchungslink; ohne Link (Termin steht schon) entfällt der Satz. Gleiches gilt für {videolink}.
// Reihenfolge und Namen sind in beiden Fassungen gleich (vorlagenAufAnsprache stellt je Position um).
export const STANDARD_VORLAGEN_JE: Record<Ansprache, Std[]> = {
  sie: [
    {
      key: "nicht_erreicht",
      name: "Nicht erreicht",
      subject: "{betreff_name}kurz zu {ihr_produkt}",
      body: "{anrede},\n\nich habe gerade versucht, Sie anzurufen, leider ohne Erfolg. Ich versuche es gern noch einmal {rueckruf_1} oder {rueckruf_2}. Passt Ihnen eine der beiden Zeiten? Oder Sie suchen sich hier direkt einen Termin aus: {terminlink}\n\n{signatur}",
    },
    {
      key: "angebot",
      name: "Angebot",
      subject: "{betreff_name}Ihr Angebot zu {produkt}",
      body: "{anrede},\n\nwie besprochen erhalten Sie im Anhang Ihr Angebot. Das Wichtigste für Sie:\n• {vorteil_1}\n• {vorteil_2}\n• {vorteil_3}\n\nIch rufe Sie am {anruf_tag} kurz an, passt das?\n\n{signatur}",
    },
    {
      key: "nachfassen_angebot",
      name: "Nachfassen Angebot",
      subject: "{betreff_name}kurze Frage zu Ihrem Angebot",
      body: "{anrede},\n\nkonnten Sie sich das Angebot schon ansehen? Ist für Sie eher der Beitrag oder die Leistung entscheidend? Eine kurze Antwort auf diese E-Mail genügt, dann stimme ich das Angebot darauf ab.\n\n{signatur}",
    },
    {
      key: "nach_abschluss",
      name: "Nach dem Abschluss",
      subject: "{betreff_name}vielen Dank für Ihr Vertrauen",
      body: "{anrede},\n\nvielen Dank für Ihr Vertrauen. Ihre Unterlagen erhalten Sie in Kürze. Wenn Sie Fragen haben, antworten Sie einfach auf diese E-Mail.\n\n{signatur}",
    },
    {
      key: "termin_vorbereitung",
      name: "Termin: Vorbereitung",
      subject: "{betreff_name}kurz zur Vorbereitung auf unser Gespräch",
      body: "{anrede},\n\nich freue mich auf unser Gespräch am {termin_datum} {termin_art}. Den Link zum Videocall finden Sie hier: {videolink}\n\nDamit wir die Zeit gut nutzen, legen Sie sich bitte Folgendes bereit:\n{termin_unterlagen}\n\nFehlt etwas davon, klären wir es im Gespräch.\n\n{signatur}",
    },
    {
      key: "nicht_erschienen",
      name: "Nicht erschienen",
      subject: "{betreff_name}neuer Termin für unser Gespräch?",
      body: "{anrede},\n\nkein Problem, so etwas passiert. Sollen wir einen neuen Termin finden? Hier suchen Sie sich direkt eine passende Zeit aus: {terminlink}\n\n{signatur}",
    },
    {
      key: "beratungsdoku",
      name: "Gesprächszusammenfassung",
      subject: "{betreff_name}Zusammenfassung unseres Gesprächs",
      body: "{anrede},\n\nvielen Dank für das Gespräch. Wie besprochen fasse ich die wichtigsten Punkte für Sie zusammen.\n\nIhre Wünsche und Bedürfnisse:\n{wuensche}\n\nMein Rat und die Gründe dafür:\n{rat}\n\nBitte lesen Sie die Zusammenfassung in Ruhe durch. Wenn etwas fehlt oder nicht stimmt, geben Sie mir bitte kurz Bescheid.\n\n{signatur}",
    },
    {
      key: "unterlagen_fehlen",
      name: "Unterlagen fehlen noch",
      subject: "{betreff_name}es fehlen nur noch wenige Angaben",
      body: "{anrede},\n\ndamit ich alles für Sie fertig machen kann, fehlen mir nur noch diese Angaben bzw. Unterlagen:\n{fehlende_unterlagen}\n\nAm einfachsten antworten Sie direkt auf diese E-Mail, gern mit Foto oder Anhang.\n\n{signatur}",
    },
    {
      key: "willkommen",
      name: "Willkommen: Police ist da",
      subject: "{betreff_name}Ihre Police ist da",
      body: "{anrede},\n\nIhre Police ist fertig, herzlich willkommen! Bitte bewahren Sie die Unterlagen gut auf. Auch künftig bin ich für alle Fragen rund um Ihre Versicherung für Sie da.\n\nSo erreichen Sie mich: Antworten Sie einfach auf diese E-Mail oder rufen Sie mich an.\n\nSo melden Sie einen Schaden: Geben Sie mir möglichst bald Bescheid und schildern Sie kurz, was passiert ist. Bewahren Sie Fotos, Rechnungen und andere Belege auf. Ich unterstütze Sie bei der Meldung an den Versicherer.\n\n{signatur}",
    },
    {
      key: "kuendigung",
      name: "Kündigung alte Versicherung",
      subject: "{betreff_name}Kündigung Ihrer bisherigen Versicherung",
      body: "{anrede},\n\ndamit Sie nicht doppelt versichert sind, sollte Ihr bisheriger Vertrag rechtzeitig gekündigt werden. Dafür habe ich Ihnen unten eine Musterkündigung vorbereitet. Bitte ergänzen Sie Ihre Anschrift, unterschreiben Sie und schicken Sie die Kündigung an Ihren bisherigen Versicherer, am besten so, dass Sie den Versand nachweisen können.\n\n{musterkuendigung}\n\nWenn Sie Fragen haben, melden Sie sich gern.\n\n{signatur}",
    },
    {
      key: "wie_besprochen",
      name: "Wie besprochen: später melden",
      subject: "{betreff_name}wie besprochen melde ich mich später",
      body: "{anrede},\n\nvielen Dank für das Gespräch. Wie besprochen melde ich mich am {melde_datum} wieder bei Ihnen. Haben Sie vorher Fragen, antworten Sie einfach auf diese E-Mail.\n\n{signatur}",
    },
    {
      key: "tuer_offen",
      name: "Kein Interesse: Tür offen",
      subject: "{betreff_name}vielen Dank für Ihre Rückmeldung",
      body: "{anrede},\n\nvielen Dank für Ihre offene Rückmeldung. Ich respektiere Ihre Entscheidung und melde mich von mir aus nicht mehr bei Ihnen.\n\nSollten Sie später doch Fragen zu Ihrer Absicherung haben, können Sie sich gern an mich wenden.\n\nAlles Gute für Sie!\n\n{signatur}",
    },
  ],
  du: [
    {
      key: "nicht_erreicht",
      name: "Nicht erreicht",
      subject: "{betreff_name}kurz zu {ihr_produkt}",
      body: "{anrede},\n\nich habe gerade versucht, dich anzurufen, leider ohne Erfolg. Ich versuche es gern noch einmal {rueckruf_1} oder {rueckruf_2}. Passt dir eine der beiden Zeiten? Oder such dir hier direkt einen Termin aus: {terminlink}\n\n{signatur}",
    },
    {
      key: "angebot",
      name: "Angebot",
      subject: "{betreff_name}dein Angebot zu {produkt}",
      body: "{anrede},\n\nwie besprochen bekommst du im Anhang dein Angebot. Das Wichtigste für dich:\n• {vorteil_1}\n• {vorteil_2}\n• {vorteil_3}\n\nIch rufe dich am {anruf_tag} kurz an, passt das?\n\n{signatur}",
    },
    {
      key: "nachfassen_angebot",
      name: "Nachfassen Angebot",
      subject: "{betreff_name}kurze Frage zu deinem Angebot",
      body: "{anrede},\n\nkonntest du dir das Angebot schon ansehen? Ist für dich eher der Beitrag oder die Leistung entscheidend? Eine kurze Antwort auf diese E-Mail genügt, dann stimme ich das Angebot darauf ab.\n\n{signatur}",
    },
    {
      key: "nach_abschluss",
      name: "Nach dem Abschluss",
      subject: "{betreff_name}vielen Dank für dein Vertrauen",
      body: "{anrede},\n\nvielen Dank für dein Vertrauen. Deine Unterlagen bekommst du in Kürze. Wenn du Fragen hast, antworte einfach auf diese E-Mail.\n\n{signatur}",
    },
    {
      key: "termin_vorbereitung",
      name: "Termin: Vorbereitung",
      subject: "{betreff_name}kurz zur Vorbereitung auf unser Gespräch",
      body: "{anrede},\n\nich freue mich auf unser Gespräch am {termin_datum} {termin_art}. Den Link zum Videocall findest du hier: {videolink}\n\nDamit wir die Zeit gut nutzen, leg dir bitte Folgendes bereit:\n{termin_unterlagen}\n\nFehlt etwas davon, klären wir es im Gespräch.\n\n{signatur}",
    },
    {
      key: "nicht_erschienen",
      name: "Nicht erschienen",
      subject: "{betreff_name}neuer Termin für unser Gespräch?",
      body: "{anrede},\n\nkein Problem, so etwas passiert. Sollen wir einen neuen Termin finden? Hier suchst du dir direkt eine passende Zeit aus: {terminlink}\n\n{signatur}",
    },
    {
      key: "beratungsdoku",
      name: "Gesprächszusammenfassung",
      subject: "{betreff_name}Zusammenfassung unseres Gesprächs",
      body: "{anrede},\n\nvielen Dank für das Gespräch. Wie besprochen fasse ich die wichtigsten Punkte für dich zusammen.\n\nDeine Wünsche und Bedürfnisse:\n{wuensche}\n\nMein Rat und die Gründe dafür:\n{rat}\n\nBitte lies dir die Zusammenfassung in Ruhe durch. Wenn etwas fehlt oder nicht stimmt, gib mir bitte kurz Bescheid.\n\n{signatur}",
    },
    {
      key: "unterlagen_fehlen",
      name: "Unterlagen fehlen noch",
      subject: "{betreff_name}es fehlen nur noch wenige Angaben",
      body: "{anrede},\n\ndamit ich alles für dich fertig machen kann, fehlen mir nur noch diese Angaben bzw. Unterlagen:\n{fehlende_unterlagen}\n\nAm einfachsten antwortest du direkt auf diese E-Mail, gern mit Foto oder Anhang.\n\n{signatur}",
    },
    {
      key: "willkommen",
      name: "Willkommen: Police ist da",
      subject: "{betreff_name}deine Police ist da",
      body: "{anrede},\n\ndeine Police ist fertig, herzlich willkommen! Bitte bewahre die Unterlagen gut auf. Auch künftig bin ich für alle Fragen rund um deine Versicherung für dich da.\n\nSo erreichst du mich: Antworte einfach auf diese E-Mail oder ruf mich an.\n\nSo meldest du einen Schaden: Gib mir möglichst bald Bescheid und schildere kurz, was passiert ist. Bewahre Fotos, Rechnungen und andere Belege auf. Ich unterstütze dich bei der Meldung an den Versicherer.\n\n{signatur}",
    },
    {
      key: "kuendigung",
      name: "Kündigung alte Versicherung",
      subject: "{betreff_name}Kündigung deiner bisherigen Versicherung",
      body: "{anrede},\n\ndamit du nicht doppelt versichert bist, sollte dein bisheriger Vertrag rechtzeitig gekündigt werden. Dafür habe ich dir unten eine Musterkündigung vorbereitet. Bitte ergänze deine Anschrift, unterschreib und schick die Kündigung an deinen bisherigen Versicherer, am besten so, dass du den Versand nachweisen kannst.\n\n{musterkuendigung}\n\nWenn du Fragen hast, melde dich gern.\n\n{signatur}",
    },
    {
      key: "wie_besprochen",
      name: "Wie besprochen: später melden",
      subject: "{betreff_name}wie besprochen melde ich mich später",
      body: "{anrede},\n\nvielen Dank für das Gespräch. Wie besprochen melde ich mich am {melde_datum} wieder bei dir. Hast du vorher Fragen, antworte einfach auf diese E-Mail.\n\n{signatur}",
    },
    {
      key: "tuer_offen",
      name: "Kein Interesse: Tür offen",
      subject: "{betreff_name}vielen Dank für deine Rückmeldung",
      body: "{anrede},\n\nvielen Dank für deine offene Rückmeldung. Ich respektiere deine Entscheidung und melde mich von mir aus nicht mehr bei dir.\n\nSolltest du später doch Fragen zu deiner Absicherung haben, kannst du dich gern an mich wenden.\n\nAlles Gute für dich!\n\n{signatur}",
    },
  ],
};

/** Standardvorlagen in Sie-Form (Standard). */
export const STANDARD_VORLAGEN = STANDARD_VORLAGEN_JE.sie;

export type Vorlage = { id: string; name: string; subject: string; body: string; standardKey: string | null };

const SELECT = { id: true, name: true, subject: true, body: true, standardKey: true } as const;
const ladeAlle = (customerId: string) => prisma.mailTemplate.findMany({ where: { customerId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: SELECT });

/**
 * Welche Standardvorlagen fehlen (rein): beim allerersten Laden alle, sonst nur die seit `stand` neuen,
 * und nie eine, deren Schlüssel oder Name schon vorhanden ist (eigene Vorlagen bleiben unangetastet).
 */
export function fehlendeStandards(an: Ansprache, stand: number, vorhanden: { name: string; standardKey: string | null }[]): Std[] {
  const keys = new Set(vorhanden.map((v) => v.standardKey).filter(Boolean));
  const names = new Set(vorhanden.map((v) => v.name.trim().toLowerCase()));
  const ab = vorhanden.length === 0 ? 0 : stand;
  return STANDARD_VORLAGEN_JE[an].filter((v) => STAND_JE_VORLAGE[v.key] > ab && !keys.has(v.key) && !names.has(v.name.toLowerCase()));
}

/**
 * Stand 3: gespeicherte Standardvorlagen, die noch genau dem alten Text (Stand 2, Sie oder Du) entsprechen, bekommen
 * die neue Fassung in derselben Ansprache (rein). Selbst geänderte Vorlagen bleiben unberührt.
 */
export function neueFassungen(vorhanden: { id: string; subject: string; body: string; standardKey: string | null }[]): { id: string; subject: string; body: string }[] {
  const out: { id: string; subject: string; body: string }[] = [];
  for (const v of vorhanden) {
    for (const an of ["sie", "du"] as const) {
      const alt = STANDARD_VORLAGEN_STAND2[an].find((x) => x.key === v.standardKey);
      const neu = STANDARD_VORLAGEN_JE[an].find((x) => x.key === v.standardKey);
      if (alt && neu && alt.subject === v.subject && alt.body === v.body && (alt.subject !== neu.subject || alt.body !== neu.body)) {
        out.push({ id: v.id, subject: neu.subject, body: neu.body });
        break;
      }
    }
  }
  return out;
}

export async function loadVorlagen(customerId: string): Promise<Vorlage[]> {
  let rows = await ladeAlle(customerId);
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { leadAddress: true, mailVorlagenStand: true } });
  if (!c) return rows;
  if (c.mailVorlagenStand >= VORLAGEN_STAND && rows.length > 0) return rows;
  // Stand zuerst hochsetzen (nur einer gewinnt), damit gleichzeitiges Laden nichts doppelt anlegt.
  if (c.mailVorlagenStand < VORLAGEN_STAND) {
    const claim = await prisma.customer.updateMany({ where: { id: customerId, mailVorlagenStand: c.mailVorlagenStand }, data: { mailVorlagenStand: VORLAGEN_STAND } });
    if (!claim.count) return ladeAlle(customerId);
  }
  const neu = fehlendeStandards(asAnsprache(c.leadAddress), c.mailVorlagenStand, rows);
  if (neu.length) {
    await prisma.mailTemplate.createMany({ data: neu.map((v) => ({ customerId, name: v.name, subject: v.subject, body: v.body, standardKey: v.key })) });
    rows = await ladeAlle(customerId);
  }
  // Stand 3: unveränderte Standardvorlagen auf die neue Fassung heben (nur wenn sie noch exakt dem alten Text entsprechen)
  if (c.mailVorlagenStand < 3) {
    const updates = neueFassungen(rows);
    for (const u of updates) {
      await prisma.mailTemplate.updateMany({ where: { id: u.id, customerId }, data: { subject: u.subject, body: u.body } });
    }
    if (updates.length) rows = await ladeAlle(customerId);
  }
  return rows;
}

/**
 * Ansprache gewechselt: unveränderte Standardvorlagen der anderen Ansprache auf die neue umstellen.
 * Selbst geänderte Vorlagen bleiben, wie sie sind.
 */
export async function vorlagenAufAnsprache(customerId: string, neu: Ansprache): Promise<number> {
  const alt: Ansprache = neu === "sie" ? "du" : "sie";
  let n = 0;
  for (let i = 0; i < STANDARD_VORLAGEN_JE[alt].length; i++) {
    const from = STANDARD_VORLAGEN_JE[alt][i];
    const to = STANDARD_VORLAGEN_JE[neu][i];
    const r = await prisma.mailTemplate.updateMany({ where: { customerId, name: from.name, subject: from.subject, body: from.body }, data: { subject: to.subject, body: to.body } });
    n += r.count;
  }
  return n;
}
