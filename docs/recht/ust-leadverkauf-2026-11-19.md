# Umsatzsteuer beim Leadverkauf (§ 4 Nr. 11 UStG): interne Rechtsprüfung, 19.11.2026

Rechts-Agent, ohne Anwalts- oder Steuerberaterfreigabe (AGENTS.md, Ole 18.11.2026). Steuerrecht ist Sache des
Steuerberaters (PhDr. Müller Treuhand GmbH). Dieses Papier bereitet dessen Prüfung und Oles Entscheidung vor (Stufe A).
Grundlage: Antrag auf verbindliche Auskunft vom 16.06.2026 (Anlage, 7 Seiten), Schreiben des FA für Körperschaften III
vom 18.09.2026 (Az. 29/461/33668, Frist 21.10.2026), Repo-Stand 19.11.2026 (`src/lib/billing.ts`, `src/lib/ppl/`).

## Kurzfassung

| Punkt | Ampel | Ergebnis |
|---|---|---|
| Leadverkauf an geprüfte Versicherungsvertreter/-makler (§ 34d Abs. 1 oder Abs. 7 GewO), Sparte = Versicherung (PKV, Tarifoptimierung, Tier, Sterbegeld, Privatschutz) | **GELB** | Steuerfreiheit nach § 4 Nr. 11 UStG gut vertretbar (BFH V R 7/08, FG Köln 8 K 3212/15, FG München 3 K 134/07), aber nicht gesichert: BFH V R 50/05 („Werbeagent“) und UStAE 4.11.1 Abs. 2 („reine Werbung genügt nicht“) sind die Gegenlinie. Kein BFH-Urteil zum Leadkauf ohne Abschlussbezug. |
| Heutige Praxis: Handrechnungen 0 % mit Hinweis, App/Stripe 19 % für dieselbe Leistung | **ROT** | Widersprüchlich. Gegenüber dem Finanzamt und im Antrag nicht haltbar. Bei Stripe-Rechnungen schuldet die UG die ausgewiesene USt in jedem Fall (§ 14c Abs. 1 UStG). |
| Abnehmer ohne nachgewiesene Vermittlererlaubnis (Leadhändler, Plattformen, Versicherungsberater, Tippgeber) | **ROT bei 0 %** | Steuerpflichtig (so auch der eigene Antrag, Frage 4). Betrifft möglicherweise Lead-Production/Pivacom (HvK) und Convexa: Vertragspartner und Status klären. |
| Kindersparplan | **ROT bei 0 %** | Ohne klaren Versicherungsbezug in Kampagne und Formular nicht nach § 4 Nr. 11 befreit. Bis zur Klärung mit 19 %. |
| Verbindliche Auskunft | **ROT (Frist)** | FA hat am 18.09.2026 nachgefragt, Frist 21.10.2026 ist abgelaufen. Sofort antworten und den Antrag auf die künftige Umgestaltung zuschneiden (Entwurf unten). |
| Software (349 €/Monat), Betreuung, Kampagnenmanagement, Terminassistent | grün (steuerpflichtig) | Unstreitig 19 %. Nicht versuchen, das in die Befreiung zu ziehen. |

**Empfehlung (Stufe A, Ole mit Steuerberater):**
1. Diese Woche: Steuerberater antwortet dem FA (Entwurf Abschnitt 7), Antrag auf die Umgestaltung ab 01.01.2027 zuschneiden, Nachfrist erbitten.
2. Ab sofort einheitlich: Leads der Kategorie A an Abnehmer mit geprüfter Registereintragung als Vertreter oder Makler steuerfrei mit Rechnungshinweis; alles andere 19 %. Keine Handrechnung mehr, die der App widerspricht.
3. App (CTO, nach Freigabe): Erlaubnisnachweis vor der ersten Lieferung speichern, Steuerkennzeichen je Produkt und Abnehmer, eigener Stripe-Steuersatz „steuerfrei § 4 Nr. 11“, Leads und Software auf getrennten Rechnungspositionen oder Rechnungen.
4. Preise gegenüber Vermittlern: „Preis je Lead X €, umsatzsteuerfrei nach § 4 Nr. 11 UStG“ (brutto = netto), dazu Steuerklausel im Vertrag (Nachberechnung, falls das FA anders entscheidet).

Kosten: Steuerberater, grob 300 bis 1.500 € für Antwort und Prüfung (Schätzung, Spanne). Gebühr der verbindlichen Auskunft
entfällt nur, wenn der Gegenstandswert unter 10.000 € liegt (§ 89 Abs. 5 Satz 3 AO; prüfen, siehe 7.3).

