# Policen per WhatsApp mit Gesundheitsangaben: rechtliche Vorprüfung

Stand: 17.11.2026 (Nachtlauf), ergänzt am 18.11.2026 (Nachrecherche Legal Data Hunter, siehe Abschnitt „Stand Nachrecherche 18.11.“, und Abendlauf mit „Bewertung Kurzfassung 18.11.“). Rechtliche Vorprüfung, keine Rechtsberatung. Ole entscheidet, die Anwältin bestätigt danach.

Gegenstand: Der WhatsApp-Assistent (WhatsApp Business Cloud API über 360dialog, Meta als Unterauftragnehmer) bittet Leads mit gebuchtem Videotermin, Fotos oder PDFs aktueller Policen in den Chat zu schicken, auch Kranken, BU und Leben. performancegrowth (Ole Kannapinn UG) ist Auftragsverarbeiter des jeweiligen Vermittlers.

**Recherchestand und Quellenlage:** Legal Data Hunter lieferte heute nur drei Treffer (Art. 9 DSGVO, § 7 UWG, Fundstellen aus dem Lauf vom 16.11. in `docs/recht/legal-data-hunter-queue.md`), dann griff das Tageslimit. Meldung des Tools im Wortlaut: Tageslimit erreicht (limit_type „day“, Plan „free“), Upgrade unter https://legaldatahunter.com/pricing, Reset laut Tool am 18.11.2026 um 13:50 UTC. Die übrigen Fundstellen stammen aus WebSearch (Behördenpapiere, Meta- und 360dialog-Dokumentation, Gesetzestexte, Urteilsfundstellen). Jede Fundstelle ist mit [LDH] oder [Web] gekennzeichnet. Was mangels Tooltreffer nicht belegt ist, steht ausdrücklich als „ohne Fundstelle“ da.

---

## Kurzfazit

**Ampel: GELB, live mit Auflagen.** Für Haftpflicht, Hausrat und Kfz kann der Ablauf nach den Textkorrekturen sofort starten. Für Kranken, BU und Leben nur, wenn vor dem Start die Auflagen A1 bis A9 (unten) erfüllt sind; die wichtigsten sind ein korrigierter Einwilligungstext (der jetzige Fußzeilentext nennt den falschen Empfänger und verschweigt Meta), ein technisches Tor „keine Ablage ohne Einwilligung“, die unterschriebene AVV-Ergänzung je Vermittler und die § 203-Verpflichtungen.

**KI-Auslesen (Zusatzfrage 9): GELB.** Für Haftpflicht, Hausrat und Kfz mit dem neuen Einwilligungstext und der AVV-Ergänzung möglich. Für Kranken, BU und Leben erst, wenn die Null-Speicherung beim KI-Anbieter schriftlich bestätigt ist (Azure: genehmigtes „modified abuse monitoring“; OpenAI: EU-Projekt mit Zero Data Retention), sonst diese Sparten vom KI-Auslesen ausnehmen. Details im Abschnitt „KI-Auslesen“.

**Bündelung Speichern plus KI (Entscheidung Ole, Stand 18.11.): GELB mit Auflage A9.** Ein Knopf für beides ist vertretbar, aber das angreifbarste Element des Ablaufs. Ampel insgesamt unverändert; neu ist Auflage A9 (eine Ablehnung nur des KI-Teils muss ohne dritten Knopf möglich sein, per Stichwort „ohne KI“). Begründung im Abschnitt „Stand Nachrecherche 18.11.“.

**Kurzfassung der Einwilligung (Ole, 18.11.): ROT im vorliegenden Wortlaut, GELB mit Textvorschlag.** Die verschlankte Nachricht erfüllt A1 und A9 nicht (KI und Beteiligte nicht im sichtbaren Text, Gesundheits-Halbsatz missverständlich, „ohne KI“ nur in der Fußzeile). Details und Textvorschlag im Abschnitt „Bewertung Kurzfassung 18.11.“. Gesamtampel unverändert GELB; A1 präzisiert, A8 ergänzt.

**Restrisiko: mittel.** Rechtsgrundlage kann nur die ausdrückliche Einwilligung nach Art. 9 Abs. 2 lit. a DSGVO sein; sie ist per WhatsApp-Knopf machbar, aber angreifbar, wenn der Text unvollständig oder irreführend ist. Der größte nicht wegzuverhandelnde Punkt ist der Transportweg: Meta entschlüsselt Cloud-API-Nachrichten auf eigenen Servern, speichert Medien bis zu 30 Tage und kann sie in die USA übermitteln (gestützt auf das Data Privacy Framework); deutsche Aufsichtsbehörden halten WhatsApp für Gesundheitsdaten nur für bedingt geeignet. Dieses Restrisiko sinkt deutlich, wenn für Kranken, BU und Leben ein EU-gehosteter Upload-Link statt des Chats angeboten wird (Empfehlung E1). Bußgeld- und Abmahnrisiko liegt in erster Linie beim Vermittler als Verantwortlichem, Haftung und Reputationsrisiko aber auch bei performancegrowth (Art. 82, 83 DSGVO; § 203 Abs. 4 StGB).

---

## Bewertung Kurzfassung 18.11.

**Gegenstand.** Ole hat die Einwilligungsnachricht verschlankt. Wortlaut, eine interaktive Nachricht mit den Knöpfen [Ja, mache ich] [Später]:

> Damit Herr Kannapinn vorab sieht, wo Sie doppelt zahlen oder Lücken haben: Schicken Sie einfach Fotos Ihrer Policen hier in den Chat. Mit „Ja, mache ich“ sind Sie einverstanden, dass Herr Kannapinn sie speichert und die Vertragsdaten automatisch auslesen lässt, auch Gesundheitsangaben. Jederzeit widerrufbar. Details: {Link}

Fußzeile: „Lieber ohne KI-Auslesen? Schreiben Sie „ohne KI“.“ Meta/USA und der Dienstleister performancegrowth stehen nur hinter dem Link (gestaffelte Information).

**Ampel.**
- **Kurzfassung im vorliegenden Wortlaut: ROT.** Nicht live schalten, solange Kranken-, BU- oder Lebenspolicen ankommen können; da der Kanal das vorher nicht weiß (Prüffrage 1), gilt das praktisch für den ganzen Policen-Kanal.
- **Mit dem Textvorschlag unten: GELB**, also wie bisher live mit den Auflagen A1 bis A9 und K1 bis K8.
- **Gesamtampel des Ablaufs: unverändert GELB.** Geändert: **A1 präzisiert** (Mindestinhalt der sichtbaren Nachricht, gilt auch für jede Kurzfassung), **A8 ergänzt** (Umgang mit „Später“), **A9 bestätigt** („ohne KI“ im Haupttext, jetzt mit verifizierten Randnummern).

