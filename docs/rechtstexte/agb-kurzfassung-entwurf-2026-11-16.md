# Entwurf: AGB gekürzt (16.11.2026)

**Status: umgesetzt am 16.11.2026** (Ole: „Baue es so ein“), `LEGAL_VERSION` „16.11.2026“ in `src/lib/legal-texts.ts`.
Bisherige Fassung als Archiv: `agb-2026-11-15-fassung-2.md`. Die Fragen an den Anwalt unten sind weiter offen.
Ole entscheidet, der Anwalt sieht drüber. Keine Rechtsberatung.

**Ziel (Ole, 16.11.2026: „Die AGBs sind nur so lang jetzt“):** gleicher Schutz, weniger Text. Gekürzt wurde nur, was
1. doppelt steht (AGB und Angebot bzw. Annahmeknopf),
2. Funktionen der Software beschreibt statt Rechte und Pflichten,
3. ausgeblendete Module betrifft (Bestandskunden-Modul, Empfehlungen & Bewertungen) oder
4. Einzelheiten regelt, die bei der Annahme im Kundenbereich ohnehin genannt und bestätigt werden.

Die Vorschläge aus der Rechtsprüfung (`agb-entwurf-2026-11-16.md`, Themen 2, 3, 6 und 10) sind hier schon eingearbeitet,
damit es nur noch eine neue Fassung gibt. Themen 8 und 9 entfallen mit § 5, bis das Modul zurückkommt.

**Ergebnis:** ca. 3.400 → ca. 2.100 Wörter (−38 %), 19 → 18 Abschnitte.

Nummern wie heute; im Entwurf rücken die Abschnitte nach dem Wegfall von § 5 um eins nach vorn (§ 10 wird § 9).

| Abschnitt (heute) | Vorher | Nachher | Was fällt weg |
|---|---:|---:|---|
| 1 Geltungsbereich | 53 | 45 | nichts Inhaltliches |
| 2 Vertragsschluss und Rangfolge | 102 | 70 | Aufzählung der Angaben am Knopf (steht dort selbst) |
| 3 Leistungen: Leadgenerierung | 96 | 85 | – |
| 4 Leistungen: Software | 474 | 300 | Funktionsliste, Bestandskunden-Modul (ausgeblendet), doppelte Modulregeln |
| 5 Zusatzmodul Empfehlungen & Bewertungen | 61 | 0 | ganzer Abschnitt, solange ausgeblendet |
| 6 Mitwirkung des Kunden | 168 | 150 | Formulierungen |
| 7 Vergütung und Zahlung | 227 | 160 | Fair Use für Bestandskampagnen (Modul ausgeblendet) |
| 8 Pause und Urlaub | 66 | 55 | – |
| 9 Testphasen und kostenlose Zeiträume | 236 | 130 | Wiederholungen, Details stehen am Buchungsknopf |
| 10 Angebote vor einer Kündigung | 362 | 140 | Einzelheiten je Angebot (stehen bei der Annahme) |
| 11 Laufzeit und Kündigung | 347 | 230 | ein Beispiel von drei, Jahreszahlung gestrafft |
| 12 Garantien | 475 | 330 | Wiederholungen der Voraussetzungen, nicht die Übergangsregeln (s. u.) |
| 13 Datenschutz | 80 | 65 | – |
| 14 Kundendaten: Zusicherung und Freistellung | 226 | 190 | Absatz Bestandskunden-Modul (ausgeblendet); Freistellung neu nach Thema 2 |
| 15 Daten bei Vertragsende | 218 | 140 | Ablauf der Ruhephase gestrafft |
| 16 Haftung | 85 | 85 | nichts |
| 17 Vertraulichkeit | 21 | 21 | nichts |
| 18 Änderungen dieser AGB | 55 | 55 | nichts |
| 19 Schlussbestimmungen | 42 | 42 | nichts |

**Bewusst nicht gekürzt:** Haftung, Änderungen, Vertraulichkeit, Schlussbestimmungen (kurz und Standard), KI-Hinweis und
„keine Beratung“ (Pflicht bzw. Haftungsschutz), Kündigungsfristen mit Beispiel (eindeutiger Kündigungstermin),
Übergangsregeln der Garantien (90 statt 120 Tage für ältere Angebote): Die Seite `/rechtliches/agb` hat nur eine
Fassung, ältere Angebote verweisen auf dieselbe URL. Die Sätze können erst raus, wenn wir alte Fassungen archivieren
oder keine Verträge aus diesen Angeboten mehr laufen.

