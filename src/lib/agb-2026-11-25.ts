// Archivierte AGB-Fassung „Stand 25.11.2026“ (Ole, 26.11.2026: „Die Garantien müssen aus den öffentlichen AGB raus“).
// Unveränderte Kopie der AGB, wie sie bis zum 26.11.2026 auf /rechtliches/agb und in jedem Angebot standen, mit dem
// Abschnitt „Garantien“. Sie bleibt Vertragsbestandteil für Verträge aus Angeboten, die vor GUARANTEES_UNTIL
// (lib/garantien.ts, 22.11.2026, 19:15 Uhr) erstellt wurden: Diese Angebote (Seite und PDF) zeigen und verlinken diese
// Fassung (agbMitGarantien), die Kunden finden sie unter Konto & Rechnungen → Ihr Vertrag („Ihre AGB (Stand 25.11.2026)“,
// /buyer/konto/agb). Nicht öffentlich: kein Link von /rechtliches/*, nur im Angebot (Token) und im Kundenbereich.
// NICHT ÄNDERN: archivierter Wortlaut. Neue Regeln gehören in AGB (lib/legal-texts.ts).

import { GUARANTEES_UNTIL, angebotMitGarantien, garantieDatum } from "@/lib/garantien";
import { PROVIDER, type LegalSection } from "@/lib/legal-texts";

/** Stand der archivierten Fassung (so beschriftet im Kundenbereich und im Angebot). */
export const AGB_ARCHIV_STAND = "25.11.2026";
/** Ab diesem Zeitpunkt erstellte Angebote nutzen die aktuellen AGB ohne Garantien (gleich GUARANTEES_UNTIL). */
export const AGB_ARCHIV_BIS = GUARANTEES_UNTIL;

/**
 * Gilt für dieses Angebot die archivierte Fassung mit Garantien? Alle Angebote außer Leadangeboten (Pay-per-Lead,
 * dort gelten keine Garantien), deren Garantie-Datum (erste Version, garantieStichtag) vor GUARANTEES_UNTIL liegt.
 * Gleiche Regel wie der Abschnitt „Ihre Garantien“ im Angebot (offer-document.tsx).
 */
export function agbMitGarantien(o: { package: string; createdAt: Date; garantieStichtag?: Date | null }): boolean {
  if (o.package === "ppl" || o.package === "ppl_software") return false;
  return angebotMitGarantien(garantieDatum(o));
}

export const AGB_2026_11_25: LegalSection[] = [
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
      { sub: "Paket Pay-per-Lead + Software", text: "In diesem Paket nutzt der Kunde die Software für die Leads, die er per Stück (Pay-per-Lead) beim Anbieter kauft. Der Anbieter stellt nur die Software bereit, ohne Betreuung und ohne eigene Werbekampagnen; die Regeln zu Leadgenerierung, Werbebudget, Preisstaffel, Meta-Zugriff, Pause und Garantien gelten dafür nicht. Leads bestellt und bezahlt der Kunde gesondert zu dem bei der Bestellung genannten Preis je Lead; sie sind nicht Teil der monatlichen Vergütung, eine Mindestabnahme besteht nicht. Der Vertrag läuft ohne Mindestlaufzeit und ist zum Ende jedes Abrechnungsmonats kündbar; im Übrigen gilt „Laufzeit und Kündigung“. Für Verträge aus Angeboten, die ab dem 24.11.2026 angenommen werden, gelten für Bestellung, Lieferung und Reklamation der Leads die im Angebot enthaltenen Bedingungen: Anerkannte Reklamationen gleicht der Anbieter mit einem kostenlosen Ersatzlead aus, bezahlte Leads liefert er nach." },
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
    // Prüfen: Garantien (von Ole am 11.11.2026 freigegeben); 120 statt 90 Tage für neue Angebote (Übergang bleibt, da eine URL).
    // Seit 22.11.2026 nur noch für ältere Angebote (Ole: ohne Garantie verkaufen), Stichtag GUARANTEES_UNTIL.
    title: "Garantien",
    items: [
      "Die Garantien gelten nur für Verträge aus Angeboten, die vor dem 22.11.2026, 19:15 Uhr erstellt wurden, und dort für die Katzenversicherung (TKV) und für weitere im Angebot genannte Produkte, ab dem Tag der ersten Auslieferung der Anzeigen. Spätere Angebote enthalten keine Garantien, es sei denn, das Angebot sagt sie ausdrücklich zu.",
      { sub: "Gemeinsame Voraussetzungen", text: "Werbebudget an den aktiven Tagen mindestens 20 € pro Tag und Produkt. Für Break-even- und Vertrags-Garantie außerdem: mindestens 80 % der über die Software gebuchten Termine vom Kunden wahrgenommen und für mindestens 80 % der Leads das Ergebnis in der Software eingetragen. Pausen verlängern den Prüfzeitraum um ihre Dauer; bei Zahlungsverzug ruht der Anspruch bis zum Ausgleich." },
      { sub: "Wahrgenommene Termine", text: "Nicht wahrgenommen sind nur Termine, die der Kunde selbst absagt oder versäumt. Sagt der Interessent ab, verschiebt er oder erscheint er nicht, gilt der Termin als wahrgenommen. Verschiebt der Kunde einen Termin, zählt nur der neue. Im Zweifel, etwa wenn nicht feststeht, wer abgesagt hat, gilt der Termin als wahrgenommen. Auf Anfrage legt der Anbieter dem Kunden die Berechnung beider Quoten in Textform vor, mit der Liste der zugrunde liegenden Termine und Leads und dem jeweils eingetragenen Ergebnis." },
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
