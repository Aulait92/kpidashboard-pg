# Policen per WhatsApp mit Gesundheitsangaben: rechtliche Vorprüfung

Stand: 17.11.2026 (Nachtlauf). Rechtliche Vorprüfung, keine Rechtsberatung. Ole entscheidet, die Anwältin bestätigt danach.

Gegenstand: Der WhatsApp-Assistent (WhatsApp Business Cloud API über 360dialog, Meta als Unterauftragnehmer) bittet Leads mit gebuchtem Videotermin, Fotos oder PDFs aktueller Policen in den Chat zu schicken, auch Kranken, BU und Leben. performancegrowth (Ole Kannapinn UG) ist Auftragsverarbeiter des jeweiligen Vermittlers.

**Recherchestand und Quellenlage:** Legal Data Hunter lieferte heute nur drei Treffer (Art. 9 DSGVO, § 7 UWG, Fundstellen aus dem Lauf vom 16.11. in `docs/recht/legal-data-hunter-queue.md`), dann griff das Tageslimit. Meldung des Tools im Wortlaut: Tageslimit erreicht (limit_type „day“, Plan „free“), Upgrade unter https://legaldatahunter.com/pricing, Reset laut Tool am 18.11.2026 um 13:50 UTC. Die übrigen Fundstellen stammen aus WebSearch (Behördenpapiere, Meta- und 360dialog-Dokumentation, Gesetzestexte, Urteilsfundstellen). Jede Fundstelle ist mit [LDH] oder [Web] gekennzeichnet. Was mangels Tooltreffer nicht belegt ist, steht ausdrücklich als „ohne Fundstelle“ da.

---

## Kurzfazit

**Ampel: GELB, live mit Auflagen.** Für Haftpflicht, Hausrat und Kfz kann der Ablauf nach den Textkorrekturen sofort starten. Für Kranken, BU und Leben nur, wenn vor dem Start die Auflagen A1 bis A8 (unten) erfüllt sind; die wichtigsten sind ein korrigierter Einwilligungstext (der jetzige Fußzeilentext nennt den falschen Empfänger und verschweigt Meta), ein technisches Tor „keine Ablage ohne Einwilligung“, die unterschriebene AVV-Ergänzung je Vermittler und die § 203-Verpflichtungen.

**KI-Auslesen (Zusatzfrage 9): GELB.** Für Haftpflicht, Hausrat und Kfz mit dem neuen Einwilligungstext und der AVV-Ergänzung möglich. Für Kranken, BU und Leben erst, wenn die Null-Speicherung beim KI-Anbieter schriftlich bestätigt ist (Azure: genehmigtes „modified abuse monitoring“; OpenAI: EU-Projekt mit Zero Data Retention), sonst diese Sparten vom KI-Auslesen ausnehmen. Details im Abschnitt „KI-Auslesen“.

**Restrisiko: mittel.** Rechtsgrundlage kann nur die ausdrückliche Einwilligung nach Art. 9 Abs. 2 lit. a DSGVO sein; sie ist per WhatsApp-Knopf machbar, aber angreifbar, wenn der Text unvollständig oder irreführend ist. Der größte nicht wegzuverhandelnde Punkt ist der Transportweg: Meta entschlüsselt Cloud-API-Nachrichten auf eigenen Servern, speichert Medien bis zu 30 Tage und kann sie in die USA übermitteln (gestützt auf das Data Privacy Framework); deutsche Aufsichtsbehörden halten WhatsApp für Gesundheitsdaten nur für bedingt geeignet. Dieses Restrisiko sinkt deutlich, wenn für Kranken, BU und Leben ein EU-gehosteter Upload-Link statt des Chats angeboten wird (Empfehlung E1). Bußgeld- und Abmahnrisiko liegt in erster Linie beim Vermittler als Verantwortlichem, Haftung und Reputationsrisiko aber auch bei performancegrowth (Art. 82, 83 DSGVO; § 203 Abs. 4 StGB).

---

## Prüffrage 1: Art. 9 DSGVO, Gesundheitsdaten und Einwilligung

