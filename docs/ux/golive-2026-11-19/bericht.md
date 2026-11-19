# Go-live-Prüfung Kundenbereich (/buyer), 19.11.2026

Prüfer: Produktteam (QA, UX, Onboarding), aus Sicht eines neuen Agenturinhabers.

## Gesamturteil: Go mit Auflagen

Der Kundenbereich ist stabil: keine 500er, keine Konsolenfehler in der Oberfläche, kein Querscrollen am Handy, keine Platzhalter, kein „n/a“, keine englischen Texte, keine Gedankenstriche in sichtbaren Kundentexten. Einrichtung, Anruf mit Ergebnis, Termin verschieben, Terminvorbereitung mit Angebot, Abschluss und Maklervollmacht funktionieren.

Auflage vor dem ersten Onboarding morgen: **B1 beheben** (kleine Änderung, ca. 30 Minuten) oder im Onboarding-Termin die Erstinformation gemeinsam mit dem Kunden prüfen und den Namen von Hand korrigieren. Die WICHTIG-Punkte diese Woche.

## Prüfumfang und Vorgehen

* Stand: `origin/claude/facebook-ad-media-buyer-GdTgt`, Commit `5b0fad00`, als eigener Worktree `/home/user/pg-qa` (nichts committet, nichts gepusht).
* App lokal nach `tools/erklaervideos/README.md` Abschnitt 1: Postgres 16 (Port 5434), Schema per `prisma migrate diff`, Seeds `seed.ts`, `wa.ts`, `termin.ts`, `ev_zustand.mjs`, `wa_einrichtung.mjs`, `next dev` mit `DIALOG360_PARTNER_ID=demo`.
* Zusätzlich ein frischer Demo-Kunde mit komplett offener Einrichtung: „Versicherungsbüro Sonnberg“, Login `qa.neu@example.com` (Skript `local/qa_fresh.mjs` im Worktree, nur erfundene Daten).
* Playwright mit Chromium, 1440×900 (Dateien mit `-d`) und 390×844 (Dateien mit `-m`), deviceScaleFactor 1. Externe Aufrufe wurden im Browser blockiert.
* Alle Screenshots liegen in diesem Ordner.

## BLOCKER

### B1 Erstinformation: Feld „Vor- und Nachname“ praktisch unsichtbar und falsch vorbefüllt

* Seite: /buyer/einrichtung, Schritt 6 „Erstinformation für Ihre Leads“ (auch „Angaben ändern“ danach).
* Was passiert: Die Auswahl „Anrede“ nimmt die ganze Breite ein, das Namensfeld daneben ist auf dem Rechner 26 px breit, am Handy ragt es sogar aus der Karte. Der Kunde sieht kein Namensfeld. Gleichzeitig ist es mit dem internen Kundennamen vorbefüllt (`Customer.name`, beim frischen Kunden „Versicherungsbüro Sonnberg“, bei Demo-Kunden nach dem Muster „Allianz Max Berger“). Wählt der Kunde „Herr“ und bestätigt, steht in der Erstinformation (Pflichtdokument nach § 15 VersVermV) und in der Ansprache des Assistenten „Herr Versicherungsbüro Sonnberg“ bzw. „Herr Allianz Max Berger“. Die Erstinformation geht an jeden neuen Lead per WhatsApp und E-Mail.
* Screenshots: `09-offen-erstinfo-d.png`, `10-schritt6-erstinfo-m.png`, `10-schritt6-erstinfo-name-ausschnitt-m.png` (Messung: `#name` 26 px breit, Wert „Versicherungsbüro Sonnberg“).
* Code:
  * `src/app/buyer/einrichtung/erstinfo-form.tsx:23` (`const input` enthält `w-full`) zusammen mit `:146` (`${input} w-28 shrink-0`): `w-full` gewinnt gegen `w-28`, die Auswahl wird 100 % breit, `#name` (`:154`) bekommt keinen Platz.
  * `src/lib/erstinformation-shared.ts:275` `erstinfoName(e?.name, w, customer.name)`: Rückfall auf den Kundennamen statt leer bzw. `User.displayName`.
