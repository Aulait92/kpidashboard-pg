# Entwurf: Auftragsverarbeitungsvertrag gekürzt (17.11.2026)

**Status: Entwurf zum Vergleichen, nicht in Kraft.** Gültig bleibt der AVV in `src/lib/legal-texts.ts`
(Stand „16.11.2026“). Gleiche Regeln wie bei der AGB-Kürzung: Ole entscheidet, der Anwalt sieht drüber, keine
Rechtsberatung. Nach Freigabe übernehme ich den Text in die App (neuer Stand, alte Fassung als Datei ablegen,
6-Wochen-Mitteilung an Kunden mit Vertrag nach AGB § 17).

**Ziel:** gleicher Schutz, weniger Text. Der AVV ist schon deutlich kürzer als die AGB (ca. 1.450 Wörter ohne
Anlagen); der Großteil steckt in „Art, Zweck und Umfang“. Gekürzt wird nur, was
1. ausgeblendete Module betrifft (Bestandskunden-Modul mit WhatsApp- und E-Mail-Kampagnen),
2. die AGB schon regeln (Zusicherung und Freistellung des Auftraggebers, Daten bei Vertragsende),
3. doppelt in einem Absatz steht.

**Bewusst nicht gekürzt** (Pflichtinhalt nach Art. 28 Abs. 3 DSGVO oder ausdrücklich geprüft): Weisungen,
Vertraulichkeit, § 203 StGB (Mitarbeiter und Unterauftragsverarbeiter), technische und organisatorische Maßnahmen
(Anlage 1), Unterstützung bei Betroffenenrechten, Meldung von Datenpannen (48 Stunden), Unterauftragsverarbeiter
mit Widerspruchsrecht, Drittländer, Kontrollrechte, KI-Kennzeichnung, Gesundheitsangaben (Art. 9 DSGVO),
Rückmeldung an Meta, Löschung mit Ruhephase als Weisung (Art. 28 Abs. 3 lit. g DSGVO). Anlage 1 (TOMs) und
Anlage 2 (Unterauftragsverarbeiter) bleiben unverändert.

**Ergebnis:** ca. 1.450 → ca. 1.000 Wörter (−30 %), Abschnitte unverändert (10).

| Abschnitt | Vorher | Nachher | Was fällt weg |
|---|---:|---:|---|
| 1 Gegenstand und Dauer | 60 | 60 | nichts |
| 2 Art, Zweck und Umfang | 690 | 400 | zwei Absätze Bestandskunden-Modul (ausgeblendet), Wiederholungen bei Angeboten auslesen, Datenarten zum Modul |
| 3 Weisungen | 50 | 50 | nichts |
| 4 Pflichten des Auftragnehmers | 330 | 300 | Formulierungen, § 203 StGB inhaltlich vollständig |
| 5 Pflichten des Auftraggebers | 120 | 60 | doppelte Zusicherung; Verweis auf AGB § 13 (Freistellung mit Verschulden, gleiche Regel wie dort) |
| 6 Unterauftragsverarbeiter | 70 | 70 | nichts |
| 7 Drittländer | 40 | 40 | nichts |
| 8 Kontrollrechte | 30 | 30 | nichts |
| 9 Löschung und Rückgabe | 210 | 130 | Ablauf der Ruhephase gestrafft, Inhalt gleich |
| 10 Haftung und Schluss | 20 | 20 | nichts |

**Wenn das Bestandskunden-Modul zurückkommt:** die zwei Absätze aus § 2 (Bestandsdaten und WhatsApp-Ansprache;
E-Mail-Kampagnen über das Postfach des Auftraggebers) und die Datenart „Vertragsangaben der Bestandskunden“ aus der
geltenden Fassung wieder aufnehmen.

**Anwalt bitte prüfen:**
1. § 5: Reicht der Verweis auf AGB § 13 für die Freistellung, oder soll die Zusicherung für gebundene Vertreter
   (Agenturvertrag, Zustimmung des Versicherers) im AVV ausdrücklich stehen bleiben?
2. § 2: Ist die zusammengefasste Beschreibung „Angebote auslesen“ (nur Sach, Haftpflicht, Rechtsschutz, Unfall, Tier;
   keine Gesundheitsangaben) als Weisung bestimmt genug?

---

## Gekürzter Text

### § 1 Gegenstand und Dauer

*(unverändert)* Dieser Vertrag regelt die Verarbeitung personenbezogener Daten durch die Ole Kannapinn UG
(haftungsbeschränkt) („Auftragnehmer“) im Auftrag des Kunden („Auftraggeber“) nach Art. 28 DSGVO im Rahmen der
Nutzung der Software und der Leadgenerierung.

Die Laufzeit entspricht der Laufzeit des Hauptvertrags. Die Pflichten aus diesem Vertrag gelten darüber hinaus,
solange der Auftragnehmer nach Ende des Hauptvertrags Daten des Auftraggebers aufbewahrt (§ 9).

