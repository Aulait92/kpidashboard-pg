// Langfassung zur Einwilligung „Unterlagen per WhatsApp“ (Ole, 17.11.2026, docs/recht-gesundheitsunterlagen.md
// Abschnitt b „Hinweise zum Text“): Verantwortlicher, Zweck, Datenarten, Rechtsgrundlagen, Empfänger, Drittland,
// Speicherdauer, Widerruf, Betroffenenrechte, Beschwerderecht. Öffentliche Seite /datenschutz/policen?k=<Token>.
// Reine Texte, ohne Gedankenstriche, in beiden Ansprachen. Stand und Version wie der Einwilligungstext
// (regeln.ts DATENSCHUTZ_VERSION). Fassung 18.11.2026 nach Text (c) der Rechtsprüfung
// (docs/recht/policen-whatsapp-gesundheitsdaten.md): Einwilligung per Knopf, KI-Auslesen nur mit Einwilligung und erst,
// wenn der KI-Dienst eingerichtet ist, Meta als Transportweg, Löschung 90 Tage nach dem Termin.

import { a, type Ansprache } from "@/lib/ansprache";
import { LOESCHFRIST_TAGE } from "@/lib/policen/regeln";

export type Vermittler = { name: string; firma: string; anschrift: string; telefon: string; email: string };

export function datenschutzPolicenAbschnitte(an: Ansprache, v: Vermittler): { ueberschrift: string; text: string }[] {
  const wer = [v.firma && v.firma !== v.name ? `${v.name}, ${v.firma}` : v.name, v.anschrift, v.telefon ? `Telefon ${v.telefon}` : "", v.email ? `E-Mail ${v.email}` : ""]
    .filter((x) => x && x.trim())
    .join("\n");
  const du = an === "du";
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
        "Die Unterlagen werden verschlüsselt in der EU gespeichert und sind nur für deinen Berater sichtbar; jeder Abruf wird protokolliert. Mit deiner Einwilligung dürfen die wichtigsten Vertragsdaten (zum Beispiel Versicherer, Tarif, Beitrag, Laufzeit, Kündigungsfrist, Versicherungssummen, Selbstbeteiligung) automatisch durch einen KI-Dienst mit Verarbeitung in der EU ausgelesen werden, der die Unterlagen nicht speichert und nicht zum Training nutzt. Gesundheitsangaben werden dabei nicht erfasst oder gespeichert. Solange dieser Dienst nicht eingerichtet ist, wertet keine KI deine Unterlagen aus. Dein Berater prüft ausgelesene Daten selbst; eine automatisierte Entscheidung über dich findet nicht statt. An Versicherer gehen die Unterlagen nicht ohne deine gesonderte Zustimmung.",
        "Die Unterlagen werden verschlüsselt in der EU gespeichert und sind nur für Ihren Berater sichtbar; jeder Abruf wird protokolliert. Mit Ihrer Einwilligung dürfen die wichtigsten Vertragsdaten (zum Beispiel Versicherer, Tarif, Beitrag, Laufzeit, Kündigungsfrist, Versicherungssummen, Selbstbeteiligung) automatisch durch einen KI-Dienst mit Verarbeitung in der EU ausgelesen werden, der die Unterlagen nicht speichert und nicht zum Training nutzt. Gesundheitsangaben werden dabei nicht erfasst oder gespeichert. Solange dieser Dienst nicht eingerichtet ist, wertet keine KI Ihre Unterlagen aus. Ihr Berater prüft ausgelesene Daten selbst; eine automatisierte Entscheidung über Sie findet nicht statt. An Versicherer gehen die Unterlagen nicht ohne Ihre gesonderte Zustimmung.",
      ),
    },
    {
      ueberschrift: "Empfänger",
      text: a(
        an,
        "Die Unterlagen werden technisch von der Ole Kannapinn UG (haftungsbeschränkt), performancegrowth, als Auftragsverarbeiter deines Beraters gespeichert, verschlüsselt in der EU. Die Übertragung erfolgt über WhatsApp: Dabei sind die 360dialog GmbH, Berlin, und WhatsApp Ireland Ltd. als Auftragsverarbeiter beteiligt. WhatsApp kann die Inhalte bis zu 30 Tage zwischenspeichern; Verbindungsdaten wie Telefonnummer und Zeitpunkte verarbeitet WhatsApp teilweise in eigener Verantwortung. Wenn du WhatsApp dafür nicht nutzen möchtest, bring die Unterlagen einfach zum Termin mit.",
        "Die Unterlagen werden technisch von der Ole Kannapinn UG (haftungsbeschränkt), performancegrowth, als Auftragsverarbeiter Ihres Beraters gespeichert, verschlüsselt in der EU. Die Übertragung erfolgt über WhatsApp: Dabei sind die 360dialog GmbH, Berlin, und WhatsApp Ireland Ltd. als Auftragsverarbeiter beteiligt. WhatsApp kann die Inhalte bis zu 30 Tage zwischenspeichern; Verbindungsdaten wie Telefonnummer und Zeitpunkte verarbeitet WhatsApp teilweise in eigener Verantwortung. Wenn Sie WhatsApp dafür nicht nutzen möchten, bringen Sie die Unterlagen einfach zum Termin mit.",
      ),
    },
    {
      ueberschrift: "Übermittlung in die USA",
      text: "WhatsApp kann Daten an Meta Platforms, Inc. und WhatsApp LLC in den USA übermitteln; Grundlage ist der Angemessenheitsbeschluss der EU-Kommission zum EU-US Data Privacy Framework (Art. 45 DSGVO), unter dem diese Unternehmen zertifiziert sind. Für Railway (Hosting, Rechenzentrum in der EU) gilt dasselbe für etwaige Zugriffe der US-Muttergesellschaft, hilfsweise Standardvertragsklauseln (Art. 46 Abs. 2 lit. c DSGVO).",
    },
    {
      ueberschrift: "Speicherdauer",
      text: a(
        an,
        `Die Unterlagen werden ${LOESCHFRIST_TAGE} Tage nach deinem Termin automatisch gelöscht (ohne Termin ${LOESCHFRIST_TAGE} Tage nach dem Eingang), außer dein Berater bewahrt sie nach einem Vertragsabschluss als Dokumentation seiner Beratung auf. Schickst du eine Unterlage, bevor du eingewilligt hast, wird sie nicht gespeichert; der Verweis darauf wird nach spätestens 24 Stunden gelöscht. WhatsApp (Meta) speichert Dateien nach eigenen Regeln bis zu 30 Tage; nach dem Abruf beantragen wir die Löschung dort, soweit die Schnittstelle das zulässt.`,
        `Die Unterlagen werden ${LOESCHFRIST_TAGE} Tage nach Ihrem Termin automatisch gelöscht (ohne Termin ${LOESCHFRIST_TAGE} Tage nach dem Eingang), außer Ihr Berater bewahrt sie nach einem Vertragsabschluss als Dokumentation seiner Beratung auf. Schicken Sie eine Unterlage, bevor Sie eingewilligt haben, wird sie nicht gespeichert; der Verweis darauf wird nach spätestens 24 Stunden gelöscht. WhatsApp (Meta) speichert Dateien nach eigenen Regeln bis zu 30 Tage; nach dem Abruf beantragen wir die Löschung dort, soweit die Schnittstelle das zulässt.`,
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