* Vorschlag: In Zeile 146 eine eigene Klasse ohne `w-full` verwenden (z. B. `input.replace("w-full", "")` plus `w-28 shrink-0`) oder Anrede und Name untereinander setzen. Namensvorschlag aus `User.displayName` des Inhabers, nicht aus `Customer.name`; ist keiner da, leer lassen und Pflichtfeld markieren. Bereits bestätigte Erstinformationen der Kunden einmal prüfen.

## WICHTIG (diese Woche)

### W1 Gewählter Versicherer wird nicht weitergegeben

* Seite: /buyer/einrichtung Schritt 5 (Versicherer wählen) und Schritt 6 (Erstinformation).
* Was passiert: In Schritt 5 „Generali“ gewählt. In Schritt 6 fragt die App erneut „Für welchen Versicherer sind Sie tätig?“, das Feld ist leer. Der Vorschlag kommt nur aus dem Kundennamen (Allianz im Namen). Ebenso richtet sich das Präsentations-Design (Allianz, AXA, SIGNAL IDUNA) nach dem Kundennamen, nicht nach der Wahl.
* Screenshots: `11-schritt5-versicherer-gewaehlt-d.png`, `09-offen-erstinfo-d.png`.
* Code: `src/lib/erstinformation-shared.ts:279` (`versichererVorschlag(customer.name, …)`), `src/lib/praesentation.ts:50-57` (`markeFuer` per Regex auf den Namen).
* Vorschlag: Bei Ausschließlichkeitsvertretern den in Schritt 5 gewählten Versicherer (`vertriebFuer(...).gesellschaften[0]`, voller Name aus `tarifkatalog`) als Vorschlag in Schritt 6 und für `markeFuer` nutzen.

### W2 „Allianz-Online-Kalender“ für alle Vertreter, auch Generali, ERGO usw.

* Seite: /buyer/einrichtung Schritt 3 „Kalender und freie Zeiten“ → „Andere Quelle für freie Zeiten“, ebenso /buyer/kalender.
* Was passiert: Nach Wahl „Generali“ zeigt die App weiter „Allianz-Online-Kalender: Wir lesen Ihre freien Termine aus der Online-Terminbuchung Ihrer Vertreter-Seite“ und eine Allianz-Zustimmung. Für einen Nicht-Allianz-Vertreter wirkt das wie Software für jemand anderen.
* Screenshot: `05-kalender-verbinden-andere-d.png` (Zählung nach Generali-Wahl: 3 Treffer „Allianz-Online-Kalender“).
* Code: `src/app/buyer/einrichtung/page.tsx:237` und `src/app/buyer/kalender/page.tsx:123` (`allianzOption={!makler}`), `src/components/calendar-sources.tsx:591-598`, `:642` („z. B. Allianz-Kalender“).
* Vorschlag: `allianzOption` nur, wenn Allianz unter den gewählten Versicherern ist (oder schon verbunden).

### W3 „Mein Versicherer erlaubt das nicht“ auch bei Maklern

* Seite: /buyer/einrichtung Schritte 3 (Kalender), 4 (Postfach), 10 (WhatsApp), Kunde als Makler.
* Was passiert: Der Makler bekommt dreimal den Ausweg „Mein Versicherer erlaubt das nicht“, dazu im Postfach den Hinweis zu Ausschließlichkeitsvertretern. Für Makler fachlich falsch.
* Screenshot: `62-makler-kalender-d.png`.
* Code: `src/app/buyer/einrichtung/page.tsx:254`, `:268-271`, `:302`, `:587`.
* Vorschlag: Bei `makler` ausblenden oder als „Darf ich nicht nutzen (z. B. Vorgabe meines Pools)“ formulieren.

### W4 Toter Link „Schreiben Sie uns“ führt auf 404