## 1. Rechtsrahmen

- § 4 Nr. 11 UStG befreit „Umsätze aus der Tätigkeit als Bausparkassenvertreter, Versicherungsvertreter und
  Versicherungsmakler“. Unionsrecht: Art. 135 Abs. 1 Buchst. a MwStSystRL („einschließlich der dazugehörigen
  Dienstleistungen, die von Versicherungsmaklern und -vertretern erbracht werden“). Begriffe unionsrechtlich, nicht nach
  §§ 92, 93 HGB auszulegen; keine Erlaubnis nach § 34d GewO nötig, um befreit zu sein (Abschn. 4.11.1 Abs. 1 und 2 UStAE).
- Zwei Prüfsteine nach EuGH (Taksatorringen C-8/01; Arthur Andersen C-472/03; Aspiro C-40/15):
  (1) Beziehung zu Versicherer **und** Versichertem, mittelbar genügt; (2) die Tätigkeit umfasst wesentliche Aspekte der
  Vermittlung, nämlich **Kunden suchen und mit dem Versicherer zusammenbringen**. Rein technische, verwaltende oder
  werbende Leistungen genügen nicht.
- Folge der Befreiung: kein Vorsteuerabzug für Eingangsleistungen, die diesen Umsätzen dienen (§ 15 Abs. 2 Satz 1 Nr. 1
  UStG). Das betrifft vor allem die **Meta-Werbekosten der PPL-Kampagnen** (Reverse Charge nach § 13b, dann nicht mehr
  als Vorsteuer abziehbar) und anteilig Gemeinkosten (Aufteilung nach § 15 Abs. 4). Die Befreiung ist also nicht
  kostenlos (siehe 4).

## 2. Frage 1: Ist der Leadverkauf steuerfrei?

**Ergebnis: gut vertretbar, wenn drei Bedingungen erfüllt sind; Restrisiko mittel.**

Tragend für die Befreiung:
- **BFH, Urteil vom 28.05.2009, V R 7/08, BStBl II 2010, 80** (verifiziert über Sekundärquellen): Wer einem
  Versicherungsmakler am Abschluss potenziell interessierte Personen nachweist und dafür eine Zuführungsprovision
  erhält, ist nach § 4 Nr. 11 befreit; die Verbindung zur Vertragspartei darf mittelbar über den Makler laufen.
  Unterschied zu uns: Dort gab es die Provision erst beim Abschluss (80 bis 85 % der Maklercourtage). Wir werden je Lead
  bezahlt, unabhängig vom Abschluss.
- **FG Köln, Urteil vom 25.09.2018, 8 K 3212/15** (verifiziert über Leitsatz und Pressemitteilung, Volltext wegen
  Netzwerksperre nicht gelesen): Die Lieferung von Datensätzen über an einer PKV interessierte Personen ist ein
  ausreichender Beitrag zur Vermittlung und fällt unter § 4 Nr. 11; deshalb kein Vorsteuerabzug aus dem Leadeinkauf.
  Kundensuche ist Kernelement der Vermittlung, der Datenverkauf an Untervermittler keine eigenständige Nebenleistung.
  **Im Antrag vom 16.06.2026 fehlt dieses Urteil. Es ist das stärkste Argument und gehört in die Antwort an das FA.**
  Revisionsstand nicht geprüft.
- **FG München, Urteil vom 19.05.2010, 3 K 134/07** (Existenz verifiziert, Inhalt nur aus Sekundärquelle, Rechtskraft
  nicht verifiziert): Leadverkauf aus Online-Vermittlung steuerfrei; nach dem Antrag auch bei abschlussunabhängiger
  Vergütung. Der Antrag nennt es „rkr.“; das konnte ich nicht bestätigen.
- **EuG, Urteil vom 26.11.2025, T-657/24, Versãofast** (verifiziert über mehrere Sekundärquellen, CURIA nicht gelesen):
  Kreditvermittlung (Art. 135 Abs. 1 Buchst. b) auch ohne Abschlussvollmacht und ohne Einfluss auf den Vertragsinhalt
  befreit, wenn die Leistungen insgesamt das Zustandekommen ermöglichen, insbesondere Suche und Anwerbung von Kunden.
  Einschränkung für uns: Versãofast hatte Verträge mit den Banken (Beziehung zur Gegenseite) und lieferte mehr als Daten;
  erfolgsabhängige Vergütung wurde als Indiz gewertet. Übertragbar im Grundsatz, aber kein direkter Lead-Fall.
  Das Gericht ist das EuG (seit Oktober 2024 für Vorabentscheidungen im Mehrwertsteuerrecht zuständig), nicht der EuGH.
