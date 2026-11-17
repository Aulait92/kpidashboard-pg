// Langfassung zur Einwilligung „Unterlagen per WhatsApp“ (Ole, 17.11.2026, docs/recht-gesundheitsunterlagen.md
// Abschnitt b „Hinweise zum Text“): Verantwortlicher, Zweck, Datenarten, Rechtsgrundlagen, Empfänger, Drittland,
// Speicherdauer, Widerruf, Betroffenenrechte, Beschwerderecht. Öffentliche Seite /datenschutz/policen?k=<Token>,
// verlinkt nur im Einwilligungstext (also nur mit Schalter POLICEN_GESUNDHEIT_AN). Reine Texte, ohne Gedankenstriche,
// in beiden Ansprachen. Stand und Version wie der Einwilligungstext (regeln.ts EINWILLIGUNG_VERSION).

import { a, type Ansprache } from "@/lib/ansprache";
import { LOESCHFRIST_ABSCHLUSS_TAGE, LOESCHFRIST_TAGE } from "@/lib/policen/regeln";

export type Vermittler = { name: string; firma: string; anschrift: string; telefon: string; email: string };

/**
 * kiEu: Die KI-Zuordnung der Unterlagen läuft über den EU-Endpunkt (regeln.ts policenKiEu); dann steht das bei den
 * Empfängern (docs/recht-gesundheitsunterlagen.md Abschnitt e, Punkt 8). Meta bleibt Drittland.
 */
