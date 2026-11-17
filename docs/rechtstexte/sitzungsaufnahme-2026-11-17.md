# Sitzungsaufnahme (Sentry Session Replay) im Vermittlerbereich: Rechtsprüfung und Texte (17.11.2026)

**Status: Entwurf zur Freigabe durch Ole.** Kein Gutachten, keine Rechtsberatung im Sinne einer Mandatierung;
einsatzfertige Texte mit kurzer Begründung. Aktenzeichen und Fundstellen vor einer Veröffentlichung einmal gegenprüfen.

**Ergebnis in fünf Sätzen**

1. Die Aufnahme ist **nur mit Opt-in je Nutzer** zulässig: § 25 Abs. 1 TDDDG (Zugriff auf und Speicherung im Endgerät durch das Replay-Skript, kein Ausnahmetatbestand nach Abs. 2), für die Weiterverarbeitung Art. 6 Abs. 1 lit. a DSGVO.
2. Für die Nutzungsdaten der Vermittler und ihrer Mitarbeiter sind wir **Verantwortlicher**; Sentry ist dafür unser Auftragsverarbeiter (bestehender DPA). Leaddaten dürfen in der Aufnahme **nicht** ankommen (auch keine Lead-IDs in URLs), sonst würden wir Auftragsdaten für eigene Zwecke nutzen (Art. 28 Abs. 10 DSGVO).
3. Der Einwilligungsdialog darf um Zustimmung werben (Nutzen, Ehrlichkeit, guter Zeitpunkt), aber **Ja und Nein müssen gleichwertig** sein: gleiche Ebene, gleiche Größe, gleiche Form. Nach der strengen deutschen Linie (DSK, OLG Köln, VG Hannover) ist ein farbig hervorgehobenes Ja neben einem blassen Nein angreifbar; empfohlen sind zwei gleich gestaltete Knöpfe.
4. Datenschutzhinweise ergänzen, Zweck von Sentry in Anlage 2 anpassen, im AVV klarstellen, dass Nutzungsdaten für eigene Zwecke nicht unter den AVV fallen. AGB bleiben unverändert.
5. Die heutigen **Fehler-Replays ohne Einwilligung** (`replaysOnErrorSampleRate: 1.0`) sollten mit dieser Umstellung ebenfalls unter die Einwilligung fallen.

---

## 1. Rechtsgrundlage und Einordnung

### 1.1 § 25 TDDDG: Einwilligung erforderlich

- **Anwendungsbereich.** § 25 Abs. 1 TDDDG (bis 13.05.2024 TTDSG) setzt Art. 5 Abs. 3 ePrivacy-RL um und gilt für jede Speicherung von Informationen in der Endeinrichtung des Endnutzers und jeden Zugriff darauf, **unabhängig davon, ob es personenbezogene Daten sind**, und auch gegenüber Unternehmern (Endnutzer ist auch eine juristische Person, § 2 Abs. 2 TDDDG i. V. m. § 3 Nr. 13 TKG). Dass unsere Nutzer B2B-Kunden sind, ändert daher nichts.
- **Tatbestand erfüllt.** Das Replay-Skript liest fortlaufend DOM, Klicks, Scrollen, Mausbewegungen, Bildschirmgröße und Navigation im Browser aus und schickt sie an Sentry; zusätzlich legt das SDK im `sessionStorage` eine Replay-Sitzung an (`sentryReplaySession`). Beides ist Speichern bzw. Zugreifen. Der EDSA legt Art. 5 Abs. 3 ausdrücklich weit aus und erfasst auch JavaScript, das das Endgerät zur Übermittlung von Informationen veranlasst (EDPB Guidelines 2/2023 on the Technical Scope of Art. 5(3) ePrivacy Directive, Version 2.0 vom 07.10.2024, Rn. 33 ff.).
- **Keine Ausnahme nach § 25 Abs. 2 Nr. 2 TDDDG.** Unbedingt erforderlich ist nur, was der Nutzer für den ausdrücklich gewünschten Dienst braucht. UX-Analyse, Klickwege, Rage und Dead Clicks dienen unserer Produktverbesserung, nicht der Bereitstellung der Funktion. Reichweitenmessung und Nutzungsanalyse fallen nach Auffassung der Aufsichtsbehörden nicht unter die Ausnahme (DSK, Orientierungshilfe für Anbieter:innen von digitalen Diensten, Version 1.2, Nov. 2024, Abschnitt zu § 25 Abs. 2 Nr. 2; Art.-29-Gruppe WP 194, Opinion 04/2012 zu Cookie-Ausnahmen). Für Session Replay als besonders eingriffsintensive Form gilt das erst recht.
- **Rechtsprechung.** EuGH, Urt. v. 01.10.2019, C-673/17 (Planet49): aktive Einwilligung, kein vorausgewähltes Kästchen, Information über Funktionsdauer und Zugriff Dritter. BGH, Urt. v. 28.05.2020, I ZR 7/16 (Cookie-Einwilligung II): Einwilligung für Nutzungsprofile/Analyse erforderlich. EuGH, Urt. v. 11.11.2020, C-61/19 (Orange România): Beweislast beim Verantwortlichen. Eine veröffentlichte deutsche oder EuGH-Entscheidung speziell zu Session Replay ist mir nicht bekannt; in den USA laufen seit Jahren Sammelklagen nach Abhörgesetzen (z. B. CIPA, Pennsylvania WESCA) gegen Session-Replay-Einsatz, überwiegend ohne Erfolg der Kläger (etwa Popa v. Microsoft, 9th Cir. 2025, fehlende Klagebefugnis), für uns aber als Risikosignal: Behörden und Gerichte sehen das Werkzeug kritisch.

