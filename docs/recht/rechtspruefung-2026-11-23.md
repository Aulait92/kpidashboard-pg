# Rechtsprüfung KW 48 (Stand 24.11.2026, Prüfzeitraum 16.11. bis 24.11.2026)

Vorprüfung, keine Rechtsberatung. Bis Budget für eine Anwältin da ist, ist diese Prüfung maßgeblich (Entscheidung Ole 18.11.2026).
Geprüft: pgmain Live (`origin/claude/facebook-ad-media-buyer-GdTgt`, Stand f3c34b16) und Staging (`origin/claude/whatsapp-crm`, Stand b09b855f; Staging liegt hinter Live, einziger eigener Commit ist ein Sicherheits-Update ohne Rechtsbezug), dazu die Befunde des Orchestrators zur Instantly-Kampagne „Versicherungsvermittler (gemischt)“ (Kampagnentexte liegen nur in Instantly, nicht im Repo; Wortlaut nicht selbst eingesehen).

**Kennzeichnung.** [LDH] = Fundstelle aus Legal Data Hunter (Lauf 24.11.2026). „Ohne Fundstelle“ = eigene Einschätzung. Links nur aus Tool-Ergebnissen. Wo das Tool ein Aktenzeichen nicht angezeigt hat, steht nur das Datum.

**LDH-Status.** 20 Abfragen (5 davon mit Zeitüberschreitung), dann Tageslimit: limit_type „day“, Plan „free“, Upgrade https://legaldatahunter.com/pricing, **resets_at 2026-11-25T14:48:00+00:00**. Nicht mehr erreicht: § 6 DDG, § 35a GmbHG, § 37a HGB, EDSA-Leitlinien 05/2020 und 07/2020, § 44b UrhG, § 22 KUG, BFSG, § 7a VVG, Art. 50 KI-VO (Geltungsbeginn).

---

## Kurzüberblick

| Nr | Fund | Risiko |
|---|---|---|
| F1 | Instantly: „Erfolgsgarantie“, obwohl seit 22.11. ohne Garantie verkauft wird | **hoch** |
| F2 | Instantly Mail 2: neu ausgewürfelter „Re:“-Betreff mit nie gesendetem Zitat | **hoch** |
| F3 | Instantly: „auch für die Allianz“ an Vertreter anderer Versicherer | mittel |
| F4 | Instantly: „40 bis 200 Anfragen, 5 bis 40 Abschlüsse“ ohne abgelegten Beleg | mittel bis hoch |
| F5 | Instantly: Signatur mit fremdem Namen (DVAG/ERGO-Sequenz, offener Befund) | **hoch**, falls zutreffend |
| F6 | Kaltakquise-Skalierung (Entscheidung Ole 19.11.): Restrisiken und Absicherungen | mittel (bewusst getragen) |
| F7 | Pflichtangaben in geschäftlichen E-Mails (§ 35a GmbHG) in Instantly-Signaturen und auf Versanddomains | mittel |
| F8 | Drei Betroffenenanfragen (Art. 15, 17, 21) | mittel (fristgebunden) |
| F9 | Creative-Vorlagen aus dem Werbekonto eines anderen echten Kunden (`vorlagenVon`) | **hoch** |
| F10 | Vergleichswerte „Schnitt aller Kunden“ ohne Mindestzahl an Kunden | gering bis mittel |
| F11 | Tier-Leads: Gesundheitsfilter vor der KI für die ganze Nachricht abgeschaltet | gering bis mittel |
| F12 | Unterauftragnehmerliste: AWS Bedrock fehlt; Instantly ohne abgelegten DPA | mittel |
| F13 | Policen-Strecke: Live-Code gegen A1 bis A9, K1 bis K8, v2 | gering (Auflagen weitgehend erfüllt) |
| F14 | NDA-Ergänzung Deibel: keine Ausnahme für Benchmarks und Creative-KI | mittel |
| F15 | Angebot 0 € Einrichtung mit Zahlung nachträglich | gering |
| F16 | WhatsApp „Nachfassen nach Absage“ mit Rückfall auf die No-Show-Vorlage | gering |
| F17 | Führungsteam (22 Agenten) mit Zugriff auf Diagnose-Daten | gering |
| F18 | Datenschutzdoku: Kalt-Mails als „mutmaßliche Einwilligung B2B“ eingeordnet | gering (Dokufehler) |

---

## Funde im Einzelnen

### F1 „Erfolgsgarantie“ in der gemischten Kampagne (hoch)