**Wenn ein Modul zurückkommt:** Bestandskunden-Modul → Absätze in § 4 (Modul, Kündigung bei Jahreszahlung), § 7
(Fair Use), § 14 (Werberecht § 7 UWG) und „Nur Bestand“ in § 10 wieder aufnehmen (Texte aus `legal-texts.ts`,
Stand 15.11.2026 Fassung 2). Empfehlungen & Bewertungen → § 5 mit Themen 8 und 9 aus der Rechtsprüfung.

**Anwalt bitte prüfen:**
1. § 10: Reicht die kurze Grundregel, wenn die Bedingungen jedes Angebots (Nachlass, Pause, Paketwechsel) bei der Annahme
   genannt und gesondert bestätigt werden? Insbesondere die Mindestlaufzeit nach einem Nachlass (§ 307 BGB).
2. § 9: Reicht der Verweis auf Dauer und Folgepreis am Buchungsknopf statt der bisherigen sechs Absätze?
3. § 4: Fällt durch die kürzere Leistungsbeschreibung etwas weg, das für die „wesentlichen Funktionen“ (Weiterentwicklung)
   gebraucht wird?

---

## Gekürzter Text

### § 1 Geltungsbereich

Diese AGB gelten für alle Verträge zwischen der Ole Kannapinn UG (haftungsbeschränkt), Lorenzstraße 58, 12209 Berlin
(„Anbieter“) und ihren Kunden über Leadgenerierung und die Nutzung der Software des Anbieters.

Sie richten sich ausschließlich an Unternehmer (§ 14 BGB), und zwar an Versicherungsvermittler mit Erlaubnis bzw.
Registrierung nach § 34d GewO; Tippgeber ohne eigene Erlaubnis sind ausgeschlossen. Abweichende Bedingungen des Kunden
gelten nur, wenn der Anbieter ihnen in Textform zustimmt.

### § 2 Vertragsschluss und Rangfolge

Der Vertrag kommt durch Annahme des Angebots zustande: online über den Angebotslink, per E-Mail oder in sonstiger Textform.
Bei der Online-Annahme gibt der Kunde seine Firma und gegebenenfalls USt-IdNr. an und bestätigt, als Unternehmer zu
handeln. Die wesentlichen Konditionen stehen direkt am Knopf zur Annahme; der Anbieter bestätigt den Vertrag per E-Mail.

Es gelten in dieser Rangfolge: Sondervereinbarungen im Angebot, das Angebot, diese AGB, der Auftragsverarbeitungsvertrag.

### § 3 Leistungen: Leadgenerierung

Der Anbieter erstellt und betreut Werbekampagnen auf Facebook und Instagram (Meta) im Werbekonto des Kunden,
einschließlich Werbemitteln und Lead-Formularen, und optimiert sie laufend. Die Leads werden exklusiv für den Kunden
erzeugt und nicht an Dritte verkauft.

Das Werbebudget zahlt der Kunde direkt an Meta; der Anbieter steuert es im vereinbarten Rahmen. Der Anbieter schuldet eine
fachgerechte Dienstleistung, keinen bestimmten Erfolg, insbesondere keine bestimmte Zahl an Leads, Kosten pro Lead oder
Abschlussquote. Entscheidungen von Meta (z. B. Ablehnung von Anzeigen, Kontosperren) liegen außerhalb seines Einflusses.

### § 4 Leistungen: Software

Ist das Paket mit Software vereinbart, stellt der Anbieter seine Software als Online-Dienst bereit, insbesondere zur
Verwaltung von Leads und Terminen, für Auswertungen und mit einem digitalen Assistenten auf WhatsApp. Der Anbieter darf
die Software weiterentwickeln, solange die vereinbarten wesentlichen Funktionen erhalten bleiben. Er strebt eine
Verfügbarkeit von 99 % im Monatsmittel an, ausgenommen angekündigte Wartungen; für Dienste Dritter (insbesondere
Meta/WhatsApp, Kalender- und KI-Anbieter) übernimmt er keine Gewähr.