- **BFH, Urteil vom 08.07.2025, XI R 7/23, DStR 2025, 2484; BFH/NV 2025, 1724** (verifiziert über Sekundärquellen):
  Tarifoptimierung eines bestehenden PKV-Vertrags (§ 204 VVG, ohne Versichererwechsel) durch einen Makler ist
  befreit; eine Änderungsvereinbarung genügt, Zahlung durch den Versicherungsnehmer schadet nicht. Achtung: Das Urteil
  betrifft die Tätigkeit des **Maklers selbst**, nicht die Zuführung von Leads an ihn. Es trägt nur das Zwischenglied
  „Tarifoptimierung ist Vermittlung“; für den Leadverkauf braucht es weiter V R 7/08 und FG Köln.
- **BFH, Urteil vom 03.11.2005, V R 21/05, BStBl II 2006, 282** (Existenz verifiziert): Kreditvermittlung; Vorprüfungen,
  ob ein Vertrag in Betracht kommt, sind Teil der befreiten Vermittlung. Die im Antrag zitierte Aussage („Akquisition und
  Analyse der Verhältnisse“) konnte ich wörtlich nicht bestätigen.

Gegen die Befreiung:
- **BFH, Urteil vom 06.09.2007, V R 50/05** (verifiziert über Sekundärquellen): Provisionen eines „Werbeagenten“ für das
  Einholen von Kundendaten sind steuerpflichtig, wenn er nicht an der Suche und Zusammenführung mitwirkt; Beziehung zu
  beiden Seiten nötig (Arthur Andersen). **Fehler im Antrag:** dort „BFH vom 14.06.2017 – V R 50/05“. Richtig ist
  06.09.2007. Bei der Antwort an das FA berichtigen.
- **Abschn. 4.11.1 Abs. 2 UStAE** (verifiziert über ältere Fassungen bei Haufe; aktuelle Fassung nicht gelesen):
  Online-Dienstleister nur befreit, wenn sie über ihr System an der Anbahnung beteiligt sind und eine Zuführungsprovision
  erhalten; reine Werbung genügt nicht. Die Grenze zwischen Werbung und Vermittlung sei von der Rechtsprechung nicht
  geklärt. Abschn. 4.8.1 UStAE: Wer nur Vermittler zuführt (nicht Kunden), ist nicht befreit.
- **EuGH, Urteil vom 25.03.2021, C-907/19, Q-GmbH** (verifiziert): Lizenz an einem Versicherungsprodukt plus Vermittlung
  als einheitliche Leistung nicht befreit. Lehre für uns: Wenn Leads Teil eines Pakets mit Software oder Betreuung sind,
  kann das Paket als einheitliche steuerpflichtige Leistung gelten. Leads deshalb getrennt vereinbaren und abrechnen.
- Abbey National (C-169/04) betrifft Fondsverwaltung und hilft hier nicht.

Worauf es ankommt (so auch der Antrag, Abschnitt 3.3):
1. **Abnehmer ist Versicherungsvertreter oder -makler** (Register: § 34d Abs. 1 oder gebunden Abs. 7). Nicht:
   Versicherungsberater (§ 34d Abs. 2, für die § 4 Nr. 11 nicht gilt), Tippgeber, Leadhändler, Plattformen. Nur dann
   steht die mittelbare Beziehung zum Versicherer (V R 7/08).
2. **Der Lead ist auf den Abschluss eines bestimmten Versicherungsvertrags gerichtet**: spartenbezogene Anzeige,
   Formular und Einwilligung „Beratung zu X durch einen Vermittler“. Eine produktneutrale Adresse ist Werbung.
3. **Exklusiv an einen Abnehmer, nicht als Paket mit Software/Betreuung.** Bei Software-Kunden kommen die Leads aus
   deren eigenem Werbebudget über unser Kampagnenmanagement: Das ist steuerpflichtige Werbe- und Softwareleistung, kein
   Leadverkauf.

Ob performancegrowth selbst „Vermittler“ ist: steuerlich kommt es nicht auf die GewO-Erlaubnis an, sondern auf die
Funktion (Kunden suchen und zusammenführen). Gewerberechtlich bleibt die UG Tippgeberin (BGH, Urteil vom 28.11.2013,
I ZR 7/13: bloßes Sammeln und Weitergeben von Kundendaten ist keine Vermittlung im Sinne des § 34d). Das ist kein
Widerspruch, weil die Begriffe verschieden ausgelegt werden. Es bedeutet aber: **mehr Vermittlungstätigkeit für das
Steuerrecht kostet Sicherheit im Gewerberecht** (siehe 3).

