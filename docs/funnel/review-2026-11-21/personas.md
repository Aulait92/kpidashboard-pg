# PKV-Funnel /f/pkv-beitrag: Test mit Lead-Personas (21.11.2026)

Auftrag: Ole, 21.11.2026 (Usability 90+). Getestet live auf https://app.performancegrowth.de/f/pkv-beitrag mit
Playwright, 390 px, Persona 1 zusätzlich Schrift 130 %. Nie abgesendet (letzter Schritt nur angesehen, Nachname „Test“).
Screenshots: `/tmp/claude-0/-home-user-kpidashboard-pg/bf89c659-cedd-579f-985a-0a606116153e/scratchpad/review-personas/`
(p1-*, p2-*, p3-*; flüchtig, Scratchpad).

Ablauf (Stand 21.11.2026): Einstieg mit Überschrift im A/B-Test („Über 650 € im Monat …“ bzw. „Hat deine PKV den
Beitrag zum 1. Januar erhöht?“), Cookie-Banner Meta, Frage 1 privat/gesetzlich, 2 Versicherung (ca. 40 Kacheln),
3 Beruf, 4 Dauer bei der PKV, 5 Beitrag (Freifeld), 6 Geburtsdatum, 7 PLZ + Ort, Zwischenseite „Fast fertig!“,
Name, Telefon + E-Mail + Einwilligung, „Kostenlos prüfen lassen“. Unter 650 € Beitrag: Ausstieg nach Frage 5.

## Persona 1: Selbstständiger, 58, 920 €, skeptisch, große Schrift

- Gezögert: Startseite. Mit 130 % verdeckt das Meta-Cookie-Banner die Antwortknöpfe von Frage 1 (`p1-selbststaendig-00.png`).
  Erster Eindruck: „Facebook will meine Daten, bevor ich überhaupt was gefragt werde.“
- Frage 2: Bei 130 % sind die Kacheln riesig, Signal Iduna liegt weit unten, ich scrolle lange (`p1-selbststaendig-02.png`). Keine Suche.
- „Fast fertig!“ (Zwischenseite) nach „7 von 7“: Ich dachte, ich bin fertig, dann kommen noch zwei Seiten. Fühlt sich wie ein Trick an.
- „Spare bis zu 50 %*“ mit Sternchen: Genau das, was ich als Abzocke kenne.
- Einwilligung: Telefon, E-Mail **und WhatsApp**, Widerruf an eine persönliche Adresse
  (ole.kannapinn@…), Firma „Ole Kannapinn UG“. Wirkt wie Einzelperson, nicht wie Fachportal.
- Partnerliste geklickt (Skeptiker tun das): „SweetCars GmbH“ ohne Registernummer als PKV-Experte. **Hier breche ich ab.**
- Anruf erwartet: ja, 24 bis 48 h steht da. Rangehen: nur, wenn Name und Nummer vorher per SMS/Mail angekündigt sind.
- SUS-Schätzung: **62** (Bedienung ok, Vertrauen schwach).

## Persona 2: Beamtin, 52, 410 € Eigenanteil (Beihilfe)

- Gezögert: Frage 5. „Ganzer Beitrag vor Abzug eines Arbeitgeberzuschusses“ passt nicht zu Beamten (Beihilfe, kein Zuschuss).
  Ich weiß nicht, ob ich 410 € oder einen fiktiven Vollbeitrag eintragen soll.
- Nach 5 Fragen: „Für Beiträge unter 650 € bieten wir diese Prüfung leider nicht an. Hast du dich vertippt?“ (`p2-beamtin-06.png`).
  Ich fühle mich abgewiesen und leicht belehrt. Hätte ich das am Anfang gewusst (Variante „Über 650 €“ sagt es, die Variante
  „1. Januar erhöht“ nicht), hätte ich mir 5 Fragen gespart.
- Frage 3 bietet „Beamtin/Beamter“ an, es passiert aber nichts Eigenes: kein Hinweis, ob Beamte gemeint sind.
- Abbruch: zwangsläufig nach Frage 5. Kein Ausweg (kein Tipp, keine Alternative).
- Anruf: entfällt. SUS-Schätzung: **55**.
- Für das Geschäft richtig, dass sie raus ist (Filter kein Beamter, ab 450/650 €). Nur früher und freundlicher.