**Digitaler Assistent (KI).** Der Anbieter ist Anbieter des Assistenten im Sinne von Art. 3 Nr. 3 der KI-Verordnung
(EU) 2024/1689 und stellt sicher, dass er Interessenten spätestens mit der ersten Nachricht klar darauf hinweist, dass sie
mit einem KI-System schreiben (Art. 50 KI-Verordnung). Der Hinweis lässt sich nicht abschalten; der Kunde entfernt oder
verdeckt ihn nicht. Der Kunde setzt den Assistenten als Betreiber (Art. 3 Nr. 4) in eigener Verantwortung ein und sorgt
für die KI-Kompetenz der Personen, die in seinem Auftrag damit arbeiten (Art. 4).

**Keine Beratung.** Der Assistent berät nicht, empfiehlt keine Versicherungsprodukte, nennt keine Tarife, Versicherer
oder Beiträge und vergleicht keine Angebote. Er klärt den Bedarf und vereinbart Termine. Beratung und Vermittlung
einschließlich der Pflichten nach §§ 61, 62 VVG liegen vollständig beim Kunden, der Gespräche jederzeit übernehmen kann.

**Zugänge.** Enthalten ist die im Angebot genannte Zahl aktiver Verkäufer. Aktiv ist ein Zugang, der Leads zugeteilt
bekommt; Zugänge ohne Leads sind kostenlos. Jeder weitere aktive Verkäufer kostet den im Angebot genannten Preis je
Monat, tagesgenau anteilig.

**Zusatzmodule** gelten nur, wenn sie im Angebot vereinbart oder im Kundenbereich bzw. in Textform gebucht sind. Sie
werden tagesgenau anteilig berechnet und sind zum Ende des laufenden Abrechnungszeitraums kündbar (bei jährlicher
Vorauszahlung zum Ende des bezahlten Jahres); eine anteilige Erstattung erfolgt nicht.

### § 5 Mitwirkung des Kunden

Der Kunde räumt Zugriff auf sein Meta-Werbekonto ein, stellt bei Meta eine Zahlungsmethode bereit und verbindet, soweit
gebucht, WhatsApp und Kalender. Er prüft Werbemittel und Nachrichtenvorlagen vor dem Start, gibt sie frei und bearbeitet
Leads zeitnah.

Der Kunde beachtet seine berufsrechtlichen Pflichten (insbesondere § 34d GewO, Versicherungsvertriebsrichtlinie,
Vorgaben und Werberichtlinien seines Versicherers). Er hinterlegt in der Software eine zutreffende Erstinformation
(§ 15 VersVermV) mit Registernummer und Status und hält sie aktuell; die Software übermittelt sie mit der ersten
Nachricht des Assistenten als Link und als PDF. Eigene Lead-Formulare nutzt er nur mit dem vom Anbieter bereitgestellten
Einwilligungstext.

Widerspricht eine Person der Kontaktaufnahme (etwa mit „STOPP“), beachtet die Software das für alle Kanäle; der Kunde
beachtet es auch außerhalb der Software. Zugangsdaten hält er geheim und meldet einen Missbrauchsverdacht unverzüglich.

### § 6 Vergütung und Zahlung

Die Setupgebühr wird mit Vertragsschluss fällig, die monatliche Vergütung ab dem Startdatum monatlich im Voraus. Alle
Preise sind netto zuzüglich Umsatzsteuer.

Die monatliche Vergütung richtet sich nach dem vereinbarten Werbebudget und der im Angebot vollständig genannten
Preisstaffel. Ändert der Kunde das Budget dauerhaft, gilt die neue Stufe ab dem folgenden Abrechnungsmonat; der
Kundenbereich zeigt die neue Vergütung vor der Änderung an.

Ist die jährliche Vorauszahlung vereinbart, ist die Vergütung für 12 Monate zum Start fällig (Nachlass laut Angebot).
Im Zahlungsjahr hinzukommende Verkäufer oder Module werden anteilig berechnet. Eine Erstattung bei vorzeitiger Beendigung
erfolgt nicht, außer bei Kündigung des Kunden aus wichtigem Grund.