## 3. Frage 2: Kontaktdaten, Vorqualifizierung, Termin, Tarifoptimierung

- **Nur Kontaktdaten und Bedarfsangaben (heute):** Der Fall von FG Köln 8 K 3212/15 und FG München 3 K 134/07. Vertretbar
  befreit, wenn die Bedingungen in 2 erfüllt sind.
- **Vorqualifizierung durch Formularfragen (Sparte, Tier, Alter, Beitrag):** stärkt den Abschlussbezug, schadet nicht.
  Keine Beratung zu Tarifen oder Versicherern, sonst § 34d-Erlaubnispflicht.
- **Terminbuchung durch performancegrowth selbst** (Anruf oder KI im Namen der UG): steuerlich eher stärker (Mitwirkung an
  der Anbahnung, Versãofast), gewerberechtlich gefährlicher. Für PPL-Leads gilt ohnehin: nie kontaktieren (AGENTS.md).
  Nicht ändern.
- **Software-Terminassistent:** handelt im Namen des Vermittlers mit dessen Erstinformation. Das ist eine Softwareleistung
  an den Vermittler, steuerpflichtig. Nicht mit dem Leadverkauf vermischen.
- **PKV-Tarifoptimierung:** Seit XI R 7/23 ist die Tarifoptimierung durch Makler befreit; der Lead darauf ist wie andere
  Kategorie-A-Leads zu behandeln, **wenn der Abnehmer Makler ist**. Arbeitet der Abnehmer als Versicherungsberater auf
  Honorar oder als reiner Tarifwechseldienstleister ohne § 34d-Status, greift § 4 Nr. 11 nicht. Bei Heinrich von Kleist
  zusätzlich prüfen, wer Vertragspartner ist: Laut `src/lib/ppl/hvk-abrechnung.ts` kauft HvK „über Lead-Production
  (Pivacom)“ und erteilt Gutschriften mit einer Spalte „19 %“. Ist Lead-Production der Käufer und selbst kein
  Vermittler, ist der Umsatz nach dem eigenen Antrag (Frage 4) steuerpflichtig. Weist die Gutschrift USt aus und
  widerspricht die UG nicht, schuldet sie die Steuer daraus (§ 14 Abs. 2 Satz 3, § 14c Abs. 1 UStG). Gutschriften
  ansehen und Steuerberater entscheiden lassen: entweder widersprechen (bei Befreiung) oder als steuerpflichtig führen.

### Einordnung der heute verkauften Produkte

| Produkt | Einordnung | Ampel bei 0 % |
|---|---|---|
| Tierkranken Katze/Hund (auch Pferd) | Versicherung, im Antrag Kategorie A | gelb |
| PKV-Tarifoptimierung | Kategorie A, nur bei Makler als Käufer | gelb (Käufer klären) |
| Privatschutz (Haftpflicht, Hausrat, Unfall, Rechtsschutz usw.) | Versicherung, Begründung wie Tier; **nicht im Antrag** | gelb, in die Antwort aufnehmen |
| Sterbegeld | Kategorie A | gelb |
| Kindersparplan | Im Repo nur neutrale Felder (Anzahl/Alter Kinder, Zielbetrag, Sparrate, Zeithorizont, `src/lib/ppl/lead-pdf.ts`); Kampagnentexte liegen bei Perspective/Meta, nicht im Repo. Die Provisionslogik rechnet wie Leben (‰ der Beitragssumme, `src/lib/provision.ts`), was auf Versicherungsmantel beim Käufer hindeutet. Entscheidend ist aber, was der Lead angefragt hat. | **rot**, bis Anzeige und Formular ausdrücklich eine Versicherungslösung (z. B. Kinder-Rentenversicherung) bewerben |
| Zahnzusatz, Krankenhauszusatz, weitere Sparten | wie Tier, nicht im Antrag | gelb, in die Antwort aufnehmen |

Nebenbemerkung Kindersparplan: Bei einem Fondssparplan käme statt § 4 Nr. 11 die Befreiung für die Vermittlung von
Wertpapierumsätzen (§ 4 Nr. 8 Buchst. e UStG) in Betracht, dann aber nur bei einem Käufer mit Erlaubnis nach § 34f/§ 34h
GewO oder Bankstatus (nicht geprüft). Für Allianz-Vertreter als Käufer nicht weiterverfolgen: 19 %.

## 4. Frage 3: Risiken