### § 2 Art, Zweck und Umfang der Verarbeitung

Erfassen, Speichern und Organisieren von Leads; Kontaktaufnahme mit Interessenten per WhatsApp und E-Mail im Namen
des Auftraggebers, auch durch einen digitalen Assistenten, der ein KI-System ist; Terminvereinbarung und
-erinnerung; Auswertungen für den Auftraggeber.

**Digitaler Assistent.** Er kennzeichnet sich spätestens mit der ersten Nachricht als KI-System (Art. 50 Abs. 1
KI-Verordnung), berät nicht zu Versicherungsprodukten, nennt keine Tarife oder Beiträge, vergleicht keine Angebote,
klärt den Bedarf und vereinbart Termine. Chatnachrichten werden dazu an den KI-Anbieter aus Anlage 2 übermittelt,
der sie nicht für eigene Zwecke, insbesondere nicht zum Training, verwendet.

**Rückmeldung an Meta** (abschaltbar durch den Auftraggeber): Für Leads aus Meta-Lead-Formularen übermittelt der
Auftragnehmer im Namen des Auftraggebers an dessen Meta-Dataset die Lead-ID von Meta, die erreichte Stufe (Lead,
Erreicht, Termin vereinbart, Abschluss), den Zeitpunkt und beim Abschluss den Vertragswert (Jahresbeitrag), damit
Meta die Auslieferung seiner Anzeigen verbessert. Kontaktdaten, Gesprächsinhalte sowie Produkt bzw. Sparte werden
nicht übermittelt.

**Terminvorbereitung und Beratungspräsentation.** Vom Auftraggeber hochgeladene Versicherungsangebote (PDF oder
Bild) zu Sach-, Haftpflicht-, Rechtsschutz-, Unfall- und Tierversicherungen kann er durch den KI-Anbieter aus
Anlage 2 auslesen lassen; übernommen werden nur Tarif-, Beitrags- und Leistungsdaten, die er prüft und bestätigt.
Angebote und Antragsunterlagen mit Gesundheitsangaben werden nicht ausgelesen. Daraus erstellt die Software eine
Präsentation, die sie dem Interessenten auf Wunsch über einen zufälligen, 14 Tage gültigen und jederzeit
beendbaren Link bereitstellt.

**Datenarten:** Kontaktdaten (Name, Telefonnummer, E-Mail-Adresse, Anschrift); Angaben aus dem Lead-Formular und
der Nachweis der Einwilligung (Zeitpunkt, Formular-ID, Textversion und Wortlaut); Kommunikationsinhalte (Chats und
E-Mails); Termindaten, Notizen und Status; Sperrliste der Personen, die der Kontaktaufnahme widersprochen haben; die
Erstinformation des Auftraggebers (über einen zufälligen Link abrufbar); hochgeladene Versicherungsangebote (mit
Name, Anschrift und Geburtsdatum des Interessenten) und daraus erstellte Präsentationen; Nutzungsdaten der Nutzer
des Auftraggebers.

**Betroffene:** Interessenten und Kunden des Auftraggebers sowie dessen Nutzer.

**Gesundheitsangaben** (Art. 9 DSGVO) aus Lead-Formularen werden gespeichert und nur dem Auftraggeber angezeigt,
nicht an den KI-Anbieter übermittelt und nicht in WhatsApp-Nachrichten verwendet. Der Auftraggeber stellt die
ausdrückliche Einwilligung sicher (Art. 9 Abs. 2 lit. a DSGVO) und fragt keine weiteren besonderen Kategorien ab.

### § 3 Weisungen

*(unverändert)* Der Auftragnehmer verarbeitet die Daten nur auf dokumentierte Weisung des Auftraggebers. Weisungen
ergeben sich aus dem Hauptvertrag und der Konfiguration der Software durch den Auftraggeber; weitere Weisungen
erfolgen in Textform. Hält der Auftragnehmer eine Weisung für rechtswidrig, weist er den Auftraggeber unverzüglich
darauf hin.

### § 4 Pflichten des Auftragnehmers

Die zur Verarbeitung befugten Personen sind zur Vertraulichkeit verpflichtet.