Die Meta-Gebühren für WhatsApp-Nachrichten an Leads sind in der Vergütung enthalten. Rechnungen sind innerhalb von 7 Tagen
zu zahlen. Bei mehr als 30 Tagen Zahlungsverzug darf der Anbieter die Kampagnen nach Ankündigung pausieren, bis die
Zahlung eingeht.

### § 7 Pause und Urlaub

Der Kunde kann die Kampagnen jederzeit pausieren. Während der Pause fällt statt der monatlichen Vergütung nur die im
Angebot genannte Software-Gebühr an, tagesgenau anteilig; ohne Software fällt nichts an. Bei jährlicher Vorauszahlung gibt
es dafür keine Gutschrift. Eine Pause verlängert eine Mindestlaufzeit nicht.

### § 8 Testphasen und kostenlose Zeiträume

Bietet der Anbieter eine Leistung für eine bestimmte Zeit kostenlos oder zu einem Startpreis an, stehen Dauer und
folgender Preis bei der Buchung bzw. im Angebot direkt am Knopf und werden dort gesondert bestätigt. Danach läuft die
Leistung automatisch zu diesem Preis weiter, sofern der Kunde sie nicht vorher im Kundenbereich oder in Textform beendet;
während des kostenlosen Zeitraums entstehen dann keine Kosten. Der Anbieter erinnert spätestens 7 Tage vor Ende per E-Mail
und im Kundenbereich.

Nach dem Übergang in die kostenpflichtige Phase ist die Leistung zum Ende des Abrechnungsmonats kündbar, soweit im
Angebot nichts anderes vereinbart ist. Je Leistung gibt es einen kostenlosen Zeitraum; ein Anspruch darauf besteht nicht.

### § 9 Angebote vor einer Kündigung

Der Anbieter kann dem Kunden vor einer Kündigung Angebote machen, etwa einen Nachlass, einen kostenlosen Monat, eine
Pause ohne Vergütung oder einen Paketwechsel. Es gelten die bei der Annahme genannten Bedingungen; der Anbieter bestätigt
sie im Kundenbereich und per E-Mail. Ein Nachlass wird nicht ausgezahlt.

Ist ein Nachlass an eine weitere Laufzeit geknüpft, läuft der Vertrag mindestens bis zu dem bei der Annahme genannten
Tag; eine Kündigung wirkt frühestens dann.

Gutschriften für fehlerhafte Leads gibt es nur nach Prüfung und in der bestätigten Höhe. Ein Anspruch auf solche
Angebote besteht nicht; der Anbieter kann sie von einer Mindestdauer der Kundenbeziehung abhängig machen und auf einmal
innerhalb von 12 Monaten begrenzen. Ein
Rückkehrangebot nach Vertragsende wird erst mit Zustimmung des Kunden zu Paket und Preis zum neuen Vertrag.

### § 10 Laufzeit und Kündigung

Ohne Vertragslaufzeit ist der Vertrag von beiden Seiten zum Ende jedes Abrechnungsmonats kündbar. Mit 3 bzw. 12 Monaten
Laufzeit gilt diese Mindestlaufzeit ab Start; danach läuft er unbefristet und ist zum Ende jedes Abrechnungsmonats
kündbar.

Bei jährlicher Vorauszahlung läuft der Vertrag 12 Monate ab Start und verlängert sich um jeweils 12 Monate, wenn er
nicht spätestens einen Monat vor Ende des Zahlungsjahres gekündigt wird. Der Kunde kann vorher auf monatliche Zahlung
umstellen; dann gilt die Regel für 12 Monate Laufzeit.

**Fristen.** Start ist das im Angebot genannte oder bei der Annahme gewählte Datum. Ein Abrechnungsmonat läuft vom
Starttag bis zum Tag vor demselben Kalendertag des Folgemonats (fehlt der Tag, bis zum Monatsletzten); Beispiel: Start am
15.03., Abrechnungsmonate 15.03. bis 14.04. usw., 3 Monate Mindestlaufzeit bis 14.06. Eine Kündigung während der
Mindestlaufzeit wirkt zu deren Ende, danach zum Ende des Abrechnungsmonats, in dem sie zugeht.

Die Kündigung erfolgt in Textform oder im Kundenbereich unter „Konto & Rechnungen“ („Vertrag hier kündigen“), wo der
Kunde den Endtermin vorher sieht. Der Anbieter bestätigt Eingang und Vertragsende per E-Mail. Das Recht zur
außerordentlichen Kündigung bleibt unberührt. Die Setupgebühr wird nicht erstattet.