**Zu Unrecht steuerfrei (Leads, die das FA als Werbung sieht):**
- Nachzahlung 19/119 des vereinnahmten Preises, wenn der Vertrag keine Nachberechnung erlaubt (Beispiel: 30 Leads à 50 €
  = 1.500 €, Steuer 239,50 €). Mit wirksamer Klausel „zuzüglich gesetzlicher Umsatzsteuer“ kann die UG nachberechnen;
  Vertreter tragen sie dann voll, weil sie keine Vorsteuer abziehen (§ 15 Abs. 2 Nr. 1 UStG, ihre Umsätze sind selbst
  befreit). Kundenbeziehung leidet.
- Zinsen nach § 233a AO: 0,15 % je Monat (1,8 % im Jahr), ab 15 Monaten nach Ablauf des Steuerjahres.
- Gegenposten: Bei Steuerpflicht wird die Vorsteuer aus den Meta-Kosten dieser Kampagnen nachträglich abziehbar. Das
  mindert den Schaden spürbar (Größenordnung: 19 % der Werbekosten je Lead).
- Strafrecht: gering, weil der Sachverhalt mit dem Antrag offengelegt ist und die Rechtsauffassung vertretbar ist
  (FG Köln, V R 7/08). Voraussetzung: Die Praxis entspricht dem Antrag (Nachweis vor Erstbelieferung, steuerpflichtig an
  Nicht-Vermittler). Sonst stimmt der dort geschilderte Sachverhalt nicht.

**Zu Unrecht mit USt (heutige Stripe-Rechnungen für befreite Leads):**
- Die UG schuldet die ausgewiesene Steuer nach § 14c Abs. 1 UStG, bis die Rechnung berichtigt ist. Berichtigung wirkt
  erst im Zeitraum der Berichtigung; nach Verwaltungsauffassung setzt sie in der Regel die Rückzahlung der Steuer an den
  Kunden voraus (nicht verifiziert, Steuerberater). Der Kunde (Vertreter) hat 19 % zu viel bezahlt und kann sie nicht
  als Vorsteuer ziehen.
- Folge der Inkonsistenz: Das FA sieht bei derselben Leistung einmal 0 %, einmal 19 %. Das schwächt die Glaubwürdigkeit
  der Rechtsauffassung im Auskunftsverfahren und in einer Prüfung.

**Vergangene Rechnungen:**
1. Liste aller Lead-Rechnungen seit Beginn (Handrechnungen und Stripe) mit Käufer, Status des Käufers (Vertreter, Makler,
   Händler), Produkt, Steuersatz. Quelle: Stripe und Buchhaltung; keine Klardaten ins Repo.
2. Handrechnungen 0 % an geprüfte Vermittler, Kategorie A: stehen lassen. Vertretbare Rechtsauffassung, offengelegt im
   Antrag. Keine Berichtigungspflicht nach § 153 AO, solange der Steuerberater die Auffassung trägt.
3. Handrechnungen 0 % an Nicht-Vermittler oder für Kindersparplan: mit Steuerberater berichtigen (Steuer 19/119 nachzahlen
   oder, wo vertraglich möglich, nachberechnen); Vorsteuer aus zugehörigen Werbekosten gegenrechnen.
4. Stripe-Rechnungen mit 19 %: Steuer ist geschuldet und muss in der Voranmeldung stehen (prüfen). Einfachster Weg: so
   lassen. Berichtigen nur, wenn Ole die Beträge den Kunden zurückzahlen will.
5. Umsatzsteuer-Rücklage (Entscheidungslog 19.11.2026) für die Fälle 3 und 4 bilden.

## 5. Frage 4: Empfehlung für App, Preise, Verfahren

**App (CTO, Freigabe Ole, Stufe A, kein Code in diesem Auftrag):**
- Nachweis vor der ersten Lieferung je PPL-Bezug: Registernummer (D-XXXX-XXXXX-XX), Status (Vertreter § 34d Abs. 1,
  gebunden Abs. 7, Makler; nicht Berater), Abrufdatum und Ergebnis des Abgleichs mit dem Vermittlerregister
  (vermittlerregister.info), gespeichert am Kunden. Ohne Nachweis: 19 %. Felder gibt es teilweise schon für die
  Erstinformation (`registerNummer`, `erlaubnis`, `ihk` in `prisma/schema.prisma`); für PPL-Käufer ohne Software fehlen
  sie.
- Steuerkennzeichen je Produkt: `vers` (Kategorie A, Befreiung möglich) oder `steuerpflichtig` (Kindersparplan und alles
  ohne Versicherungsbezug). Steuersatz der Bestellung = befreit nur bei `vers` und gültigem Nachweis.
