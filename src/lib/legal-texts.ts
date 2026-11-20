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
// 18.11.2026 (neuer Stand „18.11.2026“, Ole; Anwalts-Agent): AVV um Unterlagen vom Kunden (Policen per WhatsApp) und
// Maklervollmacht digital ergänzt: Art, Zweck und Umfang, Datenarten (Vertragsdaten, Policenbilder, Unterschrift und
// Unterschriftsprotokoll, Gesundheitsdaten nach Art. 9 DSGVO, soweit vom Kunden freigegeben), Betroffene (Mitversicherte),
// Gesundheitsdaten nur mit Einwilligung und Freischaltung, Löschfristen, TOMs (Verschlüsselung im Ruhezustand, Zugriff,
// Zugriffsprotokoll, keine Gesundheitsdaten in Protokollen, Fehlerberichten und Sitzungsaufnahmen). Anlage 2 unverändert.
// Grundlage: docs/rechtstexte/maklervollmacht-2026-11-18.md (3.1), docs/datenschutz-policen.md (Abschnitte 3 bis 6).
// Bei Kunden mit angenommenem Vertrag: Mitteilung in Textform nach AGB „Änderungen dieser AGB“.
// 18.11.2026 (neuer Stand, Ole): Laufzeit 6 Monate und Vorauszahlung für 6 Monate (1 Monat geschenkt): „Laufzeit und
// Kündigung“, „Vorauszahlung“, Zusatzmodule und Pause gelten für beide Vorauszahlungen (jährlich bzw. 6 Monate).
// 19.11.2026 (neuer Stand „19.11.2026“, Ole): „Vorauszahlung“: Der erste Zahlungszeitraum ist mit Vertragsschluss
// fällig (vorher: zum Start), der Zahlungszeitraum und die Laufzeit beginnen weiter mit dem Startdatum, jeder weitere
// Zeitraum ist zu seinem Beginn fällig. Übergangssatz: Verträge, die vor dem 19.11.2026 angenommen wurden, bleiben bei
// „zum Start“ (gleiche URL für alle Fassungen, siehe 15.11.2026). Begründung und Prüfung: docs/recht/vorauszahlung-mit-annahme.md.
// 19.11.2026 (Fassung 2, Ole): „Vergütung und Zahlung“: Sonderregel für im Angebot vereinbarte nachträgliche Zahlung
// (Offer.paymentInArrears). Ändert nichts für bestehende Verträge. Prüfung: docs/recht/zahlung-nachtraeglich.md.
// 19.11.2026 (Fassung 3, Ole): Paket „Pay-per-Lead + Software“ unter „Leistungen: Software“: nur Software, ohne Betreuung
// und Kampagnen (Regeln zu Leadgenerierung, Werbebudget, Preisstaffel, Meta-Zugriff, Pause und Garantien gelten dafür
// nicht), Leads gesondert per Stück, keine Mindestabnahme, ohne Mindestlaufzeit. Ändert nichts für
// bestehende Verträge anderer Pakete.
// 20.11.2026 (Ole): „Vergütung und Zahlung“: Absatz „Umsatzsteuer auf Leads“ (§ 4 Nr. 11 UStG nur an Vertreter/Makler
// mit geprüftem Registereintrag, Nachberechnung bei abweichender Entscheidung der Finanzverwaltung, übrige Preise zzgl.
// USt.); Satz „Alle Preise sind netto …“ verweist darauf. Prüfung: docs/recht/ust-leadverkauf-2026-11-19.md.
// PRÜFUNG DURCH OLE / ANWALT AUSSTEHEND: die mit „Prüfen:“ markierten Stellen
// (Kommentare) vor dem Livegang juristisch abnehmen lassen.

export const LEGAL_VERSION = "20.11.2026";

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

