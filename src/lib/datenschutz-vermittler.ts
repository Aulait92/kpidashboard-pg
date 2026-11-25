// Datenschutzhinweise des Vermittlers (Art. 13 und 14 DSGVO) für die Seiten, die seine Leads und Kunden bei uns sehen
// (Buchung, Termin verwalten, Chat mit dem digitalen Assistenten, Unterlagen). Ole, 20.11.2026: Hat der Vermittler keine
// eigene Datenschutz-URL hinterlegt (Onboarding.websiteInfo.privacyUrl), erscheint diese Seite in seinem Namen statt der
// Datenschutzerklärung von performancegrowth. Verantwortlich ist der Vermittler, wir sind Auftragsverarbeiter (AVV).
//
// Neutral formuliert (ohne Anrede), weil Leads je nach Vermittler gesiezt oder geduzt werden. Keine Gedankenstriche.
// Inhalt abgeglichen mit SUBPROCESSORS und AVV (lib/legal-texts.ts), Langfassung Unterlagen (lib/policen/datenschutz-text.ts),
// Löschung (lib/erasure.ts, lib/policen/regeln.ts), Rückmeldung an Meta (lib/capi). Interne Prüfnotiz:
// docs/recht/datenschutz-vermittler-seite.md. Reine Funktion ohne Datenbank.

import { PROVIDER } from "@/lib/legal-texts";
import { LOESCHFRIST_TAGE } from "@/lib/policen/regeln";

export const DATENSCHUTZ_VERMITTLER_VERSION = "20.11.2026";

export type VermittlerAngaben = {
  name: string;
  firma: string;
  anschrift: string;
  telefon: string;
  email: string;
  /** Speicher der Unterlagen (legal-texts policenSpeicherAnbieter), z. B. „Cloudflare, Inc. (R2)“ */
  speicher?: string | null;
};

const t = (s: string | null | undefined) => (s ?? "").trim();