**Ergebnis.**
- Policen aus Kranken, BU und Leben mit Risikozuschlägen, Leistungsausschlüssen oder Vorerkrankungsklauseln sind Gesundheitsdaten nach Art. 4 Nr. 15 und Art. 9 Abs. 1 DSGVO. Der EuGH legt Art. 9 weit aus: Es genügt, dass sich Gesundheitsinformationen mittelbar durch Schlussfolgerung ergeben (EuGH, Urteil vom 1.8.2022, C-184/20, [EUR-Lex CELEX:62020CJ0184](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62020CJ0184) [LDH, Lauf 16.11.]). Im Fall Lindenapotheke hat der EuGH sogar Bestelldaten für apothekenpflichtige, nicht verschreibungspflichtige Arzneimittel als Gesundheitsdaten eingestuft (EuGH, 4.10.2024, C-21/23, [curia](https://curia.europa.eu/jcms/jcms/p1_4584865/de) [Web]; Schlussanträge [EUR-Lex CELEX:62023CC0021](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62023CC0021) [LDH, Lauf 16.11.]). Schon die Tatsache „hat eine BU mit Ausschluss Rücken“ ist damit Art. 9.
- Haftpflicht, Hausrat und Kfz sind regelmäßig keine Art. 9-Daten. Da der Vermittler aber nicht vorher weiß, was ankommt, muss der gesamte Policen-Kanal wie Art. 9 behandelt werden.
- **Rechtsgrundlage:** Nur Art. 9 Abs. 2 lit. a (ausdrückliche Einwilligung) trägt ([Art. 9 DSGVO, EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679) [LDH]).
  - lit. f (Rechtsansprüche) passt nicht: Es geht um Beratung und Vertragsanbahnung, nicht um die Geltendmachung oder Verteidigung von Rechtsansprüchen.
  - lit. h passt nicht: Er setzt Gesundheitsvorsorge, Versorgung oder Behandlung durch oder unter Verantwortung von Fachpersonal mit Berufsgeheimnis voraus (Art. 9 Abs. 3). Versicherungsvermittlung gehört nicht dazu.
  - lit. e (offensichtlich öffentlich gemacht) passt nicht; ein Chat an einen Vermittler ist nicht öffentlich.
  - Dass der Lead die Datei selbst schickt, ist allenfalls eine konkludente Einwilligung. Art. 9 verlangt eine ausdrückliche.
- **Knopf als ausdrückliche Einwilligung:** Grundsätzlich ja. Der EDSA lässt für „ausdrücklich“ eine ausdrückliche Erklärung genügen, auch per Online-Formular oder elektronischer Bestätigung, verlangt aber Nachweisbarkeit (EDSA-Leitlinien 05/2020 zur Einwilligung, [EDPB](https://edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_en) [Web]). Ein Antwortknopf auf eine Nachricht, deren Haupttext die Erklärung selbst enthält („Ich willige ein, dass …“), ist eine eindeutige bestätigende Handlung im Sinne von ErwG 32. Voraussetzungen:
  1. Die Erklärung muss im Nachrichtentext stehen, nicht nur in der kleinen grauen Fußzeile. Der Knopf allein („Einverstanden, ich schicke sie“) sagt nicht, worin eingewilligt wird.
  2. Sie muss die besondere Kategorie ausdrücklich benennen („auch Gesundheitsangaben“).
  3. Informiertheit nach Art. 4 Nr. 11, Art. 7 Abs. 3 S. 3 und ErwG 42: mindestens Identität des Verantwortlichen (der Vermittler, nicht performancegrowth), Zweck (Vorbereitung und Durchführung der Beratung), Hinweis auf jederzeitigen Widerruf vor Abgabe der Einwilligung, Empfänger bzw. Transportweg (WhatsApp/Meta mit möglichem US-Zugriff, Dienstleister). Alles Weitere per Link (Art. 13).
  4. Freiwilligkeit (Art. 7 Abs. 4, ErwG 43): Der Termin darf nicht davon abhängen. Eine echte Alternative („Lieber nicht“, „Ja, aber ohne KI“ oder der sichere Upload-Link) stärkt die Freiwilligkeit.
  5. Nachweis (Art. 7 Abs. 1): Zeitstempel, Wortlaut, Lead-ID ist richtig. Zusätzlich speichern: WhatsApp-Message-ID der Einwilligungsnachricht, Telefonnummer, Version des Textes, Name des Vermittlers, Link-Version der Datenschutzhinweise.
- **Fehler im geplanten Text:** „Sie erhält nur Herr Kannapinn.“ ist sachlich falsch, sofern Herr Kannapinn nicht selbst der beratende Vermittler ist: Verantwortlicher und Empfänger ist der jeweilige Vermittler, und Meta, 360dialog sowie performancegrowth (Hosting) verarbeiten die Daten ebenfalls. Eine falsche oder beschönigende Empfängerangabe kann die Einwilligung insgesamt unwirksam machen (fehlende Informiertheit). Außerdem überschreitet der Fußzeilentext nach meinem Kenntnisstand die WhatsApp-Grenze für Fußzeilen (60 Zeichen) und der Knopftext die Grenze für Antwortknöpfe (20 Zeichen); bitte in der Meta-Doku gegenprüfen (ohne Fundstelle).

**Umsetzen.** Einwilligungstext (a) unten verwenden (deckt seit der Zusatzfrage auch das KI-Auslesen ab), Vermittlername dynamisch einsetzen, Erklärung in den Haupttext, Knopf „Ich willige ein“. Datenminimierung (Art. 5 Abs. 1 lit. c): Im Anschreiben anbieten, bei Kranken, BU und Leben nur die Seite mit Tarif, Beitrag und Leistungen zu schicken und Gesundheitsangaben zu schwärzen, wenn der Lead sie nicht besprechen will.

---

## Prüffrage 2: WhatsApp für Gesundheitsdaten, Art. 32, Drittland, Rolle Meta, Speicherdauer

**Ergebnis.**
- **Haltung der Aufsicht:** Ein eigenes DSK-Papier zu WhatsApp und Gesundheitsdaten im Kundenkontakt wurde nicht gefunden. Die DSK hat für Messenger im Krankenhaus technische Mindestanforderungen formuliert (Whitepaper 2019, [Kopie LfDI MV](https://www.datenschutz-mv.de/static/DS/Dateien/Entschliessungen/Datenschutz/20191106_WP_%20Messenger_in_KrankenHaeusern.pdf) [Web]; Stellungnahme der DSK zu Messengern im Krankenhaus, [Kopie BayLfD](https://www.datenschutz-Bayern.de/dsbk-ent/DSK_101-SN-MessengerKH.pdf) [Web]). Darin wird WhatsApp bei geschäftlicher Nutzung als problematisch und nur bedingt geeignet bewertet (Inhalt laut Suchergebnis, Volltext nicht abgerufen). Laut einer Präsentation des Bayerischen Wirtschaftsministeriums hält das BayLDA WhatsApp im Kundenkontakt für zulässig, wenn der Kunde vor Kommunikationsbeginn auf die Datenschutzrisiken hingewiesen wurde ([StMWi Bayern, 14.9.2023](https://www.stmwi.bayern.de/fileadmin/user_upload/handel/Pr%C3%A4sentationen/2023-09-14-WhatsApp-for-Business.pdf) [Web], Sekundärquelle). Die LfD Niedersachsen gilt als besonders kritisch (nur Sekundärquelle, kein Link). Fazit: Die Aufsicht verbietet WhatsApp für Kundenkommunikation nicht pauschal, erwartet bei Gesundheitsdaten aber Risikohinweis, Einwilligung und starke Sicherungen; WhatsApp ist kein Kanal, den eine Behörde für Gesundheitsdaten empfiehlt.
- **Rolle Meta bei der Cloud API:** Meta beschreibt sich für die Cloud API als Auftragsverarbeiter des Unternehmens; Nachrichten im Ruhezustand sind verschlüsselt und werden nach 30 Tagen gelöscht; andere Teile von Meta haben laut Meta keinen Zugriff auf Inhalte ([Meta, Cloud API Data Privacy & Security](https://developers.facebook.com/documentation/business-messaging/whatsapp/data-privacy-and-security) [Web]). Vertraglich gelten die WhatsApp Business Data Processing Terms, soweit die Business Terms WhatsApp als Auftragsverarbeiter einordnen; Unterauftragnehmer sind andere Meta-Gesellschaften und Dritte ([WhatsApp Business Data Processing Terms](https://whatsapp.com/legal/business-data-processing-terms?l=bg) [Web]). Wichtig: Bei der Cloud API endet die Transportverschlüsselung bei Meta, Meta verarbeitet also den Klartext der Medien. Für Metadaten (wer schreibt wem wann) handelt Meta teilweise in eigener Verantwortung; das gehört in die Datenschutzhinweise.
- **Speicherdauer bei Meta:** Standard bis zu 30 Tage. Meta bietet eine Funktion „No Storage“ (Speicherung höchstens 1 Stunde, mit dem Hinweis, dass ein kleiner Teil der Nachrichten dann nicht zugestellt werden kann; [Meta, No Storage](https://developers.facebook.com/documentation/business-messaging/whatsapp/no-storage/) [Web]) und „Local Storage“ für die Speicherung ruhender Daten in einer gewählten Region ([Meta, Local Storage](https://developers.facebook.com/documentation/business-messaging/whatsapp/local-storage/) [Web]). Ob 360dialog beides für die eigenen Nummern freischaltet, ist bei 360dialog zu klären.
- **360dialog:** Berliner GmbH, eigene Auftragsverarbeitungsverträge für Partner und Kunden sowie Seiten zu Architektur, Unterauftragnehmern und Verarbeitungsorten ([360dialog Imprint and Data Privacy](https://docs.360dialog.com/partner/help-and-support/imprint-and-data-privacy), [360dialog Architecture and Security](https://docs.360dialog.com/docs/resources/architecture-and-security) [Web]). Die konkreten Hostingorte und die Unterauftragnehmerliste wurden in den Suchergebnissen nicht angezeigt und müssen aus dem DPA-PDF übernommen werden.
- **Drittland (Art. 44 ff.):** Meta Platforms, Inc. und WhatsApp LLC sind laut eigenen Erklärungen unter dem EU-US Data Privacy Framework zertifiziert ([WhatsApp DPF-Erklärung](https://www.whatsapp.com/legal/data-privacy-framework?lang=fr_FR), [Meta DPF-Erklärung](https://privacycenter.instagram.com/policies/data_privacy_framework) [Web]); WhatsApp Ireland übermittelt nach dem Business Data Transfer Addendum an WhatsApp LLC und Meta Platforms, Inc. ([Business Data Transfer Addendum, deutsch](https://www.whatsapp.com/legal/business-data-transfer-addendum?lang=de_DE) [Web]). Damit ist der Transfer nach Art. 45 DSGVO derzeit gedeckt. Den aktuellen Eintrag auf der offiziellen DPF-Liste des US-Handelsministeriums vor Livegang einmal selbst prüfen und als Screenshot ablegen (nicht per Tool bestätigt). Restrisiko: Fällt der DPF, braucht es SCC plus Transfer Impact Assessment; bis dahin wäre der Kanal für Art. 9-Daten auszusetzen.
- **Art. 32 Sicherheit:** Siehe Softwareänderungen. Kernpunkte: Mandantentrennung, Verschlüsselung ruhender Daten mit eigenem Schlüssel je Vermittler, kein öffentlicher Bucket und keine öffentlichen URLs, 2FA für Vermittler, Zugriffsprotokoll, keine Inhalte in Logs, Fehlertracking oder Push-Nachrichten, Malware-Prüfung der Uploads, Löschkonzept einschließlich Backups.

**Restrisiko:** mittel. Rechtlich tragfähig mit Einwilligung, DPF und AVV; das tatsächliche Risiko liegt im Klartextzugriff bei Meta, der 30-Tage-Speicherung und einem möglichen Wegfall des DPF. Mit Upload-Link für Kranken, BU und Leben (E1) sinkt es auf gering.

**Umsetzen.** Meta in der Einwilligung und den Datenschutzhinweisen nennen; „No Storage“ oder „Local Storage EU“ bei 360dialog anfragen und, wenn verfügbar, aktivieren; Medien sofort nach Abruf über die API bei Meta löschen, soweit die API das für eingehende Medien zulässt (bei 360dialog klären); Upload-Link als Alternative anbieten.

---

## Prüffrage 3: Art. 28 DSGVO, Inhalt der AVV

**Ergebnis.** Der bestehende AVV zwischen Vermittler und performancegrowth deckt die Verarbeitung von Gesundheitsdaten in aller Regel nicht ab (Art. 28 Abs. 3 S. 1 verlangt Art der Daten und Kategorien betroffener Personen). Eine Ergänzung ist vor Aktivierung je Vermittler nötig. Inhalt:
- Gegenstand und Zweck: Anforderung, Empfang, verschlüsselte Ablage und Bereitstellung von Versicherungsunterlagen zur Vorbereitung der Beratung; automatisches Auslesen festgelegter Vertragsfelder durch einen KI-Dienst nur bei entsprechender Einwilligung (siehe Abschnitt „KI-Auslesen“), keine Ausgabe oder Speicherung von Gesundheitsangaben, kein Training, keine Weitergabe an Versicherer.
- Datenarten: besondere Kategorien nach Art. 9 (Gesundheitsangaben in Policen), Vertrags- und Bestandsdaten, Kommunikationsdaten. Betroffene: Leads und Mitversicherte (Ehepartner, Kinder in Familienpolicen).
- Weisung: Verarbeitung nur nach dokumentierter Einwilligung des Leads; ohne Einwilligung keine Ablage.
- Unterauftragnehmer (Art. 28 Abs. 2, 4) mit Name, Sitz, Leistung, Ort, Transfergrundlage: 360dialog GmbH (Berlin), WhatsApp Ireland Ltd. mit Meta Platforms, Inc. und WhatsApp LLC (USA, DPF), Hosting und Speicher (konkret benennen, Region EU). Änderungsverfahren mit Widerspruchsrecht.
- Hinweis: Wer Vertragspartner von Meta ist (WABA-Inhaber Vermittler oder performancegrowth), entscheidet, ob Meta Unterauftragnehmer von performancegrowth oder direkter Auftragsverarbeiter des Vermittlers ist. Das muss in der AVV korrekt abgebildet werden.
- TOMs (Art. 32) als Anlage, speziell für diesen Datenbestand.
- Löschung: 90 Tage nach Termin, bei Absage oder Nichterscheinen 90 Tage nach dem geplanten Termin; sofort bei Widerruf; Backups spätestens nach Ablauf des Backupzyklus; Löschbestätigung auf Anfrage. Exportfunktion für den Vermittler vor Löschung, danach liegt die Aufbewahrung in seiner eigenen Verantwortung.
- Unterstützung bei Betroffenenrechten, Meldung von Datenpannen ohne schuldhaftes Zögern (Ziel 24 Stunden), Unterstützung bei der DSFA (Art. 28 Abs. 3 lit. f).
- § 203 StGB: Verpflichtung zur Verschwiegenheit, Weitergabe der Pflicht an Unterauftragnehmer in Textform (§ 203 Abs. 4 S. 2 Nr. 2).
- Ausschluss eigener Zwecke: Policen-Inhalte sind von Statistik- und Benchmark-Auswertungen ausgeschlossen (Bezug zu `docs/strategie/benchmark-klausel-entwurf.md`).

**Umsetzen.** Text (b) unten als Anlage; Zustimmung je Vermittler im Admin einholen, Funktion erst danach freischalten.

---

## Prüffrage 4: Art. 35 DSGVO, Datenschutz-Folgenabschätzung

**Ergebnis.** Art. 35 Abs. 3 lit. b verlangt eine DSFA bei umfangreicher Verarbeitung besonderer Kategorien. Ein einzelner Vermittler verarbeitet für sich betrachtet wohl nicht „umfangreich“ (vgl. den Gedanken aus ErwG 91 zum einzelnen Arzt). Es kommen aber mehrere Risikokriterien zusammen: Gesundheitsdaten, Berufsgeheimnis nach § 203 StGB, Messenger eines Drittanbieters mit Drittlandbezug, systematische Anforderung durch einen automatisierten Assistenten über viele Leads. Die Landeslisten nach Art. 35 Abs. 4 enthalten Fälle der umfangreichen Verarbeitung von Daten, die einem Berufsgeheimnis unterliegen, und von Gesundheitsdaten (z. B. [DSFA-Muss-Liste nicht öffentlicher Bereich, HmbBfDI, Stand 17.10.2018](https://datenschutz-hamburg.de/fileadmin/user_upload/HmbBfDI/Datenschutz/Informationen/DSFA_Muss-Liste_fuer_den_nicht-oeffentlicher_Bereich_-_Stand_17.10.2018.pdf) [Web]; die genaue Nummer des Eintrags und die aktuelle Fassung habe ich nicht verifiziert). Methodik nach DSK-Kurzpapier Nr. 5 ([Kopie LfD Niedersachsen](https://lfd.niedersachsen.de/download/120917) [Web]).

**Empfehlung:** DSFA durchführen. Formal ist der Vermittler als Verantwortlicher zuständig; praktisch erstellt performancegrowth eine Muster-DSFA für die Plattform (die eigentlich „umfangreich“ ist), die der Vermittler übernimmt und unterschreibt. Kurzfassung siehe Text (e).

---

## Prüffrage 5: § 203 StGB

**Ergebnis.**
- **Vertreter:** § 203 Abs. 1 Nr. 7 StGB erfasst Angehörige eines Unternehmens der privaten Kranken-, Unfall- oder Lebensversicherung ([§ 203 StGB, gesetze-im-internet.de](https://www.gesetze-im-internet.de/stgb/__203.html) [Web]). Der BGH hat entschieden, dass auch ein selbständiger Versicherungsvertreter dazu gehört (BGH, Urteil vom 10.2.2010, VIII ZR 53/09, damals Nr. 6, [rewis](https://rewis.io/urteile/urteil/7sw-09-02-2010-viii-zr-5309/); Besprechung [Betriebs-Berater](https://betriebs-berater.ruw.de/wirtschaftsrecht/urteile/Selbststaendiger-Versicherungsvertreter-ist-der-Geheimhaltung-unterworfen-20088) [Web]). Allianz-Vertreter, die (auch) für Kranken- oder Lebensversicherer vermitteln, sind daher Berufsgeheimnisträger, und zwar für alle Geheimnisse, die ihnen in dieser Eigenschaft anvertraut werden. Policen mit Gesundheitsangaben sind solche Geheimnisse.
- **Makler:** Nach überwiegender Ansicht keine „Angehörigen“ eines Versicherers, weil sie auf Kundenseite stehen ([Dr. Datenschutz zu Maklern](https://www.dr-datenschutz.de/geheimhaltungspflicht-nach-stgb-fuer-selbstaendige-versicherungsmakler/) [Web]; nicht abschließend geklärt). Für die Software sollte das keine Rolle spielen: einheitlich so behandeln, als gelte § 203.
- **performancegrowth als mitwirkende Person:** Nach § 203 Abs. 3 S. 2 darf der Geheimnisträger Geheimnisse an mitwirkende Personen offenbaren, soweit das für deren Tätigkeit erforderlich ist (IT-Dienstleister sind der Hauptfall). Nach § 203 Abs. 4 S. 2 Nr. 1 macht sich der Vermittler strafbar, wenn er nicht dafür sorgt, dass die mitwirkende Person zur Geheimhaltung verpflichtet wurde; nach Abs. 4 S. 2 Nr. 2 gilt dasselbe für performancegrowth, wenn es selbst weitere mitwirkende Personen (Mitarbeiter, Hoster, 360dialog) einsetzt, ohne sie zu verpflichten. Mitarbeiter und Dienstleister von performancegrowth sind nach § 203 Abs. 4 S. 1 selbst strafbar, wenn sie offenbaren.
- **Meta und 360dialog:** Eine § 203-Verpflichtung wird Meta nicht unterschreiben. Abhilfe: Die Einwilligung des Leads muss die Übermittlung über WhatsApp/Meta und an die Dienstleister ausdrücklich umfassen; dann ist das Offenbaren insoweit befugt. Das ist ein weiterer Grund, warum Meta im Einwilligungstext stehen muss. 360dialog sollte trotzdem um eine Verschwiegenheitsverpflichtung gebeten werden (deren DPA enthält meist eine Vertraulichkeitsklausel; ob sie § 203 genügt, ist zu prüfen).

**Umsetzen.** (1) performancegrowth verpflichtet alle Mitarbeiter und Freelancer mit möglichem Zugriff in Textform (Text d). (2) AVV-Ergänzung enthält die Zusicherung gegenüber dem Vermittler. (3) Unterauftragnehmer mit Zugriff (Hosting, Speicher, 360dialog) in Textform verpflichten oder vertraglich gleichwertig binden. (4) Einwilligungstext nennt WhatsApp/Meta und Dienstleister.

---

## Prüffrage 6: Versicherungsvermittlungsrecht (VVG, GewO, VersVermV, § 213 VVG)

**Ergebnis.**
- **§ 61 VVG** (Befragung nach Wünschen und Bedürfnissen, Beratung, Dokumentation) und beim Makler § 60 VVG (Marktauswahl): Die Anforderung bestehender Policen dient der Bedarfsermittlung und ist sachlich gerechtfertigt; eine Pflicht, Policen gerade per WhatsApp einzusammeln, besteht nicht. Die Beratungsdokumentation (§§ 61, 62 VVG) bleibt Sache des Vermittlers und darf nicht von der 90-Tage-Löschung der Policen-Kopien abhängen. Normtexte nicht per Tool abgerufen.
- **§ 6 VVG** betrifft Beratungspflichten des Versicherers; für die Plattform nicht unmittelbar relevant.
- **§ 34d GewO, VersVermV:** performancegrowth vermittelt nicht und berät nicht zu Produkten; das bleibt so, solange der Assistent keine Produktempfehlungen gibt und keine abschlussabhängige Vergütung erhält. Die Erstinformation nach VersVermV (Status, Registernummer, Beschwerdestellen) muss der Vermittler beim ersten Geschäftskontakt geben; der Datenschutzhinweis-Link kann mit einem Link auf die Erstinformation kombiniert werden. Normtexte nicht per Tool abgerufen.
- **§ 213 VVG** regelt die Erhebung von Gesundheitsdaten durch den **Versicherer** bei Dritten (Ärzte, Krankenhäuser, andere Versicherer) ([§ 213 VVG, gesetze-im-internet.de](https://www.gesetze-im-internet.de/vvg_2008/__213.html) [Web]). Er greift hier nicht, weil der Vermittler beim Betroffenen selbst erhebt. Er wird relevant, sobald Unterlagen an einen Versicherer weitergegeben werden: Das darf die Software nicht automatisch tun; Weitergabe an Versicherer nur durch den Vermittler mit eigener Rechtsgrundlage (Antrag, GDV-Mustererklärung zur Schweigepflichtentbindung). Der GDV-Code of Conduct sieht für Gesundheitsdaten Mustererklärungen vor ([Hinweis R+V auf den Code of Conduct](https://www.ruv.de/datenschutz/codeofconduct) [Web]).

**Umsetzen.** Kein Weiterleiten an Versicherer aus der Software; Hinweis im Vermittler-Admin, dass die Policen-Ablage keine Beratungsdokumentation ersetzt; Link auf Erstinformation in der ersten Nachricht, falls noch nicht erfolgt.

---

## Prüffrage 7: § 7 UWG, Erinnerungen an das Schicken der Policen

**Ergebnis.** § 7 Abs. 2 Nr. 2 UWG verlangt für Werbung per elektronischer Post (dazu gehört WhatsApp) eine vorherige ausdrückliche Einwilligung ([§ 7 UWG, gesetze-im-internet.de](https://www.gesetze-im-internet.de/uwg_2004/__7.html) [LDH]). Der Werbebegriff ist weit: Der BGH hat selbst eine Kundenzufriedenheitsanfrage in einer Rechnungs-E-Mail als Werbung angesehen, weil sie mittelbar dem Absatz dient (BGH, Urteil vom 10.7.2018, VI ZR 225/17, [dejure](https://dejure.org/2018,28246) [Web]). Erinnerungen, die Policen für eine Beratung mit Abschlussziel anfordern, dienen ebenfalls mittelbar dem Absatz; sie als reine Vertragsabwicklung einzuordnen, ist vertretbar (der Lead hat den Termin selbst gebucht), aber nicht sicher. Nach dem BGH hilft auch nicht, dass die Nachricht mit einer zulässigen Servicenachricht (Terminbestätigung) verbunden ist.

**Empfehlung:** Nicht auf die Einordnung als Nicht-Werbung verlassen, sondern bei der Terminbuchung eine ausdrückliche, nicht vorausgewählte Einwilligung in WhatsApp-Nachrichten zur Terminvorbereitung einholen (Checkbox oder WhatsApp-Opt-in, protokolliert). Dann sind höchstens 2 Erinnerungen unproblematisch, wenn sie (1) sachlich bleiben (keine Produktwerbung, keine Angebote), (2) nur bis zum Termin laufen und bei Absage sofort stoppen, (3) jede Nachricht eine einfache Abmeldung nennt („STOP“), (4) nach Ablehnung („Lieber nicht“) keine Erinnerung mehr kommt. Das entspricht auch den Opt-in-Regeln von Meta für vom Unternehmen gestartete Nachrichten außerhalb des 24-Stunden-Fensters (ohne Fundstelle).

---

## Prüffrage 8: Art. 13 DSGVO

**Ergebnis.** Der Vermittler muss bei der Erhebung informieren (Art. 13 Abs. 1, 2). Die Einwilligungsnachricht enthält nur das Nötigste; der Rest steht auf einer verlinkten Seite je Vermittler. Text (c) unten.

---

## KI-Auslesen (Zusatzfrage 9)

**Ampel: GELB.** Sach (Haftpflicht, Hausrat, Kfz): grün, sobald Einwilligungstext (a), AVV § 1a/§ 4 und Datenschutzhinweis (c) aktiv sind. Kranken, BU, Leben: gelb, also erst nach schriftlichem Nachweis der Null-Speicherung beim KI-Anbieter und mit Spartenschalter K2; bis dahin diese Sparten nicht auslesen. Morgen live gehen heißt daher: KI-Auslesen höchstens für Sach.

**Art. 9 Abs. 2 lit. a: Muss die Einwilligung das automatische Auslesen nennen?** Ja. Auch wenn das Ausgabeschema keine Gesundheitsfelder hat, verarbeitet der KI-Dienst das ganze Dokument mitsamt Gesundheitsangaben (Erheben, Auslesen und Abfragen sind Verarbeitung nach Art. 4 Nr. 2). Der Zweck (Terminvorbereitung) bleibt zwar gleich, aber es kommt ein neuer Empfänger hinzu, und die bisher geplante Zusage „keine KI“ würde sonst falsch. Einwilligung muss informiert sein (Art. 4 Nr. 11, ErwG 42) und für Art. 9 ausdrücklich ([Art. 9 DSGVO](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679) [LDH]; [EDSA-Leitlinien 05/2020](https://edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_en) [Web]). Darum nennt Text (a) das KI-Auslesen und den KI-Dienst ausdrücklich und bietet mit „Ja, aber ohne KI“ eine Ablehnung nur des KI-Teils (Granularität, ErwG 32 und 43). Einwilligungen nach dem alten Text decken kein KI-Auslesen.

**Art. 22 DSGVO:** Greift nicht. Das Auslesen bereitet die Beratung vor; es gibt keine Entscheidung mit rechtlicher Wirkung oder ähnlich erheblicher Beeinträchtigung, und der Vermittler prüft die Werte (K6). Wichtig bleibt die Richtigkeit (Art. 5 Abs. 1 lit. d): Die DSK weist in ihrer Orientierungshilfe darauf hin, dass unzutreffende KI-Ausgaben zu unzulässigen Verarbeitungen führen können ([DSK, OH KI und Datenschutz, Mai 2024, Kopie BayLfD](https://www.datenschutz-bayern.de/dsbk-ent/DSK_OH_KI_und_Datenschutz.pdf) [Web], Inhalt laut Suchergebnis).

**Art. 28 Abs. 2 und 4 (Unterauftragnehmer):** Der KI-Anbieter ist weiterer Unterauftragnehmer. Nötig: vorherige Genehmigung durch den Vermittler (AVV § 4 Nr. 4 mit Namen und Ort, bei allgemeiner Genehmigung Ankündigung mit Widerspruchsrecht), Weitergabe derselben Pflichten (DPA des Anbieters prüfen: Weisungsbindung, kein Training, Löschung, Unterstützung, Audit). Stand der Anbieter laut Suche:
- **Azure OpenAI, EU Data Zone:** Verarbeitung und etwaige menschliche Prüfung im EWR (Microsoft-Q&A, Sekundärquelle). Standardmäßig kann die Missbrauchsüberwachung Eingaben speichern (Angaben zur Dauer uneinheitlich, oft 30 Tage genannt); Null-Speicherung gibt es nur über ein genehmigtes „modified abuse monitoring“ je Ressource auf Antrag ([Microsoft Q&A zu ZDR bei Data Zone](https://learn.microsoft.com/en-us/answers/questions/5625475/zero-data-retention-on-azure-open-ai-datazone-llm), [Microsoft Q&A zur Aktivierung](https://learn.microsoft.com/en-us/answers/questions/5834904/enable-zero-data-retention) [Web]). Ohne Genehmigung ist die Zusage „ohne Speicherung beim Anbieter“ nicht erfüllt.
- **OpenAI mit EU-Datenresidenz:** Laut OpenAI werden API-Anfragen aus EU-Projekten in der Region mit Zero Data Retention verarbeitet; Residenz nur für neue Projekte wählbar; Berechtigung nicht eindeutig dokumentiert ([OpenAI, Introducing data residency in Europe](https://openai.com/index/introducing-data-residency-in-europe/) [Web]; offene Frage im [OpenAI-Forum](https://community.openai.com/t/how-can-an-api-customer-become-eligible-for-eu-data-residency/1381888) [Web]).
- In beiden Fällen ist die Konzernmutter ein US-Unternehmen; ein Zugriff nach US-Recht ist nicht ausgeschlossen. DPF-Zertifizierung von Microsoft und OpenAI vor Vertragsschluss auf der offiziellen DPF-Liste prüfen (nicht per Tool bestätigt).
- **§ 203 StGB:** Auch der KI-Anbieter ist weitere mitwirkende Person (§ 203 Abs. 3 S. 2, Abs. 4 S. 2 Nr. 2, [§ 203 StGB](https://www.gesetze-im-internet.de/stgb/__203.html) [Web]). Verschwiegenheitsverpflichtung in Textform anfragen; zusätzlich deckt die Einwilligung (a) die Weitergabe ab.

**KI-Verordnung:** Für den Assistenten selbst gilt Art. 50 Abs. 1 (Hinweis, dass man mit einer KI kommuniziert, wenn das nicht offensichtlich ist); laut Fachquellen gelten die Transparenzpflichten seit dem 2.8.2026, ohne allgemeine Übergangsfrist für Chatbots ([CMS, Transparenzpflichten der KI-VO](https://cms.law/de/deu/legal-updates/deepfakes-chatbots-co.-die-neuen-transparenzpflichten-der-ki-vo), [IHK Schleswig-Holstein](https://www.ihk.de/sh/ki-kennzeichnung) [Web]; Stand eines „Digital-Omnibus“ nicht verifiziert). Das Auslesen selbst interagiert nicht mit dem Lead und erzeugt keine veröffentlichten Inhalte; eine eigene Kennzeichnungspflicht nach Art. 50 sehe ich dafür nicht, die Transparenz läuft über DSGVO-Information und die Kennzeichnung im CRM (K6). Kein Hochrisikosystem, solange keine Risikobewertung oder Preisbildung für Lebens- oder Krankenversicherung erfolgt (K8). Pflicht zur KI-Kompetenz (Art. 4 KI-VO) für performancegrowth und die Vermittler mitdenken (ohne Fundstelle). Prüfpunkt im Rechercheplan: Nr. 8 der Queue.

**Art. 5 Abs. 1 lit. c (Datenminimierung):** Das Schema ohne Gesundheitsfelder ist richtig, reicht aber allein nicht, weil das Eingabedokument die Angaben enthält. Zusätzlich: nur benötigte Seiten senden (z. B. Versicherungsschein, Beitragsseite), Freitext ausschließen, Ausgabefilter (K4), keine Speicherung von Prompts und Rohantworten (K5), ZDR beim Anbieter, KI-Ablehnung möglich. Eine noch stärkere Variante wäre eine Schwärzung vor dem Senden (eigene EU-OCR ohne Drittanbieter plus Regelfilter); das ist aufwendig und für den Start nicht zwingend.

**Was zusätzlich umgesetzt werden muss:** K1 bis K8 (Softwareliste), AVV § 1a und § 4 Nr. 4, Datenschutzhinweis (c) mit KI-Absatz, DSFA R8 bis R10, Einwilligungstext (a) neue Fassung.

---

## Fertige Texte

### (a) Einwilligungstext für den Chat

Interaktive Nachricht, Haupttext (Platzhalter in geschweiften Klammern dynamisch füllen):

> Ich willige ein, dass {Vorname Nachname des Vermittlers} ({Firma}) meine hier gesendeten Policen zur Vorbereitung unseres Termins speichert und die Vertragsdaten automatisch per KI auslesen lässt, auch wenn sie Gesundheitsangaben enthalten (etwa Kranken-, BU- oder Lebensversicherung). Beteiligt sind WhatsApp (Meta, Zugriff auch aus den USA möglich), der Dienstleister performancegrowth und ein KI-Dienst mit Verarbeitung in der EU; Widerruf jederzeit mit „Widerruf“, Infos: {Link Datenschutzhinweise}

Knöpfe (WhatsApp erlaubt höchstens 3 Antwortknöpfe mit je höchstens 20 Zeichen):
- „Ich willige ein“ (Speichern und KI-Auslesen)
- „Ja, aber ohne KI“ (nur Speichern; Einwilligungsprotokoll mit Kennzeichen `ki=false`, Auslesen unterbleibt)
- „Lieber nicht“

Den sicheren Upload-Link (E1) in der Folgenachricht oder bei „Lieber nicht“ anbieten, da die Knopfzahl begrenzt ist.

Solange KI-Auslesen für Kranken, BU und Leben noch nicht freigegeben ist (siehe Abschnitt „KI-Auslesen“), bleibt der Text trotzdem korrekt, weil er nur erlaubt und nicht verspricht; die Software liest diese Sparten dann einfach nicht aus. Alte Einwilligungen ohne KI-Hinweis decken kein KI-Auslesen: dafür neu fragen oder nicht auslesen.

Fußzeile (optional, höchstens 60 Zeichen): „Ihr Termin findet auch ohne Unterlagen statt.“

Folgenachricht nach Klick auf „Ich willige ein“: „Danke! Schicken Sie die Policen gern als Foto oder PDF. Seiten mit Gesundheitsangaben können Sie schwärzen, wenn Sie sie nicht besprechen möchten.“

### (b) AVV-Ergänzung

> **Anlage „Versicherungsunterlagen über WhatsApp“ zum Auftragsverarbeitungsvertrag zwischen {Vermittler} (Verantwortlicher) und Ole Kannapinn UG (haftungsbeschränkt), performancegrowth (Auftragsverarbeiter)**
>
> **§ 1 Gegenstand.** Der Auftragsverarbeiter fordert im Auftrag des Verantwortlichen bei Interessenten mit gebuchtem Beratungstermin über den WhatsApp-Assistenten Kopien bestehender Versicherungsunterlagen an, empfängt sie, legt sie verschlüsselt ab und stellt sie ausschließlich dem Verantwortlichen bereit. Eine Weitergabe an Versicherer oder Dritte findet nicht statt.
>
> **§ 1a KI-Auslesen.** Hat der Interessent auch in das automatische Auslesen eingewilligt, übermittelt der Auftragsverarbeiter die Unterlagen an den in § 4 genannten KI-Dienst, um ausschließlich folgende Vertragsfelder zu erfassen: Versicherer, Sparte, Tarif, Vertragsnummer, Beitrag, Zahlweise, Beginn, Ablauf, Kündigungsfrist, Deckungs- und Versicherungssummen, Selbstbeteiligung, Schadenfreiheitsklasse und vergleichbare Vertragsdaten. Gesundheitsangaben (insbesondere Risikozuschläge, Leistungsausschlüsse, Diagnosen) werden nicht ausgegeben und nicht gespeichert; das Ausgabeschema enthält dafür keine Felder, Freitextfelder sind ausgeschlossen. Anfragen und Antworten werden beim KI-Dienst nicht gespeichert (Null-Speicherung) und nicht zum Training verwendet; Verarbeitung ausschließlich in der EU. Die ausgelesenen Felder sind als maschinell erfasst gekennzeichnet und werden vom Verantwortlichen vor Verwendung geprüft; eine automatisierte Entscheidung im Sinne von Art. 22 DSGVO findet nicht statt. Für Sparten, für die die Null-Speicherung nicht schriftlich bestätigt ist, unterbleibt das Auslesen.
>
> **§ 2 Daten und Betroffene.** Versicherungsscheine, Nachträge und Bedingungen einschließlich darin enthaltener Gesundheitsdaten im Sinne von Art. 9 Abs. 1 DSGVO (z. B. Risikozuschläge, Leistungsausschlüsse); Vertrags-, Bestands- und Kommunikationsdaten. Betroffene: Interessenten und in deren Verträgen genannte Personen.
>
> **§ 3 Weisung zur Einwilligung.** Der Auftragsverarbeiter speichert Unterlagen nur, wenn eine ausdrückliche Einwilligung des Interessenten nach Art. 9 Abs. 2 lit. a DSGVO im vom Verantwortlichen freigegebenen Wortlaut vorliegt und mit Zeitpunkt, Wortlaut, Version, Nachrichtenkennung und Interessenten-ID protokolliert ist. Ohne Einwilligung werden eingehende Unterlagen nicht gespeichert und, soweit technisch möglich, beim Unterauftragnehmer gelöscht. Bei Widerruf werden die Unterlagen unverzüglich gelöscht und der Verantwortliche informiert.
>
> **§ 4 Unterauftragnehmer.** Der Verantwortliche genehmigt: (1) 360dialog GmbH, Berlin (Zugang zur WhatsApp Business Platform); (2) WhatsApp Ireland Ltd., Dublin, mit Meta Platforms, Inc. und WhatsApp LLC, USA (Nachrichtenübermittlung, Zwischenspeicherung von Medien bis zu 30 Tage, Übermittlung in die USA auf Grundlage des EU-US Data Privacy Framework); (3) {Hosting-Anbieter, Sitz, Rechenzentrumsregion EU} (Speicherung); (4) {KI-Anbieter, z. B. Microsoft Ireland Operations Ltd. (Azure OpenAI, EU Data Zone) oder OpenAI Ireland Ltd. (API-Projekt mit EU-Datenresidenz)} (Auslesen von Vertragsfeldern nach § 1a, Verarbeitung in der EU, Null-Speicherung; Konzernmutter in den USA, Transfergrundlage {DPF/SCC} für etwaige Zugriffe). Der Auftragsverarbeiter erlegt jedem Unterauftragnehmer vertraglich dieselben Datenschutzpflichten auf (Art. 28 Abs. 4 DSGVO). Änderungen zeigt der Auftragsverarbeiter mindestens 30 Tage vorher in Textform an; der Verantwortliche kann widersprechen. Fällt die Angemessenheitsgrundlage für die USA weg, setzt der Auftragsverarbeiter die Funktion für Gesundheitsdaten aus, bis eine neue Grundlage besteht.
>
> **§ 5 Technische und organisatorische Maßnahmen.** Ergänzend zur Anlage TOM: Verschlüsselung ruhender Daten mit mandantenbezogenem Schlüssel; Speicherung ausschließlich in der EU; kein öffentlicher Abruf; Zugriff nur für Nutzer des Verantwortlichen mit Zwei-Faktor-Anmeldung; Zugriff von Personal des Auftragsverarbeiters nur im dokumentierten Notfall mit Protokoll und Benachrichtigung des Verantwortlichen; Protokollierung jedes Zugriffs (wer, wann, welche Datei), Aufbewahrung der Protokolle 12 Monate; keine Inhalte in Anwendungs- und Fehlerprotokollen; Schadsoftwareprüfung eingehender Dateien.
>
> **§ 6 Löschung.** Unterlagen werden 90 Tage nach dem Termin gelöscht; ist der Termin abgesagt oder nicht wahrgenommen worden, 90 Tage nach dem geplanten Termin. Der Verantwortliche kann vorher exportieren; danach liegt die Aufbewahrung in seiner Verantwortung. Datensicherungen werden spätestens mit Ablauf des Sicherungszyklus von {x} Tagen überschrieben. Medien beim Unterauftragnehmer Meta werden nach Abruf gelöscht, soweit die Schnittstelle dies zulässt, sonst nach dessen Fristen.
>
> **§ 7 Verschwiegenheit nach § 203 StGB.** Der Auftragsverarbeiter ist mitwirkende Person im Sinne von § 203 Abs. 3 StGB. Er ist zur Verschwiegenheit verpflichtet, verschafft sich Kenntnis von fremden Geheimnissen nur, soweit dies zur Vertragserfüllung erforderlich ist, hat alle Beschäftigten und Unterauftragnehmer mit möglichem Zugriff in Textform zur Verschwiegenheit verpflichtet und über die Strafbarkeit nach § 203 Abs. 4 StGB belehrt und weist dies auf Anforderung nach.
>
> **§ 8 Unterstützung.** Der Auftragsverarbeiter unterstützt bei Betroffenenanfragen, meldet Verletzungen des Schutzes dieser Daten ohne schuldhaftes Zögern, möglichst binnen 24 Stunden, und stellt eine Muster-Datenschutz-Folgenabschätzung bereit.
>
> **§ 9 Keine eigenen Zwecke.** Unterlagen und ausgelesene Felder nach dieser Anlage sind von jeder Auswertung für eigene Zwecke des Auftragsverarbeiters ausgeschlossen, auch in anonymisierter oder aggregierter Form, und werden nicht zum Training oder zur Verbesserung von KI-Modellen verwendet.

### (c) Absatz Datenschutzerklärung (Datenschutzhinweise des Vermittlers, Art. 13 DSGVO)

> **Versicherungsunterlagen über WhatsApp**
>
> Verantwortlich: {Vermittler, Anschrift, E-Mail, Telefon}{, Datenschutzbeauftragter: …, falls vorhanden}.
>
> Zur Vorbereitung Ihres Beratungstermins bitten wir Sie, Kopien Ihrer bestehenden Versicherungsverträge zu schicken. Diese können Gesundheitsangaben enthalten, etwa Risikozuschläge oder Leistungsausschlüsse in Kranken-, Berufsunfähigkeits- oder Lebensversicherungen. Wir verarbeiten die Unterlagen nur mit Ihrer ausdrücklichen Einwilligung (Art. 6 Abs. 1 lit. a und Art. 9 Abs. 2 lit. a DSGVO), und nur, um Ihren bestehenden Versicherungsschutz zu verstehen und Sie im Termin zu beraten. Wenn Sie zustimmen, lassen wir die wichtigsten Vertragsdaten (z. B. Versicherer, Tarif, Beitrag, Laufzeit, Kündigungsfrist, Versicherungssummen, Selbstbeteiligung) automatisch durch einen KI-Dienst auslesen, damit wir Ihre Verträge vergleichen können. Gesundheitsangaben werden dabei nicht erfasst oder gespeichert. Der KI-Dienst {Anbieter} verarbeitet die Unterlagen als unser Auftragsverarbeiter ausschließlich in der EU, speichert sie nicht und nutzt sie nicht zum Training. Die ausgelesenen Daten prüfen wir selbst; eine automatisierte Entscheidung über Sie findet nicht statt. Sie können das Auslesen ablehnen („Ja, aber ohne KI“) und die Unterlagen trotzdem schicken. An Versicherer geben wir die Unterlagen nicht ohne Ihre gesonderte Zustimmung weiter.
>
> Empfänger: Die Unterlagen werden technisch von der Ole Kannapinn UG (haftungsbeschränkt), performancegrowth, {Anschrift}, als unserem Auftragsverarbeiter gespeichert, verschlüsselt in der EU. Die Übertragung erfolgt über WhatsApp: Dabei sind die 360dialog GmbH, Berlin, und WhatsApp Ireland Ltd. als Auftragsverarbeiter beteiligt. WhatsApp kann die Inhalte bis zu 30 Tage zwischenspeichern und Daten an Meta Platforms, Inc. und WhatsApp LLC in den USA übermitteln; Grundlage ist der Angemessenheitsbeschluss zum EU-US Data Privacy Framework (Art. 45 DSGVO), unter dem diese Unternehmen zertifiziert sind. Verbindungsdaten wie Telefonnummer und Zeitpunkte verarbeitet WhatsApp teilweise in eigener Verantwortung; dazu gelten die Datenschutzhinweise von WhatsApp. Wenn Sie WhatsApp nicht nutzen möchten, können Sie die Unterlagen über einen sicheren Upload-Link schicken oder in den Termin mitbringen.
>
> Speicherdauer: Wir löschen die Unterlagen 90 Tage nach Ihrem Termin (bei Absage 90 Tage nach dem geplanten Termin), sofort, wenn Sie Ihre Einwilligung widerrufen.
>
> Ihre Rechte: Sie können Ihre Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen, am einfachsten mit der Nachricht „Widerruf“ im Chat oder per E-Mail an {E-Mail}. Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Beschwerde bei einer Datenschutz-Aufsichtsbehörde, etwa {zuständige Landesbehörde}. Die Bereitstellung ist freiwillig; Ihr Termin findet auch ohne Unterlagen statt.

### (d) Verpflichtungserklärung nach § 203 StGB (für Mitarbeiter, Freelancer, Dienstleister von performancegrowth)

> **Verpflichtung zur Verschwiegenheit nach § 203 StGB**
>
> Ich, {Name}, bin für die Ole Kannapinn UG (haftungsbeschränkt), performancegrowth, als {Funktion / Dienstleister} tätig. performancegrowth wirkt an der beruflichen Tätigkeit von Versicherungsvermittlern mit, die als Angehörige eines Unternehmens der privaten Kranken-, Unfall- oder Lebensversicherung der Schweigepflicht nach § 203 Abs. 1 Nr. 7 StGB unterliegen können.
>
> 1. Ich verpflichte mich, über alle fremden Geheimnisse, insbesondere zum persönlichen Lebensbereich gehörende Geheimnisse wie Gesundheitsangaben, Versicherungsverhältnisse und Vermögensverhältnisse von Kunden und Interessenten der Vermittler, die mir bei meiner Tätigkeit bekannt werden, Verschwiegenheit zu wahren. Das gilt auch nach Ende meiner Tätigkeit.
> 2. Ich verschaffe mir Kenntnis von solchen Geheimnissen nur, soweit das für meine Aufgabe zwingend erforderlich ist, und nur auf den dafür vorgesehenen, protokollierten Wegen.
> 3. Ich setze weitere Personen nur mit vorheriger Zustimmung von performancegrowth ein und nur, wenn diese zuvor in Textform zur Verschwiegenheit verpflichtet wurden.
> 4. Ich wurde darüber belehrt, dass ich mich nach § 203 Abs. 4 S. 1 StGB strafbar mache, wenn ich ein fremdes Geheimnis unbefugt offenbare, das mir bei der Ausübung oder bei Gelegenheit meiner Tätigkeit als mitwirkende Person bekannt geworden ist (Freiheitsstrafe bis zu einem Jahr oder Geldstrafe, bei Handeln gegen Entgelt oder in Bereicherungs- oder Schädigungsabsicht nach § 203 Abs. 6 StGB bis zu zwei Jahren), und dass dies auch gilt, wenn ich weitere Personen einsetze, ohne sie zu verpflichten (§ 203 Abs. 4 S. 2 Nr. 2 StGB).
> 5. Datenschutzrechtliche Pflichten (Art. 28 Abs. 3 lit. b, Art. 29, Art. 32 Abs. 4 DSGVO) bleiben unberührt.
>
> {Ort, Datum} {Unterschrift oder Bestätigung in Textform}

Hinweis: Strafrahmen bitte von der Anwältin am aktuellen Normtext gegenprüfen lassen ([§ 203 StGB](https://www.gesetze-im-internet.de/stgb/__203.html) [Web], laut Suchergebnis zuletzt 2026 geändert).

### (e) DSFA-Kurzfassung (Muster für den Vermittler)

1. **Beschreibung:** Anforderung, Empfang und verschlüsselte Ablage von Policen (auch Kranken, BU, Leben) per WhatsApp Cloud API (360dialog, Meta) zur Terminvorbereitung; Verantwortlicher Vermittler, Auftragsverarbeiter performancegrowth; Betroffene Leads und Mitversicherte; Speicherdauer 90 Tage nach Termin; optional KI-Auslesen festgelegter Vertragsfelder über einen EU-KI-Dienst mit Null-Speicherung, ohne Gesundheitsfelder, mit Prüfung durch den Vermittler.
2. **Notwendigkeit und Verhältnismäßigkeit:** Zweck legitim (Bedarfsermittlung nach § 61 VVG); Rechtsgrundlage Art. 9 Abs. 2 lit. a; Datenminimierung durch Schwärzungshinweis und Alternative Upload/Mitbringen; Freiwilligkeit, Termin unabhängig; Widerruf per Stichwort; Information nach Art. 13.
3. **Risiken:**
   - R1 Kenntnisnahme durch Meta oder US-Behörden (Klartext bei Meta, 30 Tage, USA). Eintritt: möglich; Schwere: hoch.
   - R2 Unbefugter Zugriff auf die Ablage (Kontoübernahme Vermittler, Fehlkonfiguration Speicher, Personal performancegrowth). Eintritt: gering bis möglich; Schwere: hoch.
   - R3 Fehlversand (falscher Chat, falscher Mandant). Eintritt: gering; Schwere: hoch.
   - R4 Speicherung ohne wirksame Einwilligung (Lead schickt vor Einwilligung, unvollständiger Text). Eintritt: möglich; Schwere: mittel.
   - R5 Zweckentfremdung (Statistik, KI-Training, Weitergabe an Versicherer). Eintritt: gering; Schwere: hoch.
   - R6 Überlange Speicherung (Backups, Meta, Exporte). Eintritt: möglich; Schwere: mittel.
   - R7 Bruch des Berufsgeheimnisses (§ 203). Eintritt: gering; Schwere: hoch.
   - R8 KI-Dienst speichert Eingaben doch (Missbrauchsüberwachung, Logs) oder Zugriff über US-Konzernmutter. Eintritt: möglich ohne ZDR-Bestätigung, gering mit; Schwere: hoch.
   - R9 Modell gibt Gesundheitsangaben in Feldern aus (z. B. „Beitrag inkl. Risikozuschlag 30 % wegen …“). Eintritt: möglich; Schwere: mittel.
   - R10 Falsch ausgelesene Werte führen zu Fehlberatung (Art. 5 Abs. 1 lit. d). Eintritt: möglich; Schwere: mittel.
4. **Maßnahmen:** Einwilligungstext mit Meta-Hinweis, Einwilligungstor in der Software; Upload-Link als Alternative und für Kranken, BU, Leben empfohlen; No Storage oder Local Storage bei Meta, Löschung nach Abruf; Mandantenverschlüsselung, 2FA, Zugriffsprotokoll, kein Personalzugriff ohne Break-Glass; private EU-Speicherung; keine Inhalte in Logs und Push; Löschautomatik inkl. Backups; AVV-Ergänzung, § 203-Verpflichtungen; DPF-Überwachung mit Notabschaltung. Für KI: ZDR schriftlich, EU-Endpunkt fest, striktes Ausgabeschema ohne Freitext, Filter gegen Gesundheitsbegriffe und Prozentzuschläge in Ausgaben, keine Speicherung von Prompts und Rohantworten, Kennzeichnung „maschinell ausgelesen, bitte prüfen“ mit Seitenverweis, KI-Ablehnung per Knopf.
5. **Restrisiko nach Maßnahmen:** R1 mittel (mit Upload-Link gering), übrige gering. Keine vorherige Konsultation nach Art. 36 erforderlich, wenn die Maßnahmen umgesetzt sind.
6. **Überprüfung:** halbjährlich und bei Änderungen an Meta-Bedingungen, DPF oder Funktionsumfang; Beteiligung des Datenschutzbeauftragten, falls vorhanden.

---

## Softwareänderungen

### Auflagen vor Livegang (Kranken, BU, Leben)

- **A1 Einwilligungsnachricht ersetzen:** Text (a) als interaktive Nachricht; Vermittlername und Link dynamisch; Erklärung im Haupttext; Knöpfe höchstens 20 Zeichen, Fußzeile höchstens 60 (Grenzen gegen Meta-Doku prüfen). Fußzeile „Sie erhält nur Herr Kannapinn.“ entfernen.
- **A2 Einwilligungstor:** Eingehende Medien werden vor gültiger Einwilligung nicht von Meta heruntergeladen und nicht gespeichert. Kommt eine Datei vor der Einwilligung, Einwilligung anfragen; nach Klick erst dann abrufen (Medien-ID bleibt bei Meta eine Zeit abrufbar); ohne Einwilligung nach der Nachfrage verwerfen und, soweit die API es zulässt, bei Meta löschen.
- **A3 Einwilligungsprotokoll erweitern:** Zeitstempel, Wortlaut, Textversion, Lead-ID, Telefonnummer, WhatsApp-Message-ID der Knopfantwort, Vermittler-ID, Version der Datenschutzhinweise. Unveränderbar speichern, auch nach Löschung der Policen als Nachweis aufbewahren (ohne Dokumentinhalte).
- **A4 Widerruf:** Stichwort „Widerruf“ (und Varianten wie „widerrufen“, „löschen“) erkennen, Policen sofort löschen inkl. Vorschauen und Zwischenspeicher, Bestätigung an den Lead, Hinweis an den Vermittler, keine weiteren Erinnerungen.
- **A5 Freischaltung je Vermittler:** Funktion standardmäßig aus; Aktivierung erst nach Zustimmung zur AVV-Ergänzung (b), Bestätigung der § 203-Information und Hinterlegung der Datenschutzhinweis-URL.
- **A6 Speicher:** Eigener privater Bucket nur für Policen, Region bzw. Rechtsraum EU fest konfiguriert, serverseitige Verschlüsselung mit mandantenbezogenem Schlüssel, Abruf nur über kurzlebige signierte URLs nach Login. Achtung: `src/lib/r2.ts` in diesem Repo nutzt Cloudflare R2 mit `region: "auto"` und öffentlicher URL für Werbebilder; diesen Client nicht für Policen wiederverwenden. Falls R2: EU-Jurisdiktion des Buckets einstellen und Cloudflare als Unterauftragnehmer (US-Konzern) aufnehmen.
- **A7 Logging und Benachrichtigungen:** Keine Dateiinhalte, Dateinamen mit Gesundheitsbezug, Medien-URLs oder Webhook-Payloads in Anwendungslogs, Fehlertracking (Sentry) oder Analytics; Push- und E-Mail-Benachrichtigungen an den Vermittler nur neutral („Neue Unterlagen von {Lead}“).
- **A8 Erinnerungen:** Höchstens 2, nur bei protokolliertem WhatsApp-Opt-in aus der Terminbuchung, nur bis zum Termin, Stopp bei Absage, „Lieber nicht“, „STOP“ oder Widerruf; jede Erinnerung mit Abmeldehinweis; kein werblicher Inhalt.

### Weitere Pflichtpunkte (zeitnah, spätestens vor breitem Rollout)

- **Zugriffskontrolle:** 2FA für Vermittler-Logins mit Zugriff auf Policen; kein Admin- oder Supportzugriff von performancegrowth auf Inhalte außer Break-Glass mit Protokoll und automatischer Benachrichtigung des Vermittlers.
- **Zugriffsprotokoll:** Ansehen, Herunterladen, Löschen je Datei mit Nutzer und Zeit; für den Vermittler einsehbar.
- **Löschautomatik:** täglicher Job für „90 Tage nach Termin oder geplantem Termin“; Backups mit definierter Höchstdauer; Löschnachweis.
- **Malware-Prüfung** eingehender PDFs und Bilder vor Bereitstellung (kein Inhaltsauslesen, nur Signaturprüfung).
- **Keine Weitergabe:** Keine Funktion zum Weiterleiten an Versicherer oder Dritte aus der Ablage; Export nur als Download durch den Vermittler.
- **Ausschluss aus Statistik/Benchmark** und aus jeder KI-Verarbeitung außer dem freigegebenen Auslesen technisch erzwingen (eigene Tabelle/Bucket ohne Anbindung an Auswertungen).

### Für das KI-Auslesen (Zusatzfrage 9)

- **K1 Einwilligungsflag:** Auslesen nur bei Knopf „Ich willige ein“ mit KI-Textversion; bei „Ja, aber ohne KI“ oder alten Einwilligungen nie.
- **K2 Spartenschalter:** Konfiguration „KI-Auslesen erlaubt für Sparten“; Kranken, BU, Leben standardmäßig aus, bis ZDR-Nachweis hinterlegt ist. Sparte vor dem Auslesen bestimmen (z. B. durch Angabe des Leads oder Vermittlers); im Zweifel nicht auslesen.
- **K3 Anbieterkonfiguration:** Nur EU-Endpunkt (Azure Data Zone EU bzw. OpenAI-Projekt mit Region Europa), ZDR aktiv, Training aus; Schlüssel und Endpunkt so festlegen, dass kein Fallback auf globale oder US-Endpunkte möglich ist. Den in diesem Repo vorhandenen Replicate-Client (`replicate` in `package.json`) nicht für Policen verwenden.
- **K4 Ausgabeschema:** Strikte JSON-Schema-Ausgabe nur mit den Vertragsfeldern, Zahlen und Datumsfelder typisiert, kein Freitext, kein „Bemerkungen“-Feld; serverseitige Prüfung, die Werte mit Gesundheitsbegriffen (Diagnose, Ausschluss, Zuschlag, Vorerkrankung usw.) verwirft.
- **K5 Keine Rohdaten:** Prompts, Rohantworten und extrahierter Volltext werden nicht gespeichert und nicht geloggt (auch nicht in Sentry); gespeichert wird nur das validierte Feldobjekt.
- **K6 Kennzeichnung im CRM:** „Maschinell ausgelesen, bitte prüfen“ mit Link auf die Quellseite; Bestätigung durch den Vermittler, bevor die Werte in Vergleiche oder Beratungsunterlagen übernommen werden.
- **K7 Löschung:** Ausgelesene Felder teilen die Löschfrist der Policen (90 Tage) und den Widerruf, es sei denn, der Vermittler übernimmt sie bewusst in seine Akte.
- **K8 Kein Risiko-Scoring:** Keine Funktion, die aus Policen Versicherbarkeit, Annahmechancen oder Preise für Leben/Kranken schätzt (sonst Nähe zum Hochrisikobereich der KI-VO, Anhang III Nr. 5 lit. c, ohne Fundstelle).

### Empfehlungen (senken das Restrisiko deutlich)

- **E1 Sicherer Upload-Link:** Für Kranken, BU und Leben statt Chat einen EU-gehosteten, einmaligen Upload-Link (Ablauf 7 Tage, an Lead gebunden) anbieten; Dokumente laufen dann nicht über Meta. Im Chat nur Haftpflicht, Hausrat, Kfz.
- **E2 Meta-Speicherung minimieren:** Bei 360dialog „No Storage“ oder „Local Storage“ (EU) anfragen; Medien nach Abruf löschen.
- **E3 Schwärzungshinweis** nach der Einwilligung (siehe Folgenachricht in a).

---

## Für die Anwältin (echte Restfragen)

1. **Einwilligung per Knopf:** Genügt ein WhatsApp-Antwortknopf unter dem Text (a) als ausdrückliche Einwilligung nach Art. 9 Abs. 2 lit. a und als Befugnis nach § 203 StGB, auch für die Übermittlung über Meta in die USA? Reicht die Kurzinformation plus Link (gestufte Information)?
2. **Vertragskette Meta:** Wer ist WABA-Inhaber und Vertragspartner der WhatsApp Business Terms (Vermittler oder performancegrowth)? Je nachdem ist Meta Unterauftragnehmer von performancegrowth oder direkter Auftragsverarbeiter des Vermittlers; Auswirkungen auf AVV und § 203 Abs. 4 S. 2 Nr. 2.
3. **§ 203 bei Meta und 360dialog:** Reicht die Einwilligung des Leads als Befugnis, oder braucht es eine Verschwiegenheitsverpflichtung, die Meta nicht abgibt? Genügt die Vertraulichkeitsklausel im 360dialog-DPA?
4. **Makler und Mehrfachvertreter:** Gelten für Makler, die PKV und Leben vermitteln, § 203 Abs. 1 Nr. 7 StGB oder nicht? (Für die Software egal, für die Haftungsklausel im AVV relevant.)
5. **§ 7 UWG:** Sind Policen-Erinnerungen bei gebuchtem Termin Werbung im Sinne von BGH VI ZR 225/17, und deckt eine Einwilligung „WhatsApp zur Terminvorbereitung“ bei der Buchung sie ab?
6. **DSFA-Pflicht:** Ist die Verarbeitung je Vermittler „umfangreich“ oder steht sie auf der für ihn zuständigen Landesliste? Wer unterschreibt die DSFA, wenn performancegrowth sie für alle erstellt?
7. **Aufbewahrung:** Verträgt sich die 90-Tage-Löschung mit Dokumentations- und Nachweispflichten des Vermittlers (§§ 61, 62 VVG, Haftung bei Beratungsfehlern), oder sollte der Vermittler vorher in eigene Akten übernehmen?
8. **DPF-Ausfall:** Welche Fallback-Klausel (SCC, Aussetzung) ist im AVV sinnvoll, falls der Angemessenheitsbeschluss vom EuGH aufgehoben wird?
9. **Meta-Richtlinien:** Erlauben die WhatsApp Business Messaging Policy und Commerce Policy, aktiv Unterlagen mit Gesundheitsangaben anzufordern? (Nicht recherchiert, ohne Fundstelle.)
10. **KI-Anbieter und § 203:** Genügt der Standard-DPA von Microsoft bzw. OpenAI als Verschwiegenheitsverpflichtung nach § 203 Abs. 4 S. 2 Nr. 2 StGB, oder braucht es eine Zusatzvereinbarung bzw. stützt man sich allein auf die Einwilligung?
11. **Einwilligung für KI:** Reicht die gebündelte Einwilligung (Speichern und KI-Auslesen in einem Knopf, Ablehnung des KI-Teils per zweitem Knopf), oder verlangt die Granularität (ErwG 32, 43) zwei getrennte Erklärungen?

---

## Offen gebliebene Recherche (Legal Data Hunter Tageslimit)

Bei Reset (18.11.2026, 13:50 UTC) nachholen und in `docs/recht/legal-data-hunter-queue.md` (Nr. 6, 10) eintragen:
- Normtexte per resolve_reference: § 203 StGB, § 213 VVG, §§ 60 bis 62 VVG, § 34d GewO, § 15 VersVermV (heute nicht aufgelöst bzw. Limit).
- Rechtsprechung: BGH VIII ZR 53/09 über die Tool-Quelle; Urteil EuGH C-21/23 auf EUR-Lex; BGH/OLG zu § 7 UWG bei Terminerinnerungen und Servicenachrichten; EuGH zum Begriff „ausdrücklich“ (z. B. Planet49 C-673/17 als Einwilligungsmaßstab).
- Behördenpraxis: DSK-Muss-Liste (bundesweite Fassung), DSK-Papiere zu Messengern, EDSA-Leitlinien 05/2020 Volltext zur ausdrücklichen Einwilligung.

## Quellen

[LDH] Legal Data Hunter:
- [Verordnung (EU) 2016/679, Art. 9](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679)
- [§ 7 UWG](https://www.gesetze-im-internet.de/uwg_2004/__7.html)
- [EuGH C-184/20, Urteil 1.8.2022](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62020CJ0184) (Lauf 16.11.)
- [EuGH C-21/23, Schlussanträge](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62023CC0021) (Lauf 16.11.)

[Web] WebSearch:
- [EuGH C-21/23 Lindenapotheke, curia](https://curia.europa.eu/jcms/jcms/p1_4584865/de)
- [EDSA-Leitlinien 05/2020 zur Einwilligung](https://edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_en)
- [§ 203 StGB](https://www.gesetze-im-internet.de/stgb/__203.html)
- [§ 213 VVG](https://www.gesetze-im-internet.de/vvg_2008/__213.html)
- [BGH VIII ZR 53/09, rewis](https://rewis.io/urteile/urteil/7sw-09-02-2010-viii-zr-5309/)
- [Betriebs-Berater: Selbständiger Versicherungsvertreter ist der Geheimhaltung unterworfen](https://betriebs-berater.ruw.de/wirtschaftsrecht/urteile/Selbststaendiger-Versicherungsvertreter-ist-der-Geheimhaltung-unterworfen-20088)
- [Dr. Datenschutz: Geheimhaltungspflicht für selbständige Versicherungsmakler](https://www.dr-datenschutz.de/geheimhaltungspflicht-nach-stgb-fuer-selbstaendige-versicherungsmakler/)
- [BGH VI ZR 225/17, dejure](https://dejure.org/2018,28246)
- [DSK-Whitepaper Messenger im Krankenhaus (Kopie LfDI MV)](https://www.datenschutz-mv.de/static/DS/Dateien/Entschliessungen/Datenschutz/20191106_WP_%20Messenger_in_KrankenHaeusern.pdf)
- [DSK-Stellungnahme Messenger im Krankenhaus (Kopie BayLfD)](https://www.datenschutz-Bayern.de/dsbk-ent/DSK_101-SN-MessengerKH.pdf)
- [StMWi Bayern, WhatsApp for Business (BayLDA-Position, Sekundärquelle)](https://www.stmwi.bayern.de/fileadmin/user_upload/handel/Pr%C3%A4sentationen/2023-09-14-WhatsApp-for-Business.pdf)
- [HmbBfDI DSFA-Muss-Liste nicht öffentlicher Bereich](https://datenschutz-hamburg.de/fileadmin/user_upload/HmbBfDI/Datenschutz/Informationen/DSFA_Muss-Liste_fuer_den_nicht-oeffentlicher_Bereich_-_Stand_17.10.2018.pdf)
- [DSK-Kurzpapier Nr. 5 (Kopie LfD Niedersachsen)](https://lfd.niedersachsen.de/download/120917)
- [Meta Cloud API Data Privacy & Security](https://developers.facebook.com/documentation/business-messaging/whatsapp/data-privacy-and-security)
- [Meta No Storage](https://developers.facebook.com/documentation/business-messaging/whatsapp/no-storage/)
- [Meta Local Storage](https://developers.facebook.com/documentation/business-messaging/whatsapp/local-storage/)
- [WhatsApp Business Data Processing Terms](https://whatsapp.com/legal/business-data-processing-terms?l=bg)
- [WhatsApp Business Data Transfer Addendum (deutsch)](https://www.whatsapp.com/legal/business-data-transfer-addendum?lang=de_DE)
- [WhatsApp DPF-Erklärung](https://www.whatsapp.com/legal/data-privacy-framework?lang=fr_FR)
- [Meta DPF-Erklärung](https://privacycenter.instagram.com/policies/data_privacy_framework)
- [360dialog Imprint and Data Privacy](https://docs.360dialog.com/partner/help-and-support/imprint-and-data-privacy)
- [360dialog Architecture and Security](https://docs.360dialog.com/docs/resources/architecture-and-security)
- [R+V zum GDV-Code of Conduct](https://www.ruv.de/datenschutz/codeofconduct)
- [DSK, Orientierungshilfe KI und Datenschutz (Kopie BayLfD)](https://www.datenschutz-bayern.de/dsbk-ent/DSK_OH_KI_und_Datenschutz.pdf)
- [Microsoft Q&A: Zero Data Retention bei Azure OpenAI Data Zone](https://learn.microsoft.com/en-us/answers/questions/5625475/zero-data-retention-on-azure-open-ai-datazone-llm)
- [Microsoft Q&A: Enable zero data retention](https://learn.microsoft.com/en-us/answers/questions/5834904/enable-zero-data-retention)
- [OpenAI: Introducing data residency in Europe](https://openai.com/index/introducing-data-residency-in-europe/)
- [OpenAI-Forum: Berechtigung EU-Datenresidenz](https://community.openai.com/t/how-can-an-api-customer-become-eligible-for-eu-data-residency/1381888)
- [CMS: Transparenzpflichten der KI-VO](https://cms.law/de/deu/legal-updates/deepfakes-chatbots-co.-die-neuen-transparenzpflichten-der-ki-vo)
- [IHK Schleswig-Holstein: KI-Kennzeichnung](https://www.ihk.de/sh/ki-kennzeichnung)