export function datenschutzPolicenAbschnitte(an: Ansprache, v: Vermittler, o: { kiEu?: boolean } = {}): { ueberschrift: string; text: string }[] {
  const wer = [v.firma && v.firma !== v.name ? `${v.name}, ${v.firma}` : v.name, v.anschrift, v.telefon ? `Telefon ${v.telefon}` : "", v.email ? `E-Mail ${v.email}` : ""]
    .filter((x) => x && x.trim())
    .join("\n");
  const du = an === "du";
  const ki = o.kiEu ? " (Claude, verarbeitet in einem Rechenzentrum in der EU)" : "";
  return [
    {
      ueberschrift: "Verantwortlich",
      text: `${wer || (du ? "Dein Berater (siehe Erstinformation)" : "Ihr Berater (siehe Erstinformation)")}\n${a(an, "Bei Fragen zum Datenschutz wende dich bitte direkt an deinen Berater.", "Bei Fragen zum Datenschutz wenden Sie sich bitte direkt an Ihren Berater.")}`,
    },
    {
      ueberschrift: "Wofür",
      text: a(
        an,
        "Du kannst vor dem Termin Fotos oder PDFs deiner bisherigen Versicherungen per WhatsApp schicken. Dein Berater nutzt sie, um deinen Termin vorzubereiten. Das ist freiwillig; ohne Unterlagen schaut ihr sie im Termin gemeinsam an.",
        "Sie können vor dem Termin Fotos oder PDFs Ihrer bisherigen Versicherungen per WhatsApp schicken. Ihr Berater nutzt sie, um Ihren Termin vorzubereiten. Das ist freiwillig; ohne Unterlagen schauen Sie sie im Termin gemeinsam an.",
      ),
    },
    {
      ueberschrift: "Welche Daten",
      text: a(
        an,
        "Die Unterlagen selbst (zum Beispiel Versicherer, Sparte, Beitrag, Laufzeit, Name, Anschrift, Geburtsdatum, Vertragsnummer, mitversicherte Personen) und deine WhatsApp-Nummer. Unterlagen zur Kranken-, Berufsunfähigkeits-, Lebens-, Pflege- oder Unfallversicherung können Angaben zur Gesundheit enthalten (besondere Kategorie nach Art. 9 DSGVO). Dazu kommt das Protokoll deiner Einwilligung (Wortlaut, Zeitpunkt, Nummer).",
        "Die Unterlagen selbst (zum Beispiel Versicherer, Sparte, Beitrag, Laufzeit, Name, Anschrift, Geburtsdatum, Vertragsnummer, mitversicherte Personen) und Ihre WhatsApp-Nummer. Unterlagen zur Kranken-, Berufsunfähigkeits-, Lebens-, Pflege- oder Unfallversicherung können Angaben zur Gesundheit enthalten (besondere Kategorie nach Art. 9 DSGVO). Dazu kommt das Protokoll Ihrer Einwilligung (Wortlaut, Zeitpunkt, Nummer).",
      ),
    },
    {
      ueberschrift: "Rechtsgrundlage",
      text: a(
        an,
        "Deine ausdrückliche Einwilligung (Art. 6 Abs. 1 lit. a und Art. 9 Abs. 2 lit. a DSGVO) und die Vorbereitung eines Vertrags auf deine Anfrage (Art. 6 Abs. 1 lit. b DSGVO). Nach einem Vertragsabschluss kann dein Berater beratungsrelevante Unterlagen zur Dokumentation seiner Beratung aufbewahren (§ 61 VVG, Art. 9 Abs. 2 lit. f DSGVO).",
        "Ihre ausdrückliche Einwilligung (Art. 6 Abs. 1 lit. a und Art. 9 Abs. 2 lit. a DSGVO) und die Vorbereitung eines Vertrags auf Ihre Anfrage (Art. 6 Abs. 1 lit. b DSGVO). Nach einem Vertragsabschluss kann Ihr Berater beratungsrelevante Unterlagen zur Dokumentation seiner Beratung aufbewahren (§ 61 VVG, Art. 9 Abs. 2 lit. f DSGVO).",
      ),
    },
    {
      ueberschrift: "Was mit den Unterlagen passiert",
      text: a(
        an,
        "Die Unterlagen werden verschlüsselt gespeichert und sind nur für deinen Berater sichtbar. Eine KI ordnet jede Unterlage einer Versicherungsart zu; Gesundheitsangaben werden nicht ausgewertet, zusammengefasst oder bewertet. Nur bei Sachversicherungen (zum Beispiel Haftpflicht, Hausrat, Kfz) liest sie Versicherer, Beitrag, Zahlweise, Summe, Selbstbeteiligung und Ablauf aus. Die KI trifft keine Entscheidungen über dich.",
        "Die Unterlagen werden verschlüsselt gespeichert und sind nur für Ihren Berater sichtbar. Eine KI ordnet jede Unterlage einer Versicherungsart zu; Gesundheitsangaben werden nicht ausgewertet, zusammengefasst oder bewertet. Nur bei Sachversicherungen (zum Beispiel Haftpflicht, Hausrat, Kfz) liest sie Versicherer, Beitrag, Zahlweise, Summe, Selbstbeteiligung und Ablauf aus. Die KI trifft keine Entscheidungen über Sie.",
      ),
    },
    {
      ueberschrift: "Empfänger",
      text: a(
        an,
        `Dein Berater setzt Dienstleister ein, die nur nach seiner Weisung arbeiten (Auftragsverarbeiter) und zur Verschwiegenheit verpflichtet sind: den Anbieter der Software (Ole Kannapinn UG, Berlin), 360dialog (Berlin) und Meta Platforms Ireland für WhatsApp, Railway für das Hosting (Rechenzentrum in der EU) und Anthropic für die KI-Zuordnung${ki}. Versicherer oder andere Dritte bekommen deine Unterlagen nicht.`,
        `Ihr Berater setzt Dienstleister ein, die nur nach seiner Weisung arbeiten (Auftragsverarbeiter) und zur Verschwiegenheit verpflichtet sind: den Anbieter der Software (Ole Kannapinn UG, Berlin), 360dialog (Berlin) und Meta Platforms Ireland für WhatsApp, Railway für das Hosting (Rechenzentrum in der EU) und Anthropic für die KI-Zuordnung${ki}. Versicherer oder andere Dritte bekommen Ihre Unterlagen nicht.`,
      ),
    },
    {
      ueberschrift: "Übermittlung in die USA",
      text: `Meta, Railway und Anthropic sind Unternehmen mit Sitz bzw. Muttergesellschaft in den USA. Grundlage ist der Angemessenheitsbeschluss der EU-Kommission zum EU-US Data Privacy Framework (Durchführungsbeschluss (EU) 2023/1795), hilfsweise Standardvertragsklauseln (Art. 46 Abs. 2 lit. c DSGVO).${o.kiEu ? " Die KI-Zuordnung der Unterlagen findet in der EU statt." : ""} Anthropic nutzt die Daten nicht zum Training.`,
    },
    {
      ueberschrift: "Speicherdauer",
      text: a(
        an,
        `Ohne Vertragsabschluss werden die Unterlagen ${LOESCHFRIST_TAGE} Tage nach dem letzten Termin gelöscht (ohne Termin ${LOESCHFRIST_TAGE} Tage nach dem Eingang). Nach einem Abschluss werden sie ${LOESCHFRIST_ABSCHLUSS_TAGE} Tage danach gelöscht, außer dein Berater bewahrt sie als Dokumentation seiner Beratung auf. Eine Datei, die Gesundheitsangaben enthalten kann und vor deiner Einwilligung kommt, wird nicht gespeichert; der Verweis darauf wird nach spätestens 24 Stunden gelöscht. WhatsApp (Meta) speichert Nachrichten nach eigenen Regeln bis zu 30 Tage.`,
        `Ohne Vertragsabschluss werden die Unterlagen ${LOESCHFRIST_TAGE} Tage nach dem letzten Termin gelöscht (ohne Termin ${LOESCHFRIST_TAGE} Tage nach dem Eingang). Nach einem Abschluss werden sie ${LOESCHFRIST_ABSCHLUSS_TAGE} Tage danach gelöscht, außer Ihr Berater bewahrt sie als Dokumentation seiner Beratung auf. Eine Datei, die Gesundheitsangaben enthalten kann und vor Ihrer Einwilligung kommt, wird nicht gespeichert; der Verweis darauf wird nach spätestens 24 Stunden gelöscht. WhatsApp (Meta) speichert Nachrichten nach eigenen Regeln bis zu 30 Tage.`,
      ),
    },
    {
      ueberschrift: "Widerruf",
      text: a(
        an,
        "Du kannst deine Einwilligung jederzeit widerrufen, zum Beispiel mit der Nachricht „Widerruf“ im Chat, per E-Mail, telefonisch oder im Termin. Dann werden deine Unterlagen sofort gelöscht. Die Rechtmäßigkeit der Verarbeitung bis zum Widerruf bleibt unberührt.",
        "Sie können Ihre Einwilligung jederzeit widerrufen, zum Beispiel mit der Nachricht „Widerruf“ im Chat, per E-Mail, telefonisch oder im Termin. Dann werden Ihre Unterlagen sofort gelöscht. Die Rechtmäßigkeit der Verarbeitung bis zum Widerruf bleibt unberührt.",
      ),
    },
    {
      ueberschrift: "Mitversicherte Personen",
      text: a(
        an,
        "Schick Unterlagen, in denen andere Personen stehen (zum Beispiel Partner oder Kinder), bitte nur mit deren Einverständnis, bei Kindern als Elternteil. Dein Berater informiert die Mitversicherten im Termin.",
        "Schicken Sie Unterlagen, in denen andere Personen stehen (zum Beispiel Partner oder Kinder), bitte nur mit deren Einverständnis, bei Kindern als Elternteil. Ihr Berater informiert die Mitversicherten im Termin.",
      ),
    },
    {
      ueberschrift: "Alter",
      text: a(
        an,
        "Die Einwilligung kannst du ab 18 Jahren geben. Bist du jünger, schick bitte keine Unterlagen per WhatsApp; ihr schaut sie dann im Termin gemeinsam an.",
        "Die Einwilligung können Sie ab 18 Jahren geben. Sind Sie jünger, schicken Sie bitte keine Unterlagen per WhatsApp; Sie schauen sie dann im Termin gemeinsam an.",
      ),
    },
    {
      ueberschrift: a(an, "Deine Rechte", "Ihre Rechte"),
      text: a(
        an,
        "Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Datenübertragbarkeit (Art. 15 bis 20 DSGVO) sowie das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO). Wende dich dafür an deinen Berater.",
        "Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Datenübertragbarkeit (Art. 15 bis 20 DSGVO) sowie das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO). Wenden Sie sich dafür an Ihren Berater.",
      ),
    },
  ];
}