- Stripe: eigener Steuersatz 0 % „steuerfrei“, Rechnungshinweis „Steuerfreie Leistung nach § 4 Nr. 11 UStG“ (Pflicht nach
  § 14 Abs. 4 Satz 1 Nr. 8 UStG). Heute erzwingt `resolveTax` in `src/lib/billing.ts` immer 19 %, und
  `src/lib/ppl/orders.ts` rechnet Lead-Bestellungen darüber ab. Leads nicht auf derselben Position wie Software;
  besser eigene Rechnung.
- Ansicht für Ole: Liste der befreit abgerechneten Leads je Monat (für die Voranmeldung, Zeile steuerfreie Umsätze ohne
  Vorsteuerabzug) und für die Vorsteueraufteilung.

**Preisangaben gegenüber Vermittlern:**
- Befreite Leads: „X € je Lead, umsatzsteuerfrei nach § 4 Nr. 11 UStG“. Brutto = netto; das ist für Vertreter ohne
  Vorsteuerabzug der eigentliche Preisvorteil und darf so kommuniziert werden, ohne „Garantie“ oder Steuerversprechen.
- Steuerklausel in Bestellung/AGB (Stufe A): „Die Preise verstehen sich zuzüglich Umsatzsteuer, soweit diese anfällt.
  Behandelt die Finanzverwaltung Leads abweichend als steuerpflichtig, kann der Anbieter die Umsatzsteuer nachberechnen.“
  Die heutige AGB-Formel „netto zuzüglich der gesetzlichen Umsatzsteuer“ (`docs/rechtstexte/agb-2026-11-15-fassung-2.md`,
  Zeile 75) trägt das im Grundsatz schon; für Leads ausdrücklich machen. Conversion-Texter vorher (AGENTS.md).
- Steuerpflichtige Leads (Kindersparplan, Händler): „zzgl. 19 % USt“ deutlich am Preis.

**Verbindliche Auskunft oder Steuerberater:** Beides. Der Steuerberater ist bereits mandatiert und muss jetzt dem FA
antworten. Eine einfache Auskunft bindet nicht und bringt wenig; die verbindliche Auskunft nur für die künftige
Umgestaltung beantragen (Abschnitt 7).

## 6. Was bis zur Antwort des Finanzamts gilt

- Kategorie A an geprüfte Vertreter/Makler: steuerfrei mit Hinweis, sobald Nachweis gespeichert ist (Handrechnung bis die
  App es kann; Stripe-Bestellungen bis dahin für diese Kunden pausieren oder per Hand). Steuerklausel im Vertrag.
- Alles andere: 19 %.
- Für befreite Umsätze Vorsteuer aus PPL-Werbekosten nicht mehr abziehen bzw. aufteilen (Steuerberater).
- Antwortet das FA mit Ablehnung: Praxis kann weiterlaufen (Rechtsauffassung vertretbar), Risiko bleibt bis zur
  Außenprüfung offen; dann Einspruch bzw. FG möglich. Teilt das FA in einer einfachen Auskunft Steuerpflicht mit:
  ab dann 19 % und Nachberechnung nach Klausel; Altfälle mit Steuerberater.

## 7. Antwort an das Finanzamt (Schreiben vom 18.09.2026)

### 7.1 Lage
Das FA darf eine verbindliche Auskunft nur zu noch nicht verwirklichten Sachverhalten erteilen (§ 89 Abs. 2 AO; AEAO zu
§ 89, Nr. 3.5.4: bei Dauersachverhalten möglich für eine ernsthaft geplante Umgestaltung mit Wirkung für die Zukunft).
Der Leadverkauf läuft seit Monaten. Würde man nur „ja, begonnen“ antworten, lehnt das FA ab. Die Frist 21.10.2026 ist
abgelaufen; ob der Steuerberater geantwortet hat, ist offen (Ole fragt).

### 7.2 Empfehlung
Antrag ehrlich umstellen: Bisheriges Modell wurde verwirklicht (keine Auskunft dafür); beantragt wird die Auskunft für die
**Umgestaltung ab 01.01.2027**, die noch nicht verwirklicht ist:
1. Abrechnung aller Leadverkäufe über das eigene Bestellsystem mit Erlaubnisnachweis vor der ersten Lieferung,
   getrennt von Software und Betreuung (bisher teils Handrechnung 0 %, teils 19 % im System).
2. Neue Sparten ab 2027: Privatschutz (Sach), Zahnzusatz, Krankenhauszusatz, Pferd und weitere.
3. Ausschluss von Versicherungsberatern und Händlern aus der Befreiung; Kindersparplan nur noch steuerpflichtig oder mit
   ausdrücklichem Versicherungsbezug.