**Ergebnis:** Opt-in je Nutzer, vor dem ersten Laden des Replay-Codes. Die bisherigen Fehler-Replays im Buffer-Modus (60 Sekunden Ringpuffer im Speicher, Upload bei Fehler) greifen ebenfalls auf das Endgerät zu und dienen nicht unmittelbar dem gewünschten Dienst; die Ausnahme nach § 25 Abs. 2 Nr. 2 ist dafür bestenfalls vertretbar, nicht sicher. Empfehlung: Replay in **beiden** Modi nur nach Einwilligung, reine Fehlermeldungen ohne Replay wie bisher.

### 1.2 DSGVO

- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. a DSGVO. Wo § 25 Abs. 1 TDDDG eine Einwilligung verlangt, kann die nachfolgende Verarbeitung praktisch nicht auf berechtigte Interessen (lit. f) gestützt werden, weil die Erhebung selbst nur mit Einwilligung zulässig ist; die DSK empfiehlt, die Einwilligung so zu formulieren, dass sie beides abdeckt (DSK OH Digitale Dienste, Abschnitt zum Verhältnis TDDDG/DSGVO). Die Einwilligung muss die Anforderungen aus Art. 4 Nr. 11, Art. 7 DSGVO erfüllen (§ 25 Abs. 1 Satz 2 TDDDG verweist darauf).
- **Rolle:** Für die Nutzungsdaten der Vermittler und ihrer Mitarbeiter (Klicks, Wege, Gerät, Zeitpunkt) sind wir **Verantwortlicher** (eigener Zweck: Produktverbesserung). So steht es auch in `docs/datenschutz.md` (Abschnitt 1, „Logins, Sicherheit, Änderungsprotokoll, Nutzungsmessung“). Sentry (Functional Software, Inc.) ist insoweit unser **Auftragsverarbeiter** nach dem Sentry-DPA (Art. 28 DSGVO).
- **Verhältnis zum AVV (Leaddaten):** Für Leaddaten sind wir Auftragsverarbeiter des Vermittlers. Nutzen wir sie für eigene Zwecke, werden wir insoweit selbst Verantwortlicher und verstoßen gegen den AVV (Art. 28 Abs. 10, Art. 29 DSGVO). Deshalb muss die Technik sicherstellen, dass **keine Leadinhalte und keine Lead-Kennungen** Sentry erreichen: Texte, Eingaben und Medien maskiert, Lead-IDs in Pfaden und Netzwerk-URLs ersetzt, keine Konsolenausgaben. Dann sind die Aufnahmen bezogen auf Leads anonym (Sternchen in gleicher Länge ohne Zuordnungsmöglichkeit; vgl. zur relativen Betrachtung EuGH, Urt. v. 04.09.2025, C-413/23 P, EDSB/SRB). Das Maskieren selbst geschieht im Browser des Nutzers vor jeder Übermittlung; weil dabei technisch Leadinhalte durch unseren Code gelesen werden, empfehle ich vorsorglich die Klarstellung im AVV (Abschnitt 4).
- **Art. 9 DSGVO:** Gesundheitsangaben in Leads werden wie alle Texte maskiert, gelangen also nicht zu Sentry. Bei funktionierender Maskierung keine Verarbeitung besonderer Kategorien zu unserem Zweck. Eine Lücke in der Maskierung wäre hier besonders schwer (Datenpanne nach Art. 33, gegenüber dem Vermittler Meldung nach AVV binnen 48 Stunden).
- **Mitarbeiter der Vermittler:** Wir sind nicht ihr Arbeitgeber, die Einwilligung ist daher nicht schon wegen eines Abhängigkeitsverhältnisses zu uns fraglich. Freiwilligkeit setzt aber voraus, dass der Inhaber die Entscheidung seiner Mitarbeiter **weder sieht noch für sie trifft** und dass Aufnahmen nie an den Vermittler gehen (sonst Leistungs- und Verhaltenskontrolle, beim Vermittler § 87 Abs. 1 Nr. 6 BetrVG und § 26 BDSG). Jeder Zugang entscheidet selbst.
- **DSFA:** Schwellwertprüfung nach Art. 35 DSGVO dokumentieren. Bei 30 % Stichprobe, vollständiger Maskierung, B2B-Nutzern und ohne Profilbildung über Sitzungen hinweg ist eine vollständige DSFA nach meiner Einschätzung nicht erforderlich; Begründung im Verzeichnis (`docs/datenschutz.md`) festhalten.