* Seite: /buyer/vorlagen („Sie möchten einen Text anders formulieren? Schreiben Sie uns“).
* Was passiert: Link auf /buyer/hilfe, die Seite gibt es nicht (nur /buyer/hilfe/whatsapp). Ergebnis: 404 „Seite nicht gefunden“.
* Screenshot: Crawl-Ergebnis, 404-Seite siehe `30-route-d-buyer_gibtsnicht.png` (gleiche Seite).
* Code: `src/app/buyer/vorlagen/page.tsx:172`.
* Vorschlag: Auf den Hilfe-Chat (`HilfeChatButton`) oder eine bestehende Kontaktmöglichkeit verlinken.

### W5 Fehlerseite bei Serverfehler ohne Gestaltung und ohne Weg zurück

* Seite: alle /buyer-Seiten bei einem Renderfehler.
* Was passiert: Es gibt kein `error.tsx` im Kundenbereich (nur unter /admin). Ein Fehler zeigt `global-error.tsx`: weiße Seite, Systemschrift, „Etwas ist schiefgelaufen.“, kein Knopf, keine Navigation. Im Test trat kein 500er auf, das ist eine Absicherung.
* Code: `src/app/global-error.tsx:41-44`, fehlendes `src/app/buyer/error.tsx`.
* Vorschlag: `src/app/buyer/error.tsx` im App-Design mit „Neu laden“ und „Zur Startseite“ und KI-Hilfe-Knopf.

### W6 Hilfetermin ohne freie Zeiten: leerer Kasten

* Seite: /buyer/einrichtung, Link „Lieber gemeinsam? 15-Minuten-Hilfetermin buchen“ (Schritt 10) springt zu #hilfetermin in Schritt 9.
* Was passiert: Liefert `helpCallSlots()` nichts (lokal immer, in Produktion bei vollem oder nicht erreichbarem Kalender), steht nur „Klappt etwas nicht? Wir machen es gemeinsam.“ ohne Buchung, Telefonnummer oder E-Mail. Ein unsicherer Kunde landet in einer Sackgasse.
* Screenshot: `16-schritt9-meta-pruefen-d.png` (unterer Teil).
* Code: `src/app/buyer/einrichtung/page.tsx:564-569` (`slots.length ? … : null`).
* Vorschlag: Ohne Zeiten Telefonnummer und „Wir rufen Sie zurück“ anbieten.

### W7 Agenturname kommt aus dem internen Kundennamen und ist für den Kunden nicht änderbar

* Seiten: Präsentation (/buyer/termine/…/praesentation, auch Kundenlink und PDF), Seitenleiste.
* Was passiert: Die Präsentation für Endkunden zeigt `Customer.name` („Allianz Max Berger“) als Absender. Die vom Kunden selbst bestätigte Firma aus der Erstinformation wird hier nicht genutzt, im Kundenbereich gibt es kein Feld, um den Namen zu ändern. Die Seitenleiste zeigt beim Inhaber den Kundennamen ohne „Allianz “ statt seines Namens (beim frischen Kunden „Versicherungsbüro Sonnberg“ statt „Petra Sonnberg“).
* Screenshots: `56-praesentation-m.png`, `61-neukunde-d-buyer_konto.png` (Seitenleiste).
* Code: `src/lib/termin-vorbereitung-server.ts:178`, `src/app/buyer/layout.tsx:95`.
* Vorschlag: Für alles, was Endkunden sehen, `Erstinformation.firma` bzw. Name nutzen, Rückfall `Customer.name`. Vor jedem Onboarding `Customer.name` im Admin prüfen. Seitenleiste: `User.displayName`.

## KLEIN