### § 11 Garantien

Die Garantien gelten für die Katzenversicherung (TKV) und für weitere im Angebot genannte Produkte, ab dem Tag der ersten
Auslieferung der Anzeigen. **Gemeinsame Voraussetzungen:** Werbebudget an den aktiven Tagen mindestens 20 € pro Tag und
Produkt. Für Break-even- und Vertrags-Garantie außerdem: mindestens 80 % der gebuchten Termine wahrgenommen und für
mindestens 80 % der Leads das Ergebnis in der Software eingetragen. Pausen verlängern den Prüfzeitraum; bei Zahlungsverzug
ruht der Anspruch.

**Lead-Garantie.** Erhält der Kunde in den ersten 30 aktiven Tagen weniger als 100 Leads für das Produkt, entfällt die
Vergütung für Betreuung und Software im folgenden Abrechnungsmonat. Das Werbebudget zahlt er weiter an Meta.

**Break-even-Garantie (Vertreter mit Abschlussprovision).** Liegt die Provision aus den gewonnenen Verträgen nach 120
aktiven Tagen unter Werbebudget plus Vergütung für Betreuung und Software in diesem Zeitraum, betreut der Anbieter ohne
diese Vergütung weiter, auf Wunsch mit einem anderen Produkt ohne Setupgebühr, bis die Provision seit Start die Kosten
erreicht, längstens 6 Monate. Grundlage ist die Berechnung in der Software mit den unter „Meine Provisionen“ hinterlegten
Sätzen; der Anbieter kann Nachweise verlangen.

**Vertrags-Garantie (Makler, statt Break-even).** Hat der Kunde nach 120 aktiven Tagen weniger als 15 Verträge aus den
Leads abgeschlossen (in der Software als Abschluss eingetragen), betreut der Anbieter ohne Vergütung für Betreuung und
Software weiter, auf Wunsch mit anderem Produkt ohne Setupgebühr, bis 15 Verträge erreicht sind, längstens 6 Monate. Der
Anbieter kann eine Courtage- bzw. Provisionsabrechnung anfordern; verschweigt der Kunde Abschlüsse, entfällt der Anspruch.

**Übergang.** Für Verträge aus Angeboten, die vor dem 13.11.2026, 19:00 Uhr (Break-even) bzw. vor dem 15.11.2026,
23:45 Uhr (Vertrags-Garantie) erstellt wurden, gelten 90 statt 120 Tage.

Weitergehende Ansprüche, insbesondere auf eine bestimmte Provision oder Zahl an Verträgen, bestehen nicht.

### § 12 Datenschutz

Die Leads entstehen auf Grundlage einer ausdrücklichen Einwilligung, die auch die Kontaktaufnahme per Telefon, E-Mail und
WhatsApp umfasst; der Anbieter dokumentiert sie und legt den Nachweis auf Anfrage vor. Für die Daten in der Software ist
der Kunde Verantwortlicher und der Anbieter Auftragsverarbeiter nach dem Auftragsverarbeitungsvertrag. Der Kunde gibt
Leads nur im Rahmen der Einwilligung weiter und beachtet Widerrufe unverzüglich.

### § 13 Kundendaten: Zusicherung und Freistellung

Lädt oder nutzt der Kunde eigene Daten in der Software (z. B. Kontaktlisten, Leads aus anderen Quellen), sichert er zu,
dass das nach seinem Vermittler- bzw. Agenturvertrag, seinem Berufsrecht sowie dem Datenschutz- und Wettbewerbsrecht
zulässig ist und eine nötige Zustimmung des Versicherers vorliegt. Für welche Produkte und Zwecke er die Daten nutzt,
verantwortet er selbst.

