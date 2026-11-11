// AGB und Auftragsverarbeitungsvertrag (AVV) für „Leadgenerierung + Software“.
// Eine Quelle für die öffentlichen Seiten /rechtliches/* und den Anhang im
// Angebot. Bei Änderungen LEGAL_VERSION anpassen – angenommene Angebote
// speichern die URL, die zum Zeitpunkt der Annahme galt.
//
// 11.11.2026: Logins, jährliche Vorauszahlung, Bestandskunden-Modul mit
// Kampagnen-Kontingent, WhatsApp-Gebühren im Preis enthalten.
// PRÜFUNG DURCH OLE / ANWALT AUSSTEHEND: die mit „Prüfen:“ markierten Stellen
// (Kommentare) vor dem Livegang juristisch abnehmen lassen.

export const LEGAL_VERSION = "11.11.2026";

export const PROVIDER = {
  name: "Ole Kannapinn UG (haftungsbeschränkt)",
  street: "Lorenzstraße 58",
  city: "12209 Berlin",
  email: "ole.kannapinn@performancegrowth.de",
  brand: "performancegrowth",
  website: "performancegrowth.de",
  manager: "Ole Kannapinn",
  // Für die Pflichtangaben in geschäftlichen E-Mails (UG): leer = Zeile entfällt
  phone: "0151 52418846",
  register: "Amtsgericht Charlottenburg, HRB 172651",
};

export type LegalSection = { title: string; items: (string | { sub: string; text: string })[] };