### 1.3 Drittland

- Datenregion EU (Sentry „EU“, Speicherung in Frankfurt/Deutschland bei Google Cloud). Die Vertragspartnerin Functional Software, Inc. sitzt in den USA; Fernzugriffe (Support, Betrieb) und US-Recht (CLOUD Act) sind nicht ausgeschlossen.
- Grundlage: EU-US Data Privacy Framework (Angemessenheitsbeschluss vom 10.07.2023; Klage abgewiesen durch EuG, Urt. v. 03.09.2025, T-553/23, Latombe; Rechtsmittel möglich) **und** hilfsweise Standardvertragsklauseln im Sentry-DPA. **Prüfen und ablegen:** aktiver DPF-Eintrag von Functional Software, Inc. auf dataprivacyframework.gov, unterschriebener bzw. angenommener Sentry-DPA mit Datum (Tabelle „Nachweis Auftragsverarbeitungsverträge“ in `docs/datenschutz.md`).
- Sentry-KI-Funktionen (z. B. Seer, Replay-Zusammenfassungen) geben Daten an weitere Unterauftragnehmer (KI-Anbieter) weiter: für die Organisation **ausschalten** oder vor Nutzung gesondert prüfen.

### 1.4 Anforderungen an eine wirksame Einwilligung (und wie wir sie erfüllen)

| Anforderung | Quelle | Umsetzung |
|---|---|---|
| Informiert: wer, was, wozu, welcher Empfänger, Drittland, Dauer, Widerruf | Art. 4 Nr. 11, 7, 13 DSGVO; EuGH C-673/17; EDPB Guidelines 05/2020, Rn. 64 | Erste Ebene nennt Zweck, Art der Daten, Sentry, Maskierung, Freiwilligkeit und Widerrufsweg; „Mehr erfahren“ führt zum vollständigen Abschnitt der Datenschutzhinweise (Speicherdauer, USA-Bezug, Rechte) |
| Aktive, eindeutige Handlung, nichts vorausgewählt | Art. 4 Nr. 11 DSGVO; EuGH C-673/17; BGH I ZR 7/16 | Nur der Klick auf „Ja“ ist Einwilligung. Schließen, Wegklicken, Weiterarbeiten = keine Einwilligung |
| Freiwillig, Koppelungsverbot | Art. 7 Abs. 4 DSGVO; EuGH C-252/21 (Meta), Rn. 140 ff. | App voll nutzbar ohne Ja; keine Vorteile, Rabatte oder Funktionen nur bei Ja; kein Hinweis in AGB oder Vertrag als Pflicht |
| Gleichwertige Ablehnung auf derselben Ebene | DSK OH Digitale Dienste; EDPB Cookie Banner Taskforce Report (17.01.2023); OLG Köln, Urt. v. 19.01.2024, 6 U 80/23; VG Hannover, Urt. v. 19.03.2025, 10 A 5385/22; LG Rostock, Urt. v. 15.09.2020, 3 O 762/19 | „Nein“ als gleich großer Knopf direkt neben „Ja“, ein Klick |
| Kein Nudging, keine Dark Patterns | Art. 5 Abs. 1 lit. a DSGVO (Treu und Glauben); EDPB Guidelines 03/2022 zu Deceptive Design Patterns; Art. 25 DSA (für Plattformen, als Wertungshilfe) | Kein Confirmshaming („Nein, ich will keine bessere App“), keine versteckte Ablehnung, keine wiederholte Abfrage nach Nein, kein Zeitdruck. Siehe 2.3 zur Farbe |
| Widerruf so einfach wie Erteilung | Art. 7 Abs. 3 DSGVO | Schalter unter **Einstellungen**, ein Klick, wirkt sofort |
| Nachweis | Art. 7 Abs. 1 DSGVO; EuGH C-61/19 | Protokoll je Zugang mit Zeitpunkt, Entscheidung, Textversion, Wortlaut (siehe Abschnitt 5) |
| Bestimmtheit, getrennte Zwecke | Art. 6 Abs. 1 lit. a („für einen oder mehrere bestimmte Zwecke“) | Eigene Abfrage nur für Sitzungsaufnahmen, nicht gebündelt mit anderen Zwecken |

---

## 2. Einwilligungstext für die Abfrage in der App

### 2.1 Text (einsatzfertig, Fassung „sitzungsaufnahme-2026-11-17“)

**Titel:**
> Helfen Sie mit, die App einfacher zu machen?

**Text (2 Sätze):**
> Mit Ihrem Ja zeichnen wir bei einem Teil Ihrer Sitzungen über unseren Dienstleister Sentry (Datenregion EU) auf, wie Sie durch die App klicken, damit wir umständliche Stellen finden und verbessern. Alle Texte, Eingaben und Kundendaten sind dabei unkenntlich, die Teilnahme ist freiwillig und lässt sich jederzeit unter **Einstellungen** beenden.