**Maßstab (Fundstellen).**
- Art. 4 Nr. 11 DSGVO [LDH]: Einwilligung ist eine „freely given, specific, informed and unambiguous indication“ durch Erklärung oder eindeutige bestätigende Handlung. Art. 9 Abs. 2 lit. a [LDH]: „explicit consent ... for one or more specified purposes“. Art. 7 Abs. 2 und 3 [LDH]: Ersuchen klar unterscheidbar und verständlich; Hinweis auf Widerruf vor Abgabe; Widerruf so einfach wie Erteilung. Quelle jeweils [EUR-Lex 32016R0679](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679).
- ErwG 32 [LDH]: Ersuchen auf elektronischem Weg „clear, concise and not unnecessarily disruptive“; bei mehreren Zwecken Einwilligung für alle Zwecke. Das stützt eine knappe Nachricht, aber nicht den Verzicht auf Pflichtinhalte.
- ErwG 42 [LDH]: Für eine informierte Einwilligung muss die betroffene Person „at least of the identity of the controller and the purposes“ Kenntnis haben; vorformulierte Erklärung verständlich, leicht zugänglich, klar und einfach.
- ErwG 43 [LDH] und EuGH C-252/21 ([CELEX:62021CJ0252](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62021CJ0252) [LDH, Volltext 18.11. Abend]): Rn. 150, Nutzer müssen einzelne, für die Leistung nicht erforderliche Verarbeitungsvorgänge „individually“ ablehnen können, ohne auf die Leistung ganz verzichten zu müssen; Rn. 151, eine gesonderte Einwilligung ist im Sinne von ErwG 43 „appropriate“, wenn Umfang und erhebliche Auswirkungen der Verarbeitung dafür sprechen und die Nutzer sie nicht vernünftigerweise erwarten; fehlt sie, wird fehlende Freiwilligkeit vermutet; Rn. 152, Beweislast beim Verantwortlichen.
- EuGH C-413/23 P ([CELEX:62023CJ0413](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62023CJ0413) [LDH]), Rn. 108 und 109 (zur inhaltsgleichen Informationspflicht der EU-Organe): Die Information über Empfänger bei der Erhebung soll der Person ermöglichen, „in full knowledge of the facts“ zu entscheiden, ob sie die Daten bereitstellt, und verhindern, dass Daten gegen ihren Willen an Dritte übermittelt werden.
- EuGH C-61/19 [LDH]: Darstellung darf nicht irreführen; Beweislast beim Verantwortlichen.
- § 203 Abs. 1 Nr. 7, Abs. 3 und 4 StGB, Wortlaut [LDH] ([gesetze-im-internet.de](https://www.gesetze-im-internet.de/stgb/__203.html)): Die Einwilligung soll zugleich Befugnis für das Offenbaren an Meta und den KI-Dienst sein (Prüffrage 5). Dass eine strafrechtlich wirksame Einwilligung Kenntnis davon voraussetzt, wem offenbart wird, ist allgemeine Ansicht, aber hier ohne Fundstelle.
- EDSA-Leitlinien 05/2020 (Mindestinhalt einer informierten Einwilligung, gestaffelte Information): **nicht über das Tool auffindbar geprüft** (Limit vor der Abfrage). Nach meinem Kenntnisstand nennt der EDSA als Mindestinhalt Identität des Verantwortlichen, Zweck jedes Vorgangs, Art der Daten, Widerrufsrecht, gegebenenfalls automatisierte Entscheidungen und Risiken bei Übermittlungen nach Art. 49; gestaffelte Information ist zulässig, wenn dieser Mindestinhalt auf der ersten Ebene steht ([EDPB](https://edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_en) [Web], Randnummern nicht verifiziert).

**Prüfung Punkt für Punkt.**

| Element | Kurzfassung | Bewertung |
|---|---|---|
| Verantwortlicher | „Herr Kannapinn“ | Reicht nur, wenn Herr Kannapinn der beratende Vermittler ist; sonst falsch (siehe Prüffrage 1, „Fehler im geplanten Text“). Name dynamisch und mit Firma ({Vermittler} ({Firma})), ErwG 42. **Muss.** |
| Zweck | „vorab sieht, wo Sie doppelt zahlen oder Lücken haben“ | Gut, konkret und verständlich (Art. 9 Abs. 2 lit. a „specified purposes“). |
| Gesundheitsdaten | „... automatisch auslesen lässt, auch Gesundheitsangaben“ | Grammatisch auf das Auslesen bezogen: liest sich, als würden Gesundheitsangaben ausgelesen. Das ist sachlich falsch (K4, AVV § 1a: keine Gesundheitsfelder) und lässt offen, ob in das Speichern von Gesundheitsangaben eingewilligt wird. Irreführend im Sinne von C-61/19 und für „explicit“ zu unscharf. **Muss** geändert werden: „auch wenn die Policen Gesundheitsangaben enthalten“. |
| KI | Haupttext nur „automatisch auslesen lässt“; „KI“ nur in der Fußzeile | Art und Empfänger des Vorgangs (KI-Dienst) im Haupttext nicht erkennbar. „Per KI“ in den Haupttext (zwei Wörter). **Muss.** |
| Empfänger Meta/USA, Dienstleister, KI-Dienst | nur hinter dem Link | Datenschutzrechtlich ist der Empfänger kein ausdrücklicher Mindestinhalt nach ErwG 42, und Art. 13 kann gestaffelt erfüllt werden. Aber: Meta liest Klartext, speichert bis 30 Tage, US-Zugriff möglich; das ist die entscheidende Risikoinformation, die nach C-413/23 P Rn. 108 f. die Entscheidung über die Bereitstellung ermöglichen soll. Zusätzlich trägt die Einwilligung als Befugnis nach § 203 StGB nur, wenn die Empfänger bekannt sind. Für Gesundheitssparten **muss** eine Kurzangabe zurück in den sichtbaren Text (ein Satz, Details weiter per Link). |
| Widerruf | „Jederzeit widerrufbar.“ | Erfüllt den Hinweis vor Abgabe (Art. 7 Abs. 3 S. 3). Für „so einfach wie Erteilung“ (S. 4) den Weg nennen: „mit ‚Widerruf‘“ (A4). **Soll.** |
| Knopf | „Ja, mache ich“ | Sprachlich eine Zusage zum Schicken, keine Einwilligung. Durch „Mit ‚Ja, mache ich‘ sind Sie einverstanden“ ist der Bezug hergestellt; vertretbar. Unmissverständlicher (Art. 4 Nr. 11): „Ja, einverstanden“ (17 Zeichen). **Soll.** |
| Zweiter Knopf | „Später“ | Keine Einwilligung. Es gibt keinen Nein-Knopf mehr; die Ablehnung muss trotzdem einfach sein (ErwG 42 „unable to refuse ... without detriment“). Siehe A8 ergänzt. |
| KI-Ablehnung | nur Fußzeile | A9 verlangte den Satz im Haupttext. Die Fußzeile ist Teil derselben Nachricht, aber klein und grau; nach C-252/21 Rn. 150 f. muss die Einzelablehnung eine echte, erkennbare Wahl sein. Fußzeile schwächt A9, macht es nicht wertlos: Restrisiko der Bündelung steigt von „gering bis mittel“ (Haupttext) auf „mittel“. **Dringend empfohlen**: zurück in den Haupttext (sechs Wörter). |
| Freiwilligkeit | Hinweis „Termin auch ohne Unterlagen“ entfallen | Nicht zwingend, stützt aber Art. 7 Abs. 4 und ErwG 42. In die freie Fußzeile. **Soll.** |
| Format | „Fotos“ | PDFs ebenfalls zulassen; redaktionell. |

**Ergebnis.** Für eine informierte, ausdrückliche Einwilligung nach Art. 9 Abs. 2 lit. a, Art. 4 Nr. 11 und Art. 7 reicht die Kurzfassung **nicht**. Zurück in den sichtbaren Text müssen: (1) Vermittler mit Firma, (2) „per KI“, (3) korrigierter Gesundheits-Halbsatz, (4) ein Satz zu den Beteiligten (WhatsApp/Meta mit möglichem US-Zugriff, Dienstleister performancegrowth, KI-Dienst in der EU). Dringend empfohlen: (5) „ohne KI“ im Haupttext, (6) Widerrufsstichwort, (7) Knopf „Ja, einverstanden“. Die gestaffelte Information bleibt für alles Weitere (Speicherdauer, Rechte, Rechtsgrundlage, DPF, Unterauftragnehmer im Einzelnen) zulässig.

**Textvorschlag (rund 520 Zeichen, unter der Grenze von 1024 Zeichen für den Nachrichtentext; Grenze laut Meta-Doku, ohne Fundstelle).**

Haupttext:

> Damit {Vermittler} ({Firma}) vorab sieht, wo Sie doppelt zahlen oder Lücken haben: Schicken Sie einfach Fotos oder PDFs Ihrer Policen hier in den Chat. Mit „Ja, einverstanden“ willigen Sie ein, dass {Vermittler} sie speichert und die Vertragsdaten per KI auslesen lässt, auch wenn die Policen Gesundheitsangaben enthalten. Beteiligt sind WhatsApp (Meta, Zugriff aus den USA möglich), der Dienstleister performancegrowth und ein KI-Dienst in der EU. Lieber ohne KI? Schreiben Sie „ohne KI“. Widerruf jederzeit mit „Widerruf“. Details: {Link}

Knöpfe: [Ja, einverstanden] [Später]

Fußzeile (höchstens 60 Zeichen): „Ihr Termin findet auch ohne Policen statt.“

**Minimalvariante**, falls Ole kürzer bleiben will: Änderungen (1) bis (4) sind Pflicht; Knopf „Ja, mache ich“ und „ohne KI“ in der Fußzeile kann Ole mit **mittlerem** Restrisiko für die Bündelung bewusst tragen (dann Fußzeile wie bei ihm, Hinweis zum Termin entfällt).

**Folgen für Software und Auflagen.**
- **A1 präzisiert:** Jede Fassung der Einwilligungsnachricht, auch eine Kurzfassung, enthält sichtbar mindestens Vermittler mit Firma, Zweck, „per KI“, „auch wenn die Policen Gesundheitsangaben enthalten“, die Beteiligten in einem Satz, den Widerrufshinweis und den Link. Neue Textversion in A3 protokollieren.
- **A8 ergänzt:** „Später“ ist keine Ablehnung und keine Einwilligung. Höchstens 2 Erinnerungen (nur mit Opt-in aus der Terminbuchung), jede mit dem Satz „Kein Interesse? Antworten Sie ‚Nein‘.“; „Nein“, „STOP“ oder „Lieber nicht“ beenden die Erinnerungen. Dateien nach „Später“ fallen unter A2 (erst Einwilligung anfragen, dann abrufen).
- **A9 unverändert:** Satz „Lieber ohne KI? Schreiben Sie ‚ohne KI‘.“ im Haupttext; Fußzeile nur als bewusst getragene Abweichung (Minimalvariante).
- K1 bleibt: Auslesen nur mit der neuen Textversion und ohne Stichwort „ohne KI“.

---

## Stand Nachrecherche 18.11.

**Nachtrag Abendlauf 18.11. (nach Reset 22:24 UTC).** 7 Abfragen, dann erneut Limit: limit_type „day“, Plan „free“, Upgrade https://legaldatahunter.com/pricing, resets_at 2026-11-19T14:07:00+00:00. Neu [LDH]:
- Volltext der DSGVO ([EUR-Lex 32016R0679](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679)) mit Wortlaut Art. 4 Nr. 11 und 15, Art. 9 Abs. 1 und 2 lit. a, Art. 28, Art. 35 Abs. 1 und 3 lit. b, Art. 44 sowie ErwG 32, 42, 43 und 91. Die Wiedergaben in diesem Dokument stimmen mit dem Wortlaut überein. ErwG 91 S. 4 bestätigt den Gedanken aus Prüffrage 4: Verarbeitung von Patienten- oder Mandantendaten durch einen einzelnen Arzt, Angehörigen eines Gesundheitsberufs oder Rechtsanwalt gilt nicht als umfangreich.
- Volltext EuGH C-252/21 (Quelle EU/CURIA, 62021CJ0252): einschlägig für die gesonderte Einwilligung sind **Rn. 150 und 151**, ergänzend Rn. 143 bis 145 (ErwG 42, 43, Art. 7 Abs. 4) und Rn. 152 (Beweislast). Wichtig: Rn. 151 stützt die Angemessenheit getrennter Einwilligungen auf den Umfang der Verarbeitung, ihre erheblichen Auswirkungen und darauf, dass Nutzer die zusätzliche Verarbeitung nicht vernünftigerweise erwarten; das passt auf das KI-Auslesen von Policen mit Gesundheitsangaben. Die Annahme von „Prüfung der Bündelung“ unten ist damit bestätigt, die Einschränkung „Randnummer nicht verifiziert“ entfällt.
- § 203 StGB, Wortlaut ([gesetze-im-internet.de](https://www.gesetze-im-internet.de/stgb/__203.html), Quelle DE/BGBl): Abs. 1 Nr. 7, Abs. 3 S. 2, Abs. 4 S. 1 und S. 2 Nr. 1 und 2, Abs. 6 stimmen mit Prüffrage 5 und Text (d) überein (Strafrahmen Abs. 4 bis ein Jahr, Abs. 6 bis zwei Jahre). [Web] wird insoweit durch [LDH] ersetzt.
- EuGH C-413/23 P ([CELEX:62023CJ0413](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62023CJ0413)), Rn. 108 bis 111: Zweck der Empfängerinformation bei Erhebung (siehe Bewertung Kurzfassung).
- Weiter nicht über das Tool bestätigt: BGH VIII ZR 53/09 (resolve_reference mit Limit beantwortet), BGH VI ZR 225/17, EuGH-Urteil C-21/23, Messenger-Rechtsprechung, EDSA-Leitlinien 05/2020.

**Ablauf.** Legal Data Hunter lieferte heute 12 Abfragen, dann griff das Tageslimit erneut. Meldung des Tools: Tageslimit erreicht (limit_type „day“, Plan „free“), Upgrade unter https://legaldatahunter.com/pricing, resets_at 2026-11-18T22:24:00+00:00. Alles Folgende mit [LDH] stammt aus diesen Abfragen; was dort nicht steht, ist weiter [Web] oder ohne Fundstelle.

**Was sich geändert hat (Kurzliste).**
1. Ampel insgesamt: unverändert GELB. KI-Auslesen: unverändert GELB.
2. Neu: Auflage **A9** (Ablehnung nur des KI-Teils per Stichwort „ohne KI“, ohne dritten Knopf). Text (a), K1 und Text (c) an Oles Zwei-Knopf-Entscheidung angepasst.
3. Restrisiko der Bündelung: von „leicht erhöht“ auf **mittel** (ohne A9) bzw. **gering bis mittel** (mit A9) präzisiert.
4. Anwaltsfrage 11 geschärft, neue Anwaltsfrage 12 (anhängiges EuGH-Verfahren C-317/25).
5. Neue [LDH]-Fundstellen: Art. 4, Art. 7 DSGVO (Wortlaut), EuGH C-252/21, C-61/19, C-673/17, §§ 6, 60, 61, 68 VVG, Art. 50 KI-VO (Wortlaut). [Web] bleiben: § 203 StGB, BGH VIII ZR 53/09, BGH VI ZR 225/17, EuGH-Urteil C-21/23, alle Behörden- und Anbieterdokumente.

**Neue Fundstellen [LDH].**
- **Art. 7 DSGVO, Wortlaut** ([EUR-Lex 32016R0679, Art. 7](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679) [LDH]): Abs. 1 Nachweispflicht des Verantwortlichen; Abs. 2 Einwilligungsersuchen klar unterscheidbar, verständlich, in klarer und einfacher Sprache; Abs. 3 Widerruf jederzeit, Hinweis darauf vor Abgabe, Widerruf so einfach wie Erteilung; Abs. 4 bei der Beurteilung der Freiwilligkeit ist „in größtmöglichem Umfang“ zu berücksichtigen, ob die Erfüllung eines Vertrags von einer nicht erforderlichen Einwilligung abhängig gemacht wird. Bestätigt A3 (Protokoll), A4 (Widerruf per Stichwort im selben Kanal) und die Platzierung der Erklärung im Haupttext.
- **Art. 4 DSGVO, Wortlaut** ([EUR-Lex 32016R0679, Art. 4](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679) [LDH]): Nr. 2 nennt als Verarbeitung ausdrücklich Erheben, Speichern, Auslesen, Abfragen und Offenlegung durch Übermittlung. Das KI-Auslesen ist damit ein eigener Verarbeitungsvorgang mit eigener Übermittlung an einen weiteren Empfänger, nicht bloß ein Teil des Speicherns. Nr. 11 und Nr. 15 waren im gekürzten Tooltext nicht enthalten; Wortlaut beim Anwaltstermin aus derselben Quelle prüfen.
- **ErwG 32, 42, 43**: Wortlaut seit dem Abendlauf per Tool belegt ([EUR-Lex 32016R0679](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679) [LDH, 18.11. Abend]); die Wiedergabe unten stimmt damit überein. ErwG 43 S. 2 wörtlich: „Consent is presumed not to be freely given if it does not allow separate consent to be given to different personal data processing operations despite it being appropriate in the individual case“.
- **EuGH, Urteil vom 4.7.2023, C-252/21, Meta Platforms u. a. gegen Bundeskartellamt (Große Kammer)** ([EUR-Lex CELEX:62021CJ0252](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62021CJ0252) [LDH]). Leitsätze laut Tool: Art. 6 Abs. 1, Art. 9 Abs. 1 und 2, Art. 4 Nr. 11 (Begriff der Einwilligung). Volltext im Abendlauf abgerufen: Rn. 150 (Nutzer müssen einzelne, für den Vertrag nicht erforderliche Vorgänge einzeln ablehnen können, ohne ganz auf die Leistung zu verzichten) und Rn. 151 (gesonderte Einwilligung im Sinne von ErwG 43 „appropriate“ wegen Umfang, erheblicher Auswirkung und fehlender Erwartung der Nutzer; sonst Vermutung fehlender Freiwilligkeit) [LDH, 18.11. Abend].
- **EuGH, Urteil vom 11.11.2020, C-61/19, Orange România** ([EUR-Lex CELEX:62019CJ0061](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62019CJ0061) [LDH]; Schlussanträge Szpunar [CELEX:62019CC0061](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62019CC0061) [LDH]). Leitsätze laut Tool: freiwillige, für den bestimmten Fall, informierte Willensbekundung; Einwilligung per Ankreuzkästchen; Beweislast beim Verantwortlichen. Stützt: Nachweis (A3) und Informiertheit; die Darstellung muss den Betroffenen nicht in die Irre führen.
- **EuGH, Urteil vom 1.10.2019, C-673/17, Planet49 (Große Kammer)** ([EUR-Lex CELEX:62017CJ0673](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62017CJ0673) [LDH]). Leitsatz laut Tool: Einwilligung durch voreingestelltes Ankreuzkästchen. Maßstab: aktive Handlung nötig. Ein aktiv gedrückter Antwortknopf unter einem vollständigen Erklärungstext erfüllt das; keine Vorauswahl, keine Einwilligung durch bloßes Weiterschreiben oder Senden einer Datei.
- **Anhängig: EuGH C-317/25, Groupe Canal+ gegen CNIL**, Schlussanträge Spielmann vom 17.9.2026 ([EUR-Lex CELEX:62025CC0317](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62025CC0317) [LDH], vorläufige Fassung). Erschien als Treffer zur Suche nach gesonderter Einwilligung; Inhalt nicht abgerufen. Beobachten, ob das Urteil die Granularität neu fasst.
- **VVG**: [§ 61 VVG](https://www.gesetze-im-internet.de/vvg_2008/__61.html), [§ 60 VVG](https://www.gesetze-im-internet.de/vvg_2008/__60.html), [§ 6 VVG](https://www.gesetze-im-internet.de/vvg_2008/__6.html), [§ 68 VVG](https://www.gesetze-im-internet.de/vvg_2008/__68.html) [LDH]. Bestätigt die Einordnung in Prüffrage 6: § 61 betrifft die Beratungs- und Dokumentationspflichten des Vermittlers, § 6 die des Versicherers. § 62 VVG wurde nicht getroffen (ohne Fundstelle).
- **Art. 50 VO (EU) 2024/1689, Wortlaut** ([EUR-Lex 32024R1689, Art. 50](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689) [LDH]): Abs. 1 verpflichtet Anbieter von KI-Systemen, die direkt mit natürlichen Personen interagieren, diese zu informieren, dass sie mit einem KI-System interagieren, es sei denn, das ist offensichtlich. Abs. 2 (Kennzeichnung synthetischer Inhalte) gilt nicht, soweit das System die Eingabedaten nicht wesentlich verändert. Bestätigt: Hinweis „KI-Assistent“ im Chat nötig; für das reine Auslesen von Vertragsfeldern keine Kennzeichnungspflicht nach Abs. 2. Geltungsbeginn stand nicht im Tooltext, bleibt [Web].

**Nicht über das Tool bestätigt (Stand Abendlauf).** BGH VIII ZR 53/09, BGH VI ZR 225/17, Messenger- oder WhatsApp-Rechtsprechung zu Gesundheitsdaten, BGH oder OLG zu Gesundheitsdaten bei Versicherungen, EDSA-Leitlinien 05/2020. Im Abendlauf nachgeholt [LDH]: § 203 StGB, Art. 9, 28, 35, 44 DSGVO, ErwG 32, 42, 43, Volltext C-252/21 (siehe Nachtrag oben).

**Prüfung der Bündelung (ein Knopf für Speichern und KI-Auslesen).**
- *Für die Bündelung:* Beide Vorgänge dienen demselben Zweck (Terminvorbereitung). ErwG 32 verlangt eine Einwilligung für alle Zwecke, wenn die Verarbeitung mehreren Zwecken dient, nicht zwingend je Vorgang eine eigene. Das Gesamtangebot ist freiwillig, der Termin hängt nicht daran; das Kopplungsverbot nach Art. 7 Abs. 4 ([LDH]) betrifft die Abhängigkeit eines Vertrags oder einer Leistung, und die liegt nicht vor. Wer „Lieber nicht“ wählt, verliert nichts außer der Vorbereitung.
- *Gegen die Bündelung:* ErwG 43 S. 2 vermutet fehlende Freiwilligkeit, wenn zu verschiedenen Verarbeitungsvorgängen keine gesonderte Einwilligung möglich ist, obwohl das im Einzelfall angebracht ist. Das KI-Auslesen ist nach Art. 4 Nr. 2 ([LDH]) ein eigener Vorgang mit einem zusätzlichen Empfänger (KI-Anbieter mit US-Konzernmutter), betrifft Art. 9-Daten und ist für das Speichern und Ansehen durch den Vermittler nicht erforderlich. Gerade weil Ole erwartet, dass „fast alle“ ohne KI wählen würden, lässt sich argumentieren, dass eine getrennte Wahl hier „angebracht“ ist und die Bündelung den Willen der Betroffenen überspielt. Der EuGH hat in C-252/21 für nicht erforderliche Zusatzverarbeitungen eine gesonderte Einwilligungsmöglichkeit verlangt (Rn. 150, 151, [LDH, Volltext 18.11. Abend]). Die Folge eines Verstoßes wäre nicht nur die Unwirksamkeit für das KI-Auslesen, sondern womöglich auch für das Speichern, weil es nur eine Erklärung gibt.
- *Ergebnis:* Haltbar, aber nicht sicher. Die Vermutung nach ErwG 43 lässt sich mit geringem Aufwand ausräumen, ohne den dritten Knopf einzuführen, den Ole nicht will: **Auflage A9**. Im Haupttext steht ein Satz „Ohne KI? Dann antworten Sie ‚ohne KI‘.“; die Software erkennt das Stichwort vor und nach dem Klick auf „Einverstanden“ und setzt `ki=false`. Damit gibt es eine gesonderte Wahl, die Standardoption bleibt aber „Einverstanden“ mit KI. Ohne A9 trägt Ole ein mittleres Risiko; die Abmilderung über A9 senkt es auf gering bis mittel. Für Kranken, BU und Leben bleibt das KI-Auslesen ohnehin an K2 (Nachweis Null-Speicherung) gebunden.
- *Nicht zulässig wäre*: den Knopf nur „Einverstanden“ zu nennen und die Erklärung in die Fußzeile oder hinter den Link zu verlagern (Art. 7 Abs. 2, [LDH]); eine Einwilligung aus dem bloßen Senden einer Datei abzuleiten (C-673/17, [LDH]).

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
  4. Freiwilligkeit (Art. 7 Abs. 4, ErwG 43): Der Termin darf nicht davon abhängen. Eine echte Alternative („Lieber nicht“, Stichwort „ohne KI“ nach A9 oder der sichere Upload-Link) stärkt die Freiwilligkeit.
  5. Nachweis (Art. 7 Abs. 1): Zeitstempel, Wortlaut, Lead-ID ist richtig. Zusätzlich speichern: WhatsApp-Message-ID der Einwilligungsnachricht, Telefonnummer, Version des Textes, Name des Vermittlers, Link-Version der Datenschutzhinweise.
- **Fehler im geplanten Text:** „Sie erhält nur Herr Kannapinn.“ ist sachlich falsch, sofern Herr Kannapinn nicht selbst der beratende Vermittler ist: Verantwortlicher und Empfänger ist der jeweilige Vermittler, und Meta, 360dialog sowie performancegrowth (Hosting) verarbeiten die Daten ebenfalls. Eine falsche oder beschönigende Empfängerangabe kann die Einwilligung insgesamt unwirksam machen (fehlende Informiertheit). Außerdem überschreitet der Fußzeilentext nach meinem Kenntnisstand die WhatsApp-Grenze für Fußzeilen (60 Zeichen) und der Knopftext die Grenze für Antwortknöpfe (20 Zeichen); bitte in der Meta-Doku gegenprüfen (ohne Fundstelle).

**Umsetzen.** Einwilligungstext (a) unten verwenden (deckt seit der Zusatzfrage auch das KI-Auslesen ab), Vermittlername dynamisch einsetzen, Erklärung in den Haupttext, Knopf „Einverstanden“ (Entscheidung Ole). Datenminimierung (Art. 5 Abs. 1 lit. c): Im Anschreiben anbieten, bei Kranken, BU und Leben nur die Seite mit Tarif, Beitrag und Leistungen zu schicken und Gesundheitsangaben zu schwärzen, wenn der Lead sie nicht besprechen will.

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
- **Vertreter:** § 203 Abs. 1 Nr. 7 StGB erfasst Angehörige eines Unternehmens der privaten Kranken-, Unfall- oder Lebensversicherung ([§ 203 StGB, gesetze-im-internet.de](https://www.gesetze-im-internet.de/stgb/__203.html) [LDH, 18.11. Abend; vorher Web]). Der BGH hat entschieden, dass auch ein selbständiger Versicherungsvertreter dazu gehört (BGH, Urteil vom 10.2.2010, VIII ZR 53/09, damals Nr. 6, [rewis](https://rewis.io/urteile/urteil/7sw-09-02-2010-viii-zr-5309/); Besprechung [Betriebs-Berater](https://betriebs-berater.ruw.de/wirtschaftsrecht/urteile/Selbststaendiger-Versicherungsvertreter-ist-der-Geheimhaltung-unterworfen-20088) [Web]). Allianz-Vertreter, die (auch) für Kranken- oder Lebensversicherer vermitteln, sind daher Berufsgeheimnisträger, und zwar für alle Geheimnisse, die ihnen in dieser Eigenschaft anvertraut werden. Policen mit Gesundheitsangaben sind solche Geheimnisse.
- **Makler:** Nach überwiegender Ansicht keine „Angehörigen“ eines Versicherers, weil sie auf Kundenseite stehen ([Dr. Datenschutz zu Maklern](https://www.dr-datenschutz.de/geheimhaltungspflicht-nach-stgb-fuer-selbstaendige-versicherungsmakler/) [Web]; nicht abschließend geklärt). Für die Software sollte das keine Rolle spielen: einheitlich so behandeln, als gelte § 203.
- **performancegrowth als mitwirkende Person:** Nach § 203 Abs. 3 S. 2 darf der Geheimnisträger Geheimnisse an mitwirkende Personen offenbaren, soweit das für deren Tätigkeit erforderlich ist (IT-Dienstleister sind der Hauptfall). Nach § 203 Abs. 4 S. 2 Nr. 1 macht sich der Vermittler strafbar, wenn er nicht dafür sorgt, dass die mitwirkende Person zur Geheimhaltung verpflichtet wurde; nach Abs. 4 S. 2 Nr. 2 gilt dasselbe für performancegrowth, wenn es selbst weitere mitwirkende Personen (Mitarbeiter, Hoster, 360dialog) einsetzt, ohne sie zu verpflichten. Mitarbeiter und Dienstleister von performancegrowth sind nach § 203 Abs. 4 S. 1 selbst strafbar, wenn sie offenbaren.
- **Meta und 360dialog:** Eine § 203-Verpflichtung wird Meta nicht unterschreiben. Abhilfe: Die Einwilligung des Leads muss die Übermittlung über WhatsApp/Meta und an die Dienstleister ausdrücklich umfassen; dann ist das Offenbaren insoweit befugt. Das ist ein weiterer Grund, warum Meta im Einwilligungstext stehen muss. 360dialog sollte trotzdem um eine Verschwiegenheitsverpflichtung gebeten werden (deren DPA enthält meist eine Vertraulichkeitsklausel; ob sie § 203 genügt, ist zu prüfen).

**Umsetzen.** (1) performancegrowth verpflichtet alle Mitarbeiter und Freelancer mit möglichem Zugriff in Textform (Text d). (2) AVV-Ergänzung enthält die Zusicherung gegenüber dem Vermittler. (3) Unterauftragnehmer mit Zugriff (Hosting, Speicher, 360dialog) in Textform verpflichten oder vertraglich gleichwertig binden. (4) Einwilligungstext nennt WhatsApp/Meta und Dienstleister.

---

## Prüffrage 6: Versicherungsvermittlungsrecht (VVG, GewO, VersVermV, § 213 VVG)

**Ergebnis.**
- **§ 61 VVG** (Befragung nach Wünschen und Bedürfnissen, Beratung, Dokumentation) und beim Makler § 60 VVG (Marktauswahl): Die Anforderung bestehender Policen dient der Bedarfsermittlung und ist sachlich gerechtfertigt; eine Pflicht, Policen gerade per WhatsApp einzusammeln, besteht nicht. Die Beratungsdokumentation (§§ 61, 62 VVG) bleibt Sache des Vermittlers und darf nicht von der 90-Tage-Löschung der Policen-Kopien abhängen. Normtexte: [§ 61 VVG](https://www.gesetze-im-internet.de/vvg_2008/__61.html), [§ 60 VVG](https://www.gesetze-im-internet.de/vvg_2008/__60.html) [LDH, 18.11.]; § 62 VVG ohne Tooltreffer.
- **§ 6 VVG** ([gesetze-im-internet.de](https://www.gesetze-im-internet.de/vvg_2008/__6.html) [LDH, 18.11.]) betrifft Beratungspflichten des Versicherers; für die Plattform nicht unmittelbar relevant.
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

**Art. 9 Abs. 2 lit. a: Muss die Einwilligung das automatische Auslesen nennen?** Ja. Auch wenn das Ausgabeschema keine Gesundheitsfelder hat, verarbeitet der KI-Dienst das ganze Dokument mitsamt Gesundheitsangaben (Erheben, Auslesen und Abfragen sind Verarbeitung nach Art. 4 Nr. 2, [EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679) [LDH, 18.11.]). Der Zweck (Terminvorbereitung) bleibt zwar gleich, aber es kommt ein neuer Empfänger hinzu, und die bisher geplante Zusage „keine KI“ würde sonst falsch. Einwilligung muss informiert sein (Art. 4 Nr. 11, ErwG 42) und für Art. 9 ausdrücklich ([Art. 9 DSGVO](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679) [LDH]; [EDSA-Leitlinien 05/2020](https://edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_en) [Web]). Darum nennt Text (a) das KI-Auslesen und den KI-Dienst ausdrücklich und ermöglicht eine Ablehnung nur des KI-Teils (Granularität, ErwG 32 und 43); nach Oles Zwei-Knopf-Entscheidung per Stichwort „ohne KI“ (A9), siehe „Stand Nachrecherche 18.11.“. Einwilligungen nach dem alten Text decken kein KI-Auslesen.

**Art. 22 DSGVO:** Greift nicht. Das Auslesen bereitet die Beratung vor; es gibt keine Entscheidung mit rechtlicher Wirkung oder ähnlich erheblicher Beeinträchtigung, und der Vermittler prüft die Werte (K6). Wichtig bleibt die Richtigkeit (Art. 5 Abs. 1 lit. d): Die DSK weist in ihrer Orientierungshilfe darauf hin, dass unzutreffende KI-Ausgaben zu unzulässigen Verarbeitungen führen können ([DSK, OH KI und Datenschutz, Mai 2024, Kopie BayLfD](https://www.datenschutz-bayern.de/dsbk-ent/DSK_OH_KI_und_Datenschutz.pdf) [Web], Inhalt laut Suchergebnis).

**Art. 28 Abs. 2 und 4 (Unterauftragnehmer):** Der KI-Anbieter ist weiterer Unterauftragnehmer. Nötig: vorherige Genehmigung durch den Vermittler (AVV § 4 Nr. 4 mit Namen und Ort, bei allgemeiner Genehmigung Ankündigung mit Widerspruchsrecht), Weitergabe derselben Pflichten (DPA des Anbieters prüfen: Weisungsbindung, kein Training, Löschung, Unterstützung, Audit). Stand der Anbieter laut Suche:
- **Azure OpenAI, EU Data Zone:** Verarbeitung und etwaige menschliche Prüfung im EWR (Microsoft-Q&A, Sekundärquelle). Standardmäßig kann die Missbrauchsüberwachung Eingaben speichern (Angaben zur Dauer uneinheitlich, oft 30 Tage genannt); Null-Speicherung gibt es nur über ein genehmigtes „modified abuse monitoring“ je Ressource auf Antrag ([Microsoft Q&A zu ZDR bei Data Zone](https://learn.microsoft.com/en-us/answers/questions/5625475/zero-data-retention-on-azure-open-ai-datazone-llm), [Microsoft Q&A zur Aktivierung](https://learn.microsoft.com/en-us/answers/questions/5834904/enable-zero-data-retention) [Web]). Ohne Genehmigung ist die Zusage „ohne Speicherung beim Anbieter“ nicht erfüllt.
- **OpenAI mit EU-Datenresidenz:** Laut OpenAI werden API-Anfragen aus EU-Projekten in der Region mit Zero Data Retention verarbeitet; Residenz nur für neue Projekte wählbar; Berechtigung nicht eindeutig dokumentiert ([OpenAI, Introducing data residency in Europe](https://openai.com/index/introducing-data-residency-in-europe/) [Web]; offene Frage im [OpenAI-Forum](https://community.openai.com/t/how-can-an-api-customer-become-eligible-for-eu-data-residency/1381888) [Web]).
- In beiden Fällen ist die Konzernmutter ein US-Unternehmen; ein Zugriff nach US-Recht ist nicht ausgeschlossen. DPF-Zertifizierung von Microsoft und OpenAI vor Vertragsschluss auf der offiziellen DPF-Liste prüfen (nicht per Tool bestätigt).
- **§ 203 StGB:** Auch der KI-Anbieter ist weitere mitwirkende Person (§ 203 Abs. 3 S. 2, Abs. 4 S. 2 Nr. 2, [§ 203 StGB](https://www.gesetze-im-internet.de/stgb/__203.html) [LDH]). Verschwiegenheitsverpflichtung in Textform anfragen; zusätzlich deckt die Einwilligung (a) die Weitergabe ab.

**KI-Verordnung:** Für den Assistenten selbst gilt Art. 50 Abs. 1 (Hinweis, dass man mit einer KI kommuniziert, wenn das nicht offensichtlich ist; Wortlaut [EUR-Lex 32024R1689](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689) [LDH, 18.11.]); laut Fachquellen gelten die Transparenzpflichten seit dem 2.8.2026, ohne allgemeine Übergangsfrist für Chatbots ([CMS, Transparenzpflichten der KI-VO](https://cms.law/de/deu/legal-updates/deepfakes-chatbots-co.-die-neuen-transparenzpflichten-der-ki-vo), [IHK Schleswig-Holstein](https://www.ihk.de/sh/ki-kennzeichnung) [Web]; Stand eines „Digital-Omnibus“ nicht verifiziert). Das Auslesen selbst interagiert nicht mit dem Lead und erzeugt keine veröffentlichten Inhalte; eine eigene Kennzeichnungspflicht nach Art. 50 sehe ich dafür nicht, die Transparenz läuft über DSGVO-Information und die Kennzeichnung im CRM (K6). Kein Hochrisikosystem, solange keine Risikobewertung oder Preisbildung für Lebens- oder Krankenversicherung erfolgt (K8). Pflicht zur KI-Kompetenz (Art. 4 KI-VO) für performancegrowth und die Vermittler mitdenken (ohne Fundstelle). Prüfpunkt im Rechercheplan: Nr. 8 der Queue.

**Art. 5 Abs. 1 lit. c (Datenminimierung):** Das Schema ohne Gesundheitsfelder ist richtig, reicht aber allein nicht, weil das Eingabedokument die Angaben enthält. Zusätzlich: nur benötigte Seiten senden (z. B. Versicherungsschein, Beitragsseite), Freitext ausschließen, Ausgabefilter (K4), keine Speicherung von Prompts und Rohantworten (K5), ZDR beim Anbieter, KI-Ablehnung möglich. Eine noch stärkere Variante wäre eine Schwärzung vor dem Senden (eigene EU-OCR ohne Drittanbieter plus Regelfilter); das ist aufwendig und für den Start nicht zwingend.

**Was zusätzlich umgesetzt werden muss:** K1 bis K8 (Softwareliste), AVV § 1a und § 4 Nr. 4, Datenschutzhinweis (c) mit KI-Absatz, DSFA R8 bis R10, Einwilligungstext (a) neue Fassung.

---

## Fertige Texte

### (a) Einwilligungstext für den Chat

Interaktive Nachricht, Haupttext (Platzhalter in geschweiften Klammern dynamisch füllen):

> Ich willige ein, dass {Vorname Nachname des Vermittlers} ({Firma}) meine hier gesendeten Policen zur Vorbereitung unseres Termins speichert und die Vertragsdaten automatisch per KI auslesen lässt, auch wenn sie Gesundheitsangaben enthalten (etwa Kranken-, BU- oder Lebensversicherung). Beteiligt sind WhatsApp (Meta, Zugriff auch aus den USA möglich), der Dienstleister performancegrowth und ein KI-Dienst mit Verarbeitung in der EU; Widerruf jederzeit mit „Widerruf“, Infos: {Link Datenschutzhinweise}

Ergänzung im Haupttext nach Entscheidung Ole und Auflage A9 (Stand 18.11.), als letzter Satz vor dem Link: „Ohne KI? Dann antworten Sie ‚ohne KI‘.“

Knöpfe nach Entscheidung Ole (WhatsApp erlaubt höchstens 3 Antwortknöpfe mit je höchstens 20 Zeichen):
- „Einverstanden“ (Speichern und KI-Auslesen; wird zusätzlich „ohne KI“ geschrieben, vorher oder danach: nur Speichern, Protokoll mit `ki=false`)
- „Lieber nicht“

Frühere Fassung mit drittem Knopf „Ja, aber ohne KI“: rechtlich die sicherste Variante, von Ole verworfen; A9 ist der Ersatz.

Den sicheren Upload-Link (E1) in der Folgenachricht oder bei „Lieber nicht“ anbieten, da die Knopfzahl begrenzt ist.

Solange KI-Auslesen für Kranken, BU und Leben noch nicht freigegeben ist (siehe Abschnitt „KI-Auslesen“), bleibt der Text trotzdem korrekt, weil er nur erlaubt und nicht verspricht; die Software liest diese Sparten dann einfach nicht aus. Alte Einwilligungen ohne KI-Hinweis decken kein KI-Auslesen: dafür neu fragen oder nicht auslesen.

Fußzeile (optional, höchstens 60 Zeichen): „Ihr Termin findet auch ohne Unterlagen statt.“

Folgenachricht nach Klick auf „Einverstanden“: „Danke! Schicken Sie die Policen gern als Foto oder PDF. Seiten mit Gesundheitsangaben können Sie schwärzen, wenn Sie sie nicht besprechen möchten.“

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
> Zur Vorbereitung Ihres Beratungstermins bitten wir Sie, Kopien Ihrer bestehenden Versicherungsverträge zu schicken. Diese können Gesundheitsangaben enthalten, etwa Risikozuschläge oder Leistungsausschlüsse in Kranken-, Berufsunfähigkeits- oder Lebensversicherungen. Wir verarbeiten die Unterlagen nur mit Ihrer ausdrücklichen Einwilligung (Art. 6 Abs. 1 lit. a und Art. 9 Abs. 2 lit. a DSGVO), und nur, um Ihren bestehenden Versicherungsschutz zu verstehen und Sie im Termin zu beraten. Wenn Sie zustimmen, lassen wir die wichtigsten Vertragsdaten (z. B. Versicherer, Tarif, Beitrag, Laufzeit, Kündigungsfrist, Versicherungssummen, Selbstbeteiligung) automatisch durch einen KI-Dienst auslesen, damit wir Ihre Verträge vergleichen können. Gesundheitsangaben werden dabei nicht erfasst oder gespeichert. Der KI-Dienst {Anbieter} verarbeitet die Unterlagen als unser Auftragsverarbeiter ausschließlich in der EU, speichert sie nicht und nutzt sie nicht zum Training. Die ausgelesenen Daten prüfen wir selbst; eine automatisierte Entscheidung über Sie findet nicht statt. Sie können das Auslesen ablehnen (Nachricht „ohne KI“ im Chat) und die Unterlagen trotzdem schicken. An Versicherer geben wir die Unterlagen nicht ohne Ihre gesonderte Zustimmung weiter.
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

Hinweis: Strafrahmen am Normtext geprüft ([§ 203 StGB](https://www.gesetze-im-internet.de/stgb/__203.html) [LDH, 18.11. Abend]: Abs. 4 S. 1 bis ein Jahr, Abs. 6 bis zwei Jahre); Stand der Datenbankfassung bitte von der Anwältin bestätigen lassen.

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

- **A1 Einwilligungsnachricht ersetzen:** Text (a) als interaktive Nachricht; Vermittlername und Link dynamisch; Erklärung im Haupttext; Knöpfe höchstens 20 Zeichen, Fußzeile höchstens 60 (Grenzen gegen Meta-Doku prüfen). Fußzeile „Sie erhält nur Herr Kannapinn.“ entfernen. Präzisiert 18.11. Abend (Bewertung Kurzfassung): Jede Fassung, auch eine Kurzfassung, nennt sichtbar Vermittler mit Firma, Zweck, „per KI“, „auch wenn die Policen Gesundheitsangaben enthalten“, die Beteiligten in einem Satz (WhatsApp/Meta mit möglichem US-Zugriff, Dienstleister, KI-Dienst EU), den Widerrufshinweis und den Link.
- **A2 Einwilligungstor:** Eingehende Medien werden vor gültiger Einwilligung nicht von Meta heruntergeladen und nicht gespeichert. Kommt eine Datei vor der Einwilligung, Einwilligung anfragen; nach Klick erst dann abrufen (Medien-ID bleibt bei Meta eine Zeit abrufbar); ohne Einwilligung nach der Nachfrage verwerfen und, soweit die API es zulässt, bei Meta löschen.
- **A3 Einwilligungsprotokoll erweitern:** Zeitstempel, Wortlaut, Textversion, Lead-ID, Telefonnummer, WhatsApp-Message-ID der Knopfantwort, Vermittler-ID, Version der Datenschutzhinweise. Unveränderbar speichern, auch nach Löschung der Policen als Nachweis aufbewahren (ohne Dokumentinhalte).
- **A4 Widerruf:** Stichwort „Widerruf“ (und Varianten wie „widerrufen“, „löschen“) erkennen, Policen sofort löschen inkl. Vorschauen und Zwischenspeicher, Bestätigung an den Lead, Hinweis an den Vermittler, keine weiteren Erinnerungen.
- **A5 Freischaltung je Vermittler:** Funktion standardmäßig aus; Aktivierung erst nach Zustimmung zur AVV-Ergänzung (b), Bestätigung der § 203-Information und Hinterlegung der Datenschutzhinweis-URL.
- **A6 Speicher:** Eigener privater Bucket nur für Policen, Region bzw. Rechtsraum EU fest konfiguriert, serverseitige Verschlüsselung mit mandantenbezogenem Schlüssel, Abruf nur über kurzlebige signierte URLs nach Login. Achtung: `src/lib/r2.ts` in diesem Repo nutzt Cloudflare R2 mit `region: "auto"` und öffentlicher URL für Werbebilder; diesen Client nicht für Policen wiederverwenden. Falls R2: EU-Jurisdiktion des Buckets einstellen und Cloudflare als Unterauftragnehmer (US-Konzern) aufnehmen.
- **A7 Logging und Benachrichtigungen:** Keine Dateiinhalte, Dateinamen mit Gesundheitsbezug, Medien-URLs oder Webhook-Payloads in Anwendungslogs, Fehlertracking (Sentry) oder Analytics; Push- und E-Mail-Benachrichtigungen an den Vermittler nur neutral („Neue Unterlagen von {Lead}“).
- **A8 Erinnerungen:** Höchstens 2, nur bei protokolliertem WhatsApp-Opt-in aus der Terminbuchung, nur bis zum Termin, Stopp bei Absage, „Lieber nicht“, „STOP“ oder Widerruf; jede Erinnerung mit Abmeldehinweis; kein werblicher Inhalt. Ergänzt 18.11. Abend: Bei Knopf „Später“ (Kurzfassung) gilt das als offene Antwort; jede Erinnerung nennt „Kein Interesse? Antworten Sie ‚Nein‘.“, „Nein“ beendet die Erinnerungen.
- **A9 KI-Ablehnung ohne dritten Knopf (neu 18.11., Folge der Bündelung):** Satz „Ohne KI? Dann antworten Sie ‚ohne KI‘.“ im Haupttext von (a). Stichwort (auch „keine KI“, „ohne ki“) vor und nach dem Klick erkennen, `ki=false` im Protokoll (A3) setzen, Bestätigung an den Lead („Alles klar, wir lesen nichts automatisch aus.“), bereits erzeugte Feldwerte löschen. Gilt für alle Sparten. Bestätigt 18.11. Abend durch EuGH C-252/21 Rn. 150, 151 [LDH]; Platzierung nur in der Fußzeile (Kurzfassung Ole) ist eine bewusst getragene Abweichung mit mittlerem statt gering bis mittlerem Restrisiko.

### Weitere Pflichtpunkte (zeitnah, spätestens vor breitem Rollout)

- **Zugriffskontrolle:** 2FA für Vermittler-Logins mit Zugriff auf Policen; kein Admin- oder Supportzugriff von performancegrowth auf Inhalte außer Break-Glass mit Protokoll und automatischer Benachrichtigung des Vermittlers.
- **Zugriffsprotokoll:** Ansehen, Herunterladen, Löschen je Datei mit Nutzer und Zeit; für den Vermittler einsehbar.
- **Löschautomatik:** täglicher Job für „90 Tage nach Termin oder geplantem Termin“; Backups mit definierter Höchstdauer; Löschnachweis.
- **Malware-Prüfung** eingehender PDFs und Bilder vor Bereitstellung (kein Inhaltsauslesen, nur Signaturprüfung).
- **Keine Weitergabe:** Keine Funktion zum Weiterleiten an Versicherer oder Dritte aus der Ablage; Export nur als Download durch den Vermittler.
- **Ausschluss aus Statistik/Benchmark** und aus jeder KI-Verarbeitung außer dem freigegebenen Auslesen technisch erzwingen (eigene Tabelle/Bucket ohne Anbindung an Auswertungen).

### Für das KI-Auslesen (Zusatzfrage 9)

- **K1 Einwilligungsflag:** Auslesen nur bei Knopf „Einverstanden“ mit KI-Textversion und ohne Stichwort „ohne KI“ (A9); bei `ki=false` oder alten Einwilligungen nie.
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
11. **Bündelung Speichern und KI (geschärft 18.11.):** Ole hat sich für zwei Knöpfe („Einverstanden“, „Lieber nicht“) entschieden, KI-Ablehnung nur per Stichwort „ohne KI“ (A9). Genügt das, um die Vermutung fehlender Freiwilligkeit nach ErwG 43 S. 2 auszuräumen, oder ist eine gesonderte Erklärung „angebracht“, weil das KI-Auslesen ein eigener Vorgang mit eigenem Empfänger ist (Art. 4 Nr. 2)? Einschlägig in EuGH C-252/21 ([CELEX:62021CJ0252](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62021CJ0252) [LDH]) sind Rn. 150 und 151 (per Tool verifiziert); trägt die Begründung aus Rn. 151 (Umfang, Auswirkung, Erwartung) die Übertragung auf das KI-Auslesen? Neu (18.11. Abend): Reicht „ohne KI“ in der Fußzeile (Minimalvariante der Kurzfassung) oder muss es in den Haupttext? Und: Fällt bei Unwirksamkeit wegen Bündelung auch die Einwilligung ins Speichern, oder ist sie teilbar?
12. **Anhängiges Verfahren (neu 18.11.):** EuGH C-317/25 Groupe Canal+ gegen CNIL, Schlussanträge vom 17.9.2026 ([CELEX:62025CC0317](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62025CC0317) [LDH]): Berührt es die Anforderungen an gesonderte Einwilligungen? (Inhalt nicht abgerufen.)

---

## Offen gebliebene Recherche (Legal Data Hunter Tageslimit)

Stand 18.11. Abend: Limit nach 7 Abfragen erneut erreicht, resets_at 2026-11-19T14:07:00+00:00 (Meldung des Tools: limit_type „day“, Plan „free“, Upgrade unter https://legaldatahunter.com/pricing). Erledigt am 18.11. Abend: Volltext DSGVO (Art. 4 Nr. 11 und 15, Art. 9, 28, 35, 44, ErwG 32, 42, 43, 91), Volltext EuGH C-252/21 (Rn. 150, 151), § 203 StGB, EuGH C-413/23 P. Erledigt am 18.11. tagsüber: Art. 4, Art. 7 DSGVO, Art. 50 KI-VO, §§ 6, 60, 61, 68 VVG, EuGH C-673/17, C-61/19, C-252/21 (Leitsätze). Weiter offen, beim nächsten Reset nachholen und in `docs/recht/legal-data-hunter-queue.md` (Nr. 6, 10) eintragen:
- Rechtsprechung: BGH VIII ZR 53/09 (als Erstes, resolve_reference wurde vom Limit gestoppt), BGH VI ZR 225/17; Urteil EuGH C-21/23; BGH/OLG zu § 7 UWG bei Terminerinnerungen; Rechtsprechung zu Messenger/WhatsApp und Gesundheitsdaten; BGH/OLG zu Gesundheitsdaten bei Versicherungsvermittlern.
- Normtexte: § 62 VVG, § 213 VVG, § 34d GewO, § 15 VersVermV.
- Behördenpraxis: EDSA-Leitlinien 05/2020 (Mindestinhalt, gestaffelte Information, Granularität) über das Tool suchen (namespace doctrine, country EU); DSK-Muss-Liste (bundesweite Fassung), DSK-Papiere zu Messengern.

## Quellen

[LDH] Legal Data Hunter:
- [Verordnung (EU) 2016/679, Art. 9](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679)
- [§ 7 UWG](https://www.gesetze-im-internet.de/uwg_2004/__7.html)
- [EuGH C-184/20, Urteil 1.8.2022](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62020CJ0184) (Lauf 16.11.)
- [EuGH C-21/23, Schlussanträge](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62023CC0021) (Lauf 16.11.)
- [Verordnung (EU) 2016/679, Art. 4 und Art. 7, Wortlaut](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679) (18.11.)
- [EuGH C-252/21, Meta Platforms u. a. gegen Bundeskartellamt, Urteil 4.7.2023](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62021CJ0252) (18.11.)
- [EuGH C-61/19, Orange România, Urteil 11.11.2020](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62019CJ0061) und [Schlussanträge](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62019CC0061) (18.11.)
- [EuGH C-673/17, Planet49, Urteil 1.10.2019](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62017CJ0673) (18.11.)
- [EuGH C-317/25, Groupe Canal+, Schlussanträge 17.9.2026](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62025CC0317) (18.11., anhängig)
- [§ 6 VVG](https://www.gesetze-im-internet.de/vvg_2008/__6.html), [§ 60 VVG](https://www.gesetze-im-internet.de/vvg_2008/__60.html), [§ 61 VVG](https://www.gesetze-im-internet.de/vvg_2008/__61.html), [§ 68 VVG](https://www.gesetze-im-internet.de/vvg_2008/__68.html) (18.11.)
- [Verordnung (EU) 2024/1689, Art. 50, Wortlaut](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689) (18.11.)
- [Verordnung (EU) 2016/679, Volltext: Art. 4 Nr. 11 und 15, Art. 9, 28, 35, 44, ErwG 32, 42, 43, 91](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679) (18.11. Abend)
- [EuGH C-252/21, Volltext, Rn. 143 bis 152](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62021CJ0252) (18.11. Abend)
- [EuGH C-413/23 P, EDSB gegen SRB, Urteil 4.9.2025, Rn. 108 bis 111](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62023CJ0413) (18.11. Abend)
- [§ 203 StGB](https://www.gesetze-im-internet.de/stgb/__203.html) (18.11. Abend, vorher Web)

[Web] WebSearch:
- [EuGH C-21/23 Lindenapotheke, curia](https://curia.europa.eu/jcms/jcms/p1_4584865/de)
- [EDSA-Leitlinien 05/2020 zur Einwilligung](https://edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_en)
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

## Entscheidung Ole (17.11., Nacht)

- Einwilligung nur mit zwei Knöpfen „Einverstanden“ und „Lieber nicht“. Speichern und KI-Auslesen werden gebündelt eingewilligt, ohne getrennte Option „ohne KI“. Begründung Ole: sonst wählen fast alle die Option ohne KI. Rechtliche Einordnung: Das Angebot bleibt insgesamt freiwillig (der Termin findet auch ohne Unterlagen statt), daher kein Kopplungsproblem nach Art. 7 Abs. 4 DSGVO. Offen ist, ob ErwG 43 hier eine getrennte Einwilligung verlangt (Anwaltsfrage 11). Restrisiko leicht erhöht, von Ole bewusst getragen.
  - Nachtrag 18.11.: Nach der Nachrecherche (Art. 4 Nr. 2, Art. 7 DSGVO, EuGH C-252/21, alle [LDH]) ist die Bündelung vertretbar, aber das Restrisiko eher mittel als leicht erhöht. Empfehlung ohne dritten Knopf: Auflage A9 (Stichwort „ohne KI“), senkt es auf gering bis mittel. Entscheidung über A9 liegt bei Ole.
- Livegang aller Sparten. Gesundheitssparten je Vermittler erst nach Zustimmung zur AVV-Ergänzung (A5). KI-Auslesen für Kranken, BU und Leben erst mit Nachweis der Null-Speicherung (K2).