Verletzt der Kunde diese Zusicherung oder spricht er Personen über die Software unzulässig an, stellt er den Anbieter von
darauf beruhenden Ansprüchen Dritter frei (insbesondere des Versicherers, betroffener Personen, Mitbewerber und
Verbände), einschließlich angemessener Kosten der Rechtsverteidigung; das gilt nicht, wenn er die Verletzung nicht zu
vertreten hat. Der Anbieter informiert den Kunden unverzüglich, gibt ihm Gelegenheit zur Stellungnahme und erkennt
Ansprüche nicht ohne Abstimmung an. Hat der Anbieter die Verletzung mit zu vertreten, etwa durch eine fehlerhafte Funktion
der Software, mindert sich die Freistellung entsprechend § 254 BGB. Geldbußen gegen den Anbieter selbst sind nicht
erfasst.

### § 14 Daten bei Vertragsende

Der Kunde kann seine Daten jederzeit im Kundenbereich vollständig exportieren, auch nach Vertragsende bis zur Löschung.

Nach Vertragsende ruht das Konto: Die Daten werden nur noch gespeichert, Kampagnen, Nachrichten und Assistent sind
beendet. Der Kunde kann sich zum Export oder zur Reaktivierung (zu neu vereinbarten Konditionen) anmelden. Die Daten werden
24 Monate aufbewahrt; im Kundenbereich kann der Kunde jederzeit 3 Monate oder die sofortige Löschung wählen. Der Anbieter
erinnert 30 und 7 Tage vor der Löschung per E-Mail.

Danach löscht der Anbieter die personenbezogenen Daten endgültig, ausgenommen pseudonymisierte Sperrlisteneinträge
(Hashwerte) von Personen, die der Werbung widersprochen haben, und Daten mit gesetzlicher Aufbewahrungspflicht (z. B.
Verträge und Rechnungen). Sicherungen werden mit der regulären Rotation gelöscht; anonyme Kennzahlen bleiben erhalten.

### § 15 Haftung

*(unverändert)* Der Anbieter haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei der Verletzung von Leben,
Körper oder Gesundheit sowie nach dem Produkthaftungsgesetz.

Bei einfacher Fahrlässigkeit haftet der Anbieter nur bei Verletzung einer wesentlichen Vertragspflicht und der Höhe nach
begrenzt auf den vertragstypischen, vorhersehbaren Schaden, höchstens jedoch auf die vom Kunden in den letzten 12 Monaten
gezahlte Vergütung. Im Übrigen ist die Haftung ausgeschlossen.

Für den Verlust von Daten haftet der Anbieter nur in Höhe des Aufwands, der bei regelmäßiger Datensicherung zur
Wiederherstellung erforderlich gewesen wäre.

### § 16 Vertraulichkeit

*(unverändert)* Beide Seiten behandeln vertrauliche Informationen der jeweils anderen Seite, insbesondere Konditionen,
Kennzahlen und Kampagnendaten, vertraulich, auch über das Vertragsende hinaus.

### § 17 Änderungen dieser AGB

*(unverändert)* Der Anbieter kann diese AGB mit Wirkung für die Zukunft ändern. Änderungen werden dem Kunden mindestens
sechs Wochen vor Inkrafttreten in Textform mitgeteilt. Widerspricht der Kunde nicht innerhalb dieser Frist, gelten sie als
angenommen; auf diese Folge wird in der Mitteilung hingewiesen. Im Fall des Widerspruchs kann jede Seite zum
Inkrafttreten kündigen.

### § 18 Schlussbestimmungen

*(unverändert)* Änderungen und Ergänzungen des Vertrags bedürfen der Textform. Sollte eine Bestimmung unwirksam sein oder
werden, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt. Es gilt das Recht der Bundesrepublik Deutschland. Ist
der Kunde Kaufmann, ist Gerichtsstand der Sitz des Anbieters in Berlin.

---

## Umsetzung nach Freigabe

- Text in `src/lib/legal-texts.ts` übernehmen, `LEGAL_VERSION` erhöhen, Kommentar mit Datum.
- Die bisherige Fassung vorher als Datei ablegen (`docs/rechtstexte/agb-2026-11-15-fassung-2.md`), weil
  `/rechtliches/agb` immer die aktuelle Fassung zeigt.
- Verweise auf Abschnittsnamen prüfen (AVV „Pflichten des Auftraggebers“ verweist auf „Kundendaten: Zusicherung und
  Freistellung“; Halteangebote-Texte im Kundenbereich auf „Angebote vor einer Kündigung“).
- Kunden mit angenommenem Vertrag: Mitteilung nach § 17, sechs Wochen vor Inkrafttreten.