1. Name des Gründers als Beispiel in der Signatur: „z. B. Ole Kannapinn“, „Kannapinn Versicherungen“, „Herr Kannapinn“. `src/app/buyer/einstellungen/assistent/service-mails.tsx:27`, `:28`, `:103`. Screenshot `09-offen-serviceMails-d.png`. Vorschlag: „Max Mustermann“.
2. „Die Erstinformation zu Frau Sonnberg als Versicherungsvermittler“: bei Frauen „Versicherungsvermittlerin“. `src/lib/calendar/lead-email.ts:153`, `src/lib/mail-strecke/texte.ts:168`. Screenshot `13-schritt8-signatur-nach-erstinfo-d.png`.
3. Schritt 7 zeigt ohne Produkte im Angebot das Beispiel „Privatschutz“, auch wenn der Kunde das nicht gebucht hat. Mit zwei Produkten im Angebot erscheinen genau diese zwei (geprüft, korrekt). `src/lib/so-arbeitet-server.ts:33`. Screenshots `09-offen-assistent-d.png`, `14-schritt7-produkte-d.png`.
4. Schritt 11 „Start“ verspricht „Neue Leads bekommen innerhalb weniger Minuten eine WhatsApp-Nachricht“, auch wenn WhatsApp noch nicht verbunden ist. `src/app/buyer/einrichtung/page.tsx:647`. Screenshot `63-schritt11-start-d.png`.
5. Versicherer wird doppelt abgefragt (Schritt 5 Auswahl, Schritt 6 Freitext), siehe W1.
6. Werbebudget am Rechner: „zum Eintippen antippen“. `src/app/buyer/konto/budget-card.tsx:138`. Screenshot `61-neukunde-d-buyer_wachstum.png`.
7. Schritt 9 zitiert Metas Knopf „Einem Partner Zugriff auf deine Assets gewähren“ (Du). Ist Metas Originaltext, als Zitat vertretbar, eventuell mit „(so heißt der Knopf bei Meta)“ kennzeichnen. `src/app/buyer/einrichtung/page.tsx:508`.
8. Demo-Daten duzen („Sollen deine Kinder mitversichert sein?“, „dein Videocall“), obwohl der Demo-Kunde auf „Sie“ steht. Betrifft App-Demo und Vorführungen. `src/lib/demo-data.ts:270` und weitere.
9. Fehlen die OAuth-Zugänge auf dem Server, zeigt „Google-Kalender verbinden“ bzw. „Outlook verbinden“ rohes JSON mit englischen Variablennamen (lokal gesehen, HTTP 500). Nur bei Fehlkonfiguration. `src/app/api/google/connect`, `src/app/api/microsoft/connect`. Screenshots `05-kalender-verbinden-Google-d.png`, `05-kalender-verbinden-Outloo-d.png`.
10. Abschluss mit einem Tipp speichert sofort den typischen Beitrag (600 €/Jahr) und die Provision; tippt der Kunde „Abbrechen“, bleibt der Schätzwert stehen. Absicht laut Code, sollte aber im Blatt erkennbar sein („Schätzwert, später änderbar“). Screenshot `51-abschluss-sheet-m.png`.

Anzahl KLEIN: 10.

## Was gut funktioniert (geprüft)