export function datenschutzVermittler(v: VermittlerAngaben): { title: string; items: string[] }[] {
  const name = t(v.name);
  const firma = t(v.firma);
  const anschrift = t(v.anschrift);
  const telefon = t(v.telefon);
  const email = t(v.email);

  const kopf = firma && firma !== name ? (name ? `${name}, ${firma}` : firma) : name;
  const verantwortlich = [kopf, anschrift, telefon ? `Telefon: ${telefon}` : "", email ? `E-Mail: ${email}` : ""].filter(Boolean);
  const kontakt = email ? `per E-Mail an ${email}` : telefon ? `telefonisch unter ${telefon}` : "über die oben genannten Kontaktdaten";

  return [
    {
      title: "Verantwortlich",
      items: [
        ...(verantwortlich.length
          ? verantwortlich
          : ["Der Versicherungsvermittler, der diese Seite nutzt (Name und Anschrift siehe Anbieterangaben)."]),
        "Fragen zum Datenschutz, Anträge auf Auskunft oder Löschung und Widerrufe gehen an diese Adresse.",
      ],
    },
    {
      title: "Technischer Dienstleister",
      items: [
        `Die Seiten, der digitale Assistent und die Datenhaltung werden von der ${PROVIDER.name}, ${PROVIDER.street}, ${PROVIDER.city} (${PROVIDER.brand}), bereitgestellt. Sie verarbeitet die Daten als Auftragsverarbeiter nur im Auftrag und nach Weisung des Vermittlers (Art. 28 DSGVO) und ist zur Verschwiegenheit verpflichtet. Anwendung, Datenbank und Unterlagen liegen in Rechenzentren in der EU.`,
      ],
    },
    {
      title: "Terminbuchung",
      items: [
        "Für die Buchung werden Name, E-Mail-Adresse, Telefonnummer, der gewählte Termin und die Art des Gesprächs (Telefon oder Video) verarbeitet, dazu freiwillige Angaben, etwa zum Anliegen. Zweck ist, den Termin zu vereinbaren, zu bestätigen, durchzuführen und die gewünschte Beratung vorzubereiten.",
        "Rechtsgrundlage ist die Anbahnung eines Vertrags auf Anfrage der betroffenen Person (Art. 6 Abs. 1 lit. b DSGVO). Der Termin wird in den Kalender des Vermittlers eingetragen; Videotermine laufen über dessen Videodienst (zum Beispiel Google Meet oder Microsoft Teams).",
        "Name und eine Kontaktmöglichkeit sind nötig, um einen Termin zu vereinbaren. Alle übrigen Angaben sind freiwillig.",
      ],
    },
    {
      title: "Herkunft der Daten",
      items: [
        "Kam die Anfrage über ein Formular, etwa in einer Werbeanzeige auf Facebook oder Instagram oder auf der Website des Vermittlers, stammen die Kontaktdaten und Angaben aus diesem Formular. Weitere Daten entstehen im Chat, bei der Buchung und im Gespräch.",
      ],
    },
    {
      title: "Digitaler Assistent per WhatsApp",
      items: [
        "Der Vermittler nutzt einen digitalen KI-Assistenten, der per WhatsApp auf die Anfrage antwortet, Fragen zum Bedarf stellt, Termine anbietet und an Termine erinnert. Verarbeitet werden Telefonnummer, WhatsApp-Profilname, Nachrichten und Zeitpunkte. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.",
        "Der Vermittler sieht den Verlauf und kann das Gespräch jederzeit selbst übernehmen. Der Assistent trifft keine Entscheidungen mit rechtlicher Wirkung (Art. 22 DSGVO); Beratung und Angebote kommen vom Vermittler.",
        "Ist eine Nummer nicht per WhatsApp erreichbar, kann eine SMS mit einem Link zur Terminwahl bzw. eine Erinnerung an einen gebuchten Termin gesendet werden.",
      ],
    },
    {
      title: "KI-Verarbeitung",
      items: [
        "Für die Antworten des Assistenten werden die Chatnachrichten an einen KI-Dienst (Anthropic, PBC) übermittelt. Vom Vermittler hochgeladene Angebote werden dort nur für Sach-, Haftpflicht-, Rechtsschutz-, Unfall- und Tierversicherungen ausgelesen.",
        "Angaben zur Gesundheit werden vor der Übermittlung an die KI entfernt. Die Daten werden nicht zum Training von KI-Modellen genutzt.",
      ],
    },
    {
      title: "Angaben zur Gesundheit",
      items: [
        "Werden in einem Anfrageformular oder im Chat Angaben zur Gesundheit gemacht (besondere Kategorie nach Art. 9 DSGVO), sieht sie nur der Vermittler zur Vorbereitung der Beratung. Rechtsgrundlage ist die ausdrückliche Einwilligung (Art. 9 Abs. 2 lit. a DSGVO), die jederzeit widerrufen werden kann.",
      ],
    },
    {
      title: "Unterlagen vor dem Termin",
      items: [
        "Bisherige Versicherungsunterlagen können freiwillig per WhatsApp geschickt werden. Gespeichert werden sie nur nach ausdrücklicher Einwilligung (Art. 6 Abs. 1 lit. a, Art. 9 Abs. 2 lit. a DSGVO), verschlüsselt in der EU und nur für den Vermittler sichtbar.",
        "Mit der Einwilligung können die wichtigsten Vertragsdaten durch einen KI-Dienst mit Verarbeitung in der EU ausgelesen werden, ohne Gesundheitsangaben und ohne Speicherung beim KI-Dienst. Wer das nicht möchte, antwortet im Chat „ohne KI“.",
        `Die Unterlagen werden ${LOESCHFRIST_TAGE} Tage nach dem Termin automatisch gelöscht, nach einem Widerruf sofort. Einzelheiten stehen in den gesonderten Hinweisen, die vor der Einwilligung angezeigt werden.`,
      ],
    },
    {
      title: "Erinnerungen und E-Mails",
      items: [
        "Zum gebuchten Termin kommen Bestätigung und Erinnerungen per WhatsApp und E-Mail (Art. 6 Abs. 1 lit. b DSGVO, hilfsweise lit. f). Erinnerungen zur Vorbereitung, etwa an Unterlagen, gibt es nur mit Einwilligung (Art. 6 Abs. 1 lit. a DSGVO).",
        "E-Mails werden über einen Versanddienst oder über das Postfach des Vermittlers verschickt. Abmelden ist jederzeit mit „STOP“ im Chat oder über den Link in der E-Mail möglich.",
      ],
    },
    {
      title: "Rückmeldung an Meta",
      items: [
        "Kam die Anfrage über eine Werbeanzeige des Vermittlers bei Meta, kann Meta pseudonym mitgeteilt werden, wie weit die Anfrage gekommen ist (Anfrage-ID, Stufe wie Termin oder Abschluss, Zeitpunkt, beim Abschluss der Jahresbeitrag). Name, Kontaktdaten und Versicherungsart werden nicht übermittelt.",
        "Zweck ist, die Anzeigen des Vermittlers auf passende Interessenten auszurichten (berechtigtes Interesse, Art. 6 Abs. 1 lit. f DSGVO). Dem kann jederzeit widersprochen werden.",
      ],
    },
    {
      title: "Empfänger",
      items: [
        `Im Auftrag des Vermittlers sind beteiligt: der technische Dienstleister mit Hosting bei Railway (Rechenzentrum in der EU) und Ablage der Unterlagen bei ${t(v.speicher) || "einem Speicher mit Rechenzentrum in der EU"} (Region EU), 360dialog GmbH und WhatsApp Ireland Ltd. (WhatsApp), Anthropic, PBC und OpenAI Ireland Ltd. (KI), Resend (E-Mail-Versand), seven communications GmbH & Co. KG (SMS) und Sentry (Fehlerüberwachung ohne Inhalte), dazu Google oder Microsoft, wenn der Vermittler deren Kalender oder Postfach nutzt.`,
        "WhatsApp verarbeitet Verbindungsdaten wie Telefonnummer und Zeitpunkte teilweise in eigener Verantwortung und kann Inhalte bis zu 30 Tage zwischenspeichern.",
        "Versicherer erhalten Daten nur, soweit das für ein gewünschtes Angebot oder einen Antrag erforderlich ist, und nicht über diese Seiten. Die Daten werden nicht verkauft.",
      ],
    },
    {
      title: "Übermittlung in Drittländer",
      items: [
        `Einige Dienstleister oder ihre Muttergesellschaften sitzen in den USA (unter anderem Anthropic, OpenAI, Resend, Meta, Railway, ${/amazon/i.test(t(v.speicher)) ? "Amazon" : "Cloudflare"}, Sentry, Google, Microsoft). Grundlage ist der Angemessenheitsbeschluss zum EU-US Data Privacy Framework, soweit das Unternehmen zertifiziert ist (Art. 45 DSGVO), sonst EU-Standardvertragsklauseln (Art. 46 Abs. 2 lit. c DSGVO).`,
      ],
    },
    {
      title: "Speicherdauer",
      items: [
        "Kontaktdaten, Termine und Chatverlauf werden gelöscht, sobald sie für Termin, Beratung und Betreuung nicht mehr erforderlich sind, spätestens 24 Monate nach dem letzten Kontakt, wenn kein Vertrag zustande gekommen ist. Auf Verlangen wird sofort gelöscht, soweit keine gesetzliche Pflicht zur Aufbewahrung besteht.",
        "Nach einem Vertragsabschluss bewahrt der Vermittler die Beratungsdokumentation bis zu 10 Jahre auf (§§ 61, 62 VVG, Handels- und Steuerrecht). Nach einer Abmeldung bleibt nur ein pseudonymer Sperreintrag (Hashwert), damit keine weiteren Nachrichten kommen.",
      ],
    },
    {
      title: "Rechte",
      items: [
        "Betroffene Personen haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Datenübertragbarkeit (Art. 15 bis 20 DSGVO). Anträge gehen an den Vermittler, " + kontakt + ".",
      ],
    },
    {
      title: "Widerspruch",
      items: [
        "Der Verarbeitung auf Grundlage berechtigter Interessen (Art. 6 Abs. 1 lit. f DSGVO) kann aus Gründen, die sich aus der besonderen Situation ergeben, jederzeit widersprochen werden, der Rückmeldung an Meta und Werbung jederzeit ohne Angabe von Gründen (Art. 21 DSGVO). Am einfachsten mit „STOP“ im Chat oder " + kontakt + ".",
      ],
    },
    {
      title: "Widerruf der Einwilligung",
      items: [
        "Eine Einwilligung kann jederzeit mit Wirkung für die Zukunft widerrufen werden, zum Beispiel mit der Nachricht „Widerruf“ oder „STOP“ im Chat oder " + kontakt + ". Die Rechtmäßigkeit der Verarbeitung bis zum Widerruf bleibt unberührt.",
      ],
    },
    {
      title: "Beschwerde",
      items: [
        "Betroffene Personen können sich bei einer Datenschutz-Aufsichtsbehörde beschweren, insbesondere am Wohnort oder am Sitz des Vermittlers (Art. 77 DSGVO).",
      ],
    },
    {
      title: "Stand",
      items: [`Fassung vom ${DATENSCHUTZ_VERMITTLER_VERSION}`],
    },
  ];
}