export const AGB: LegalSection[] = [
  {
    title: "Geltungsbereich",
    items: [
      `Diese Allgemeinen Geschäftsbedingungen gelten für alle Verträge zwischen der ${PROVIDER.name}, ${PROVIDER.street}, ${PROVIDER.city} („Anbieter“) und ihren Kunden über Leadgenerierung und die Nutzung der Software des Anbieters.`,
      "Das Angebot richtet sich ausschließlich an Unternehmer im Sinne von § 14 BGB, insbesondere Versicherungsvermittler. Abweichende Bedingungen des Kunden gelten nur, wenn der Anbieter ihnen ausdrücklich in Textform zustimmt.",
    ],
  },
  {
    title: "Vertragsschluss und Rangfolge",
    items: [
      "Der Vertrag kommt durch die Annahme des Angebots zustande: online über den Angebotslink, per E-Mail oder in sonstiger Textform.",
      "Es gelten in dieser Rangfolge: im Angebot vereinbarte Sondervereinbarungen, das Angebot, diese AGB, der Auftragsverarbeitungsvertrag.",
    ],
  },
  {
    title: "Leistungen: Leadgenerierung",
    items: [
      "Der Anbieter konzipiert, erstellt und betreut Werbekampagnen auf Facebook und Instagram (Meta) im Werbekonto des Kunden, einschließlich Werbemitteln und Lead-Formularen, und optimiert diese laufend.",
      "Die generierten Leads werden exklusiv für den Kunden erzeugt und nicht an Dritte verkauft.",
      "Das Werbebudget zahlt der Kunde direkt an Meta. Der Anbieter steuert es im vereinbarten Rahmen (Tagesbudget je Produkt).",
      "Der Anbieter schuldet eine fachgerechte Dienstleistung, keinen bestimmten Erfolg. Insbesondere werden keine bestimmte Anzahl an Leads, Kosten pro Lead, Erreichbarkeit oder Abschlussquote zugesichert. Entscheidungen von Meta (z. B. Ablehnung von Anzeigen, Kontosperren) liegen außerhalb des Einflussbereichs des Anbieters.",
    ],
  },
  {
    title: "Leistungen: Software",
    items: [
      "Ist im Angebot das Paket mit Software vereinbart, stellt der Anbieter dem Kunden seine Software als Online-Dienst bereit, insbesondere Lead-Verwaltung, Pipeline, Wiedervorlagen, Terminbuchung mit Erinnerungen, Auswertungen und einen digitalen Assistenten auf WhatsApp.",
      "Der digitale Assistent arbeitet KI-gestützt, gibt sich gegenüber Interessenten als digitaler Assistent zu erkennen und führt keine Versicherungsberatung durch. Er stellt Fragen zur Bedarfsklärung und vereinbart Termine. Beratung und Vermittlung bleiben vollständig beim Kunden, der Gespräche jederzeit selbst übernehmen kann.",
      "Der Anbieter strebt eine Verfügbarkeit von 99 % im Monatsmittel an, ausgenommen angekündigte Wartungen. Für Dienste Dritter (insbesondere Meta/WhatsApp, Kalender- und KI-Anbieter) übernimmt der Anbieter keine Gewähr.",
      "Der Anbieter darf die Software weiterentwickeln, solange die vereinbarten wesentlichen Funktionen erhalten bleiben.",
      // Prüfen: Logins / Nutzerzahl
      "Im Paket mit Software sind die im Angebot genannte Zahl an Logins enthalten (Inhaber und Berater). Weitere Logins kann der Kunde selbst anlegen; sie werden zum im Angebot genannten Preis je Login und Monat berechnet, anteilig ab dem Tag der Einrichtung bis zum Tag der Entfernung. Ab der im Angebot genannten Zahl an Logins gelten individuelle Konditionen.",
      // Prüfen: Bestandskunden-Modul + Fair Use
      "Das Bestandskunden-Modul (Import und Auswertung der Bestandskunden des Kunden, Kampagnen per WhatsApp) ist ein Zusatzmodul und nur enthalten, wenn es im Angebot vereinbart oder nachträglich in Textform gebucht wurde. Es ist zum Ende des Abrechnungsmonats kündbar, sofern im Angebot nichts anderes vereinbart ist.",
    ],
  },
  {
    title: "Mitwirkung des Kunden",
    items: [
      "Der Kunde räumt dem Anbieter Zugriff auf sein Meta-Werbekonto ein, stellt eine Zahlungsmethode bei Meta bereit und verbindet, soweit gebucht, seine WhatsApp-Nummer und seinen Kalender.",
      "Der Kunde bearbeitet die Leads zeitnah, prüft die Werbemittel und Nachrichtenvorlagen vor dem Start und gibt sie frei.",
      "Der Kunde ist für die Einhaltung seiner berufsrechtlichen Pflichten verantwortlich, insbesondere aus § 34d GewO, der Versicherungsvertriebsrichtlinie und den Vorgaben seines Versicherers, einschließlich etwaiger Werberichtlinien.",
      "Zugangsdaten sind geheim zu halten. Der Kunde informiert den Anbieter unverzüglich über einen Missbrauchsverdacht.",
    ],
  },
  {
    title: "Vergütung und Zahlung",
    items: [
      "Die Setupgebühr wird mit Vertragsschluss fällig. Die monatliche Vergütung ist ab dem im Angebot genannten Startdatum monatlich im Voraus fällig. Alle Preise verstehen sich netto zuzüglich der gesetzlichen Umsatzsteuer.",
      // Prüfen: jährliche Vorauszahlung
      { sub: "Jährliche Vorauszahlung", text: "Ist im Angebot die jährliche Vorauszahlung vereinbart, ist die Vergütung für 12 Monate zum Start im Voraus fällig. Sie beträgt das im Angebot genannte Vielfache der monatlichen Vergütung einschließlich vereinbarter Zusätze (Nachlass für die Vorauszahlung). Während des Zahlungsjahres hinzukommende Logins oder Module werden anteilig für die Restlaufzeit berechnet. Eine anteilige Erstattung bei vorzeitiger Beendigung erfolgt nicht, außer bei Kündigung aus wichtigem Grund durch den Kunden." },
      "Die Höhe der monatlichen Vergütung richtet sich nach dem vereinbarten monatlichen Werbebudget (Preisstaffel laut Angebot). Ändert der Kunde das Budget dauerhaft, gilt die neue Stufe ab dem folgenden Abrechnungsmonat.",
      // Prüfen: WhatsApp-Gebühren inklusive, Fair Use bei Bestandskampagnen
      "Die Gebühren von Meta für WhatsApp-Nachrichten sind in der Vergütung enthalten. Das gilt ohne Mengenbegrenzung für die Kommunikation mit Leads (Erstkontakt, Erinnerungen, Nachfassen). Für Kampagnen an Bestandskunden sind die Gebühren für die im Angebot genannte Zahl an Kampagnen-Nachrichten je Kalendermonat enthalten (Fair Use); ist das Kontingent erreicht, startet die Software weitere Kampagnen erst im Folgemonat. Ein höheres Kontingent kann gesondert vereinbart werden.",
      "Rechnungen sind innerhalb von 7 Tagen per Überweisung oder SEPA-Lastschrift zu zahlen. Gerät der Kunde mehr als 30 Tage in Zahlungsverzug, darf der Anbieter die Kampagnen nach vorheriger Ankündigung pausieren. Nach Zahlungseingang werden sie wieder gestartet.",
    ],
  },
  {
    title: "Pause und Urlaub",
    items: [
      "Der Kunde kann die Kampagnen jederzeit pausieren, etwa für Urlaub. Während der Pause wird statt der monatlichen Vergütung nur die im Angebot genannte Software-Gebühr berechnet, tagesgenau anteilig; ist keine Software vereinbart, fällt während der Pause keine Vergütung an.",
      "Eine Pause verlängert eine vereinbarte Mindestlaufzeit nicht.",
      // Prüfen: Pause bei Jahreszahlung
      "Bei jährlicher Vorauszahlung können die Kampagnen ebenfalls pausiert werden; eine Gutschrift oder Verlängerung des Zahlungsjahres erfolgt dafür nicht.",
    ],
  },
  {
    title: "Laufzeit und Kündigung",
    items: [
      { sub: "Ohne Vertragslaufzeit", text: "Der Vertrag läuft unbefristet und kann von beiden Seiten zum Ende des jeweiligen Abrechnungsmonats in Textform gekündigt werden." },
      { sub: "Mit 12 Monaten Laufzeit", text: "Der Vertrag hat eine Mindestlaufzeit von 12 Monaten ab Start. Danach läuft er unbefristet weiter und kann zum Ende des jeweiligen Abrechnungsmonats gekündigt werden." },
      // Prüfen: Verlängerung bei Jahreszahlung
      { sub: "Mit jährlicher Vorauszahlung", text: "Der Vertrag hat eine Laufzeit von 12 Monaten ab Start und verlängert sich jeweils um weitere 12 Monate, wenn er nicht mit einer Frist von einem Monat zum Ende des Zahlungsjahres in Textform gekündigt wird. Der Kunde kann vor Ablauf des Zahlungsjahres in Textform auf monatliche Zahlung umstellen; dann gilt ab dem folgenden Zahlungszeitraum die Regel „Mit 12 Monaten Laufzeit“." },
      "Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt. Die Setupgebühr wird bei Vertragsende nicht erstattet.",
    ],
  },
  {
    title: "Garantien",
    items: [
      // Prüfen: Garantien (von Ole am 11.11.2026 freigegeben)
      "Die folgenden Garantien gelten für das Produkt Katzenversicherung (TKV) sowie für weitere Produkte, soweit sie im Angebot ausdrücklich genannt sind. Sie gelten ab Start der Kampagne (Tag der ersten Auslieferung der Anzeigen).",
      { sub: "Lead-Garantie", text: "Beträgt das Werbebudget in den ersten 30 aktiven Tagen mindestens 20 € pro Tag und Produkt und erhält der Kunde in diesem Zeitraum weniger als 100 Leads für dieses Produkt, entfällt die monatliche Vergütung für Betreuung und Software im folgenden Abrechnungsmonat. Das Werbebudget zahlt der Kunde weiterhin direkt an Meta." },
      { sub: "Break-even-Garantie", text: "Liegt die Provision des Kunden aus den über den Anbieter gewonnenen Verträgen nach 90 Tagen unter der Summe aus Werbebudget und Vergütung für Betreuung und Software in diesem Zeitraum, betreut der Anbieter den Kunden ohne Vergütung für Betreuung und Software weiter, auf Wunsch mit einem anderen Produkt ohne Setupgebühr, bis die Provision seit Kampagnenstart diese Kosten erreicht, längstens jedoch 6 Monate. Voraussetzungen: Werbebudget an den aktiven Tagen mindestens 20 € pro Tag und Produkt; mindestens 80 % der über die Software gebuchten Termine wahrgenommen; für mindestens 80 % der Leads das Ergebnis in der Software eingetragen (z. B. erreicht, Termin, Abschluss mit Beitrag); Provisionssätze unter „Meine Provisionen“ hinterlegt. Maßgeblich ist die Berechnung in der Software auf Grundlage dieser Angaben; der Anbieter kann Nachweise zu Abschlüssen verlangen." },
      "Pausen (z. B. Urlaub oder Krankheit) verlängern den jeweiligen Prüfzeitraum um ihre Dauer; maßgeblich sind die aktiven Tage. Besteht zum Zeitpunkt der Prüfung ein Zahlungsverzug, ruht der Anspruch bis zum Ausgleich.",
      "Weitergehende Ansprüche, insbesondere auf eine bestimmte Zahl von Verträgen oder eine bestimmte Provision, bestehen nicht.",
    ],
  },
  {
    title: "Datenschutz",
    items: [
      "Die Leads werden auf Grundlage einer ausdrücklichen Einwilligung der Interessenten erzeugt, die auch die Kontaktaufnahme per Telefon, E-Mail und WhatsApp umfasst. Der Anbieter dokumentiert die Einwilligung und stellt den Nachweis auf Anfrage zur Verfügung.",
      "Für die Verarbeitung personenbezogener Daten in der Software ist der Kunde Verantwortlicher und der Anbieter Auftragsverarbeiter. Hierfür gilt der Auftragsverarbeitungsvertrag, der Bestandteil des Vertrags ist.",
      "Der Kunde gibt Leads nicht an Dritte weiter, soweit dies nicht von der Einwilligung gedeckt ist, und beachtet Widerrufe unverzüglich.",
    ],
  },
  {
    title: "Haftung",
    items: [
      "Der Anbieter haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei der Verletzung von Leben, Körper oder Gesundheit sowie nach dem Produkthaftungsgesetz.",
      "Bei einfacher Fahrlässigkeit haftet der Anbieter nur bei Verletzung einer wesentlichen Vertragspflicht und der Höhe nach begrenzt auf den vertragstypischen, vorhersehbaren Schaden, höchstens jedoch auf die vom Kunden in den letzten 12 Monaten gezahlte Vergütung. Im Übrigen ist die Haftung ausgeschlossen.",
      "Für den Verlust von Daten haftet der Anbieter nur in Höhe des Aufwands, der bei regelmäßiger Datensicherung zur Wiederherstellung erforderlich gewesen wäre.",
    ],
  },
  {
    title: "Vertraulichkeit",
    items: [
      "Beide Seiten behandeln vertrauliche Informationen der jeweils anderen Seite, insbesondere Konditionen, Kennzahlen und Kampagnendaten, vertraulich, auch über das Vertragsende hinaus.",
    ],
  },
  {
    title: "Änderungen dieser AGB",
    items: [
      "Der Anbieter kann diese AGB mit Wirkung für die Zukunft ändern. Änderungen werden dem Kunden mindestens sechs Wochen vor Inkrafttreten in Textform mitgeteilt. Widerspricht der Kunde nicht innerhalb dieser Frist, gelten sie als angenommen; auf diese Folge wird in der Mitteilung hingewiesen. Im Fall des Widerspruchs kann jede Seite zum Inkrafttreten kündigen.",
    ],
  },
  {
    title: "Schlussbestimmungen",
    items: [
      "Änderungen und Ergänzungen des Vertrags bedürfen der Textform.",
      "Sollte eine Bestimmung unwirksam sein oder werden, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.",
      "Es gilt das Recht der Bundesrepublik Deutschland. Ist der Kunde Kaufmann, ist Gerichtsstand der Sitz des Anbieters in Berlin.",
    ],
  },
];