## Persona 3: Angestellter, 46, 780 €, eilig

- Gesamt etwa 11 Bildschirme statt „7 kurze Fragen“. Zeit grob 90 bis 120 s, geht in der Mittagspause.
- Gezögert: Frage 5 Beitrag, „vor Abzug Arbeitgeberzuschuss“: Ich kenne nur meinen Abzug auf der Abrechnung, rechne kurz hoch. Gut erklärt, aber Denkarbeit.
- Frage 7: PLZ und Ort getrennt, Ort wird nicht aus der PLZ ergänzt, Fehlermeldung „Bitte gib deinen Wohnort ein“. Nervt.
- Zwischenseite „Fast fertig!“ mit drei Absätzen: überspringe ich, kostet einen Klick.
- Name und Telefon auf zwei Seiten: eine Seite reicht. E-Mail ohne „optional“, ich weiß nicht, ob Pflicht.
- Abbruch: eher nein, wenn nichts klemmt. Anruf erwartet: ja; rangehen bei unbekannter Nummer in der Arbeit eher nicht, Rückruf
  auf Wunsch-Zeitfenster wäre besser.
- SUS-Schätzung: **78**.

## Die 8 wichtigsten Änderungen (priorisiert)

1. **Partnerliste bereinigen** (Stufe A wegen Rechtstext, sofort): „SweetCars GmbH“ ohne Registernummer zerstört Vertrauen und
   ist rechtlich fraglich; nur Partner mit § 34d/34e-Nummer und Firmennamen, der nach Versicherung klingt.
2. **Ausschluss früh und freundlich**: Beitragsgrenze direkt nach Frage 1 als Kacheln abfragen (z. B. „unter 450 €“, „450 bis 650 €“,
   „über 650 €“) bzw. Beamte schon bei Frage 3 mit freundlichem Endbildschirm aussteigen lassen; „Hast du dich vertippt?“ streichen.
3. **Cookie-Banner** darf die erste Frage nicht verdecken (kompakter, unten schmal, oder erst nach erster Antwort); bei 130 % prüfen.
4. **Zählung ehrlich**: „7 kurze Fragen“ und „7 von 7“ passen nicht zu 11 Bildschirmen. Zwischenseite „Fast fertig!“ streichen oder auf
   einen Satz über dem Namensfeld kürzen; Name und Telefon auf eine Seite.
5. **Vertrauen statt „bis zu 50 %*“**: Überschrift der Kontaktseite durch konkreten Ablauf ersetzen („Ein geprüfter Experte mit
   Registernummer ruft dich an, du entscheidest danach“); Sternchen-Versprechen weg oder klein.
6. **Absender seriös**: Widerruf an Funktionsadresse (z. B. widerruf@…), Marke vor Personennamen; WhatsApp in der Einwilligung
   kurz begründen oder wählbar machen (Recht prüfen, Stufe A).
7. **Beitragsfrage je Beruf**: Bei Beamten „Ihr Eigenanteil nach Beihilfe“, bei Angestellten „Gesamtbeitrag (steht im Beitragsschreiben)“.
8. **Formular-Komfort**: Ort aus PLZ automatisch, E-Mail als „optional“ kennzeichnen, Versicherer-Suche oder die 8 größten oben plus
   „Andere“, Wunsch-Zeitfenster für den Rückruf („heute Abend“, „morgen Vormittag“), Bestätigung mit Name/Nummer des Experten per SMS.

## Ergebnis

Empfehlung: Punkte 1 bis 3 vor weiterem Anzeigenbudget umsetzen, 4 bis 8 als nächste A/B-Runde. Begründung: Bedienung ist solide,
aber skeptische Zielgruppe (die mit hohen Beiträgen) bricht an Vertrauenssignalen ab, und Ausgeschlossene verlieren 5 Fragen.
Risiko: Abbruchquote auf der Kontaktseite und Beschwerden; Partnerliste rechtlich. Kosten: 0,5 bis 1 Tag Entwicklung.
Stufe: 1 und 6 A (Rechtstexte/Partner), Rest B. SUS-Mittel der Personas: ca. 65 (Spanne 55 bis 78), Ziel 90 nicht erreicht.