**Knöpfe (empfohlen):**
- „Ja, gern“
- „Nein, danke“

**Zulässige Varianten:** „Ja, ich helfe mit“ / „Nein, lieber nicht“ · „Einverstanden“ / „Ablehnen“. Beide Knöpfe immer aus demselben Paar, gleich lang wirkend.

**Link:** „Mehr erfahren“ → `https://performancegrowth.de/datenschutz#sitzungsaufnahmen` (neuer Tab), unterhalb des Textes oder zwischen Text und Knöpfen, nicht nach den Knöpfen versteckt.

**Bestätigung nach Ja (kleiner Hinweis, 1 Satz):**
> Danke! Sie können das jederzeit unter **Einstellungen** wieder ausschalten.

**Nach Nein:** kein Hinweis, kein Nachfragen.

**Schalter unter Einstellungen** (Widerruf und spätere Zustimmung):
- Beschriftung: „Sitzungsaufnahme zur Verbesserung der App“
- Hinweis (1 Satz): „Wir sehen, wie Sie klicken, nicht was Sie lesen oder eingeben.“ + Link „Mehr erfahren“
- Ausschalten wirkt sofort; Einschalten zeigt vorher denselben Text wie die Abfrage (2.1) mit „Ja, gern“ / „Abbrechen“.

**Warum das konversionsstark und trotzdem wirksam ist:** Die Frage spricht den Nutzen für den Nutzer an („einfacher machen“, „umständliche Stellen“), nimmt die Hauptsorge vorweg („Texte, Eingaben und Kundendaten unkenntlich“) und zeigt, dass der Ausstieg leicht ist. Das sind wahre, wesentliche Informationen, kein Druck. Gestrichen habe ich bewusst: Formulierungen wie „nur 1 Klick“, Fortschrittsbalken, Hinweise auf andere Nutzer („90 % machen mit“) und jede Verknüpfung mit Vorteilen; das wäre Nudging bzw. ein Koppelungsproblem.

Hinweis zur Formulierung „Kundendaten“: Gemeint sind die Daten der Leads und Kunden des Vermittlers; so verstehen Vermittler das Wort. Der Satz ist nur wahr, wenn die Technik aus Abschnitt 5 (Maskierung, IDs aus URLs) umgesetzt und getestet ist.

### 2.2 Zeitpunkt und Häufigkeit

- Nicht beim ersten Login und nicht während der Einrichtung, sondern frühestens nach einigen Tagen Nutzung, nach einer abgeschlossenen Aufgabe (z. B. auf „Heute“ nach dem Laden), nie mitten in einem Vorgang. Das ist zulässig und hebt die Zustimmungsquote ohne Druck.
- Einmal je Zugang. Wird das Fenster ohne Entscheidung geschlossen (X, Escape, Klick daneben), gilt das als „keine Entscheidung“: höchstens **ein** weiteres Mal frühestens 7 Tage später fragen. Nach „Nein“ nicht erneut fragen (frühestens bei einer neuen Textfassung mit geänderten Zwecken, dann ist ohnehin neu einzuwilligen).
- Nicht als blockierendes Fenster, das die App unbenutzbar macht (Handy: Bottom Sheet, das sich schließen lässt).

### 2.3 Gestaltung: Darf das Ja hervorgehoben werden?

- **Strenge deutsche Linie:** Die DSK verlangt eine gleichwertige Ablehnungsmöglichkeit auf derselben Ebene; eine Gestaltung, bei der die Zustimmung farblich hervorgehoben und die Ablehnung optisch zurückgenommen ist, sehen Aufsichtsbehörden und Gerichte als Indiz gegen eine freiwillige, unbeeinflusste Entscheidung (OLG Köln 6 U 80/23; VG Hannover 10 A 5385/22; LG Rostock 3 O 762/19). Der EDSA (Cookie Banner Taskforce, 2023) lehnt eine pauschale Farbregel ab und prüft im Einzelfall, beanstandet aber, wenn die Ablehnung wegen Kontrast oder Form kaum als Option wahrnehmbar ist.
- **Empfehlung (rechtssicher):** Zwei **gleich große, gleich geformte, gleich gestaltete Knöpfe** nebeneinander (Handy: untereinander, volle Breite, gleiche Höhe), gleiche Schrift und Schriftstärke, beide mit ausreichendem Kontrast (WCAG AA). „Ja“ darf **zuerst** stehen. Die Konversion kommt aus Text und Zeitpunkt, nicht aus der Farbe.
- **Vertretbar, mit Restrisiko:** „Ja“ in der Primärfarbe, „Nein“ als gleich großer, klar umrandeter Knopf mit voller Schriftfarbe. Nach EDSA-Sicht im Einzelfall zulässig, nach der deutschen Rechtsprechung angreifbar. Weil eine unwirksame Einwilligung alle damit erhobenen Aufnahmen rechtswidrig macht, rate ich davon ab.
- **Unzulässig:** „Nein“ als Textlink, kleiner, grau oder nur in einer zweiten Ebene; Schließen-X als einzige Ablehnung; vorausgewählter Schalter; Ablehnung erst nach Scrollen.