export const AVV: LegalSection[] = [
  {
    title: "Gegenstand und Dauer",
    items: [
      `Dieser Vertrag regelt die Verarbeitung personenbezogener Daten durch die ${PROVIDER.name} („Auftragnehmer“) im Auftrag des Kunden („Auftraggeber“) nach Art. 28 DSGVO im Rahmen der Nutzung der Software und der Leadgenerierung.`,
      "Die Laufzeit entspricht der Laufzeit des Hauptvertrags.",
    ],
  },
  {
    title: "Art, Zweck und Umfang der Verarbeitung",
    items: [
      "Erfassen, Speichern und Organisieren von Leads; Kontaktaufnahme mit Interessenten per WhatsApp und E-Mail im Namen des Auftraggebers, auch durch einen KI-gestützten digitalen Assistenten; Terminvereinbarung und -erinnerung; Auswertungen für den Auftraggeber.",
      // Prüfen: Bestandskunden-Modul im AVV
      "Bei gebuchtem Bestandskunden-Modul zusätzlich: Import, Speicherung und Auswertung der vom Auftraggeber hochgeladenen Bestandskundendaten (z. B. Vertragsarten, Ablaufdaten, Geburtsdatum) und deren Ansprache per WhatsApp im Namen des Auftraggebers. Der Auftraggeber stellt sicher, dass für die Ansprache eine Rechtsgrundlage und, soweit erforderlich, eine Einwilligung vorliegt.",
      { sub: "Datenarten", text: "Kontaktdaten (Name, Telefonnummer, E-Mail-Adresse, Anschrift), Angaben aus dem Lead-Formular (z. B. Lebenssituation, Versicherungsinteresse), Kommunikationsinhalte (Chatverläufe), Termindaten, Notizen und Status zum Lead sowie Nutzungsdaten der Nutzer des Auftraggebers." },
      { sub: "Betroffene", text: "Interessenten und Kunden des Auftraggebers sowie Nutzer des Auftraggebers." },
      "Besondere Kategorien personenbezogener Daten (Art. 9 DSGVO), insbesondere Gesundheitsdaten, sind nicht Gegenstand der Verarbeitung. Der Auftraggeber fragt solche Daten in Formularen und Gesprächsleitfäden nicht ab.",
    ],
  },
  {
    title: "Weisungen",
    items: [
      "Der Auftragnehmer verarbeitet die Daten nur auf dokumentierte Weisung des Auftraggebers. Weisungen ergeben sich aus dem Hauptvertrag und der Konfiguration der Software durch den Auftraggeber; weitere Weisungen erfolgen in Textform.",
      "Hält der Auftragnehmer eine Weisung für rechtswidrig, weist er den Auftraggeber unverzüglich darauf hin.",
    ],
  },
  {
    title: "Pflichten des Auftragnehmers",
    items: [
      "Die zur Verarbeitung befugten Personen sind zur Vertraulichkeit verpflichtet.",
      "Der Auftragnehmer trifft die technischen und organisatorischen Maßnahmen nach Art. 32 DSGVO gemäß Anlage 1 und passt sie dem Stand der Technik an, ohne das Schutzniveau zu unterschreiten.",
      "Er unterstützt den Auftraggeber bei der Erfüllung der Betroffenenrechte (Art. 12–23 DSGVO) und der Pflichten aus Art. 32–36 DSGVO.",
      "Er meldet dem Auftraggeber Verletzungen des Schutzes personenbezogener Daten unverzüglich, spätestens innerhalb von 48 Stunden nach Kenntnis.",
    ],
  },
  {
    title: "Unterauftragsverarbeiter",
    items: [
      "Der Auftraggeber genehmigt die in Anlage 2 genannten Unterauftragsverarbeiter. Über beabsichtigte Änderungen informiert der Auftragnehmer in Textform; der Auftraggeber kann innerhalb von 14 Tagen aus wichtigem datenschutzrechtlichem Grund widersprechen.",
      "Der Auftragnehmer verpflichtet Unterauftragsverarbeiter vertraglich auf ein gleichwertiges Schutzniveau.",
    ],
  },
  {
    title: "Übermittlung in Drittländer",
    items: [
      "Eine Übermittlung in Länder außerhalb der EU/des EWR erfolgt nur, wenn die Voraussetzungen der Art. 44 ff. DSGVO erfüllt sind, insbesondere auf Grundlage eines Angemessenheitsbeschlusses (z. B. EU-US Data Privacy Framework) oder der EU-Standardvertragsklauseln.",
    ],
  },
  {
    title: "Kontrollrechte",
    items: [
      "Der Auftragnehmer weist die Einhaltung seiner Pflichten auf Anfrage nach, vorrangig durch Dokumentation. Vor-Ort-Kontrollen sind nach angemessener Ankündigung zu üblichen Geschäftszeiten möglich.",
    ],
  },
  {
    title: "Löschung und Rückgabe",
    items: [
      "Nach Ende des Hauptvertrags stellt der Auftragnehmer dem Auftraggeber auf Wunsch einen Export der Daten bereit und löscht die Daten innerhalb von 30 Tagen, soweit keine gesetzliche Pflicht zur Aufbewahrung besteht. Daten in Datensicherungen werden im Rahmen der regulären Rotation gelöscht.",
    ],
  },
  {
    title: "Haftung und Schlussbestimmungen",
    items: [
      "Für die Haftung gilt Art. 82 DSGVO. Im Übrigen gelten die Bestimmungen des Hauptvertrags.",
    ],
  },
];