**Verschwiegenheit nach § 203 StGB.** Soweit der Auftraggeber als Versicherungsvermittler einer Schweigepflicht
nach § 203 StGB unterliegt und dem Auftragnehmer dabei fremde Geheimnisse zugänglich werden (z. B. die Tatsache
eines Vertrags in der Personenversicherung), wirkt der Auftragnehmer als sonstige mitwirkende Person im Sinne von
§ 203 Abs. 3 Satz 2 StGB mit. Er verpflichtet sich zur Verschwiegenheit über diese Geheimnisse, auch über das
Vertragsende hinaus, und erhält Kenntnis nur, soweit für die Leistung erforderlich. Der Auftraggeber weist darauf
hin, dass eine unbefugte Offenbarung nach § 203 Abs. 4 StGB strafbar ist. Der Auftragnehmer verpflichtet seine
Mitarbeiter und weitere mitwirkende Personen vor Aufnahme der Tätigkeit in Textform zur Verschwiegenheit, belehrt
sie über die Strafbarkeit, dokumentiert dies und weist es auf Anfrage nach. Unterauftragsverarbeiter, die Kenntnis
erlangen können, verpflichtet er ebenso in Textform und sorgt dafür, dass sie ihre Personen gleich verpflichten
(§ 203 Abs. 4 Satz 2 Nr. 2 StGB).

Der Auftragnehmer trifft die technischen und organisatorischen Maßnahmen nach Art. 32 DSGVO gemäß Anlage 1 und passt
sie dem Stand der Technik an, ohne das Schutzniveau zu unterschreiten. Er unterstützt den Auftraggeber bei den
Betroffenenrechten (Art. 12 bis 23 DSGVO) und den Pflichten aus Art. 32 bis 36 DSGVO und meldet Verletzungen des
Schutzes personenbezogener Daten unverzüglich, spätestens innerhalb von 48 Stunden nach Kenntnis.

### § 5 Pflichten des Auftraggebers

Der Auftraggeber ist für die Zulässigkeit der Verarbeitung verantwortlich. Er sichert zu, dass er die Daten, die er
in die Software lädt oder dort nutzt, nach seinem Vermittler- bzw. Agenturvertrag und dem Datenschutzrecht
verarbeiten und dem Auftragnehmer überlassen darf und eine erforderliche Zustimmung des Versicherers vorliegt. Für
Ansprüche Dritter aus einer Verletzung dieser Zusicherung gilt die Freistellung nach den AGB (§ 13 „Kundendaten:
Zusicherung und Freistellung“).

### § 6 Unterauftragsverarbeiter

*(unverändert)* Der Auftraggeber genehmigt die in Anlage 2 genannten Unterauftragsverarbeiter. Über beabsichtigte
Änderungen informiert der Auftragnehmer in Textform; der Auftraggeber kann innerhalb von 14 Tagen aus wichtigem
datenschutzrechtlichem Grund widersprechen. Der Auftragnehmer verpflichtet Unterauftragsverarbeiter vertraglich auf
ein gleichwertiges Schutzniveau, einschließlich der Verschwiegenheit nach § 203 StGB, soweit einschlägig.

### § 7 Übermittlung in Drittländer

*(unverändert)* Eine Übermittlung in Länder außerhalb der EU bzw. des EWR erfolgt nur, wenn die Voraussetzungen der
Art. 44 ff. DSGVO erfüllt sind, insbesondere auf Grundlage eines Angemessenheitsbeschlusses (z. B. EU-US Data
Privacy Framework) oder der EU-Standardvertragsklauseln.

### § 8 Kontrollrechte

*(unverändert)* Der Auftragnehmer weist die Einhaltung seiner Pflichten auf Anfrage nach, vorrangig durch
Dokumentation. Vor-Ort-Kontrollen sind nach angemessener Ankündigung zu üblichen Geschäftszeiten möglich.

### § 9 Löschung und Rückgabe

Der Auftraggeber kann jederzeit einen vollständigen Export seiner Daten im Kundenbereich abrufen (Rückgabe), auch
nach Vertragsende bis zur Löschung.

Er weist den Auftragnehmer hiermit an (Art. 28 Abs. 3 lit. g DSGVO), die Daten nach Ende des Hauptvertrags
24 Monate aufzubewahren (Ruhephase); im Kundenbereich kann er jederzeit bis zur Löschung 3 Monate oder die Löschung
sofort nach Vertragsende wählen. In der Ruhephase werden die Daten nur gespeichert; Zugang besteht nur für Export
und Reaktivierung, mit der dieser Vertrag für den neuen Hauptvertrag fortgilt.

Danach löscht der Auftragnehmer die personenbezogenen Daten endgültig, erinnert 30 und 7 Tage vorher per E-Mail und
bestätigt die Löschung in Textform. Ausgenommen sind pseudonymisierte Sperrlisteneinträge (Hashwerte) zur
dauerhaften Beachtung von Werbewidersprüchen und Daten mit gesetzlicher Aufbewahrungspflicht, insbesondere
Abrechnungsdaten. Datensicherungen werden mit der regulären Rotation gelöscht.

### § 10 Haftung und Schlussbestimmungen

*(unverändert)* Für die Haftung gilt Art. 82 DSGVO. Im Übrigen gelten die Bestimmungen des Hauptvertrags.

*Anlage 1 (technische und organisatorische Maßnahmen) und Anlage 2 (Unterauftragsverarbeiter): unverändert.*