---

## 3. Abschnitt für die Datenschutzhinweise (einsatzfertig)

Ort: Datenschutzerklärung `performancegrowth.de/datenschutz` (Lovable, `src/routes/datenschutz.tsx`), Anker `#sitzungsaufnahmen`, nach dem Abschnitt zur Fehlerüberwachung bzw. zum Kundenbereich. Stand-Datum oben anpassen. Rechtstext in Sie-Form. Nummer an die bestehende Gliederung anpassen.

> **Sitzungsaufnahmen im Kundenbereich (nur mit Ihrer Einwilligung)**
>
> Wenn Sie in unserer Software zustimmen, zeichnen wir bei einem Teil Ihrer Sitzungen im Kundenbereich (etwa 30 %) auf, wie Sie die Software bedienen. Zweck ist, umständliche Abläufe, Fehler und Stellen zu finden, an denen Klicks ins Leere gehen oder mehrfach nötig sind, und die Software zu verbessern. Verantwortlich sind wir, die Ole Kannapinn UG (haftungsbeschränkt).
>
> Aufgezeichnet werden Klicks, Tippen, Scrollen und Mausbewegungen, der Aufbau der aufgerufenen Seiten, die besuchten Seiten (ohne Kennungen einzelner Kontakte und ohne URL-Parameter), technische Angaben zu Anfragen an unseren Server (Adresse ohne Kennungen, Dauer, Statuscode), Fehlermeldungen sowie Browser, Betriebssystem, Gerätetyp, Bildschirmgröße, Zeitpunkt und Dauer der Sitzung. Alle Texte, Eingaben, Bilder und sonstigen Medien werden bereits in Ihrem Browser vor der Übermittlung unkenntlich gemacht; wir sehen daher weder Inhalte noch Daten Ihrer Kontakte, Leads oder Kunden. Ihren Namen oder Ihre E-Mail-Adresse übermitteln wir nicht; Ihre IP-Adresse wird nur zur Übertragung verwendet und nicht gespeichert. Auf Seiten für Ihre Kunden (zum Beispiel Buchungs-, Angebots- und Empfehlungsseiten) und im Verwaltungsbereich findet keine Aufnahme statt.
>
> Rechtsgrundlage ist Ihre Einwilligung nach § 25 Abs. 1 TDDDG und Art. 6 Abs. 1 lit. a DSGVO. Die Einwilligung ist freiwillig; ohne sie können Sie die Software uneingeschränkt nutzen. Jeder Nutzer entscheidet für sich; Ihr Arbeitgeber oder Inhaber Ihres Kontos sieht Ihre Entscheidung und die Aufnahmen nicht. Zum Nachweis speichern wir Zeitpunkt, Ihre Entscheidung und die Fassung des Einwilligungstextes.
>
> Empfänger ist unser Auftragsverarbeiter Functional Software, Inc. (Sentry), 45 Fremont Street, 8th Floor, San Francisco, CA 94105, USA. Die Daten werden in der Datenregion EU (Deutschland) gespeichert. Ein Zugriff aus den USA ist nicht ausgeschlossen; er ist durch den Angemessenheitsbeschluss der EU-Kommission zum EU-US Data Privacy Framework, unter dem Sentry zertifiziert ist, und ergänzend durch EU-Standardvertragsklauseln abgesichert. Auf die Aufnahmen haben bei uns nur wenige berechtigte Personen Zugriff; wir werten sie nicht zur Leistungs- oder Verhaltenskontrolle aus und geben sie nicht an Ihren Arbeitgeber oder Dritte weiter.
>
> Die Aufnahmen werden nach 90 Tagen automatisch gelöscht. Sie können Ihre Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen, in der Software unter Einstellungen (Schalter „Sitzungsaufnahme zur Verbesserung der App“) oder per E-Mail an ole.kannapinn@performancegrowth.de. Die Aufnahme endet dann sofort; bereits gespeicherte Aufnahmen Ihres Zugangs löschen wir innerhalb von 30 Tagen. Die Rechtmäßigkeit der bis zum Widerruf erfolgten Verarbeitung bleibt unberührt. Den Nachweis Ihrer Entscheidung bewahren wir bis drei Jahre nach Ende des Jahres auf, in dem die Einwilligung endet. Ihre weiteren Rechte (Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Beschwerde bei einer Aufsichtsbehörde) finden Sie im Abschnitt zu Ihren Rechten.