export const TOMS: string[] = [
  "Betrieb der Anwendung und Datenbank in Rechenzentren in der EU (Amsterdam).",
  "Verschlüsselte Übertragung (TLS) für alle Verbindungen.",
  "Zugang nur mit persönlichem Konto; Passwörter werden ausschließlich als Hash gespeichert. Administratoren melden sich zusätzlich mit einem zweiten Faktor (Authenticator-App) an.",
  "Begrenzung von Anmeldeversuchen; Sitzungen laufen automatisch ab.",
  "Strikte Trennung der Daten je Auftraggeber (Mandantentrennung) und Rollenkonzept (Administrator, Inhaber, Berater); Berater sehen nur die ihnen zugeteilten Leads.",
  "Änderungsprotokoll: Anmeldungen, Exporte, Löschungen und Änderungen an Zugängen werden mit Person und Zeitpunkt protokolliert (Aufbewahrung 1 Jahr).",
  "Zugangsdaten zu Drittdiensten (z. B. Kalender) werden verschlüsselt gespeichert.",
  "Tägliche und wöchentliche Datensicherungen sowie fortlaufende Sicherung zur zeitpunktgenauen Wiederherstellung.",
  "Versionierte, automatisch getestete Datenbank- und Programmänderungen; Healthchecks, Ausfallüberwachung und Fehlerüberwachung ohne Übermittlung personenbezogener Inhalte. Wiederherstellung aus der Sicherung wird regelmäßig getestet.",
  "Löschfunktion je Lead für Betroffenenanfragen und vollständige Löschung der Lead-Daten bei Vertragsende.",
  "Pseudonyme Nutzungsstatistik ohne Lead-Inhalte, automatische Löschung nach 180 Tagen.",
  "Zugriff auf Kundendaten nur durch berechtigte, zur Vertraulichkeit verpflichtete Personen und nur, soweit für Betrieb und Support erforderlich.",
];