// 16.11.2026 (Ole: „Die AGBs sind nur so lang jetzt“, „Baue es so ein“): gekürzte Fassung, ca. 3.400 → 2.100 Wörter.
// Entwurf mit Begründung je Abschnitt: docs/rechtstexte/agb-kurzfassung-entwurf-2026-11-16.md; bisherige Fassung als
// Archiv: docs/rechtstexte/agb-2026-11-15-fassung-2.md. Eingearbeitet aus der Rechtsprüfung (agb-entwurf-2026-11-16.md):
// Freistellung mit Verschulden (Thema 2), Rollen nach der KI-Verordnung (Thema 3), vollständige Preisstaffel (Thema 6),
// Erstinformation als Link und PDF (Thema 10). Entfallen, solange ausgeblendet: Zusatzmodul Empfehlungen & Bewertungen
// und die Regeln zum Bestandskunden-Modul (Fair Use, Werberecht § 7 UWG, Paket „Nur Bestand“); bei Rückkehr aus dem
// Archiv wieder aufnehmen (Themen 8 und 9 der Rechtsprüfung beachten).
export const AGB: LegalSection[] = [
  {
    // Prüfen: Ausschluss von Tippgebern (Anwalts-Memo, Vermittlerrecht; Ole 15.11.2026)
    title: "Geltungsbereich",
    items: [
      `Diese AGB gelten für alle Verträge zwischen der ${PROVIDER.name}, ${PROVIDER.street}, ${PROVIDER.city} („Anbieter“) und ihren Kunden über Leadgenerierung und die Nutzung der Software des Anbieters.`,
      "Sie richten sich ausschließlich an Unternehmer (§ 14 BGB), und zwar an Versicherungsvermittler mit Erlaubnis bzw. Registrierung nach § 34d GewO; Tippgeber ohne eigene Erlaubnis sind ausgeschlossen. Abweichende Bedingungen des Kunden gelten nur, wenn der Anbieter ihnen in Textform zustimmt.",
    ],
  },
  {
    // Prüfen: Unternehmereigenschaft bei der Annahme (Anwalts-Memo, Ole 15.11.2026)
    title: "Vertragsschluss und Rangfolge",
    items: [
      "Der Vertrag kommt durch Annahme des Angebots zustande: online über den Angebotslink, per E-Mail oder in sonstiger Textform. Bei der Online-Annahme gibt der Kunde seine Firma und gegebenenfalls USt-IdNr. an und bestätigt, als Unternehmer zu handeln. Die wesentlichen Konditionen stehen direkt am Knopf zur Annahme; der Anbieter bestätigt den Vertrag per E-Mail.",
      "Es gelten in dieser Rangfolge: Sondervereinbarungen im Angebot, das Angebot, diese AGB, der Auftragsverarbeitungsvertrag.",
    ],
  },
  {
    title: "Leistungen: Leadgenerierung",
    items: [
      "Der Anbieter erstellt und betreut Werbekampagnen auf Facebook und Instagram (Meta) im Werbekonto des Kunden, einschließlich Werbemitteln und Lead-Formularen, und optimiert sie laufend. Die Leads werden exklusiv für den Kunden erzeugt und nicht an Dritte verkauft.",
      "Das Werbebudget zahlt der Kunde direkt an Meta; der Anbieter steuert es im vereinbarten Rahmen. Der Anbieter schuldet eine fachgerechte Dienstleistung, keinen bestimmten Erfolg, insbesondere keine bestimmte Zahl an Leads, Kosten pro Lead oder Abschlussquote. Entscheidungen von Meta (z. B. Ablehnung von Anzeigen, Kontosperren) liegen außerhalb seines Einflusses.",
    ],
  },
  {
    title: "Leistungen: Software",
    items: [
      "Ist das Paket mit Software vereinbart, stellt der Anbieter seine Software als Online-Dienst bereit, insbesondere zur Verwaltung von Leads und Terminen, für Auswertungen und mit einem digitalen Assistenten auf WhatsApp. Der Anbieter darf die Software weiterentwickeln, solange die vereinbarten wesentlichen Funktionen erhalten bleiben. Er strebt eine Verfügbarkeit von 99 % im Monatsmittel an, ausgenommen angekündigte Wartungen; für Dienste Dritter (insbesondere Meta/WhatsApp, Kalender- und KI-Anbieter) übernimmt er keine Gewähr.",
      // Prüfen: KI-Kennzeichnung (Art. 50 KI-VO), Rollen Anbieter/Betreiber und KI-Kompetenz (Rechtsprüfung Thema 3)
      { sub: "Digitaler Assistent (KI)", text: "Der Anbieter ist Anbieter des Assistenten im Sinne von Art. 3 Nr. 3 der KI-Verordnung (EU) 2024/1689 und stellt sicher, dass er Interessenten spätestens mit der ersten Nachricht klar darauf hinweist, dass sie mit einem KI-System schreiben (Art. 50 KI-Verordnung). Der Hinweis lässt sich nicht abschalten; der Kunde entfernt oder verdeckt ihn nicht. Der Kunde setzt den Assistenten als Betreiber (Art. 3 Nr. 4) in eigener Verantwortung ein und sorgt für die KI-Kompetenz der Personen, die in seinem Auftrag damit arbeiten (Art. 4)." },
      { sub: "Keine Beratung", text: "Der Assistent berät nicht, empfiehlt keine Versicherungsprodukte, nennt keine Tarife, Versicherer oder Beiträge und vergleicht keine Angebote. Er klärt den Bedarf und vereinbart Termine. Beratung und Vermittlung einschließlich der Pflichten nach §§ 61, 62 VVG liegen vollständig beim Kunden, der Gespräche jederzeit übernehmen kann." },
      // Prüfen: aktive Verkäufer statt Logins (Ole, 14.11.2026)
      { sub: "Zugänge", text: "Enthalten ist die im Angebot genannte Zahl aktiver Verkäufer. Aktiv ist ein Zugang, der Leads zugeteilt bekommt; Zugänge ohne Leads sind kostenlos. Jeder weitere aktive Verkäufer kostet den im Angebot genannten Preis je Monat, tagesgenau anteilig." },
      // Prüfen: Zusatzmodule, Kündigung bei jährlicher Vorauszahlung zum Ende des bezahlten Jahres (12.11.2026)
      // Prüfen: Paket Pay-per-Lead + Software (19.11.2026, Fassung 3)
      { sub: "Paket Pay-per-Lead + Software", text: "In diesem Paket nutzt der Kunde die Software für die Leads, die er per Stück (Pay-per-Lead) beim Anbieter kauft. Der Anbieter stellt nur die Software bereit, ohne Betreuung und ohne eigene Werbekampagnen; die Regeln zu Leadgenerierung, Werbebudget, Preisstaffel, Meta-Zugriff, Pause und Garantien gelten dafür nicht. Leads bestellt und bezahlt der Kunde gesondert zu dem bei der Bestellung genannten Preis je Lead; sie sind nicht Teil der monatlichen Vergütung, eine Mindestabnahme besteht nicht. Der Vertrag läuft ohne Mindestlaufzeit und ist zum Ende jedes Abrechnungsmonats kündbar; im Übrigen gilt „Laufzeit und Kündigung“." },
      { sub: "Zusatzmodule", text: "Zusatzmodule gelten nur, wenn sie im Angebot vereinbart oder im Kundenbereich bzw. in Textform gebucht sind. Sie werden tagesgenau anteilig berechnet und sind zum Ende des laufenden Abrechnungszeitraums kündbar, bei Vorauszahlung (jährlich bzw. für 6 Monate) zum Ende des bezahlten Zeitraums; eine anteilige Erstattung erfolgt nicht." },
    ],
  },
  {
    // Prüfen: Erstinformation (§§ 15, 16 VersVermV), Einwilligungstext, STOPP (Anwalts-Memo, Rechtsprüfung Thema 10)
    title: "Mitwirkung des Kunden",
    items: [
      "Der Kunde räumt Zugriff auf sein Meta-Werbekonto ein, stellt bei Meta eine Zahlungsmethode bereit und verbindet, soweit gebucht, WhatsApp und Kalender. Er prüft Werbemittel und Nachrichtenvorlagen vor dem Start, gibt sie frei und bearbeitet Leads zeitnah.",
      "Der Kunde beachtet seine berufsrechtlichen Pflichten (insbesondere § 34d GewO, Versicherungsvertriebsrichtlinie, Vorgaben und Werberichtlinien seines Versicherers). Er hinterlegt in der Software eine zutreffende Erstinformation (§ 15 VersVermV) mit Registernummer und Status und hält sie aktuell; die Software stellt sie Interessenten als Link und als PDF bereit. Eigene Lead-Formulare nutzt er nur mit dem vom Anbieter bereitgestellten Einwilligungstext.",
      "Widerspricht eine Person der Kontaktaufnahme (etwa mit „STOPP“), beachtet die Software das für alle Kanäle; der Kunde beachtet es auch außerhalb der Software. Zugangsdaten hält er geheim und meldet einen Missbrauchsverdacht unverzüglich.",
    ],
  },
  {
    // Prüfen: Preisstaffel vollständig im Angebot (Rechtsprüfung Thema 6), jährliche Vorauszahlung, WhatsApp-Gebühren
    title: "Vergütung und Zahlung",
    items: [
      // Prüfen: Sonderregel Zahlung nachträglich (19.11.2026, Fassung 2; docs/recht/zahlung-nachtraeglich.md)
      "Die Setupgebühr wird mit Vertragsschluss fällig, die monatliche Vergütung ab dem Startdatum monatlich im Voraus. Ist im Angebot nachträgliche Zahlung vereinbart, wird die monatliche Vergütung abweichend davon jeweils nachträglich für den abgelaufenen Leistungsmonat fällig, erstmals einen Monat nach dem Startdatum; das gilt bis zum Vertragsende, die Vergütung für den letzten Leistungsmonat wird danach fällig. Alle Preise sind netto zuzüglich Umsatzsteuer, soweit nicht unter „Umsatzsteuer auf Leads“ anders geregelt.",
      // Prüfen: Steuerklausel Leads (20.11.2026, docs/recht/ust-leadverkauf-2026-11-19.md)
      { sub: "Umsatzsteuer auf Leads", text: "Leads an Versicherungsvertreter und Versicherungsmakler mit geprüftem Registereintrag berechnet der Anbieter umsatzsteuerfrei nach § 4 Nr. 11 UStG. Beurteilt die Finanzverwaltung diese Leistungen als umsatzsteuerpflichtig, darf der Anbieter die gesetzliche Umsatzsteuer für diese Leads nachberechnen, auch rückwirkend für bereits gelieferte Leads. Alle übrigen Preise verstehen sich zuzüglich der gesetzlichen Umsatzsteuer. Das gilt insbesondere für Software, Betreuung und Einrichtung, für Leads an Kunden ohne geprüften Registereintrag als Versicherungsvertreter oder Versicherungsmakler und für Leads ohne Versicherungsbezug (z. B. Kindersparpläne)." },
      "Die monatliche Vergütung richtet sich nach dem vereinbarten Werbebudget und der im Angebot vollständig genannten Preisstaffel. Ändert der Kunde das Budget dauerhaft, gilt die neue Stufe ab dem folgenden Abrechnungsmonat; der Kundenbereich zeigt die neue Vergütung vor der Änderung an.",
      // Prüfen: Vorauszahlung für 6 Monate (Laufzeit 6 Monate, 18.11.2026); Fälligkeit mit Vertragsschluss (19.11.2026)
      { sub: "Vorauszahlung", text: "Ist sie vereinbart, wird die Vergütung für 12 Monate (jährlich, mit 12 Monaten Laufzeit) bzw. für 6 Monate (mit 6 Monaten Laufzeit) im Voraus gezahlt (Nachlass laut Angebot). Die Vorauszahlung für den ersten Zahlungszeitraum ist mit Vertragsschluss fällig, die für jeden weiteren Zahlungszeitraum zu dessen Beginn. Zahlungszeiträume und Laufzeit beginnen mit dem Startdatum. Für Verträge, die vor dem 19.11.2026 angenommen wurden, ist die erste Vorauszahlung zum Start fällig. Im Zahlungszeitraum hinzukommende Verkäufer oder Module werden anteilig berechnet. Eine Erstattung bei vorzeitiger Beendigung erfolgt nicht, außer bei Kündigung des Kunden aus wichtigem Grund." },
      "Die Meta-Gebühren für WhatsApp-Nachrichten an Leads sind in der Vergütung enthalten. Rechnungen sind innerhalb von 7 Tagen zu zahlen. Bei mehr als 30 Tagen Zahlungsverzug darf der Anbieter die Kampagnen nach Ankündigung pausieren, bis die Zahlung eingeht.",
    ],
  },
  {
    title: "Pause und Urlaub",
    items: [
      "Der Kunde kann die Kampagnen jederzeit pausieren. Während der Pause fällt statt der monatlichen Vergütung nur die im Angebot genannte Software-Gebühr an, tagesgenau anteilig; ohne Software fällt nichts an. Bei Vorauszahlung gibt es dafür keine Gutschrift. Eine Pause verlängert eine Mindestlaufzeit nicht.",
    ],
  },
  {
    // Prüfen: Testphasen, Startpreis mit automatischem Übergang (§ 305c BGB), gesonderte Bestätigung am Knopf
    title: "Testphasen und kostenlose Zeiträume",
    items: [
      "Bietet der Anbieter eine Leistung für eine bestimmte Zeit kostenlos oder zu einem Startpreis an, stehen Dauer und folgender Preis bei der Buchung bzw. im Angebot direkt am Knopf und werden dort gesondert bestätigt. Danach läuft die Leistung automatisch zu diesem Preis weiter, sofern der Kunde sie nicht vorher im Kundenbereich oder in Textform beendet; während des kostenlosen Zeitraums entstehen dann keine Kosten. Der Anbieter erinnert spätestens 7 Tage vor Ende per E-Mail und im Kundenbereich.",
      "Nach dem Übergang in die kostenpflichtige Phase ist die Leistung zum Ende des Abrechnungsmonats kündbar, soweit im Angebot nichts anderes vereinbart ist. Je Leistung gibt es einen kostenlosen Zeitraum; ein Anspruch darauf besteht nicht.",
    ],
  },
  {
    // Prüfen: Halteangebote, insbesondere Mindestlaufzeit nach einem Nachlass (§ 307 BGB); Einzelheiten stehen bei der Annahme
    title: "Angebote vor einer Kündigung",
    items: [
      "Der Anbieter kann dem Kunden vor einer Kündigung Angebote machen, etwa einen Nachlass, einen kostenlosen Monat, eine Pause ohne Vergütung oder einen Paketwechsel. Es gelten die bei der Annahme genannten Bedingungen; der Anbieter bestätigt sie im Kundenbereich und per E-Mail. Ein Nachlass wird nicht ausgezahlt.",
      "Ist ein Nachlass an eine weitere Laufzeit geknüpft, läuft der Vertrag mindestens bis zu dem bei der Annahme genannten Tag; eine Kündigung wirkt frühestens dann.",
      "Gutschriften für fehlerhafte Leads gibt es nur nach Prüfung und in der bestätigten Höhe. Ein Anspruch auf solche Angebote besteht nicht; der Anbieter kann sie von einer Mindestdauer der Kundenbeziehung abhängig machen und auf einmal innerhalb von 12 Monaten begrenzen. Ein Rückkehrangebot nach Vertragsende wird erst mit Zustimmung des Kunden zu Paket und Preis zum neuen Vertrag.",
    ],
  },
  {
    // Prüfen: eindeutiger Kündigungstermin und Kündigung im Kundenbereich (Anwalts-Memo, Ole 15.11.2026)
    title: "Laufzeit und Kündigung",
    items: [
      "Ohne Vertragslaufzeit ist der Vertrag von beiden Seiten zum Ende jedes Abrechnungsmonats kündbar. Mit 3, 6 bzw. 12 Monaten Laufzeit gilt diese Mindestlaufzeit ab Start; danach läuft er unbefristet und ist zum Ende jedes Abrechnungsmonats kündbar.",
      // Prüfen: Verlängerung bei Vorauszahlung für 6 Monate wie bei jährlicher Vorauszahlung (18.11.2026)
      "Bei Vorauszahlung läuft der Vertrag einen Zahlungszeitraum (12 Monate bei jährlicher Vorauszahlung, 6 Monate bei Vorauszahlung für 6 Monate) ab Start und verlängert sich um jeweils einen weiteren Zahlungszeitraum, wenn er nicht spätestens einen Monat vor dessen Ende gekündigt wird. Der Kunde kann vorher auf monatliche Zahlung umstellen; dann gilt die Regel für seine Laufzeit.",
      { sub: "Fristen", text: "Start ist das im Angebot genannte oder bei der Annahme gewählte Datum. Ein Abrechnungsmonat läuft vom Starttag bis zum Tag vor demselben Kalendertag des Folgemonats (fehlt der Tag, bis zum Monatsletzten); Beispiel: Start am 15.03., Abrechnungsmonate 15.03. bis 14.04. usw., 3 Monate Mindestlaufzeit bis 14.06. Eine Kündigung während der Mindestlaufzeit wirkt zu deren Ende, danach zum Ende des Abrechnungsmonats, in dem sie zugeht." },
      "Die Kündigung erfolgt in Textform oder im Kundenbereich unter „Konto & Rechnungen“ („Vertrag hier kündigen“), wo der Kunde den Endtermin vorher sieht. Der Anbieter bestätigt Eingang und Vertragsende per E-Mail. Das Recht zur außerordentlichen Kündigung bleibt unberührt. Die Setupgebühr wird nicht erstattet.",
    ],
  },
  {
    // Prüfen: Garantien (von Ole am 11.11.2026 freigegeben); 120 statt 90 Tage für neue Angebote (Übergang bleibt, da eine URL)
    title: "Garantien",
    items: [
      "Die Garantien gelten für die Katzenversicherung (TKV) und für weitere im Angebot genannte Produkte, ab dem Tag der ersten Auslieferung der Anzeigen.",
      { sub: "Gemeinsame Voraussetzungen", text: "Werbebudget an den aktiven Tagen mindestens 20 € pro Tag und Produkt. Für Break-even- und Vertrags-Garantie außerdem: mindestens 80 % der über die Software gebuchten Termine wahrgenommen und für mindestens 80 % der Leads das Ergebnis in der Software eingetragen. Pausen verlängern den Prüfzeitraum um ihre Dauer; bei Zahlungsverzug ruht der Anspruch bis zum Ausgleich." },
      { sub: "Lead-Garantie", text: "Erhält der Kunde in den ersten 30 aktiven Tagen weniger als 100 Leads für das Produkt, entfällt die Vergütung für Betreuung und Software im folgenden Abrechnungsmonat. Das Werbebudget zahlt er weiter an Meta." },
      { sub: "Break-even-Garantie (Vertreter mit Abschlussprovision)", text: "Liegt die Provision aus den über den Anbieter gewonnenen Verträgen nach 120 aktiven Tagen unter Werbebudget plus Vergütung für Betreuung und Software in diesem Zeitraum, betreut der Anbieter ohne diese Vergütung weiter, auf Wunsch mit einem anderen Produkt ohne Setupgebühr, bis die Provision seit Start die Kosten erreicht, längstens 6 Monate. Grundlage ist die Berechnung in der Software mit den unter „Meine Provisionen“ hinterlegten Sätzen; der Anbieter kann Nachweise zu Abschlüssen verlangen." },
      { sub: "Vertrags-Garantie (Makler, statt Break-even)", text: "Hat der Kunde nach 120 aktiven Tagen weniger als 15 Verträge aus den Leads abgeschlossen (in der Software als Abschluss eingetragen), betreut der Anbieter ohne Vergütung für Betreuung und Software weiter, auf Wunsch mit einem anderen Produkt ohne Setupgebühr, bis 15 Verträge erreicht sind, längstens 6 Monate. Der Anbieter kann eine Courtage- bzw. Provisionsabrechnung des Versicherers anfordern; verschweigt der Kunde Abschlüsse, entfällt der Anspruch." },
      { sub: "Übergang", text: "Für Verträge aus Angeboten, die vor dem 13.11.2026, 19:00 Uhr (Break-even-Garantie) bzw. vor dem 15.11.2026, 23:45 Uhr (Vertrags-Garantie) erstellt wurden, gelten 90 statt 120 aktive Tage." },
      "Weitergehende Ansprüche, insbesondere auf eine bestimmte Provision oder Zahl an Verträgen, bestehen nicht.",
    ],
  },
  {
    title: "Datenschutz",
    items: [
      "Die Leads entstehen auf Grundlage einer ausdrücklichen Einwilligung, die auch die Kontaktaufnahme per Telefon, E-Mail und WhatsApp umfasst; der Anbieter dokumentiert sie und legt den Nachweis auf Anfrage vor. Für die Daten in der Software ist der Kunde Verantwortlicher und der Anbieter Auftragsverarbeiter nach dem Auftragsverarbeitungsvertrag, der Bestandteil des Vertrags ist. Der Kunde gibt Leads nur im Rahmen der Einwilligung weiter und beachtet Widerrufe unverzüglich.",
    ],
  },
  {
    // Prüfen: Zusicherung und Freistellung mit Verschulden (Rechtsprüfung Thema 2, BGH VIII ZR 16/05)
    title: "Kundendaten: Zusicherung und Freistellung",
    items: [
      "Lädt oder nutzt der Kunde eigene Daten in der Software (z. B. Kontaktlisten, Leads aus anderen Quellen), sichert er zu, dass das nach seinem Vermittler- bzw. Agenturvertrag, seinem Berufsrecht sowie dem Datenschutz- und Wettbewerbsrecht zulässig ist und eine nötige Zustimmung des Versicherers vorliegt. Für welche Produkte und Zwecke er die Daten nutzt, verantwortet er selbst.",
      "Verletzt der Kunde diese Zusicherung oder spricht er Personen über die Software unzulässig an, stellt er den Anbieter von darauf beruhenden Ansprüchen Dritter frei (insbesondere des Versicherers, betroffener Personen, Mitbewerber und Verbände), einschließlich angemessener Kosten der Rechtsverteidigung; das gilt nicht, wenn er die Verletzung nicht zu vertreten hat. Der Anbieter informiert den Kunden unverzüglich, gibt ihm Gelegenheit zur Stellungnahme und erkennt Ansprüche nicht ohne Abstimmung an. Hat der Anbieter die Verletzung mit zu vertreten, etwa durch eine fehlerhafte Funktion der Software, mindert sich die Freistellung entsprechend § 254 BGB. Geldbußen gegen den Anbieter selbst sind nicht erfasst.",
    ],
  },
  {
    // Prüfen: Export, Ruhephase (Standard 24 Monate) und Löschung nach Vertragsende, Sperrliste als Hashwerte (15.11.2026)
    title: "Daten bei Vertragsende",
    items: [
      "Der Kunde kann seine Daten jederzeit im Kundenbereich vollständig exportieren (Konto, „Ihre Daten herunterladen“), auch nach Vertragsende bis zur Löschung.",
      "Nach Vertragsende ruht das Konto: Die Daten werden nur noch gespeichert, Kampagnen, Nachrichten und Assistent sind beendet. Der Kunde kann sich zum Export oder zur Reaktivierung (zu neu vereinbarten Konditionen) anmelden. Die Daten werden 24 Monate aufbewahrt; im Kundenbereich kann der Kunde jederzeit bis zur Löschung 3 Monate oder die sofortige Löschung wählen. Der Anbieter erinnert 30 und 7 Tage vor der Löschung per E-Mail.",
      "Danach löscht der Anbieter die personenbezogenen Daten endgültig, ausgenommen pseudonymisierte Sperrlisteneinträge (Hashwerte) von Personen, die der Werbung widersprochen haben, und Daten mit gesetzlicher Aufbewahrungspflicht (z. B. Angebote, Verträge und Rechnungen). Datensicherungen werden mit der regulären Rotation gelöscht; anonyme Kennzahlen bleiben erhalten.",
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
      // Prüfen: Unterlagen vom Kunden per WhatsApp und Maklervollmacht digital, Art. 9 DSGVO (Ole, 18.11.2026; Rechtsprüfung
      // docs/rechtstexte/maklervollmacht-2026-11-18.md Abschnitt 3.1, docs/recht/policen-whatsapp-gesundheitsdaten.md Text b)
      "Unterlagen vom Kunden (soweit vom Auftraggeber genutzt): Der Auftragnehmer bittet Interessenten und Kunden im Namen des Auftraggebers per WhatsApp um Kopien bestehender Versicherungsunterlagen (z. B. Fotos oder PDF von Versicherungsscheinen), empfängt sie nach Einwilligung der betroffenen Person, speichert sie verschlüsselt und stellt sie ausschließlich dem Auftraggeber bereit. Eine Weitergabe an Versicherer oder Dritte durch den Auftragnehmer findet nicht statt. Für Unterlagen mit Gesundheitsangaben gilt zusätzlich die Anlage „Versicherungsunterlagen über WhatsApp“, der der Auftraggeber in der Software zustimmt.",
      "Maklervollmacht (nur für Auftraggeber mit Status Versicherungsmakler): Auf Veranlassung des Auftraggebers erstellt die Software Maklervollmacht, Maklerauftrag und, soweit erforderlich, eine Einwilligung zu Gesundheitsdaten mit Schweigepflichtentbindung, lässt sie von dessen Kunden über einen persönlichen Link elektronisch unterschreiben, protokolliert die Unterschrift und sendet dem Kunden auf Wunsch eine Kopie. Übertragungsschreiben an Versicherer erstellt die Software als PDF; übermittelt werden sie vom Auftraggeber selbst.",
      // Prüfen: neue Datenarten (Einwilligungsnachweis, Sperrliste, Erstinformation), Ole 15.11.2026
      { sub: "Datenarten", text: "Kontaktdaten (Name, Telefonnummer, E-Mail-Adresse, Anschrift), Angaben aus dem Lead-Formular (z. B. Lebenssituation, Versicherungsinteresse), Nachweise der Einwilligung aus Lead-Formularen (Zeitpunkt, Formular-ID, Textversion und Wortlaut), Kommunikationsinhalte (Chatverläufe und E-Mails), Termindaten, Notizen und Status zum Lead, Sperrliste der Personen, die der Kontaktaufnahme widersprochen haben (z. B. mit „STOPP“), bei gebuchtem Bestandskunden-Modul Vertragsangaben der Bestandskunden (z. B. Sparte, Versicherer, Vertragsnummer, Beitrag, Ablaufdatum) sowie Einwilligungs- und Abmeldestatus, die Erstinformation des Auftraggebers (PDF, für Interessenten über einen zufällig erzeugten Link unter /erstinformation/ abrufbar), vom Auftraggeber hochgeladene Versicherungsangebote (mit Name, Anschrift und Geburtsdatum des Interessenten sowie Tarif-, Beitrags- und Leistungsdaten) und daraus erstellte Präsentationen, Vertragsdaten bestehender Verträge (z. B. Versicherer, Sparte, Vertragsnummer), Policenbilder und weitere Versicherungsunterlagen der Betroffenen, Unterschrift und Unterschriftsprotokoll (Unterschriftsbild, Zeitpunkt, Übermittlungsweg, IP-Adresse, Gerät und Browser, Prüfwerte der unterschriebenen Dokumente), Nachweise von Einwilligung und Widerruf, Gesundheitsdaten (Art. 9 DSGVO), soweit vom Kunden freigegeben, außerdem Nutzungsdaten der Nutzer des Auftraggebers." },
      { sub: "Betroffene", text: "Interessenten und Kunden des Auftraggebers, in deren Versicherungsunterlagen genannte Personen (z. B. Mitversicherte) sowie Nutzer des Auftraggebers." },
      // Prüfen: Gesundheitsangaben aus Lead-Formularen (Art. 9 DSGVO), Einwilligung, Ole 15.11.2026
      "Gesundheitsangaben (Art. 9 DSGVO), die Interessenten in Lead-Formularen machen, werden gespeichert und nur dem Auftraggeber angezeigt. Sie werden nicht an den KI-Anbieter übermittelt und nicht in WhatsApp-Nachrichten verwendet (Meta, 360dialog). Der Auftraggeber stellt sicher, dass dafür eine ausdrückliche Einwilligung vorliegt (Art. 9 Abs. 2 lit. a DSGVO), und fragt darüber hinaus keine besonderen Kategorien personenbezogener Daten ab, außer in den folgenden Fällen.",
      // Prüfen: Gesundheitsdaten in Unterlagen und Maklervollmacht (Ole, 18.11.2026)
      "Gesundheitsdaten in Versicherungsunterlagen (z. B. Risikozuschläge oder Leistungsausschlüsse in Kranken-, Berufsunfähigkeits-, Lebens- oder Unfallversicherungen) und in der Einwilligung zur Maklervollmacht verarbeitet der Auftragnehmer nur, soweit die betroffene Person sie mit einer ausdrücklichen Einwilligung freigegeben hat, die die Software mit Zeitpunkt, Wortlaut und Textversion protokolliert, und nur, soweit der Auftraggeber die Funktion für diese Sparten freigeschaltet hat. Ohne Einwilligung werden solche Unterlagen nicht gespeichert; nach einem Widerruf werden sie unverzüglich gelöscht, nur der Nachweis von Einwilligung und Widerruf bleibt. Gesundheitsdaten werden nicht an den KI-Anbieter übermittelt, nicht in Nachrichten verwendet und nicht in Anwendungsprotokolle, Fehlerberichte oder Sitzungsaufnahmen übernommen.",
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
      // Prüfen: Löschfristen für Unterlagen vom Kunden und Maklervollmacht (Ole, 18.11.2026)
      "Für Unterlagen vom Kunden gelten kürzere Fristen: Versicherungsunterlagen aus WhatsApp löscht der Auftragnehmer automatisch 90 Tage nach dem Termin (bei Absage 90 Tage nach dem geplanten Termin, ohne Termin 90 Tage nach Eingang), es sei denn, der Auftraggeber behält sie nach einem Abschluss ausdrücklich als Beratungsdokumentation; nach einem Widerruf der Einwilligung sofort. Maklervollmacht, Maklerauftrag, Einwilligung und Unterschriftsprotokoll bewahrt der Auftragnehmer als Nachweis für den Auftraggeber auf, bis dieser sie oder den Kontakt löscht, längstens bis zur Löschung nach diesem Abschnitt. Mit dem Löschen eines Kontakts werden alle zugehörigen Unterlagen gelöscht.",
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
  // Prüfen: TOMs für Unterlagen vom Kunden, Unterschriften und Gesundheitsdaten (Art. 9 DSGVO), Ole 18.11.2026
  "Verschlüsselung im Ruhezustand: Versicherungsunterlagen vom Kunden werden je Datei verschlüsselt (AES-256-GCM, eigener Schlüssel je Datei, verpackt mit einem Schlüssel je Auftraggeber, Schlüssel getrennt von der Datenbank) und nur in einem privaten Speicher in der EU abgelegt; kein öffentlicher Link, Abruf nur über kurz gültige, an die Anmeldung gebundene Links. Mit dem Löschen wird der Schlüssel der Datei vernichtet, so dass auch Kopien in Sicherungen nicht mehr lesbar sind. Unterschriftsbilder und unterschriebene Dokumente werden verschlüsselt in der Datenbank in der EU gespeichert.",
  "Zugriff auf diese Unterlagen nur für den Auftraggeber und seine berechtigten Mitarbeiter (Inhaber und zuständiger Berater), Öffnen von Unterlagen mit Gesundheitsbezug nur mit Zwei-Faktor-Anmeldung. Personal des Auftragnehmers sieht weder Inhalt noch Dateinamen; ein Zugriff im dokumentierten Notfall wird protokolliert und dem Auftraggeber mitgeteilt.",
  "Zugriffsprotokoll: Jedes Öffnen und Herunterladen von Versicherungsunterlagen sowie Einwilligung, Widerruf, Unterschrift und Löschung werden mit Person und Zeitpunkt ohne Inhalte protokolliert (Aufbewahrung 1 Jahr); Nachweise von Einwilligungen werden nur ergänzt, nicht nachträglich geändert.",
  "Keine Inhalte von Unterlagen, keine Gesundheitsdaten und keine Dateinamen in Anwendungsprotokollen, Fehlerberichten, Benachrichtigungen oder Sitzungsaufnahmen; die Seiten für Interessenten und Kunden (z. B. Unterschrift der Maklervollmacht) werden nicht aufgezeichnet.",
  "Prüfung eingehender Dateien auf Schadsoftware vor der Ablage; ungeprüfte Dateien werden nicht angeboten.",
  "Automatische, protokollierte Löschung der Unterlagen nach den Fristen im Abschnitt „Löschung und Rückgabe“; das Löschprotokoll wird nach einer Wiederherstellung aus der Sicherung erneut angewendet.",
];

export const SUBPROCESSORS: { name: string; purpose: string; location: string }[] = [
  { name: "Railway Corporation", purpose: "Hosting von Anwendung und Datenbank", location: "Serverstandort EU (Amsterdam); Unternehmen USA" },
  { name: "Anthropic, PBC", purpose: "KI-System für den digitalen Assistenten: Verarbeitung der Chatnachrichten (ohne Gesundheitsangaben aus Lead-Formularen); Auslesen vom Auftraggeber hochgeladener Versicherungsangebote (nur Sach-, Haftpflicht-, Rechtsschutz-, Unfall- und Tierversicherungen); keine Nutzung zum Training", location: "USA" },
  { name: "360dialog GmbH", purpose: "Anbindung der WhatsApp Business API", location: "Deutschland" },
  { name: "Meta Platforms Ireland Ltd.", purpose: "WhatsApp-Nachrichtenversand; Lead-Formulare; Rückmeldung der Lead-Stufen an das Meta-Dataset des Auftraggebers (Meta-Lead-ID, Stufe, Zeitpunkt, Vertragswert; keine Kontaktdaten, kein Produkt; abschaltbar)", location: "Irland / USA" },
  { name: "Resend (Plus Five Five, Inc.)", purpose: "Versand von E-Mails (z. B. Terminbestätigungen)", location: "USA" },
  { name: "seven communications GmbH & Co. KG (seven.io)", purpose: "Versand von SMS an Leads (Hinweis mit Link zur Terminwahl), nur wenn der Lead nicht per WhatsApp erreichbar ist", location: "Deutschland" },
  { name: "Formagrid Inc. (Airtable)", purpose: "Lead-Datenhaltung, nur noch bis zur vollständigen Umstellung auf den direkten Lead-Eingang", location: "USA" },
  { name: "Zapier, Inc.", purpose: "Übertragung der Leads aus den Meta-Formularen, nur noch bis zur vollständigen Umstellung auf den direkten Lead-Eingang", location: "USA" },
  { name: "OpenAI, L.L.C. / OpenAI Ireland Ltd.", purpose: "Erstellung von Werbemotiven, Videos und Untertiteln für die Kampagnen des Auftraggebers; keine Lead-Daten", location: "Irland / USA" },
  { name: "Cloudflare, Inc. (R2)", purpose: "Speicherung der Werbemotive für die Kampagnen; keine Lead-Daten", location: "EU / USA" },
  { name: "Functional Software, Inc. (Sentry)", purpose: "Fehlerüberwachung; Sitzungsaufnahmen im Kundenbereich nur mit Einwilligung des einzelnen Nutzers, mit im Browser unkenntlich gemachten Texten, Eingaben und Bildern und ohne Kennungen von Leads (keine Inhalte aus Leads)", location: "Datenregion EU (Deutschland); Unternehmen USA" },
  { name: "Google Ireland Ltd. / Microsoft Ireland Operations Ltd.", purpose: "Kalenderanbindung und E-Mail-Versand über das Postfach des Auftraggebers (einzelne E-Mails und E-Mail-Kampagnen), sofern vom Auftraggeber genutzt", location: "Irland / USA" },
];