Hinweise zum Text:
- „unter dem Sentry zertifiziert ist“ nur stehen lassen, wenn der DPF-Eintrag geprüft ist; sonst den Halbsatz streichen und nur Standardvertragsklauseln nennen.
- „90 Tage“ gilt für bezahlte Sentry-Pläne (Sentry-Doku „Replay Details, Retention“: 90 Tage bezahlt, 30 Tage im kostenlosen Plan, nicht einstellbar). Bei kostenlosem Plan „30 Tagen“ schreiben. Den Eintrag „Fehlerüberwachung“ in `docs/datenschutz.md` (bisher „90 Tage Standard, Prüfen“) entsprechend festhalten.
- „IP-Adresse … nicht gespeichert“ setzt die Sentry-Projekteinstellung „Prevent Storing of IP Addresses“ voraus (Abschnitt 5).
- „innerhalb von 30 Tagen löschen“ setzt die Zuordnung Replay-ID zu Zugang voraus (Abschnitt 5). Ohne diese Technik den Satz ersetzen durch: „Bereits gespeicherte Aufnahmen werden mit Ablauf der Speicherdauer gelöscht; auf Wunsch löschen wir sie früher, soweit wir sie Ihnen zuordnen können.“

Eintrag für `docs/webseite-offen.md` (wenn umgesetzt, durch den umsetzenden Arbeitsstrang): Datenschutzerklärung um diesen Abschnitt ergänzen, wörtlich, Sie-Form, Stand-Datum anpassen.

---

## 4. Unterauftragnehmer-Liste, AVV und AGB

### 4.1 Anlage 2 (`SUBPROCESSORS` in `src/lib/legal-texts.ts`), Zeile Sentry ersetzen

Bisher:
```ts
{ name: "Functional Software, Inc. (Sentry)", purpose: "Fehlerüberwachung ohne personenbezogene Inhalte", location: "Datenregion EU" },
```

Neu:
```ts
{ name: "Functional Software, Inc. (Sentry)", purpose: "Fehlerüberwachung; Sitzungsaufnahmen im Kundenbereich nur mit Einwilligung des einzelnen Nutzers, mit im Browser unkenntlich gemachten Texten, Eingaben und Bildern und ohne Kennungen von Leads (keine Inhalte aus Leads)", location: "Datenregion EU (Deutschland); Unternehmen USA" },
```

Begründung: Sentry bleibt derselbe Unterauftragnehmer, es kommt kein neuer hinzu; die 14-Tage-Widerspruchsregel des AVV greift für neue oder ersetzte Unterauftragnehmer, nicht für eine präzisere Beschreibung. Die bisherige Angabe „ohne personenbezogene Inhalte“ wäre aber nach Einführung nicht mehr ganz genau (Fehler-Replays, URLs), deshalb anpassen. Die Angabe „Unternehmen USA“ ergänze ich aus Transparenz, wie bei Railway.

### 4.2 AVV: Klarstellung empfohlen

Der geltende AVV und der Kurzfassungs-Entwurf nennen bei den Datenarten „Nutzungsdaten der Nutzer des Auftraggebers“ und bei den Betroffenen „Nutzer des Auftraggebers“. Das kann so gelesen werden, als verarbeiteten wir alle Nutzungsdaten nur im Auftrag. Für Sitzungsaufnahmen (und ebenso Anmeldung, Sicherheit, Abrechnung, eigene Nutzungsmessung) sind wir aber selbst Verantwortlicher. Zur Abgrenzung und als ausdrückliche Weisung zum Maskieren empfehle ich, in „Art, Zweck und Umfang der Verarbeitung“ (geltende Fassung) bzw. § 2 (Kurzfassung) nach den Datenarten einzufügen:

> **Eigene Zwecke des Auftragnehmers.** Nutzungsdaten der Nutzer des Auftraggebers, die der Auftragnehmer für eigene Zwecke verarbeitet (Anmeldung und Sicherheit, Abrechnung, Fehlerbehebung und Verbesserung der Software, etwa Sitzungsaufnahmen nach Einwilligung des einzelnen Nutzers), verarbeitet er als Verantwortlicher und nicht nach diesem Vertrag. Daten aus Leads und Kundendaten des Auftraggebers verwendet er dafür nicht; der Auftraggeber weist ihn an, solche Inhalte und Kennungen vor jeder Übermittlung an einen Dienst zur Fehler- oder Sitzungsaufnahme bereits im Browser unkenntlich zu machen bzw. zu entfernen. Aufnahmen von Nutzern gibt der Auftragnehmer nicht an den Auftraggeber weiter.

Wann: mit der nächsten AVV-Fassung (`LEGAL_VERSION` erhöhen). Bestehende Kunden mit angenommenem Vertrag in Textform informieren (AGB „Änderungen dieser AGB“, 6 Wochen). Der Satz begünstigt die Kunden und beschränkt uns; er ist keine Voraussetzung für den Start, wenn die Technik aus Abschnitt 5 steht, macht die Lage aber eindeutig. Ohne ihn bleibt das Restrisiko aus Abschnitt 6 Nr. 4.

### 4.3 AGB: keine Änderung