export const SUBPROCESSORS: { name: string; purpose: string; location: string }[] = [
  { name: "Railway Corporation", purpose: "Hosting von Anwendung und Datenbank", location: "Serverstandort EU (Amsterdam); Unternehmen USA" },
  { name: "Anthropic, PBC", purpose: "KI-Verarbeitung der Chatnachrichten für den digitalen Assistenten", location: "USA" },
  { name: "360dialog GmbH", purpose: "Anbindung der WhatsApp Business API", location: "Deutschland" },
  { name: "Meta Platforms Ireland Ltd.", purpose: "WhatsApp-Nachrichtenversand; Lead-Formulare", location: "Irland / USA" },
  { name: "Resend (Plus Five Five, Inc.)", purpose: "Versand von E-Mails (z. B. Terminbestätigungen)", location: "USA" },
  { name: "Formagrid Inc. (Airtable)", purpose: "Lead-Datenhaltung", location: "USA" },
  { name: "Zapier, Inc.", purpose: "Übertragung der Leads aus den Meta-Formularen", location: "USA" },
  { name: "Functional Software, Inc. (Sentry)", purpose: "Fehlerüberwachung ohne personenbezogene Inhalte", location: "Datenregion EU" },
  { name: "Google Ireland Ltd. / Microsoft Ireland Operations Ltd.", purpose: "Kalenderanbindung, sofern vom Auftraggeber genutzt", location: "Irland / USA" },
];
