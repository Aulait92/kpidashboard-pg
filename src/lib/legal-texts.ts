// AGB und Auftragsverarbeitungsvertrag (AVV) für „Leadgenerierung + Software“.
// Eine Quelle für die öffentlichen Seiten /rechtliches/* und den Anhang im
// Angebot. Bei Änderungen LEGAL_VERSION anpassen – angenommene Angebote
// speichern die URL, die zum Zeitpunkt der Annahme galt.
//
// 11.11.2026: Logins, jährliche Vorauszahlung, Bestandskunden-Modul mit
// Kampagnen-Kontingent, WhatsApp-Gebühren im Preis enthalten.
// 12.11.2026: Bestandskunden-Modul bei jährlicher Vorauszahlung: Kündigung zum Ende
// des bezahlten Jahres, keine anteilige Erstattung (wie die Stripe-Abrechnung).
// 14.11.2026: Statt Logins zählen aktive Verkäufer (bekommen Leads); Mitglieder ohne Leads kostenlos.
// 14.11.2026: AVV: Verschwiegenheit nach § 203 StGB, E-Mail-Kampagnen im Bestandskunden-Modul.
// 14.11.2026 (Fassung 2): Abschnitt „Testphasen und kostenlose Zeiträume“ (Ole).
// 15.11.2026: AVV: Rückmeldung an Meta (Conversions API für CRM), Meta in Anlage 2 um die Rückmeldung ergänzt.
// 15.11.2026 (Anwalts-Memo, Ole; neuer Stand „15.11.2026“): AVV: § 203 StGB ausdrücklich bis zu den Unterauftragsverarbeitern,
// dokumentierte Verpflichtung der Mitarbeiter (Vorlage docs/vorlage-verpflichtung-203-stgb.md).
// Folge einer neuen Fassung: Die Seiten /rechtliches/* zeigen den neuen Stand, neue Angebote verweisen darauf.
// Außerdem: AGB „Kundendaten: Zusicherung und Freistellung“ und „Daten bei Vertragsende“ (Export im Kundenbereich,
// Löschung nach Vertragsende, seit dem Nachtrag unten mit Ruhephase), AVV „Pflichten des Auftraggebers“, KI-Kennzeichnung (Art. 50 KI-VO) und
// „keine Beratung“ in AGB und AVV.
// Außerdem: Annahme mit Firma, USt-IdNr. und Bestätigung „Unternehmer (§ 14 BGB)“, Konditionen direkt am Knopf und
// Auftragsbestätigung; Startpreis und Testphasen mit gesonderter Bestätigung. „Laufzeit und Kündigung“: Fristen mit
// Beispielen (eindeutiger Kündigungstermin) und Kündigung im Kundenbereich („Vertrag hier kündigen“).
// Außerdem (Zulieferung der anderen Arbeitsstränge, gleicher Stand): Tippgeber ausgeschlossen, Erstinformation und
// § 34d-Angaben aktuell halten, KI-Hinweis nicht abschaltbar, Rollen nach KI-VO, §§ 61, 62 VVG beim Kunden, eigener
// Einwilligungstext unverändert, STOPP für alle Kanäle; AVV: Einwilligungsnachweise, Sperrliste, Erstinformation,
// Gesundheitsangaben nur für den Auftraggeber (nicht an KI oder WhatsApp); Zusicherung gebundener Vertreter, Werberecht
// Bestandskunden-Modul, Export jederzeit, Sperrliste als Hashwerte über das Vertragsende hinaus, Zusatzmodul
// Empfehlungen & Bewertungen (Dankeschön höchstens 15 €, Einverständnis vor der Nachfrage).
// Kunden werden NICHT automatisch zur Zustimmung aufgefordert (kein Banner). Am 15.11.2026 gab es noch keine Kunden mit
// angenommenem Vertrag (Ole), eine Mitteilung entfällt; bei späteren Änderungen mit Kunden gilt AGB „Änderungen dieser
// AGB“ (Mitteilung in Textform, 6 Wochen Widerspruchsfrist), siehe docs/datenschutz.md.
// 15.11.2026 (gleicher Stand, Ole): Ruhephase nach Vertragsende statt Löschung nach 30 Tagen. Standard: Aufbewahrung
// 24 Monate als Weisung des Auftraggebers (Art. 28 Abs. 3 lit. g DSGVO), wählbar 3 Monate oder sofort; in der Ruhephase
// nur Speicherung, Zugang nur für Export und Reaktivierung, danach endgültige Löschung; Abrechnungsdaten nach den
// gesetzlichen Fristen (lib/ruhend.ts). AGB „Daten bei Vertragsende“ und AVV „Löschung und Rückgabe“, TOMs.
// 15.11.2026 (gleicher Stand, Ole): AGB „Angebote vor einer Kündigung“ (Halteangebote, lib/halteangebote.ts): Rabatt-
// bedingungen, Mindestlaufzeit nach einem Nachlass, Pause ohne Vergütung, Paket „Nur Bestand“, Gutschrift nur nach Prüfung, kein Anspruch,
// Rückkehrangebot; in „Laufzeit und Kündigung“ der Verweis auf die Mindestlaufzeit nach einem Nachlass.
// 15.11.2026 (gleicher Stand, Ole): AVV „Art, Zweck und Umfang“: Angebote auslesen (nur ohne Gesundheitsangaben) und
// Beratungspräsentation mit Kundenlink; Datenarten und Anlage 2 (Anthropic) ergänzt.
// 15.11.2026 (Fassung 2, neuer Stand, Ole): „Garantien“: Vertrags-Garantie (Makler) nach 120 statt 90 aktiven Tagen,
// wie die Break-even-Garantie. Gilt nur für neue Verträge: Angebote vor dem Stichtag (VERTRAGS_GARANTIE_120_AB in
// lib/rechner.ts) behalten 90 Tage. Die Seiten /rechtliches/* und das Angebot zeigen immer die aktuelle Fassung (eine
// URL, keine Archivfassungen), darum steht die alte Frist für ältere Angebote als Übergangssatz im Text selbst.
// PRÜFUNG DURCH OLE / ANWALT AUSSTEHEND: die mit „Prüfen:“ markierten Stellen
// (Kommentare) vor dem Livegang juristisch abnehmen lassen.

export const LEGAL_VERSION = "15.11.2026 (Fassung 2)";

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
  // Standard für den Rechnungsfuß; ein abweichender Wert unter Admin → Einstellungen →
  // Rechnungsangaben geht vor (Ole, 14.11.2026).
  vatId: "DE295007828",
};

export type LegalSection = { title: string; items: (string | { sub: string; text: string })[] };