- **Was:** Die Kampagne wirbt mit „Erfolgsgarantie“. Seit 22.11.2026, 19:15 Uhr enthalten neue Angebote keine Garantie mehr (`src/lib/garantien.ts:20` `GUARANTEES_UNTIL`, `src/components/offer-document.tsx:259` bis `:261` und `:807`; `docs/garantien.md:3`; `docs/unterlagen/sprechzettel-vertrieb.md:112` „Garantien nicht erwähnen“). Die Garantie ist also im Angebot nicht definiert. Befund steht seit 19.11. offen in `docs/firma/kaltakquise.md:27`.
- **Norm:** § 5 Abs. 1, Abs. 2 Nr. 1 (Vorteile, „von der Verwendung zu erwartende Ergebnisse“) und Nr. 2 (Bedingungen der Leistung) UWG, Wortlaut [LDH] ([gesetze-im-internet.de, UWG § 5](https://www.gesetze-im-internet.de/uwg_2004/__5.html)); § 5 gilt ausdrücklich auch gegenüber „sonstigen Marktteilnehmern“, also Vermittlern. Wird eine Einschränkung nicht direkt am Blickfang klargestellt, ist die Aussage irreführend: BGH, Urteil vom 15.10.2015 „All Net Flat“ [LDH] ([rechtsprechung-im-internet.de](https://www.rechtsprechung-im-internet.de/jportal/?quelle=jlink&docid=KORE318052015&psml=bsjrsprod.psml)); zur Werbung mit Garantien BGH, Urteil vom 14.4.2011 „Werbung mit Garantie“ [LDH] ([rechtsprechung-im-internet.de](https://www.rechtsprechung-im-internet.de/jportal/?quelle=jlink&docid=KORE313212011&psml=bsjrsprod.psml)). Verstößt zudem gegen die vereinbarte Regel „keine Garantieversprechen“.
- **Risiko: hoch.** Klare Unwahrheit über die Leistung; abmahnfähig durch Mitbewerber (Agenturen), dazu Anfechtungs- und Haftungsrisiko gegenüber Kunden, die sich auf die Mail berufen (§ 311 Abs. 2 BGB, ohne Fundstelle).
- **Änderung:** Wort und Satz sofort aus allen Sequenzen löschen; bereits angeschriebene Interessenten, die antworten, im Gespräch nicht auf eine Garantie verweisen.
- **Rechtlich minimaler Text:** Satz ersatzlos streichen. Wenn ein Ersatz gewünscht ist: „Sie zahlen monatlich und können nach der Mindestlaufzeit kündigen.“ (nur, wenn das so im Angebot steht).

### F2 Mail 2 mit neu ausgewürfeltem „Re:“-Betreff und erfundenem Zitat (hoch)

- **Was:** Schritt 2 erhält einen anderen Betreff mit „Re:“ und zitiert eine Nachricht, die so nie gesendet wurde (Befund Orchestrator, Instantly).
- **Norm:** § 7 Abs. 2 Nr. 3 lit. a und b UWG [LDH] ([gesetze-im-internet.de, UWG](https://www.gesetze-im-internet.de/uwg_2004/)): unzumutbare Belästigung stets bei Werbung, bei der gegen § 6 Abs. 1 DDG verstoßen wird; § 6 DDG verbietet nach meinem Kenntnisstand, Absender und kommerziellen Charakter in Kopf- und Betreffzeile zu verschleiern (Normtext ohne Fundstelle, Limit). § 5 Abs. 1, Abs. 2 Nr. 3 UWG [LDH] (Vortäuschen einer bestehenden Korrespondenz bzw. Geschäftsbeziehung) und § 5a Abs. 4 UWG [LDH] (kommerzieller Zweck nicht kenntlich gemacht). Rechtsprechung zur geschäftlichen E-Mail-Adresse: BGH, Urteil vom 14.3.2017 [LDH] ([rechtsprechung-im-internet.de](https://www.rechtsprechung-im-internet.de/jportal/?quelle=jlink&docid=KORE303012017&psml=bsjrsprod.psml)); schon eine einmalige Mail genügt: OLG Dresden, 4 U 168/24 vom 24.6.2024 [LDH] ([justiz.sachsen.de](https://www.justiz.sachsen.de/esamosplus/pages/index.aspx)).
- **Risiko: hoch.** Macht aus dem bewusst getragenen § 7-Risiko eine Täuschung. Das verschlechtert jede Abmahnung, jeden Vergleich und die Bußgeldbemessung, weil Vorsatz offen zutage liegt.
- **Änderung:** Schritt 2 im selben Thread senden (Instantly: gleicher Betreff, echter Verlauf) oder mit neuem, neutralem Betreff ohne „Re:“/„AW:“/„Fwd:“ und ohne Zitat. Kein Spintax für „Re:“.
- **Rechtlich minimaler Text:** Betreff identisch mit Mail 1 im selben Thread, oder neuer Betreff ohne Antwortkennzeichen, zum Beispiel „Kurze Nachfrage zu Leads für {{gesellschaft}}-Vertreter“. Zitat nur des tatsächlich gesendeten Wortlauts.

### F3 „auch für die Allianz“ an Vertreter anderer Versicherer (mittel)

- **Was:** Die gemischte Kampagne nennt die Allianz als Referenz, auch gegenüber Vertretern von Signal Iduna, DVAG, ERGO usw. Die Sprechzettel nennen „200.000 Leads im Versicherungsbereich für die Allianz“ (`docs/unterlagen/sprechzettel-vertrieb.md:23`); der Befund „für die Allianz … Lead.Now“ ist seit 19.11. offen (`docs/firma/kaltakquise.md:24`).
- **Norm:** § 5 Abs. 2 Nr. 3 (Beziehungen, Status des Unternehmers) und Nr. 4 (Aussagen zu Sponsoring oder Zulassung), § 5 Abs. 3 Nr. 1 (Verwechslungsgefahr mit Kennzeichen eines Mitbewerbers) UWG [LDH] ([UWG § 5](https://www.gesetze-im-internet.de/uwg_2004/__5.html)). Markenrechtliche Nennung (§ 23 MarkenG) ohne Fundstelle.
- **Risiko: mittel.** Wahr und belegbar ist eine Referenz zulässig. Irreführend wird sie, wenn sie eine direkte Beauftragung oder Billigung durch die Allianz AG nahelegt, die es so nicht gab (etwa wenn die Leads über eine Agentur, einzelne Vertreter oder ein Programm wie Lead.Now liefen). Bei Konzernadressen (allianz.de, allianz-agentur.de) liest zudem die Rechtsabteilung des Konzerns mit.
- **Änderung:** Beziehung exakt so benennen, wie sie vertraglich bestand; Beleg (Vertrag, Rechnungen, Zahl) in einer internen Akte ablegen. Ohne Beleg streichen.
- **Rechtlich minimaler Text (je nach Beleg):** „Wir haben bereits rund {Zahl} Leads im Versicherungsbereich erzeugt, darunter für Vertreter der Allianz.“ oder, nur bei direktem Vertrag mit der Allianz: „… darunter im Auftrag der Allianz ({Programm}).“ Ohne Beleg: „Wir erzeugen seit {Jahr} Leads für Versicherungsvermittler.“

### F4 „40 bis 200 Anfragen, 5 bis 40 Abschlüsse“ (mittel bis hoch)

- **Was:** Konkrete Ergebnisspannen ohne Zeitraum, Budget und Bezug.
- **Norm:** § 5 Abs. 2 Nr. 1 UWG [LDH]: „von der Verwendung zu erwartende Ergebnisse“. Wer mit nachprüfbaren Zahlen wirbt, muss sie belegen können (zur Prüfbarkeit vgl. BGH 15.4.2021, Queue Nr. 2 [LDH]; Beweislast des Werbenden für innerbetriebliche Tatsachen ohne Fundstelle). Ohne Angabe von Zeitraum und Budget entsteht der Eindruck, jeder Kunde erreiche mindestens 40 Anfragen und 5 Abschlüsse (§ 5a Abs. 1, Abs. 2 Nr. 2 UWG [LDH]).
- **Risiko: mittel bis hoch.** „5 bis 40 Abschlüsse“ hängt vom Vermittler ab, nicht von performancegrowth; als Erwartungswert kaum belegbar.
- **Änderung:** Nur Zahlen aus der eigenen Auswertung (Diagnose `q=` je Kunde und Monat), mit Zeitraum, Zahl der Kunden, Budget und Produkt; Abschlüsse weglassen oder als Einzelbeispiel kennzeichnen. Auswertung als PDF in der Akte ablegen.
- **Rechtlich minimaler Text:** „Bei {Anzahl} Kunden mit {Produkt} und rund {Budget} € Werbebudget im Monat lagen die Anfragen von {Monat} bis {Monat} 2026 zwischen {min} und {max} im Monat. Wie viele daraus Abschlüsse werden, hängt von Ihrer Beratung ab.“

### F5 Signatur mit fremdem Namen (hoch, falls zutreffend)

- **Was:** Offener Befund „Signatur mit fremdem Namen in DVAG/ERGO-Sequenz prüfen“ (`docs/firma/kaltakquise.md:26`).
- **Norm:** § 7 Abs. 2 Nr. 3 lit. a UWG [LDH]: Werbung, bei der die Identität des Absenders verschleiert oder verheimlicht wird, ist stets unzumutbare Belästigung; § 5 Abs. 2 Nr. 3 UWG [LDH] (Identität des Unternehmers).
- **Risiko: hoch**, wenn eine nicht existierende oder nicht bei performancegrowth tätige Person unterschreibt.
- **Änderung:** Nur echte, für performancegrowth handelnde Personen; Firma immer nennen.
- **Rechtlich minimaler Text:** „{Echter Name}, performancegrowth (Ole Kannapinn UG (haftungsbeschränkt))“ plus Pflichtangaben nach F7.

### F6 Kaltakquise ohne Einwilligung und ohne Datenschutz-Fußzeile: Restrisiken (mittel, bewusst getragen)

Entscheidung Ole 19.11.2026 (`docs/recht/legal-data-hunter-queue.md`) wird nicht neu diskutiert. Bewertet werden nur Restrisiken und Absicherungen.

- **Normlage, jetzt mit Fundstellen [LDH]:** § 7 Abs. 2 Nr. 2 UWG verlangt für elektronische Post eine vorherige ausdrückliche Einwilligung, auch gegenüber Unternehmern; die „mutmaßliche Einwilligung“ gilt nur für Telefon (Nr. 1). BGH 14.3.2017 (Eingriff in den Gewerbebetrieb bei Werbe-Mail an geschäftliche Adresse), BGH 10.7.2018 (Leitsatz: Werbung per elektronischer Post ohne Einwilligung ist Eingriff in das Persönlichkeitsrecht; Kundenzufriedenheitsbefragung ist Werbung; nach Datum und Leitsatz VI ZR 225/17) [LDH] ([rechtsprechung-im-internet.de](https://www.rechtsprechung-im-internet.de/jportal/?quelle=jlink&docid=KORE309042018&psml=bsjrsprod.psml)), OLG Dresden 4 U 168/24 (einmalige Mail genügt), LG Münster 26 O 55/11 vom 24.8.2011 [LDH] ([nrwe.justiz.nrw.de](https://nrwe.justiz.nrw.de/lgs/muenster/lg_muenster/j2011/026_O_55_11_Urteil_20110824.html)), AG Berlin-Mitte 6 C 88/24 vom 7.11.2024 (Werbe-Mail an Unternehmen) [LDH] ([gesetze.berlin.de](https://gesetze.berlin.de/perma?d=NJRE001609896)).
- **Restrisiken:**
  1. Unterlassungsanspruch jedes Empfängers (§§ 823, 1004 BGB) und von Mitbewerbern (§ 8 UWG); bei Konzernadressen auch durch den Versicherer als Inhaber des Postfachs (ohne Fundstelle). Streitwerte im B2B erfahrungsgemäß einige tausend Euro je Fall (ohne Fundstelle).
  2. DSGVO: fehlende Information nach Art. 14 Abs. 3 lit. b und fehlender Hinweis nach Art. 21 Abs. 4 bei der ersten Mitteilung ([EUR-Lex 32016R0679](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679) [LDH, Volltext 18.11.]). Bußgeldrahmen Art. 83 Abs. 5 lit. b; realistisch ist eher ein Verfahren nach Beschwerde mit Anordnung und kleinem Bußgeld; die bewusste Entscheidung wirkt bei der Bemessung erschwerend (Art. 83 Abs. 2 lit. b, Vorsatz).
  3. Die Mischung je Ziel-Domain „So sieht kein Konzern-Gateway eine Welle“ (`docs/firma/kaltakquise.md:17`) ist nicht rechtswidrig, dokumentiert aber Vorsatz. Formulierung in internen Dokumenten neutral halten („Zustellbarkeit“).
  4. Volumen bis 1.800 Mails am Tag (`docs/firma/kaltakquise.md:18`): Zahl der möglichen Anspruchsteller wächst linear.
- **Absicherungen (Pflicht, ändern die Entscheidung nicht):**
  - A-K1: § 7 Abs. 2 Nr. 3 lit. c UWG [LDH] verlangt eine gültige Adresse für die Aufforderung, keine weiteren Nachrichten zu senden. Das ist keine Datenschutz-Fußzeile. Antwortadresse muss funktionieren und überwacht sein; empfohlen ist eine Zeile im Text.
    **Rechtlich minimaler Text:** „Keine weiteren Mails? Eine kurze Antwort genügt.“
  - A-K2: Pflichtangaben nach § 35a GmbHG in jeder Signatur (F7).
  - A-K3: Keine Täuschungselemente (F1, F2, F5); Kampagnentexte vor Start von Ole und Recht freigeben lassen (steht schon in `docs/firma/kaltakquise.md:8`).
  - A-K4: Prozess „Datenschutz und Recht“ (`docs/datenschutz.md`, Abschnitt Vertrieb) ist umgesetzt (Erkennen, Sperre inkl. eigener Domain, Hash-Sperrvermerk, Frist 7 Tage, Vorlagen, Nachweisprotokoll, Abmahnung nie automatisch löschen). Ergänzen: Ordner „Abmahnungen“ mit Muster-Antwort „modifizierte Unterlassungserklärung nur nach Prüfung“; Kostenrahmen für eine Anwältin im Abmahnfall vorab festlegen.
  - A-K5: Liste nur aus öffentlichen geschäftlichen Angaben, vermutete Adressen nie (umgesetzt, `src/lib/vertrieb/import-contacts.ts:194` bis `:197`, `:400`). Herkunft je Kontakt gespeichert (Art. 15 Abs. 1 lit. g) [LDH].

### F7 Pflichtangaben in geschäftlichen E-Mails (mittel)

- **Was:** Die App-Mails tragen die Angaben (`src/lib/email.ts:165` bis `:168`: Firma, Anschrift, Geschäftsführer, Registergericht und HRB). Für die rund 60 Instantly-Postfächer und die CRM-Mails über Oles Google-Postfach (`src/lib/vertrieb/crm-mail-server.ts:73`, nur Text ohne App-Signatur) ist nicht belegt, dass die Signatur sie enthält.
- **Norm:** § 35a Abs. 1 GmbHG (gilt für die UG): auf allen Geschäftsbriefen an einen bestimmten Empfänger, gleichviel welcher Form, Rechtsform, Sitz, Registergericht, Registernummer und Geschäftsführer (ohne Fundstelle, Limit). Durchsetzung über Zwangsgeld (§ 79 GmbHG, ohne Fundstelle); zusätzlich Vorenthalten wesentlicher Informationen nach § 5a Abs. 1 UWG [LDH] denkbar. § 37a HGB gilt nur für den eingetragenen Kaufmann, hier nicht einschlägig (ohne Fundstelle).
- **Rechtlich minimaler Text (Signatur, eine Zeile reicht):** „Ole Kannapinn UG (haftungsbeschränkt), Lorenzstraße 58, 12209 Berlin · Sitz Berlin · Amtsgericht Charlottenburg, HRB 172651 · Geschäftsführer: Ole Kannapinn“ (Werte aus `src/lib/legal-texts.ts:90` und `:99`). Zusätzlich auf jeder Versanddomain ein Impressum (§ 5 DDG, ohne Fundstelle).

### F8 Drei Betroffenenanfragen: Art. 15, Art. 21, Art. 17 mit 14-Tage-Frist (mittel)

- **Fristen:** Art. 12 Abs. 3 DSGVO: unverzüglich, spätestens innerhalb eines Monats [LDH, Volltext]. Die 14 Tage des Löschantrags binden rechtlich nicht, die interne Frist von 7 Tagen hält sie aber ein. Empfehlung: alle drei bis spätestens **1.12.2026** beantworten, den Löschantrag innerhalb der 14 Tage.
- **Art. 15:** Vorlage aus der Akte (Herkunft mit Quelle, Quell-URL und Abrufdatum; Zweck; Art. 6 Abs. 1 lit. f; Empfänger Instantly USA, Railway EU, Google; Speicherdauer; Rechte; Beschwerderecht) erfüllt Art. 15 Abs. 1 lit. a bis h. Ergänzen: Kopie der Daten (Art. 15 Abs. 3), Hinweis auf geeignete Garantien für die USA (Art. 15 Abs. 2: SCC bzw. DPF für Instantly, F12) und **Widerspruchsrecht** (Art. 21). Nicht schreiben, es gebe eine Einwilligung.
- **Art. 21:** Gegen Direktwerbung absolut (Art. 21 Abs. 2, 3) [LDH, Volltext]. Sperre inkl. Blocklist, Bestätigung ohne werblichen Inhalt.
- **Art. 17:** Löschung bis auf Sperrvermerk als SHA-256 (`src/lib/vertrieb/art17.ts`). Das ist vertretbar: Ohne Sperrvermerk würde dieselbe Adresse bei einem neuen Import wieder angeschrieben; Grundlage Art. 17 Abs. 3 lit. e bzw. Art. 6 Abs. 1 lit. f i. V. m. Art. 21 Abs. 3 (Wertung ohne Fundstelle). In der Bestätigung offenlegen.
- **Wichtig:** Enthält eine der drei Anfragen eine Drohung mit Anwalt, Aufsicht oder Schadensersatz, ist sie als Abmahnung zu behandeln: nicht automatisch löschen, Belege sichern, keine Unterlassungserklärung ungeprüft unterschreiben.
- **Rechtlich minimale Texte:**
  - Widerspruch: „Guten Tag {Name}, wir haben Ihren Widerspruch am {Datum} erhalten. Ihre Adresse ist für Werbung dauerhaft gesperrt; Sie erhalten von uns keine weiteren Werbe-Mails. Freundliche Grüße, {Name}, Ole Kannapinn UG (haftungsbeschränkt), {Pflichtangaben}“
  - Löschung: „Guten Tag {Name}, wir haben Ihre Daten am {Datum} gelöscht. Damit wir Sie nicht erneut anschreiben, speichern wir nur einen nicht lesbaren Prüfwert (Hash) Ihrer Adresse mit dem Vermerk „nicht kontaktieren“. Freundliche Grüße, …“
  - Auskunft: Vorlage aus der Kontaktakte, ergänzt um den Satz „Sie können der Verarbeitung Ihrer Daten für Werbung jederzeit widersprechen (Art. 21 DSGVO); eine kurze Antwort genügt.“ und die Angabe „Instantly (USA): Standardvertragsklauseln“.

### F9 Creative-Vorlagen aus dem Werbekonto eines anderen echten Kunden (hoch)

- **Was:** Commit 6f668ead (24.11.2026, live): Parameter `vorlagenVon` lädt Gewinner-Anzeigen samt Bildvorlagen aus dem Meta-Werbekonto eines anderen Kunden („Schwarzkopf … an Lohmanns Gewinnern anlehnen, auch die Bilder“). Code: `src/lib/kampagnen/context.ts:44` bis `:49` und `:87` bis `:92`, `src/app/api/ops/kampagne/route.ts:115` bis `:116`, `src/lib/kampagnen/run.ts:105`, `:111`. Kein Opt-out, keine Zustimmung des Quellkunden, kein Filter gegen Namen, Gesichter, Logos oder wörtliche Übernahme. Damit läuft das Creative-Lernen **nicht** nur auf Oles eigenen Konten und Testkunden.
- **Norm:** § 4 Abs. 2 Nr. 2 und 3 GeschGehG [LDH] ([gesetze-im-internet.de, § 4](https://www.gesetze-im-internet.de/geschgehg/__4.html)): Nutzung entgegen einer vertraglichen Nutzungsbeschränkung; Geschäftsgeheimnis nach § 2 Nr. 1 GeschGehG [LDH] ([§ 2](https://www.gesetze-im-internet.de/geschgehg/__2.html)): Leistungszahlen je Anzeige sind nicht öffentlich und wirtschaftlich wertvoll; NDA und Vertraulichkeitsklauseln sind „angemessene Geheimhaltungsmaßnahmen“. Bilder: §§ 2, 72 UrhG, § 22 KUG (ohne Fundstelle). Kampagnenzahlen eines Einzelvermittlers sind personenbezogen (Art. 4 Nr. 1 DSGVO [LDH]).
- **Risiko: hoch**, solange der Quellkunde nicht zugestimmt hat. Schwarzkopf und Lohmann können Konkurrenten in derselben Region sein; ein Kunde erkennt seine eigenen Motive sofort.
- **Änderung (Vorschlag):** `vorlagenVon` nur zulassen, wenn der Quellkunde Ole selbst, ein Testkunde (`isTest`) oder ein Kunde mit schriftlicher Zustimmung ist (Feld am Kunden, Nachweis); Bilder anderer Kunden nie als Bildvorlage, nur als abstraktes Gestaltungsmerkmal; Ausgabefilter T4 aus dem Benchmark-Entwurf. Bis dahin Funktion für echte Fremdkunden sperren.
- **Rechtlich minimaler Text (Zustimmung des Quellkunden, Textform genügt):** „Ich bin einverstanden, dass performancegrowth meine Anzeigen und ihre Kennzahlen nutzt, um Anzeigen für andere Kunden zu entwickeln. Mein Name, mein Bild, mein Logo und meine Zahlen werden dabei nicht übernommen oder gezeigt. Ich kann das jederzeit in den Einstellungen abschalten.“

### F10 Vergleichswerte ohne Mindestzahl an Kunden (gering bis mittel)

- **Was:** `src/lib/zahlen-tipps-server.ts:30` bis `:36` (`averageKpis`) bildet den „Schnitt aller Kunden“ ohne Mindestzahl an Kunden und ohne Dominanzregel; der Kunde sieht seine Quote neben dem Schnitt. Bei wenigen aktiven Kunden ist der Wert eines einzelnen anderen Kunden rückrechenbar. `src/lib/verlustgruende.ts:59` bis `:69` hat immerhin mindestens 5 Kunden.
- **Norm:** ErwG 26 DSGVO und EuGH C-413/23 P Rn. 84 bis 86 [LDH, Queue Nr. 11]; vertragliche Vertraulichkeit.
- **Änderung:** T1 aus `docs/strategie/benchmark-klausel-entwurf.md`: Schnitt nur ab 5 Kunden, {50} Fällen und höchstens 40 % Anteil eines Kunden, sonst nicht anzeigen. Kundensichtbar kein neuer Text nötig.

### F11 Tier-Leads: Gesundheitsfilter vor der KI ganz aus (gering bis mittel)

- **Was:** Der Bot speichert Tiergesundheit („War in Behandlung: …“, `src/lib/whatsapp/tier-fragen.ts:281` bis `:302`). Begründung „keine Art.-9-Daten“ ist richtig: Art. 4 Nr. 15 und Art. 9 erfassen nur natürliche Personen [LDH, Volltext]. Aber `src/lib/gesundheitsdaten.ts:57` und `:75` überspringen bei Tier-Leads (`opts.tier`) den Filter für die **ganze** Nachricht. Schreibt der Halter über sich selbst („ich war selbst im Krankenhaus“), geht das ungefiltert an die KI.
- **Norm:** Art. 9 Abs. 1, Art. 5 Abs. 1 lit. c, Art. 25 DSGVO [LDH, Volltext].
- **Änderung:** Bei Tier-Leads nur Sätze freigeben, die das Tier betreffen (Tiername, Tierart, Tierarzt); übrige Sätze wie bei anderen Leads filtern. Tierangaben sind personenbezogene Daten des Halters (Art. 6 Abs. 1 lit. b), Löschfristen wie Lead-Daten.

### F12 Unterauftragnehmer: AWS Bedrock fehlt, Instantly ohne DPA-Nachweis (mittel)

- **Was:** AWS Bedrock (eu-central-1) läuft für KI-Zusammenfassung und Gründevorschläge der Beratungsdokumentation (`src/lib/zusammenfassung-server.ts:163`, `:181` bis `:183`, `src/lib/beratungsdoku-server.ts:272`) und als Anbieter für das Policen-Auslesen (`src/lib/policen/auslesen/anbieter/bedrock-eu.ts`). In `SUBPROCESSORS` (`src/lib/legal-texts.ts:695` ff.) steht AWS nur bedingt als S3-Speicher (`:690`), nicht als KI-Dienst. Instantly verarbeitet Vermittlerdaten in den USA, die Spalte „AVV/DPA abgeschlossen am“ ist leer (`docs/datenschutz.md:113`). seven.io, Cloudflare R2, OpenAI, 360dialog und Meta sind aufgeführt.
- **Norm:** Art. 28 Abs. 2 und 4 DSGVO (Unterauftragnehmer nur nach Genehmigung bzw. Information mit Widerspruchsmöglichkeit), Art. 28 Abs. 3, Art. 44 ff. [LDH, Volltext].
- **Änderung:** AWS Bedrock in `SUBPROCESSORS` aufnehmen, Kunden nach AVV informieren (14 Tage Widerspruch); Instantly-DPA abschließen und ablegen (Grundlage USA: DPF-Zertifizierung prüfen, sonst SCC).
- **Rechtlich minimaler Text (Eintrag Unterauftragnehmerliste):** „Amazon Web Services EMEA SARL (Bedrock), KI-Dienst für Gesprächszusammenfassungen, Beratungsdokumentation und das Auslesen von Versicherungsunterlagen; Region Frankfurt (EU); Konzern USA; keine Nutzung zum Training.“
- **Kundeninformation:** „Wir nehmen Amazon Web Services EMEA SARL (Rechenzentrum Frankfurt) als weiteren Unterauftragnehmer auf: KI für Gesprächszusammenfassungen und das Auslesen von Unterlagen. Sie können innerhalb von 14 Tagen widersprechen.“

### F13 Policen-Strecke: Live-Code gegen die Auflagen (gering)

Ergebnis im Einzelnen in `docs/recht/policen-whatsapp-gesundheitsdaten.md`, Abschnitt „Prüfung Live-Code 24.11.“. Kurz:

- **Chat-Einwilligung** (`src/lib/policen/bitte.ts:81` bis `:88`, Version `2026-11-18.g2`/`.s2`): A1 erfüllt (Vermittler mit Firma, Zweck, „automatisch auslesen lässt (KI-Dienst in der EU)“, korrekter Gesundheits-Halbsatz, Meta mit US-Zugriff, performancegrowth, Widerruf mit Stichwort, Link); A9 im Haupttext erfüllt. Knopf „Einverstanden“ unter einer Ich-Erklärung: ausreichend.
- **v2 (Formular, „Zustimmen & senden“):** gebaut und live im Code (`src/lib/policen/flow/*`, `FLOW_TEXT_VERSION` `2026-11-19.g1`), aber hinter `POLICEN_FLOW=1` und vorerst nur für den Testkunden (`POLICEN_FLOW_KUNDEN`); Freigabe für alle wartet laut `docs/firma/offene-aufgaben.md:37` auf Oles Test. Wortlaut entspricht der „Bewertung Policen-Strecke v2“ (GELB).
- A2 bis A8, K1 bis K5, K7 im Code umgesetzt; K2 hält: Kranken, BU, Leben werden nicht ausgelesen, solange `zdrNachweisAm` fehlt (OpenAI-ZDR beantragt 23.11., keine Bestätigung).
- **Offen:** (a) AVV-Ergänzung (Anlage 2, Auslesen per KI) liegt nicht bei allen Kunden vor, obwohl die Strecke für alle Software-Kunden vorgesehen ist (Auflage aus der Entscheidung 19.11.); (b) A8a Policen-Satz in der Vortags-Erinnerung ohne Opt-in (von Ole am 19.11. so entschieden, Risiko gering; jetzt gestützt durch BGH 10.7.2018 [LDH]: auch Nebenzwecke machen eine Nachricht zur Werbung, darum den Satz rein auf den Termin beziehen); (c) E1 (EU-Upload-Link) nicht gebaut.

### F14 NDA-Ergänzung Deibel (mittel)

- **Was:** `docs/recht/vertraege/NDA-Deibel-Ergaenzung.pdf`: gesetzliche Offenlegung (Nr. 1), Aufbewahrungsausnahme und Herausgabe von Zugängen (Nr. 2), Vertragsstrafe nur bei Verschulden, höchstens 5.000 € je Verstoß, Fortsetzungszusammenhang, Anrechnung (Nr. 3). Diese drei Punkte sind ausgewogen und entschärfen die NDA zugunsten performancegrowth; Vertragsstrafe in AGB-ähnlicher Form unter § 307 BGB [LDH] tragfähig.
- **Lücke:** Keine Ausnahme für anonymisierte Vergleichswerte und Creative-KI. Ohne sie ist jede Nutzung von Deibels Kampagnendaten für andere Kunden (F9, Baustein A des Benchmark-Entwurfs) ein NDA-Verstoß mit Vertragsstrafe und zugleich § 4 Abs. 2 Nr. 2 GeschGehG [LDH]. Zweitens: Deibel ist Allianz-Generalvertretung; Policen seiner Kunden aus Personenversicherungen sind nach BGH VIII ZR 53/09 [LDH] Geheimnisse im Sinne von § 203 StGB (siehe Queue Nr. 6). Die NDA sollte klarstellen, dass für personenbezogene Daten die AVV vorgeht.
- **Rechtlich minimaler Text (neue Nr. 4 der Ergänzung):** „4. Zu § 3: Nicht unter die Geheimhaltung fallen anonymisierte, zusammengefasste Auswertungen, die keinen Rückschluss auf den Auftraggeber, seine Kampagnen oder seine Kunden zulassen. Für personenbezogene Daten gilt vorrangig der Auftragsverarbeitungsvertrag.“ Wenn Ole Deibels Anzeigen auch als Vorlage für andere nutzen will, zusätzlich der Zustimmungstext aus F9.

### F15 Angebot mit 0 € Einrichtung und Zahlung nachträglich (gering)

- **Was:** Option „Zahlung nachträglich“ (`Offer.paymentInArrears`, Commit ab2a9aa3) mit AGB-Sonderregel (`docs/recht/zahlung-nachtraeglich.md`); ausgeschlossen ist nur die Kombination mit „kostenlosem Start“, nicht 0 € Einrichtung.
- **Prüfung:** B2B, Regel begünstigt den Kunden; §§ 305c, 307 BGB [LDH] nicht berührt; das Angebot ist nach dem 22.11. erstellt, enthält also keine Garantie. Preisangabenverordnung gilt im B2B nicht (ohne Fundstelle). Risiko wirtschaftlich (Vorleistung, Ausfall), rechtlich gering. Auflage aus dem 19.11. bleibt: Stripe-Ereignis `invoice.created` aktiv, damit die Rechnung den Leistungszeitraum nennt (§ 14 Abs. 4 Nr. 6 UStG, ohne Fundstelle).
- **Kundensichtbar:** keine Änderung nötig. Darauf achten, dass „0 €“ nicht als befristeter Vorteil dargestellt wird, wenn er nicht befristet ist (§ 5 Abs. 2 Nr. 2 UWG [LDH]).

### F16 WhatsApp „Nachfassen nach Absage“ (gering)

- **Was:** Commit 528f70f9: Vorlage `followup_absage`; bis zur Meta-Freigabe geht an Leads, die selbst abgesagt haben, die No-Show-Vorlage („verpasster Termin“).
- **Norm:** § 7 Abs. 2 Nr. 2 UWG [LDH] (WhatsApp ist elektronische Post); BGH 10.7.2018 [LDH]. Gedeckt, soweit die Einwilligung aus Formular bzw. Buchung den Kontakt zur Anfrage umfasst; eine Nachricht mit „Kein Bedarf mehr“ ist verhältnismäßig.
- **Änderung:** Rückfall auf die No-Show-Vorlage nicht verwenden (sachlich falsch gegenüber jemandem, der abgesagt hat); bis zur Freigabe nichts senden oder nur im 24-Stunden-Fenster frei formulieren. Nur einmal nachfassen.

### F17 Führungsteam (22 Agenten, `.claude/agents`, `docs/firma/`) (gering)

- **Was:** Agenten lesen über die Diagnose-Schnittstelle Kundendaten (Instantly, Leads in Summen). Rechtsberatung findet nur in eigener Sache statt (kein Problem nach RDG, ohne Fundstelle). Die Agenten-Datei „rechtsanwalt“ ist eine Rollenbezeichnung; nach außen nie als „Rechtsanwalt“ auftreten (§ 132a StGB, ohne Fundstelle).
- **Datenschutz:** Werden dabei Lead-Daten der Vermittler an Anthropic übermittelt, ist das ein weiterer Zweck des Unterauftragnehmers Anthropic (bisher „KI-System für den Assistenten“). **Änderung:** Diagnose-Abfragen für Agenten nur mit Summen oder pseudonym; sonst Zweck in `SUBPROCESSORS` um „Betrieb und Support“ ergänzen.

### F18 Datenschutzdoku: falsche Einordnung der Kalt-Mails (gering)

- `docs/datenschutz.md:28`: „Kalt-E-Mails **Prüfen** (§ 7 UWG, mutmaßliche Einwilligung B2B)“. Nach § 7 Abs. 2 Nr. 2 UWG [LDH] gibt es die mutmaßliche Einwilligung nur beim Telefon. Text in pgmain bei Gelegenheit korrigieren: „Kalt-E-Mails ohne Einwilligung (§ 7 Abs. 2 Nr. 2 UWG), Risiko bewusst getragen (Entscheidung Ole 19.11.2026)“.

### Ohne Befund (geprüft)

- Import der Vermittlerliste (Commit 77323091): nur echte, öffentlich angegebene Adressen, Herkunft je Kontakt, Sperrabgleich auch über Hashes; keine Anreicherung der Listenkontakte. Ordnungsgemäß.
- Lead-Texte „Versicherungsagentur …“ statt „Versicherung … Generalvertretung“ (6d6dfb96): senkt das Risiko einer Verwechslung mit dem Versicherer (§ 5 Abs. 3 Nr. 1 UWG [LDH]).
- Leadbestellungen „Nachlieferung statt Erstattung“ und Paket „Nur Leads“: intern am 24.11. geprüft (`docs/recht/2026-11-24-*.md`); die enge Erstattungsausnahme ist für § 307 BGB [LDH] nötig und sollte bleiben.
- KI-Kennzeichnung im Assistenten („digitaler KI-Assistent“, `src/lib/whatsapp/erstanschreiben.ts:7`, `src/lib/whatsapp/bot.ts:443` f.): Art. 50 Abs. 1 KI-VO erfüllt (Wortlaut [LDH] in der Queue Nr. 8).
- Lokale Texterkennung für Policen (`src/lib/policen/texterkennung.ts`): kein Drittanbieter, Text nicht gespeichert.
- Maklervollmacht und Bestandsübertragung (d25f52f7, c9a171ee): nur interne Logik der Vertragszählung, keine neuen kundensichtbaren Rechtstexte in diesem Zeitraum gefunden.
- BFSG, TDDDG § 25: keine Änderungen mit neuem Tracking oder neuen Endkundenseiten im Zeitraum gefunden.

---

## Ole muss entscheiden

| Nr | Thema | Vorschlag |
|---|---|---|
| E1 | Instantly-Texte (F1, F2, F4, F5) | **Kampagne „Versicherungsvermittler (gemischt)“ anhalten**, bis „Erfolgsgarantie“ gestrichen, Mail 2 ohne falsches „Re:“ und Zitat, Zahlen belegt oder gestrichen und Signaturen echt sind. Aufwand: eine Stunde Textarbeit. |
| E2 | Allianz-Referenz (F3) | Beziehung zur Allianz in einem Satz festhalten (direkter Vertrag oder über wen) und Beleg ablegen; danach Formulierung nach F3. Ohne Beleg streichen. |
| E3 | Abmeldezeile in Kalt-Mails (F6, A-K1) | Eine Zeile „Keine weiteren Mails? Eine kurze Antwort genügt.“ aufnehmen. Das ist keine Datenschutz-Fußzeile und berührt die Entscheidung vom 19.11. nicht, senkt aber das Risiko nach § 7 Abs. 2 Nr. 3 lit. c UWG. |
| E4 | Creative-Vorlagen von Fremdkunden (F9) | **Funktion `vorlagenVon` für echte Fremdkunden abschalten**, bis der Quellkunde zugestimmt hat. Für Schwarzkopf/Lohmann: Lohmann vorher fragen (Text F9) oder nur eigene Gewinner und Testkonten verwenden. |
| E5 | Benchmark-Klausel in AGB und AVV (Baustein A bis C des Entwurfs) | Einführen mit aktiver Zustimmung im Konto bzw. Änderungsmitteilung mit 6 Wochen Widerspruch (neue Pflichten für Kunden: Rechteeinräumung, Gewährleistung für Inhalte). Bis dahin nur Ole- und Testkonten im Creative-Lernen. |
| E6 | NDA Deibel (F14) | Nr. 4 (Ausnahme anonymisierte Auswertungen, Vorrang AVV) vor Unterschrift ergänzen. |
| E7 | Unterauftragnehmer (F12) | AWS Bedrock in die Liste und die 14-Tage-Information an alle Kunden senden (Text F12); Instantly-DPA abschließen. Kunden anschreiben: ja, Pflicht nach AVV. |
| E8 | AVV-Ergänzung Policen an alle Kunden (F13 a) | Vor dem Schalten von v2 für alle die Anlage 2 an alle betroffenen Kunden senden (Auflage vom 19.11.). |
| E9 | Antworten auf die drei Anfragen (F8) | Bis 1.12.2026 beantworten, Löschung innerhalb der 14 Tage; Texte F8. Prüfen, ob eine davon eine Abmahnung ist. |
| E10 | Signatur-Pflichtangaben (F7) | In alle 60 Postfächer und Oles Google-Signatur; Impressum auf jeder Versanddomain. |
| E11 | Vergleichswerte (F10) | Schwellen T1 im Code (5 Kunden, 50 Fälle, 40 %). Kein Kundentext nötig. |

## Für später an die Anwältin

1. Kalt-Mail-Programm: Verteidigungslinie und Kostenrahmen im Abmahnfall; Muster einer modifizierten Unterlassungserklärung; Höhe üblicher Streitwerte B2B (F6).
2. Allianz-Referenz und Markennennung (§ 5 UWG, § 23 MarkenG) mit dem tatsächlichen Vertragsverhältnis (F3).
3. `vorlagenVon` und Creative-KI: Reicht eine Zustimmung in Textform des Quellkunden; Rechteketten bei Bildern von Fotografen der Kunden; § 22 KUG (F9, Benchmark-Entwurf).
4. Hash-Sperrvermerk nach Art. 17: Tragfähigkeit der Rechtsgrundlage (F8).
5. Vorrang AVV vor NDA und Formulierung der Vertragsstrafe (F14).
6. Restfragen Policen aus `docs/recht/policen-whatsapp-gesundheitsdaten.md` (Bündelung, § 203 bei Meta, DPF-Ausfall), jetzt mit BGH VIII ZR 53/09 [LDH]: Auch der bloße Umstand einer Personenversicherung ist geschützt.
7. Benchmark-Weisungsmodell (Art. 28 Abs. 10) und EDSA-Leitlinien 07/2020.

## Stand der Queue

Siehe `docs/recht/legal-data-hunter-queue.md` (aktualisiert 24.11.2026). Neu belegt: Nr. 6 (BGH VIII ZR 53/09), Nr. 10 (BGH 10.7.2018, Rest offen), Nr. 11 (GeschGehG §§ 2, 4, BGB §§ 305c, 307, 310). Neu aufgenommen: Nr. 12 bis 17 (Kalt-Mail-Rechtsprechung, Garantie-Werbung, „Re:“-Betreff/§ 6 DDG, Erfolgszahlen, Allianz-Referenz, § 35a GmbHG). Nächster Lauf nach 2026-11-25T14:48 UTC: § 6 DDG, § 35a GmbHG, EDSA 05/2020 und 07/2020, § 44b UrhG, § 22 KUG, dann Nr. 7, 8, 9.

## Fundstellen [LDH], Lauf 24.11.2026

- [BGH, Urteil vom 10.2.2010, VIII ZR 53/09](https://www.rechtsprechung-im-internet.de/jportal/?quelle=jlink&docid=KORE302852010&psml=bsjrsprod.psml)
- [BGH, Urteil vom 10.7.2018 (Kundenzufriedenheitsbefragung, VI ZR 225/17 nach Datum und Leitsatz)](https://www.rechtsprechung-im-internet.de/jportal/?quelle=jlink&docid=KORE309042018&psml=bsjrsprod.psml)
- [BGH, Urteil vom 14.3.2017 (Werbe-Mail an geschäftliche Adresse)](https://www.rechtsprechung-im-internet.de/jportal/?quelle=jlink&docid=KORE303012017&psml=bsjrsprod.psml)
- [BGH, Urteil vom 15.12.2015 (Bestätigungs-Mails mit Werbung)](https://www.rechtsprechung-im-internet.de/jportal/?quelle=jlink&docid=KORE302822016&psml=bsjrsprod.psml)
- [BGH, Urteil vom 13.1.2022 „Inbox-Werbung II“](https://www.rechtsprechung-im-internet.de/jportal/?quelle=jlink&docid=KORE304072022&psml=bsjrsprod.psml)
- [BGH, Urteil vom 12.9.2013 „Empfehlungs-E-Mail“](https://www.rechtsprechung-im-internet.de/jportal/?quelle=jlink&docid=KORE316512013&psml=bsjrsprod.psml)
- [OLG Dresden, 4 U 168/24, 24.6.2024](https://www.justiz.sachsen.de/esamosplus/pages/index.aspx)
- [LG Münster, 26 O 55/11, 24.8.2011](https://nrwe.justiz.nrw.de/lgs/muenster/lg_muenster/j2011/026_O_55_11_Urteil_20110824.html)
- [AG Berlin-Mitte, 6 C 88/24, 7.11.2024](https://gesetze.berlin.de/perma?d=NJRE001609896)
- [BGH, Urteil vom 14.4.2011 „Werbung mit Garantie“](https://www.rechtsprechung-im-internet.de/jportal/?quelle=jlink&docid=KORE313212011&psml=bsjrsprod.psml)
- [BGH, Urteil vom 15.10.2015 „All Net Flat“](https://www.rechtsprechung-im-internet.de/jportal/?quelle=jlink&docid=KORE318052015&psml=bsjrsprod.psml)
- [UWG §§ 5, 5a, 7, Wortlaut](https://www.gesetze-im-internet.de/uwg_2004/) (§ 5 auch [einzeln](https://www.gesetze-im-internet.de/uwg_2004/__5.html))
- [GeschGehG § 2](https://www.gesetze-im-internet.de/geschgehg/__2.html) (nur lit. a im Tooltext), [GeschGehG § 4](https://www.gesetze-im-internet.de/geschgehg/__4.html)
- [BGB § 307](https://www.gesetze-im-internet.de/bgb/__307.html), [BGB §§ 305c, 310](https://www.gesetze-im-internet.de/bgb/)
- Aus früheren Läufen weiter genutzt: DSGVO-Volltext [EUR-Lex 32016R0679](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679), EuGH C-413/23 P [CELEX:62023CJ0413](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62023CJ0413).

## Entscheidungen Ole 24.11.2026
- Instantly „gemischt“: nur die Erfolgsgarantie entfernt (in Mail 1 und Mail 2, per API am 24.11. erledigt). Allianz-Referenz, Zahlen, Re:-Betreff und Zitat bleiben vorerst (Restrisiko F2 bis F4 bewusst getragen). Neufassung liegt in docs/vertrieb/instantly-gemischt-v2.md.
- vorlagenVon (Anzeigen eines Kunden für andere): grundsätzlich gewollt. Claude-Vorschlag dazu: Leitplanken (keine Personenbilder, Logos, Namen oder Zahlen des Quellkunden, Quelle anonym) und vertragliche Grundlage über Banner mit Widerspruch.
- AWS Bedrock: keine Mail an Kunden, Information höchstens per Banner bzw. Hinweis im Kundenbereich.