Dazu FG Köln 8 K 3212/15 ergänzen und das Datum von V R 50/05 berichtigen. Die einfache Auskunft nur hilfsweise annehmen.

### 7.3 Gegenstandswert
Im Antrag „unter 10.000 € im Jahr“. Bei 19 % entspricht das rund 52.600 € befreiten Leadumsatzes im Jahr. Mit neuen Sparten
und Wachstum kann es mehr werden; der Steuerberater soll die Schätzung für 2027 neu ansetzen (Gebühr nach § 89 Abs. 5 AO).

### 7.4 Entwurf (Ole an Steuerberater, zum Weiterleiten)

> Betreff: Antrag auf verbindliche Auskunft vom 16.06.2026, Nachfrage FA für Körperschaften III vom 18.09.2026,
> Az. 29/461/33668
>
> Sehr geehrter Herr Dr. Müller,
>
> das Finanzamt fragt, ob mit der Umsetzung des Sachverhalts schon begonnen wurde. Die Frist war der 21.10.2026. Falls
> Sie noch nicht geantwortet haben, bitte ich Sie, um eine kurze Nachfrist zu bitten und wie folgt zu antworten:
>
> 1. Den Verkauf von Interessentendaten an Versicherungsvermittler betreiben wir seit [Monat/Jahr]. Insoweit ist der
>    Sachverhalt verwirklicht; dafür beantragen wir keine verbindliche Auskunft.
> 2. Ab dem 01.01.2027 gestalten wir das Modell um: Alle Leadverkäufe laufen dann über unser eigenes Bestellsystem.
>    Vor der ersten Lieferung prüfen und speichern wir den Eintrag des Käufers im Vermittlerregister als
>    Versicherungsvertreter oder Versicherungsmakler. Leads werden getrennt von Software und Betreuung vereinbart und
>    abgerechnet. Hinzu kommen neue Sparten (Privatschutz mit Haftpflicht, Hausrat, Unfall und Rechtsschutz, außerdem
>    Zahnzusatz und Krankenhauszusatz). Versicherungsberater und Wiederverkäufer erhalten Leads nur steuerpflichtig.
> 3. Für diese künftige Gestaltung bitten wir um verbindliche Auskunft zu den Fragen 1 bis 4 des Antrags, ergänzt um die
>    neuen Sparten. Hilfsweise nehmen wir eine einfache Auskunft an.
> 4. Bitte ergänzen Sie in der Begründung FG Köln, Urteil vom 25.09.2018, 8 K 3212/15 (Lieferung von Datensätzen über
>    PKV-Interessenten als Vermittlung nach § 4 Nr. 11 UStG) und berichtigen Sie das Datum von BFH V R 50/05
>    (06.09.2007).
> 5. Bitte setzen Sie den Gegenstandswert für 2027 auf Grundlage unserer Planung neu an; ich schicke Ihnen die Zahlen.
>
> Außerdem bitte ich Sie um Ihre Einschätzung, wie wir mit bisherigen Rechnungen umgehen: Handrechnungen ohne
> Umsatzsteuer und Rechnungen aus unserem System mit 19 % für vergleichbare Leads. Eine Übersicht schicke ich Ihnen mit.
>
> Mit freundlichen Grüßen
> Ole Kannapinn

Platzhalter [Monat/Jahr] vor dem Versand füllen. Der Text geht an den Steuerberater, nicht an Kunden; Stufe A (Ole).

## 8. Offene Punkte (vor der Umsetzung klären)

1. Hat der Steuerberater dem FA geantwortet? (Ole)
2. Wer ist Vertragspartner und Rechnungsempfänger bei HvK (HvK selbst oder Lead-Production/Pivacom) und bei Convexa;
   welcher Registerstatus? Gutschriften von Lead-Production mit „19 %“ ansehen. (Ole, Steuerberater)
3. Kindersparplan: Anzeigentext und Formular aus Perspective/Meta vorlegen. (CMO)
4. An wen ging die Handrechnung „PKV-Tarifoptimierung, 30 Leads à 50 €, 0 %“? (Ole)
5. Wurden die 19 % aus Stripe-Lead-Rechnungen angemeldet? (Steuerberater, CFO)

## Quellen und Verlässlichkeit

Primärtexte konnte ich nicht lesen: bundesfinanzhof.de, justiz.nrw.de und steuerschroeder.de sind in dieser Umgebung
gesperrt. „Verifiziert“ heißt hier: Aktenzeichen, Datum und Kernaussage in mindestens einer Fachquelle bestätigt.