Die Sitzungsaufnahme ist keine Vertragsleistung und darf auch nicht als Pflicht des Kunden vereinbart werden (Koppelungsverbot). Eine AGB-Regel wäre sogar schädlich, weil sie den Eindruck einer vertraglichen Pflicht erweckt. Die Information gehört in die Datenschutzhinweise.

---

## 5. Technische Pflichten (vor dem Livegang umzusetzen)

**A. Einwilligung und Nachweis**
1. Einwilligungsprotokoll je Zugang (Nutzer, nicht Kunde), nur anhängend (append-only), z. B. eigenes Modell oder Muster wie `ConsentOptIn`: `userId`, `customerId`, `entscheidung` (`ja` | `nein` | `widerruf` | `ja_einstellungen`), `zeitpunkt` (Serverzeit), `textVersion` (z. B. `sitzungsaufnahme-2026-11-17`), Wortlaut bzw. Hash des angezeigten Textes, `quelle` (`abfrage` | `einstellungen`), Oberfläche (Web, App). Keine IP nötig. Aufbewahrung: bis 3 Jahre nach Ende des Jahres, in dem die Einwilligung endet bzw. das Konto gelöscht wird.
2. Aktueller Stand als Feld am Zugang (z. B. `sessionReplayConsent`, `sessionReplayConsentVersion`), maßgeblich serverseitig; der Client bekommt ihn mit der Sitzung.
3. Textversion: Ändern sich Zweck, Empfänger, Datenarten oder Speicherdauer wesentlich, neue Version und neue Einwilligung; bis dahin keine Aufnahme mehr auf Grundlage der alten.
4. Inhaber und Admins des Vermittlers sehen die Entscheidung ihrer Mitarbeiter nicht und können sie nicht setzen. Unser Admin-Bereich zeigt höchstens Gesamtzahlen.

**B. Kein Laden vor Einwilligung**
5. `replayIntegration` **nicht** in `Sentry.init` (heute in `src/instrumentation-client.ts`). Erst nach bestätigtem Ja per `Sentry.addIntegration(Sentry.replayIntegration({...}))` (oder `lazyLoadIntegration`) hinzufügen und starten. Vorher kein Replay-Code aktiv, kein `sessionStorage`-Eintrag, kein Puffer.
6. `replaysOnErrorSampleRate` für Nutzer ohne Einwilligung auf 0 (Empfehlung aus 1.1); mit Einwilligung Fehler-Replays zusätzlich zulässig.
7. Stichprobe 30 % (`replaysSessionSampleRate: 0.3`) nur innerhalb der Einwilligten.
8. **Positivliste statt Sperrliste:** Aufnahme nur, wenn der Pfad mit `/buyer` beginnt; beim Verlassen (`onRouterTransitionStart`) sofort `stop()`. Die bestehende Sperrliste `isReplayBlockedPath` bleibt als zweite Sicherung. Nie aufnehmen: `/admin`, Login, Passwort-Seiten, Endkundenseiten (`/book`, `/angebot`, `/empfehlung`, `/beratung`, `/praesentation`, `/einwilligung`, `/erstinformation`, `/abmelden`, `/feedback`, `/demo`), und keine Sitzungen, in denen ein Admin als Kunde angemeldet ist (Impersonation).

**C. Widerruf**
9. Ausschalten in den Einstellungen: im aktuellen Tab sofort `Sentry.getReplay()?.stop()`, Server-Flag setzen, in anderen offenen Tabs über `BroadcastChannel` bzw. beim nächsten Fokus oder Seitenwechsel ebenfalls stoppen. Nach Neuladen wird die Integration nicht mehr hinzugefügt.
10. Löschung gespeicherter Aufnahmen: Replay-ID (`getReplay()?.getReplayId()`) bei Start serverseitig mit `userId` speichern (nicht an Sentry senden); bei Widerruf oder Löschung des Zugangs die Aufnahmen über die Sentry-API löschen, spätestens nach 30 Tagen (wie im Datenschutztext). Die Zuordnungstabelle nach 90 Tagen automatisch löschen.

**D. Maskierung und Datensparsamkeit**
11. `maskAllText: true`, `maskAllInputs: true`, `blockAllMedia: true` (wie heute); **keine** `unmask`/`unblock`-Selektoren. Später freigeben nur feste Oberflächentexte (Knopfbeschriftungen) über eine Positivliste nach Prüfung, nie Daten.
12. Elemente mit Bild über CSS (`background-image`, Avatare, Logos von Kunden) und `iframe` mit `data-sentry-block` versehen; Canvas nicht aufnehmen.
13. Attribute prüfen: `title`, `aria-label`, `alt`, `placeholder`, `data-*` dürfen keine Namen, Telefonnummern oder Leadinhalte enthalten, oder die Elemente werden geblockt. `<title>` der Seiten bleibt statisch (heute z. B. „Kontakt | performancegrowth“, so lassen).
14. URLs: in `beforeAddRecordingEvent` und im Event-Prozessor zusätzlich zu den Token-Pfaden alle IDs in Pfaden ersetzen (`/buyer/leads/<id>`, `/buyer/kontakte/<id>`, `/buyer/termine/<id>`, `/buyer/bestand/kampagnen/<id>`, API-Pfade) durch `[id]`; Query und Hash entfernen (heute schon). Gilt für Navigation, Netzwerk-Spans und `replay_event.urls`.
15. Netzwerk: `networkDetailAllowUrls` leer lassen (keine Bodies, keine Header). Konsolenausgaben aus der Aufnahme entfernen (Ereignisse mit Kategorie `console` in `beforeAddRecordingEvent` verwerfen).
16. Keine Nutzerkennung an Sentry (`dataCollection.userInfo: false` bleibt; kein `setUser` mit E-Mail oder Name).