export const AGB: LegalSection[] = [
  {
    title: "Geltungsbereich",
    items: [
      `Diese Allgemeinen Geschäftsbedingungen gelten für alle Verträge zwischen der ${PROVIDER.name}, ${PROVIDER.street}, ${PROVIDER.city} („Anbieter“) und ihren Kunden über Leadgenerierung und die Nutzung der Software des Anbieters.`,
      "Das Angebot richtet sich ausschließlich an Unternehmer im Sinne von § 14 BGB, insbesondere Versicherungsvermittler. Abweichende Bedingungen des Kunden gelten nur, wenn der Anbieter ihnen ausdrücklich in Textform zustimmt.",
      // Prüfen: Ausschluss von Tippgebern (Anwalts-Memo, Vermittlerrecht; Ole 15.11.2026)
      "Die Leistungen richten sich an Versicherungsvermittler mit Erlaubnis bzw. Registrierung nach § 34d GewO. Tippgeber ohne eigene Erlaubnis sind von den Leistungen ausgeschlossen.",
    ],
  },
  {
    title: "Vertragsschluss und Rangfolge",
    items: [
      "Der Vertrag kommt durch die Annahme des Angebots zustande: online über den Angebotslink, per E-Mail oder in sonstiger Textform.",
      // Prüfen: Unternehmereigenschaft bei der Annahme (Anwalts-Memo, Ole 15.11.2026)
      "Bei der Online-Annahme gibt der Kunde seine Firma und, soweit vorhanden, seine USt-IdNr. an und bestätigt, dass er den Vertrag als Unternehmer im Sinne von § 14 BGB schließt. Direkt am Knopf zur Annahme stehen Einrichtungsgebühr, laufende Vergütung mit Beginn, gegebenenfalls Startpreis mit dem Datum des Übergangs in die reguläre Vergütung sowie Laufzeit und Kündigungsmöglichkeit. Der Anbieter bestätigt den Vertragsschluss mit diesen Angaben per E-Mail.",
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
      // Prüfen: KI-Kennzeichnung nach Art. 50 KI-VO, Rollen Anbieter/Betreiber (Anwalts-Memo, Ole 15.11.2026)
      "Der digitale Assistent ist ein KI-System. Er weist Interessenten und Kunden des Kunden spätestens mit der ersten Nachricht klar darauf hin, dass sie mit einem KI-System und nicht mit einem Menschen schreiben (Art. 50 Abs. 1 der Verordnung (EU) 2024/1689, KI-Verordnung), gibt sich nie als Mensch aus und beantwortet die Frage danach wahrheitsgemäß. Der Hinweis in der ersten Nachricht lässt sich nicht abschalten; der Kunde entfernt oder verdeckt ihn nicht, auch nicht in eigenen Nachrichten und Vorlagen.",
      // Prüfen: Rollen nach der KI-Verordnung (Anbieter/Betreiber), Anwalt prüft die Einordnung
      "Nach dem Verständnis der Parteien stellt der Anbieter das KI-System bereit, und der Kunde setzt es in eigener Verantwortung für seine Kommunikation mit Interessenten und Kunden ein (Betreiber im Sinne der KI-Verordnung). Beide Seiten erfüllen die Pflichten, die sie in ihrer jeweiligen Rolle treffen, und unterstützen sich dabei.",
      "Der digitale Assistent führt keine Versicherungsberatung oder Versicherungsvermittlung durch: Er berät nicht, gibt keine Empfehlungen zu Versicherungsprodukten, nennt keine Tarife, Versicherer oder Preise bzw. Beiträge und vergleicht keine Angebote. Er stellt Fragen zur Bedarfsklärung und vereinbart Termine. Beratung und Vermittlung einschließlich der Befragungs-, Beratungs- und Dokumentationspflichten nach §§ 61, 62 VVG bleiben vollständig beim Kunden, der Gespräche jederzeit selbst übernehmen kann.",
      "Der Anbieter strebt eine Verfügbarkeit von 99 % im Monatsmittel an, ausgenommen angekündigte Wartungen. Für Dienste Dritter (insbesondere Meta/WhatsApp, Kalender- und KI-Anbieter) übernimmt der Anbieter keine Gewähr.",
      "Der Anbieter darf die Software weiterentwickeln, solange die vereinbarten wesentlichen Funktionen erhalten bleiben.",
      // Prüfen: aktive Verkäufer statt Logins (Ole, 14.11.2026)
      "Im Paket mit Software ist die im Angebot genannte Zahl aktiver Verkäufer enthalten. Aktiv ist ein Zugang, der Leads zugeteilt bekommt (Einstellung „bekommt Leads“) oder an einem Tag Leads zugewiesen bekommen hat; er zählt dann für diesen Tag als aktiv. Zugänge ohne Leads (z. B. Inhaber, der nur steuert, oder Assistenz) sind kostenlos. Weitere Zugänge kann der Kunde selbst anlegen; jeder weitere aktive Verkäufer wird zum im Angebot genannten Preis je Monat berechnet, tagesgenau anteilig. Ab der im Angebot genannten Zahl an Zugängen gelten individuelle Konditionen.",
      // Prüfen: Bestandskunden-Modul + Fair Use; Kündigung bei jährlicher Vorauszahlung zum Ende des bezahlten Jahres (12.11.2026)
      "Das Bestandskunden-Modul (Import und Auswertung der Bestandskunden des Kunden, Kampagnen per WhatsApp) ist ein Zusatzmodul und nur enthalten, wenn es im Angebot vereinbart oder nachträglich in Textform gebucht wurde. Es ist zum Ende des Abrechnungszeitraums kündbar, sofern im Angebot nichts anderes vereinbart ist: bei monatlicher Zahlweise zum Ende des Abrechnungsmonats, bei jährlicher Vorauszahlung zum Ende des bezahlten Abrechnungsjahres. Bei jährlicher Vorauszahlung wird das Modul bei Buchung anteilig bis zum Ende des laufenden Abrechnungsjahres berechnet; eine anteilige Erstattung bei Kündigung erfolgt nicht.",
      // Prüfen: Selbstbuchung von Zusatzmodulen im Kundenbereich (Ole, 11.11.2026)
      "Zusatzmodule können im Kundenbereich auch selbst gebucht und dort zum Ende des laufenden Abrechnungszeitraums gekündigt werden. Bei einer Buchung im laufenden Zeitraum wird die Vergütung tagesgenau anteilig berechnet; bei einer Kündigung bleibt das Modul bis zum Ende des bereits bezahlten Zeitraums nutzbar, eine anteilige Erstattung erfolgt nicht.",
    ],
  },
  {
    // Prüfen: Dankeschön (§ 48b VAG) und Bewertungsbitten (Anwalts-Memo, Ole 15.11.2026)
    title: "Zusatzmodul Empfehlungen & Bewertungen",
    items: [
      "Der Kunde holt vor der automatischen Nachfrage mit Bewertungs- und Empfehlungsbitte das Einverständnis seines Kunden ein und bestätigt es in der Software.",
      "Ein Dankeschön für Empfehlungen beträgt höchstens 15 € je Empfehler und Kalenderjahr, wird nicht in bar gewährt, nicht an einen Vertragsabschluss gekoppelt und nie der empfohlenen Person gewährt. Vorgaben des Versicherers beachtet der Kunde selbst.",
    ],
  },
  {
    title: "Mitwirkung des Kunden",
    items: [
      "Der Kunde räumt dem Anbieter Zugriff auf sein Meta-Werbekonto ein, stellt eine Zahlungsmethode bei Meta bereit und verbindet, soweit gebucht, seine WhatsApp-Nummer und seinen Kalender.",
      "Der Kunde bearbeitet die Leads zeitnah, prüft die Werbemittel und Nachrichtenvorlagen vor dem Start und gibt sie frei.",
      "Der Kunde ist für die Einhaltung seiner berufsrechtlichen Pflichten verantwortlich, insbesondere aus § 34d GewO, der Versicherungsvertriebsrichtlinie und den Vorgaben seines Versicherers, einschließlich etwaiger Werberichtlinien.",
      // Prüfen: Erstinformation, Einwilligungstext, STOPP (Anwalts-Memo, Ole 15.11.2026)
      "Der Kunde hinterlegt in der Software eine zutreffende Erstinformation nach § 15 VersVermV, seine Registernummer und seinen Status nach § 34d GewO und hält diese Angaben aktuell. Die Software stellt die Erstinformation Interessenten über einen Link zur Verfügung.",
      "Nutzt der Kunde eigene Lead-Formulare oder Landingpages, verwendet er den vom Anbieter bereitgestellten Einwilligungstext unverändert.",
      "Widerspricht ein Interessent oder Kunde der Kontaktaufnahme, etwa mit „STOPP“, beachtet die Software den Widerspruch für alle Kanäle (WhatsApp, E-Mail und Kampagnen). Der Kunde beachtet ihn auch außerhalb der Software.",
      "Zugangsdaten sind geheim zu halten. Der Kunde informiert den Anbieter unverzüglich über einen Missbrauchsverdacht.",
    ],
  },
  {
    title: "Vergütung und Zahlung",
    items: [
      "Die Setupgebühr wird mit Vertragsschluss fällig. Die monatliche Vergütung ist ab dem im Angebot genannten Startdatum monatlich im Voraus fällig. Alle Preise verstehen sich netto zuzüglich der gesetzlichen Umsatzsteuer.",
      // Prüfen: jährliche Vorauszahlung
      { sub: "Jährliche Vorauszahlung", text: "Ist im Angebot die jährliche Vorauszahlung vereinbart, ist die Vergütung für 12 Monate zum Start im Voraus fällig. Sie beträgt das im Angebot genannte Vielfache der monatlichen Vergütung einschließlich vereinbarter Zusätze (Nachlass für die Vorauszahlung). Während des Zahlungsjahres hinzukommende aktive Verkäufer oder Module werden anteilig für die Restlaufzeit berechnet. Eine anteilige Erstattung bei vorzeitiger Beendigung erfolgt nicht, außer bei Kündigung aus wichtigem Grund durch den Kunden." },
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
    // Prüfen: Testphasen und kostenlose Zeiträume (Ole, 14.11.2026)
    title: "Testphasen und kostenlose Zeiträume",
    items: [
      "Bietet der Anbieter ein Zusatzmodul oder eine Leistung für einen bestimmten Zeitraum kostenlos an (Testphase, Prämie oder Aktion), nennt er die Dauer und den anschließenden Preis bei der Buchung bzw. im Angebot.",
      "Nach Ende des kostenlosen Zeitraums wird die Leistung automatisch zu dem bei der Buchung genannten Preis fortgeführt und berechnet, sofern der Kunde sie nicht vorher beendet.",
      "Der Kunde kann die Leistung während des kostenlosen Zeitraums jederzeit im Kundenbereich oder in Textform beenden. Es entstehen dann keine Kosten.",
      "Der Anbieter weist den Kunden spätestens 7 Tage vor Ende des kostenlosen Zeitraums per E-Mail und im Kundenbereich auf das Ende und den folgenden Preis hin.",
      "Nach dem Übergang in die kostenpflichtige Phase kann die Leistung monatlich zum Ende des Abrechnungsmonats gekündigt werden, soweit im Angebot nichts anderes vereinbart ist.",
      "Je Leistung und Kunde wird ein kostenloser Zeitraum gewährt. Ein Anspruch auf kostenlose Zeiträume besteht nicht.",
      // Prüfen: Startpreis mit automatischem Übergang (Anwalts-Memo 15.11.2026, § 305c BGB)
      "Ist im Angebot ein Startpreis vereinbart, gilt er für die genannte Zahl von Abrechnungsmonaten ab Start. Danach gilt automatisch die im Angebot genannte reguläre Vergütung. Das Datum des Übergangs und der folgende Betrag stehen bei der Annahme direkt am Knopf, der Kunde bestätigt sie dort gesondert, und sie stehen in der Auftragsbestätigung.",
      "Bei Testphasen, die der Kunde im Kundenbereich bucht, stehen Ende der Testphase und folgender Preis direkt am Knopf zur Buchung und werden dort gesondert bestätigt. Der Anbieter bestätigt Beginn, Ende und folgenden Preis per E-Mail.",
    ],
  },
  {
    // Prüfen: Halteangebote vor einer Kündigung (Ole, 15.11.2026), insbesondere Mindestlaufzeit nach einem Nachlass (§ 307 BGB)
    title: "Angebote vor einer Kündigung",
    items: [
      "Der Anbieter kann dem Kunden vor einer Kündigung, insbesondere im Kundenbereich unter „Vertrag hier kündigen“, Angebote machen, etwa einen Nachlass auf die monatliche Vergütung, einen kostenlosen Monat der Betreuung, eine Pause ohne Vergütung, eine Neuausrichtung der Kampagne oder einen Wechsel des Pakets. Es gelten die bei der Annahme genannten Bedingungen; der Anbieter bestätigt sie im Kundenbereich und bei einem Nachlass zusätzlich per E-Mail.",
      { sub: "Rabattbedingungen", text: "Ein Nachlass gilt für die genannte Zahl von Monatsrechnungen ab der nächsten Rechnung und bezieht sich auf die monatliche Vergütung einschließlich vereinbarter Zusätze. Er wird nicht ausgezahlt und nicht auf andere Zeiträume übertragen. Bei jährlicher Vorauszahlung wird kein Nachlass auf die Monatsgebühr angeboten." },
      { sub: "Mindestlaufzeit nach einem Nachlass", text: "Ist ein Nachlass an eine weitere Laufzeit geknüpft, läuft der Vertrag mindestens bis zu dem bei der Annahme genannten Tag. Er ergibt sich aus dem laufenden Abrechnungsmonat, den rabattierten Abrechnungsmonaten und der genannten Zahl weiterer Abrechnungsmonate (Beispiel: Start am 01.08., Annahme am 15.11., Nachlass für 2 Monate, danach 3 Monate: Mindestlaufzeit bis 30.04. des Folgejahres). Eine Kündigung ist jederzeit möglich, wirkt aber frühestens zu diesem Tag." },
      { sub: "Pause ohne Vergütung", text: "Wird eine Pause ohne Vergütung vereinbart, entfällt für ihre Dauer die gesamte Vergütung. Sie dauert höchstens die bei der Annahme genannte Zahl von Monaten und verlängert eine vereinbarte Mindestlaufzeit nicht." },
      { sub: "Paket „Nur Bestand“", text: "Wählt der Kunde das Paket „Nur Bestand“, umfasst der Vertrag ab dem nächstmöglichen Kündigungstermin des bisherigen Pakets nur noch die Speicherung seiner Daten und das Bestandskunden-Modul mit dessen Kontingent zu dem bei der Annahme genannten Preis, ohne Leadgenerierung und ohne Betreuung. Das Modul „Empfehlungen & Bewertungen“ kann gegen den im Kundenbereich genannten Aufpreis dazugebucht werden. Im Übrigen gelten die Regeln zu Zusatzmodulen und „Laufzeit und Kündigung“ ohne Mindestlaufzeit." },
      "Gutschriften für Leads mit fehlerhaften Angaben erfolgen nur nach Prüfung durch den Anbieter und in der von ihm bestätigten Höhe.",
      "Ein Anspruch auf solche Angebote besteht nicht. Der Anbieter kann sie von einer Mindestdauer der Kundenbeziehung abhängig machen und Nachlässe und vergleichbare Vorteile auf einmal innerhalb von 12 Monaten begrenzen.",
      "Nach Vertragsende kann der Anbieter ein Angebot zur Rückkehr ohne neue Einrichtungsgebühr machen. Ein neuer Vertrag kommt erst zustande, wenn der Kunde Paket und Preis zugestimmt hat.",
    ],
  },
  {
    title: "Laufzeit und Kündigung",
    items: [
      { sub: "Ohne Vertragslaufzeit", text: "Der Vertrag läuft unbefristet und kann von beiden Seiten zum Ende des jeweiligen Abrechnungsmonats in Textform gekündigt werden." },
      // Prüfen: Mindestlaufzeit 3 Monate (Ole, 11.11.2026)
      { sub: "Mit 3 Monaten Laufzeit", text: "Der Vertrag hat eine Mindestlaufzeit von 3 Monaten ab Start. Danach läuft er unbefristet weiter und kann zum Ende des jeweiligen Abrechnungsmonats gekündigt werden." },
      { sub: "Mit 12 Monaten Laufzeit", text: "Der Vertrag hat eine Mindestlaufzeit von 12 Monaten ab Start. Danach läuft er unbefristet weiter und kann zum Ende des jeweiligen Abrechnungsmonats gekündigt werden." },
      // Prüfen: Verlängerung bei Jahreszahlung
      { sub: "Mit jährlicher Vorauszahlung", text: "Der Vertrag hat eine Laufzeit von 12 Monaten ab Start und verlängert sich jeweils um weitere 12 Monate, wenn er nicht mit einer Frist von einem Monat zum Ende des Zahlungsjahres in Textform gekündigt wird. Der Kunde kann vor Ablauf des Zahlungsjahres in Textform auf monatliche Zahlung umstellen; dann gilt ab dem folgenden Zahlungszeitraum die Regel „Mit 12 Monaten Laufzeit“." },
      // Prüfen: eindeutiger Kündigungstermin und Kündigung im Kundenbereich (Anwalts-Memo, Ole 15.11.2026)
      { sub: "Fristen", text: "Start ist das im Angebot genannte oder bei der Annahme gewählte Startdatum. Ein Abrechnungsmonat beginnt am Starttag bzw. an demselben Kalendertag der Folgemonate und endet mit dem Tag davor; fehlt dieser Tag in einem Monat, endet er mit dem Monatsletzten (Beispiel: Start am 15.03., Abrechnungsmonate 15.03. bis 14.04., 15.04. bis 14.05. usw.). Eine Mindestlaufzeit von 3 bzw. 12 Monaten endet entsprechend (Beispiel: Start am 15.03.2027, 3 Monate bis 14.06.2027). Eine Kündigung während der Mindestlaufzeit wirkt zu deren Ende, danach zum Ende des Abrechnungsmonats, in dem sie zugeht. Bei jährlicher Vorauszahlung muss die Kündigung spätestens einen Monat vor Ende des Zahlungsjahres zugehen (Beispiel: Zahlungsjahr bis 14.03.2028, Kündigung bis 14.02.2028), sonst wirkt sie zum Ende des folgenden Zahlungsjahres." },
      { sub: "Form der Kündigung", text: "Die Kündigung erfolgt in Textform (z. B. E-Mail) oder im Kundenbereich unter „Konto & Rechnungen“ über „Vertrag hier kündigen“. Dort sieht der Kunde vor dem Absenden den Termin, zu dem der Vertrag endet. Der Anbieter bestätigt den Eingang der Kündigung und das Vertragsende unverzüglich per E-Mail." },
      "Hat der Kunde einen Nachlass mit Mindestlaufzeit angenommen (Abschnitt „Angebote vor einer Kündigung“), wirkt eine ordentliche Kündigung frühestens zum Ende dieser Mindestlaufzeit.",
      "Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt. Die Setupgebühr wird bei Vertragsende nicht erstattet.",
    ],
  },
  {
    title: "Garantien",
    items: [
      // Prüfen: Garantien (von Ole am 11.11.2026 freigegeben)
      "Die folgenden Garantien gelten für das Produkt Katzenversicherung (TKV) sowie für weitere Produkte, soweit sie im Angebot ausdrücklich genannt sind. Sie gelten ab Start der Kampagne (Tag der ersten Auslieferung der Anzeigen).",
      { sub: "Lead-Garantie", text: "Beträgt das Werbebudget in den ersten 30 aktiven Tagen mindestens 20 € pro Tag und Produkt und erhält der Kunde in diesem Zeitraum weniger als 100 Leads für dieses Produkt, entfällt die monatliche Vergütung für Betreuung und Software im folgenden Abrechnungsmonat. Das Werbebudget zahlt der Kunde weiterhin direkt an Meta." },
      { sub: "Break-even-Garantie", text: "Gilt für Kunden, die als Versicherungsvertreter mit Abschlussprovision arbeiten (nicht für Makler, deren Vergütung als laufende Bestandsprovision über die Vertragslaufzeit anfällt). Ziel: spätestens ab dem 5. Monat profitabel. Liegt die Provision des Kunden aus den über den Anbieter gewonnenen Verträgen nach 4 Monaten (120 aktiven Tagen) unter der Summe aus Werbebudget und Vergütung für Betreuung und Software in diesem Zeitraum, betreut der Anbieter den Kunden ohne Vergütung für Betreuung und Software weiter, auf Wunsch mit einem anderen Produkt ohne Setupgebühr, bis die Provision seit Kampagnenstart diese Kosten erreicht, längstens jedoch 6 Monate. Voraussetzungen: Werbebudget an den aktiven Tagen mindestens 20 € pro Tag und Produkt; mindestens 80 % der über die Software gebuchten Termine wahrgenommen; für mindestens 80 % der Leads das Ergebnis in der Software eingetragen (z. B. erreicht, Termin, Abschluss mit Beitrag); Provisionssätze unter „Meine Provisionen“ hinterlegt. Maßgeblich ist die Berechnung in der Software auf Grundlage dieser Angaben; der Anbieter kann Nachweise zu Abschlüssen verlangen. Für Verträge aus Angeboten, die vor dem 13.11.2026, 19:00 Uhr erstellt wurden, gilt statt 120 aktiven Tagen eine Frist von 90 Tagen." },
      // Prüfen: Vertrags-Garantie für Makler inkl. Produktwechsel ohne Setupgebühr (Ole, 11.11.2026);
      // 120 statt 90 aktive Tage für neue Angebote (Ole, 15.11.2026, Stichtag VERTRAGS_GARANTIE_120_AB in lib/rechner.ts)
      { sub: "Vertrags-Garantie (für Makler)", text: "Gilt für Kunden, die als Versicherungsmakler tätig sind, anstelle der Break-even-Garantie. Hat der Kunde nach 120 aktiven Tagen weniger als 15 Verträge aus den über den Anbieter gewonnenen Leads abgeschlossen, betreut der Anbieter den Kunden ohne Vergütung für Betreuung und Software weiter, auf Wunsch mit einem anderen Produkt ohne Setupgebühr, bis 15 Verträge erreicht sind, längstens jedoch 6 Monate. Als Vertrag zählt jeder Lead, für den in der Software ein Abschluss eingetragen ist. Voraussetzungen: Werbebudget an den aktiven Tagen mindestens 20 € pro Tag und Produkt; mindestens 80 % der über die Software gebuchten Termine wahrgenommen; für mindestens 80 % der Leads das Ergebnis in der Software eingetragen. Im Garantiefall kann der Anbieter als Nachweis eine Courtage- bzw. Provisionsabrechnung des Versicherers anfordern; verschweigt der Kunde Abschlüsse, entfällt der Anspruch. Für Verträge aus Angeboten, die vor dem 15.11.2026, 23:45 Uhr erstellt wurden, gilt statt 120 aktiven Tagen eine Frist von 90 aktiven Tagen." },
      "Pausen (z. B. Urlaub oder Krankheit) verlängern den jeweiligen Prüfzeitraum um ihre Dauer; maßgeblich sind die aktiven Tage. Besteht zum Zeitpunkt der Prüfung ein Zahlungsverzug, ruht der Anspruch bis zum Ausgleich. Das gilt für alle Garantien.",
      "Weitergehende Ansprüche, insbesondere auf eine bestimmte Provision oder, über die Vertrags-Garantie hinaus, auf eine bestimmte Zahl von Verträgen, bestehen nicht.",
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
    // Prüfen: Zusicherung und Freistellung, vor allem für Ausschließlichkeitsvertreter (Anwalts-Memo, Ole 15.11.2026)
    title: "Kundendaten: Zusicherung und Freistellung",
    items: [
      "Lädt der Kunde Daten seiner Kunden oder Interessenten in die Software (insbesondere Bestandskunden, eigene Kontaktlisten und Leads aus anderen Quellen) oder nutzt er sie dort, etwa für Kampagnen, sichert er zu, dass Upload und Nutzung nach seinem Vermittlervertrag, nach seinen berufsrechtlichen Pflichten und nach dem Datenschutz- und Wettbewerbsrecht zulässig sind und dass eine erforderliche Zustimmung des Versicherers vorliegt. Der Kunde ist dafür verantwortlich, für welche Produkte und Zwecke er diese Daten nutzt.",
      "Ist der Kunde gebundener Versicherungsvertreter, sichert er insbesondere zu, dass Upload, Speicherung und Nutzung der übermittelten Kundendaten nach seinem Agenturvertrag und dem Datenschutzrecht zulässig sind.",
      // Prüfen: Werberecht beim Bestandskunden-Modul (§ 7 UWG), Ole 15.11.2026
      "Beim Bestandskunden-Modul ist der Kunde für die werberechtlichen Voraussetzungen verantwortlich, insbesondere Einwilligungen und, bei E-Mail-Werbung ohne Einwilligung, den Hinweis auf das Widerspruchsrecht bei Erhebung der Adresse (§ 7 Abs. 3 UWG). Seine Angaben hierzu (Importdatei, Bestätigungen) müssen zutreffen; die Software prüft nur anhand dieser Angaben.",
      "Der Kunde stellt den Anbieter von Ansprüchen Dritter frei, insbesondere des Versicherers sowie von betroffenen Personen, Mitbewerbern, Verbänden und Behörden, die auf einer Verletzung dieser Zusicherung oder auf einer unzulässigen Ansprache durch den Kunden beruhen. Die Freistellung umfasst die angemessenen Kosten der Rechtsverteidigung. Der Anbieter informiert den Kunden unverzüglich über geltend gemachte Ansprüche, gibt ihm Gelegenheit zur Stellungnahme und erkennt Ansprüche nicht ohne Abstimmung mit dem Kunden an. Die Freistellung gilt nicht, soweit der Anbieter die Verletzung zu vertreten hat.",
    ],
  },
  {
    // Prüfen: Export, Ruhephase (Standard 24 Monate) und Löschung nach Vertragsende, Sperrliste als Hashwerte (15.11.2026)
    title: "Daten bei Vertragsende",
    items: [
      "Der Kunde kann jederzeit einen vollständigen Export seiner Daten im Kundenbereich abrufen (Konto, „Ihre Daten herunterladen“), auch nach Vertragsende bis zur Löschung.",
      "Nach Vertragsende ruht das Konto des Kunden: Der Anbieter speichert die Daten nur noch und verarbeitet sie nicht weiter; Kampagnen, Nachrichten, digitaler Assistent und Abgleiche sind beendet. Der Kunde kann sich anmelden, um seine Daten zu exportieren oder sein Konto zu reaktivieren. Für die Reaktivierung vereinbaren die Parteien die Leistungen und die Vergütung neu.",
      "Die Daten bewahrt der Anbieter nach Vertragsende 24 Monate auf (Ruhephase). Der Kunde kann bei der Kündigung und danach jederzeit bis zur Löschung im Kundenbereich eine kürzere Aufbewahrung von 3 Monaten oder die Löschung sofort nach Vertragsende wählen oder zur Aufbewahrung von 24 Monaten zurückkehren. Der Anbieter erinnert den Kunden 30 und 7 Tage vor der Löschung per E-Mail.",
      "Nach Ablauf der gewählten Aufbewahrung löscht der Anbieter die personenbezogenen Daten der Leads, Kontakte und Kunden des Kunden sowie die Zugänge endgültig. Ausgenommen sind pseudonymisierte Sperrlisteneinträge (Hashwerte) von Personen, die der Werbung widersprochen haben, zur dauerhaften Beachtung des Widerspruchs, sowie Daten, für die eine gesetzliche Pflicht zur Aufbewahrung besteht. Daten in Datensicherungen werden im Rahmen der regulären Rotation gelöscht. Angebote, Verträge, Rechnungen und die zugehörigen Abrechnungsdaten bewahrt der Anbieter nach den gesetzlichen Fristen auf; anonyme Kennzahlen ohne Personenbezug bleiben erhalten.",
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
      "Die Laufzeit entspricht der Laufzeit des Hauptvertrags. Die Pflichten aus diesem Vertrag gelten darüber hinaus, solange der Auftragnehmer nach Ende des Hauptvertrags Daten des Auftraggebers aufbewahrt (Abschnitt „Löschung und Rückgabe“).",
    ],
  },
  {
    title: "Art, Zweck und Umfang der Verarbeitung",
    items: [
      "Erfassen, Speichern und Organisieren von Leads; Kontaktaufnahme mit Interessenten per WhatsApp und E-Mail im Namen des Auftraggebers, auch durch einen digitalen Assistenten, der ein KI-System ist; Terminvereinbarung und -erinnerung; Auswertungen für den Auftraggeber.",
      // Prüfen: KI-Kennzeichnung im AVV (Art. 50 KI-VO)
      "Der digitale Assistent kennzeichnet sich gegenüber den Betroffenen spätestens mit der ersten Nachricht als KI-System (Art. 50 Abs. 1 KI-Verordnung). Er berät nicht zu Versicherungsprodukten, nennt keine Tarife oder Beiträge und vergleicht keine Angebote; er klärt den Bedarf und vereinbart Termine. Chatnachrichten werden dazu an den in Anlage 2 genannten KI-Anbieter übermittelt, der sie nicht für eigene Zwecke, insbesondere nicht zum Training, verwendet.",
      // Prüfen: Bestandskunden-Modul im AVV
      "Bei gebuchtem Bestandskunden-Modul zusätzlich: Import, Speicherung und Auswertung der vom Auftraggeber hochgeladenen Bestandskundendaten (z. B. Vertragsarten, Ablaufdaten, Geburtsdatum) und deren Ansprache per WhatsApp im Namen des Auftraggebers. Der Auftraggeber stellt sicher, dass für die Ansprache eine Rechtsgrundlage und, soweit erforderlich, eine Einwilligung vorliegt.",
      // Prüfen: E-Mail-Kampagnen über das Postfach des Auftraggebers (Ole, 14.11.2026)
      "Bei gebuchtem Bestandskunden-Modul außerdem: Versand von E-Mail-Kampagnen an Bestandskunden im Namen des Auftraggebers über dessen verbundenes E-Mail-Postfach (z. B. Google, Microsoft oder SMTP) als einzelne E-Mails, einschließlich Verarbeitung von Antworten, Zustellfehlern und Abmeldungen sowie Speicherung des Einwilligungs- und Abmeldestatus je Kunde und Kanal. Der Auftragnehmer verarbeitet dazu die E-Mail-Adresse, den Namen und die für die Kampagne genutzten Vertragsangaben. Abmeldungen werden dauerhaft gespeichert und bei späteren Kampagnen und erneuten Importen berücksichtigt. Inhalte des Postfachs, die nicht zu Kampagnen oder Kontakten aus der Software gehören, werden nicht verarbeitet. Die Verantwortung für die wettbewerbs- und datenschutzrechtliche Zulässigkeit der Ansprache (insbesondere § 7 UWG) verbleibt beim Auftraggeber.",
      // Prüfen: Rückmeldung an Meta (Conversions API für CRM, Ole 15.11.2026): Rolle von Meta (Auftragsverarbeiter
      // nach den Meta Business Tools Terms bzw. gemeinsame Verantwortung), § 203 StGB bei Vertragswert ohne Produkt
      "Rückmeldung an Meta (abschaltbar durch den Auftraggeber): Für Leads aus Meta-Lead-Formularen übermittelt der Auftragnehmer im Namen des Auftraggebers an dessen Meta-Dataset die von Meta vergebene Lead-ID, die erreichte Stufe (Lead, Erreicht, Termin vereinbart, Abschluss), den Zeitpunkt und beim Abschluss den Vertragswert (Jahresbeitrag), damit Meta die Auslieferung der Anzeigen des Auftraggebers verbessert. Kontaktdaten (Name, Telefonnummer, E-Mail-Adresse), Gesprächsinhalte und das abgeschlossene Produkt bzw. die Sparte werden nicht übermittelt.",
      // Prüfen: Angebote auslesen und Beratungspräsentation mit Kundenlink (Ole 15.11.2026)
      "Terminvorbereitung und Beratungspräsentation: Lädt der Auftraggeber zur Vorbereitung eines Beratungstermins Versicherungsangebote hoch (PDF oder Bild), kann er sie durch den in Anlage 2 genannten KI-Anbieter auslesen lassen; übernommen werden nur Tarif-, Beitrags- und Leistungsdaten, die der Auftraggeber prüft und bestätigt. Das Auslesen ist auf Sach-, Haftpflicht-, Rechtsschutz-, Unfall- und Tierversicherungen beschränkt; Angebote zu Produkten mit Gesundheitsangaben von Personen (z. B. Kranken-, Berufsunfähigkeits-, Lebens- oder Pflegeversicherung) werden nicht an den KI-Anbieter übermittelt. Der Auftraggeber lädt keine Antragsunterlagen mit Gesundheitsfragen zum Auslesen hoch. Aus den bestätigten Angeboten erstellt die Software eine Präsentation; auf Wunsch des Auftraggebers stellt sie diese dem Interessenten über einen zufällig erzeugten, 14 Tage gültigen und jederzeit beendbaren Link bereit.",
      // Prüfen: neue Datenarten (Einwilligungsnachweis, Sperrliste, Erstinformation), Ole 15.11.2026
      { sub: "Datenarten", text: "Kontaktdaten (Name, Telefonnummer, E-Mail-Adresse, Anschrift), Angaben aus dem Lead-Formular (z. B. Lebenssituation, Versicherungsinteresse), Nachweise der Einwilligung aus Lead-Formularen (Zeitpunkt, Formular-ID, Textversion und Wortlaut), Kommunikationsinhalte (Chatverläufe und E-Mails), Termindaten, Notizen und Status zum Lead, Sperrliste der Personen, die der Kontaktaufnahme widersprochen haben (z. B. mit „STOPP“), bei gebuchtem Bestandskunden-Modul Vertragsangaben der Bestandskunden (z. B. Sparte, Versicherer, Vertragsnummer, Beitrag, Ablaufdatum) sowie Einwilligungs- und Abmeldestatus, die Erstinformation des Auftraggebers (PDF, für Interessenten über einen zufällig erzeugten Link unter /erstinformation/ abrufbar), vom Auftraggeber hochgeladene Versicherungsangebote (mit Name, Anschrift und Geburtsdatum des Interessenten sowie Tarif-, Beitrags- und Leistungsdaten) und daraus erstellte Präsentationen, außerdem Nutzungsdaten der Nutzer des Auftraggebers." },
      { sub: "Betroffene", text: "Interessenten und Kunden des Auftraggebers sowie Nutzer des Auftraggebers." },
      // Prüfen: Gesundheitsangaben aus Lead-Formularen (Art. 9 DSGVO), Einwilligung, Ole 15.11.2026
      "Gesundheitsangaben (Art. 9 DSGVO), die Interessenten in Lead-Formularen machen, werden gespeichert und nur dem Auftraggeber angezeigt. Sie werden nicht an den KI-Anbieter übermittelt und nicht in WhatsApp-Nachrichten verwendet (Meta, 360dialog). Der Auftraggeber stellt sicher, dass dafür eine ausdrückliche Einwilligung vorliegt (Art. 9 Abs. 2 lit. a DSGVO), und fragt darüber hinaus keine besonderen Kategorien personenbezogener Daten ab.",
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
      // Prüfen: Verschwiegenheit nach § 203 StGB (Ole, 14.11.2026; Anwalt prüft)
      {
        sub: "Verschwiegenheit nach § 203 StGB",
        text: "Soweit der Auftraggeber als Versicherungsvermittler einer gesetzlichen Schweigepflicht nach § 203 StGB unterliegt und dem Auftragnehmer dabei fremde Geheimnisse zugänglich werden (z. B. die Tatsache eines Vertrags in der Personenversicherung), wirkt der Auftragnehmer als sonstige mitwirkende Person im Sinne von § 203 Abs. 3 Satz 2 StGB mit. Der Auftragnehmer verpflichtet sich zur Verschwiegenheit über alle Geheimnisse, die ihm dabei bekannt werden, auch über das Ende dieses Vertrags hinaus. Er erhält Kenntnis nur, soweit dies für die vertragliche Leistung erforderlich ist. Der Auftraggeber weist hiermit darauf hin, dass eine unbefugte Offenbarung nach § 203 Abs. 4 StGB strafbar ist. Der Auftragnehmer verpflichtet seine Mitarbeiter und alle weiteren mitwirkenden Personen, die bei der Leistung Kenntnis von solchen Geheimnissen erlangen können, vor Aufnahme der Tätigkeit in Textform zur Verschwiegenheit und belehrt sie über die Strafbarkeit nach § 203 StGB. Die Verpflichtung der Mitarbeiter wird dokumentiert und dem Auftraggeber auf Anfrage nachgewiesen.",
      },
      // Prüfen: § 203 StGB bis zu den Unterauftragsverarbeitern (Ole, 15.11.2026; Anwalt: reichen die DPAs der großen Anbieter?)
      {
        sub: "Verschwiegenheit der Unterauftragsverarbeiter",
        text: "Der Auftragnehmer verpflichtet Unterauftragsverarbeiter, soweit sie bei ihrer Leistung Kenntnis von Geheimnissen im Sinne von § 203 StGB erlangen können, in Textform zur Verschwiegenheit und weist sie auf die Strafbarkeit einer unbefugten Offenbarung nach § 203 Abs. 4 StGB hin. Er sorgt dafür, dass Unterauftragsverarbeiter weitere von ihnen eingesetzte Personen in gleicher Weise verpflichten (§ 203 Abs. 4 Satz 2 Nr. 2 StGB). Unterauftragsverarbeiter erhalten Kenntnis nur, soweit dies für ihre Leistung erforderlich ist.",
      },
      "Der Auftragnehmer trifft die technischen und organisatorischen Maßnahmen nach Art. 32 DSGVO gemäß Anlage 1 und passt sie dem Stand der Technik an, ohne das Schutzniveau zu unterschreiten.",
      "Er unterstützt den Auftraggeber bei der Erfüllung der Betroffenenrechte (Art. 12–23 DSGVO) und der Pflichten aus Art. 32–36 DSGVO.",
      "Er meldet dem Auftraggeber Verletzungen des Schutzes personenbezogener Daten unverzüglich, spätestens innerhalb von 48 Stunden nach Kenntnis.",
    ],
  },
  {
    // Prüfen: Zusicherung des Auftraggebers (AO-Vertreter), Anwalts-Memo 15.11.2026
    title: "Pflichten des Auftraggebers",
    items: [
      "Der Auftraggeber ist für die Zulässigkeit der Verarbeitung verantwortlich. Er sichert zu, dass er die Daten, die er in die Software lädt oder dort nutzt (insbesondere Bestandskunden und Leads aus anderen Quellen), nach seinem Vermittlervertrag und nach dem Datenschutzrecht verarbeiten und dem Auftragnehmer überlassen darf und dass eine erforderliche Zustimmung des Versicherers vorliegt.",
      "Ist der Auftraggeber gebundener Versicherungsvertreter, sichert er zu, dass Upload, Speicherung und Nutzung der übermittelten Kundendaten nach seinem Agenturvertrag und dem Datenschutzrecht zulässig sind, und stellt den Auftragnehmer von Ansprüchen Dritter, insbesondere des Versicherers, frei, die auf einer Verletzung dieser Zusicherung beruhen.",
      "Im Übrigen gilt für Ansprüche Dritter aus einer Verletzung dieser Zusicherungen die Freistellung nach den AGB (Abschnitt „Kundendaten: Zusicherung und Freistellung“).",
    ],
  },
  {
    title: "Unterauftragsverarbeiter",
    items: [
      "Der Auftraggeber genehmigt die in Anlage 2 genannten Unterauftragsverarbeiter. Über beabsichtigte Änderungen informiert der Auftragnehmer in Textform; der Auftraggeber kann innerhalb von 14 Tagen aus wichtigem datenschutzrechtlichem Grund widersprechen.",
      "Der Auftragnehmer verpflichtet Unterauftragsverarbeiter vertraglich auf ein gleichwertiges Schutzniveau, einschließlich der Verschwiegenheit nach § 203 StGB, soweit diese einschlägig ist.",
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
    // Prüfen: Ruhephase 24 Monate als Weisung des Auftraggebers nach Art. 28 Abs. 3 lit. g DSGVO (Ole, 15.11.2026)
    title: "Löschung und Rückgabe",
    items: [
      "Der Auftraggeber kann jederzeit einen vollständigen Export seiner Daten im Kundenbereich abrufen (Rückgabe), auch nach Ende des Hauptvertrags bis zur Löschung.",
      "Nach Ende des Hauptvertrags entscheidet der Auftraggeber nach Art. 28 Abs. 3 lit. g DSGVO über Löschung oder Rückgabe. Er weist den Auftragnehmer hiermit an, die personenbezogenen Daten nach Ende des Hauptvertrags 24 Monate aufzubewahren (Ruhephase), damit er die Zusammenarbeit fortsetzen kann. Eine abweichende Weisung erteilt der Auftraggeber im Kundenbereich: Aufbewahrung von 3 Monaten oder Löschung sofort nach Vertragsende; er kann sie bis zur Löschung jederzeit ändern.",
      "In der Ruhephase speichert der Auftragnehmer die Daten nur und verarbeitet sie nicht weiter. Zugang hat der Auftraggeber nur für den Export und die Reaktivierung seines Kontos. Mit der Reaktivierung endet die Ruhephase und dieser Vertrag gilt für den neuen Hauptvertrag fort.",
      "Nach Ablauf der gewählten Aufbewahrung löscht der Auftragnehmer die personenbezogenen Daten endgültig, erinnert den Auftraggeber 30 und 7 Tage vorher per E-Mail und bestätigt die Löschung in Textform. Ausgenommen sind pseudonymisierte Sperrlisteneinträge (Hashwerte) von Personen, die der Werbung widersprochen haben, zur dauerhaften Beachtung des Widerspruchs, sowie Daten, für die eine gesetzliche Pflicht zur Aufbewahrung besteht, insbesondere Abrechnungsdaten nach Handels- und Steuerrecht. Daten in Datensicherungen werden im Rahmen der regulären Rotation gelöscht.",
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
  "Löschfunktion je Lead für Betroffenenanfragen; nach Vertragsende Ruhephase mit reiner Speicherung (kein Zugang außer Export und Reaktivierung, keine automatische Verarbeitung) und automatische, protokollierte Löschung nach der gewählten Aufbewahrung.",
  "Pseudonyme Nutzungsstatistik ohne Lead-Inhalte, automatische Löschung nach 180 Tagen.",
  "Zugriff auf Kundendaten nur durch berechtigte, zur Vertraulichkeit und zur Verschwiegenheit nach § 203 StGB verpflichtete und belehrte Personen und nur, soweit für Betrieb und Support erforderlich.",
];

export const SUBPROCESSORS: { name: string; purpose: string; location: string }[] = [
  { name: "Railway Corporation", purpose: "Hosting von Anwendung und Datenbank", location: "Serverstandort EU (Amsterdam); Unternehmen USA" },
  { name: "Anthropic, PBC", purpose: "KI-System für den digitalen Assistenten: Verarbeitung der Chatnachrichten (ohne Gesundheitsangaben aus Lead-Formularen); Auslesen vom Auftraggeber hochgeladener Versicherungsangebote (nur Sach-, Haftpflicht-, Rechtsschutz-, Unfall- und Tierversicherungen); keine Nutzung zum Training", location: "USA" },
  { name: "360dialog GmbH", purpose: "Anbindung der WhatsApp Business API", location: "Deutschland" },
  { name: "Meta Platforms Ireland Ltd.", purpose: "WhatsApp-Nachrichtenversand; Lead-Formulare; Rückmeldung der Lead-Stufen an das Meta-Dataset des Auftraggebers (Meta-Lead-ID, Stufe, Zeitpunkt, Vertragswert; keine Kontaktdaten, kein Produkt; abschaltbar)", location: "Irland / USA" },
  { name: "Resend (Plus Five Five, Inc.)", purpose: "Versand von E-Mails (z. B. Terminbestätigungen)", location: "USA" },
  { name: "Formagrid Inc. (Airtable)", purpose: "Lead-Datenhaltung, nur noch bis zur vollständigen Umstellung auf den direkten Lead-Eingang", location: "USA" },
  { name: "Zapier, Inc.", purpose: "Übertragung der Leads aus den Meta-Formularen, nur noch bis zur vollständigen Umstellung auf den direkten Lead-Eingang", location: "USA" },
  { name: "OpenAI, L.L.C. / OpenAI Ireland Ltd.", purpose: "Erstellung von Werbemotiven, Videos und Untertiteln für die Kampagnen des Auftraggebers; keine Lead-Daten", location: "Irland / USA" },
  { name: "Cloudflare, Inc. (R2)", purpose: "Speicherung der Werbemotive für die Kampagnen; keine Lead-Daten", location: "EU / USA" },
  { name: "Functional Software, Inc. (Sentry)", purpose: "Fehlerüberwachung ohne personenbezogene Inhalte", location: "Datenregion EU" },
  { name: "Google Ireland Ltd. / Microsoft Ireland Operations Ltd.", purpose: "Kalenderanbindung und E-Mail-Versand über das Postfach des Auftraggebers (einzelne E-Mails und E-Mail-Kampagnen), sofern vom Auftraggeber genutzt", location: "Irland / USA" },
];