| Quelle | Status |
|---|---|
| BFH 28.05.2009, V R 7/08, BStBl II 2010, 80 | verifiziert (Sekundär): [IWW](https://www.iww.de/wvm/archiv/untervermittlung-zufuehrungsprovision-ist-umsatzsteuerfrei-f14519), [Versicherungsbote](https://www.versicherungsbote.de/id/60948/Zufuhrungsprovision-ist-steuerfrei/), [NWB](https://datenbank.nwb.de/Dokument/348287/) |
| FG Köln 25.09.2018, 8 K 3212/15 | verifiziert (Leitsatz, Pressemitteilung): [NRWE](https://nrwe.justiz.nrw.de/fgs/koeln/j2018/8_K_3212_15_Urteil_20180925.html), [NWB](https://datenbank.nwb.de/Dokument/824438/) |
| FG München 19.05.2010, 3 K 134/07 | Existenz verifiziert, Inhalt sekundär, Rechtskraft nicht verifiziert: [NWB](https://datenbank.nwb.de/Dokument/422050/) |
| BFH 08.07.2025, XI R 7/23 | verifiziert (Sekundär): [Haufe](https://www.haufe.de/id/entscheidung/bfh-urteil-vom-08072025-xi-r-723-veroeffentlicht-am-23102025-HI17027265.html), [otto-schmidt](https://www.otto-schmidt.de/news/steuerrecht/steuerfreie-tarifoptimierung-von-versicherungsvertragen-2025-10-23.html), [NWB-Blog](https://www.nwb-experten-blog.de/tarifoptimierung-von-versicherungsvertraegen-ist-umsatzsteuerfrei/) |
| EuG 26.11.2025, T-657/24, Versãofast | verifiziert (Sekundär): [Forvis Mazars](https://www.forvismazars.com/de/en/services/tax/global-indirect-tax-value-added-tax-and-customs/latest-vat-news/credit-intermediary-services-absence-of-authority), [PwC BE](https://news.pwc.be/vat-exemption-for-financial-intermediation-broader-than-you-think/), [BDO](https://www.bdo.nl/en-gb/insights/vat-exemption-for-credit-intermediaries-has-scope-widened-tale-intsco-vata) |
| BFH 06.09.2007, V R 50/05 (Werbeagent) | verifiziert (Sekundär): [IWW](https://www.iww.de/wvv/archiv/taetigkeit-als-werbeagent-reines-einholen-von-kundendaten-verguetung-ist-umsatzsteuerpflichtig-f7037), [anwalt24](https://www.anwalt24.de/urteile/bfh/2007-09-06/v-r-50_05). Im Antrag falsch datiert |
| BFH 03.11.2005, V R 21/05, BStBl II 2006, 282 | Existenz verifiziert, zitierte Aussage nicht wörtlich bestätigt: [IWW](https://www.iww.de/quellenmaterial/id/3175) |
| EuGH 17.03.2016, C-40/15, Aspiro | aus Kenntnis, im Antrag gleich zitiert; nicht gesondert abgerufen |
| EuGH 03.03.2005, C-472/03, Arthur Andersen; 20.11.2003, C-8/01, Taksatorringen | aus Kenntnis, nicht verifiziert |
| EuGH 25.03.2021, C-907/19, Q-GmbH | verifiziert: [Deloitte](https://taxscape.deloitte.com/article/q-gmbh-(c-907-19)---cjeu-judgment.aspx), [FGS](https://www.fgs.de/news-and-insights/blog/detail/eugh-keine-steuerbefreiung-fuer-die-entwicklung-und-vermittlung-von-versicherungsprodukten) |
| BGH 28.11.2013, I ZR 7/13 (Tippgeber, Gewerberecht) | verifiziert (Sekundär): [aufrecht.de](https://www.aufrecht.de/urteile/wettbewerbsrecht/urteile-2013/grundsatzentscheidung-zur-abgrenzung-von-online-versicherungsvermittlung-und-blossem-tippgeber-bgh-urt-v-28112013-az-i-zr-713) |
| Abschn. 4.11.1 UStAE | ältere Fassungen verifiziert: [Haufe](https://www.haufe.de/id/norm/umsatzsteuer-anwendungserlass-stand-zum-31122023-4111-bausparkassenvertreter-versicherungsvertreter-versicherungsmakler-HI16172612_p4.11.1.html); aktuelle Fassung nicht gelesen |
| § 14c, § 15 Abs. 2, § 4 Nr. 8 Buchst. e UStG; § 89, § 233a, § 238 Abs. 1a, § 153 AO | Gesetzeskenntnis, Stand nicht online gegengeprüft |