**E. Sentry-Einstellungen und Organisation**
17. Organisation in der Datenregion EU (prüfen: `de.sentry.io`), Projekteinstellung „Prevent Storing of IP Addresses“ an, serverseitiges Data Scrubbing an, KI-Funktionen (Seer, Zusammenfassungen) für die Organisation aus.
18. Zugriff auf Replays nur für wenige benannte Personen mit 2FA; zur Vertraulichkeit und nach § 203 StGB verpflichtet (wie für Supportzugriffe).
19. Keine Weitergabe von Aufnahmen an Vermittler, keine Auswertung je Person zur Leistungsbewertung; Auswertung nur zur Verbesserung der Oberfläche.

**F. Prüfung und Dokumentation**
20. Vor dem Livegang: Testaufnahmen auf jeder `/buyer`-Seite (Desktop und 390 px), darin gezielt nach Klartext suchen (Namen, Telefonnummern, Gesundheitsangaben, IDs in URLs). Ergebnis mit Datum ablegen. Bei jeder neuen Seite oder Komponente mit Leaddaten wiederholen (z. B. Snapshot-Test, der neue Komponenten ohne Maskierungs-Attribut meldet).
21. `docs/datenschutz.md`: Verzeichniszeile „Sitzungsaufnahme (Einwilligung)“ mit Zweck, Daten, Art. 6 Abs. 1 lit. a, § 25 Abs. 1 TDDDG, Empfänger Sentry (EU), Löschung 90 Tage; Zeile „Fehlerüberwachung“ anpassen (Replay nur mit Einwilligung); DSFA-Schwellwertprüfung festhalten; DPA- und DPF-Nachweis in die Tabelle eintragen.
22. App-Store-Datenschutzangaben (falls die App in Stores ist, `docs/app-store.md`): „Nutzungsdaten: Produktinteraktion“ an Sentry ergänzen, nicht zum Tracking.
23. Datenpanne: Wird trotz allem Klartext aus Leads aufgenommen, Aufnahmen löschen, Ursache beheben, Art. 33 prüfen und betroffene Vermittler nach AVV binnen 48 Stunden informieren.

---

## 6. Restrisiken (kurz)

1. **Maskierungslücken** sind das Hauptrisiko: neue Komponenten, Attribute, CSS-Bilder, Kopieren in die Zwischenablage, Fehlermeldungen mit Namen. Folge wäre eine Verarbeitung von Leaddaten (ggf. Art. 9) zu eigenen Zwecken. Gegenmittel: Positivliste, Tests (Nr. 20), Notschalter (Umgebungsvariable, die die Integration sofort abschaltet).
2. **Gestaltung des Dialogs:** Bei hervorgehobenem Ja droht Unwirksamkeit aller Einwilligungen; mit gleich gestalteten Knöpfen gering.
3. **Fehler-Replays ohne Einwilligung**, falls sie beibehalten werden: Stützung auf § 25 Abs. 2 Nr. 2 TDDDG unsicher.
4. **Rollenabgrenzung zum AVV:** Ohne die AVV-Klarstellung (4.2) könnte ein Vermittler argumentieren, das Maskieren seiner Leaddaten im Browser sei eine weisungswidrige Verarbeitung; praktisch gering, wenn nichts übermittelt wird.
5. **Drittland:** Zugriff aus den USA möglich; Bestand des DPF hängt am weiteren Verfahren vor dem EuGH. SCC im Sentry-DPA als Rückfall.
6. **Mitarbeiter größerer Vermittler** könnten sich überwacht fühlen; bei Betriebsräten ist das Thema sensibel. Gegenmittel: Einzelentscheidung je Zugang, keine Weitergabe an den Vermittler, klare Aussage im Text.
7. **Nebenbefund:** Die eigene pseudonyme Nutzungsmessung (`docs/datenschutz.md`, Art. 6 Abs. 1 lit. f) und die reine Fehlerüberwachung im Browser stehen ebenfalls unter § 25 TDDDG, soweit sie Informationen im Endgerät speichern oder auslesen; gesondert prüfen, nicht Gegenstand dieser Prüfung.