* Erster Login: Startseite „Ihr Start am Dienstag, 24. November“, Fortschritt, nächster Schritt aufgeklappt (`01-*`, `02-*`).
* Anrede: durchgehend „Sie“ im Kundenbereich; Fragebogen zeigt die gespeicherte Ansprache.
* Terminart: Video ist Standard, Telefon und vor Ort nur als Zusatz (Schritt 1).
* Signatur Schritt 8: nach der Erstinformation vorbefüllt mit Name, Firma, Anschrift, Telefon und Link zur Erstinformation (`13-schritt8-signatur-nach-erstinfo-d.png`). Vorher fragt die App Anrede, Agentur, Telefon, Anschrift ab.
* Erstinformation als PDF: vollständig (Status, Register, IHK, Schlichtungsstellen), Link funktioniert.
* Produktliste Schritt 7: nur die gebuchten Produkte als Auswahl, Beispielchat wechselt passend.
* Meta-Prüfung: verständliche Fehlertexte bei falscher ID und wenn die Prüfung nicht geht (`15-*`, `16-*`).
* WhatsApp verbinden: Wegwahl, Checkliste, Knopf leitet direkt an 360dialog weiter (mit `lang=de`, Name und E-Mail vorbefüllt). Abgelaufener oder kaputter Rückruf führt zu „Der Link war abgelaufen…“, Fehlerfall mit „Häufige Ursachen“ (`17-*`, `19-whatsapp-fehler-m.png`).
* Leerzustände Neukunde: Nachrichten („WhatsApp ist noch nicht verbunden“ mit Knopf), Wachstum („Ihre Zahlen erscheinen ab dem Kampagnenstart“), Konto (`61-*`).
* Anruf: Nach Rückkehr in die App erscheint „Wie lief es mit …?“ mit sechs Ergebnissen, „Nicht erreicht“ speichert und schließt (`42-anruf-wie-lief-es-m.png`, `48-ne-ohnetel-*`).
* Termin verschieben: Blatt mit aktuellem Termin, neues Datum gespeichert, Kontakt zeigt neue Zeit (`52-*`, `53-*`).
* Terminvorbereitung: Bedarf, offene Fragen, Tarife, Beitrag eintragen mit Autospeichern, Summe und Kombi-Hinweis, Präsentation (`54-*`, `55-*`, `56-*`).
* Abschluss: Blatt mit Beitrag, Glückwunsch, Danke-Mail; danach „Police fertig machen“ und Vertragsübersicht im Kontakt (`51-*`, `57-vollmacht-m.png` oben).
* Maklervollmacht: nur bei Maklern, Karte im Kontakt, Pflichtfrage in der Einrichtung ohne Vorauswahl (`57-*`, `62-makler-vollmachtfrage-d.png`). Bei Vertretern keine Vollmacht sichtbar.
* Navigation: 34 Seiten per Crawl plus 15 direkt aufgerufene Routen, alle 200 außer W4. Ausgeblendete Module (Bestand, Empfehlungen, Bestellen, Ruhend) leiten sauber auf „Heute“ um. 404-Seite deutsch mit „Zur Startseite“. Kein Querscrollen auf 390 px, keine „n/a“, keine {{…}}, keine Gedankenstriche in Kundentexten (Bereichsangaben wie „Mo–Sa“ nur in ausgeblendeten Modulen oder im Admin).

## Nicht oder nur teilweise prüfbar

* Echte Weitergabe an Google, Microsoft (Kalender und Postfach), 360dialog/Meta und Stripe: lokal keine Zugänge. Geprüft bis zur Übergabe. Ob die Zugänge in Produktion gesetzt sind, ist unbekannt (bitte vor dem Termin einmal „Google-Kalender verbinden“ in Produktion klicken).
* Zahlart hinterlegen: Der Knopf erscheint nur mit Stripe-Kunde und aktivierter Abrechnung. Der Demo-Kunde sieht „Ihre Rechnungen kommen per E-Mail, Sie zahlen per Überweisung“. Stripe-Seite und Rückkehr nicht prüfbar.
* Hilfetermin-Buchung: lokal keine freien Zeiten (siehe W6).
* Push-Benachrichtigungen, App aufs Handy, echte WhatsApp-Nachrichten und E-Mails: nicht ausgelöst.
* Policen-Ansicht als eigener Bereich (/buyer/bestand) ist ausgeblendet; geprüft wurde die Vertragsansicht im Kontakt nach Abschluss.
* Anruf am Rechner: Im Testbrowser blockiert die tel:-Navigation die Seite, das Ergebnisblatt reagierte dann nicht. Mit unterdrückter tel:-Navigation funktioniert alles. In echten Browsern nicht nachgestellt, Stichprobe auf echtem Handy empfohlen.
* Datumsfelder zeigen im Testbrowser „mm/dd/yyyy“ (Sprache des Systems), in deutschen Browsern erscheint das deutsche Format. Nicht als Fund gewertet.
* Der runde „N“-Knopf unten links auf den Screenshots ist die Next.js-Entwickleranzeige und erscheint nur lokal.
* Tarifvorschläge für Nicht-Allianz-Versicherer in der Terminvorbereitung: Demo-Daten nur mit Allianz.
