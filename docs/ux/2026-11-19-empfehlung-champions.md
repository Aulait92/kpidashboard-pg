# Empfehlungen & Bewertungen: Umbauplan „Champions League“ (19.11.2026)

CPO, verdichtet aus Sales, UX, Recht und Personas (alle Stand 19.11.2026, Code gelesen, keine Live-Daten, weil das
Modul ausgeblendet ist). Mehrumsatz ist geschätzt, nicht gemessen. SUS-Ist 58 (Spanne 52 bis 65, aus dem Code
bewertet, keine Screenshots wegen Speichermangel der Dev-Server). Ziel nach Umbau: 90+, nachgewiesen auf 390 px.

**Entscheidung:** Umbau in 3 Paketen diese Nacht, Stufe C (Branch `empfehlung-champions`, Modul bleibt aus:
`EMPFEHLUNG_MODULE_AVAILABLE = false`). Paket 1 behebt zuerst die drei roten Rechtspunkte und holt die Einwilligung
an den Abschluss, weil ohne sie keine einzige Bitte rausgeht. Einschalten bleibt Stufe A (Ole).

## 1. Zielbild

„App öffnen, sehen, wen ich heute fragen soll und warum (mit Euro-Wert), ein Tipp, fertig.“

- **Wer:** Vermittler (Allianz-Vertreter, Makler, Großagentur), am Handy, zwischen zwei Terminen.
- **Eine Aufgabe:** aus zufriedenen Kunden Empfehlungen (Leads mit hoher Abschlussquote) und ehrliche
  Google-Bewertungen machen, fast ohne eigenen Aufwand.
- **Hauptaktion der Seite:** „Link senden“ in der Liste „Heute fragen“. Alles andere ist Auswertung oder Einstellung
  und tritt zurück.
- **Drei starke Abläufe statt vieler Funktionen:**
  1. Einwilligung beim Abschluss (ein Tipp, im Gespräch) → Automatik fragt in Ihrem Namen.
  2. „Heute fragen“: Liste mit Grund und Euro-Wert, je Zeile ein Knopf.
  3. Empfehlung kommt rein → Push „jetzt anrufen“ mit Gesprächseinstieg, Nummer des Vermittlers beim Empfohlenen
     gespeichert.

## 2. Hauptablauf

1. **Abschluss erfassen** (Lead-Detail, Abschluss-Karte): Häkchen „Kunde hat zugestimmt: Nachfrage, ehrliche
   Google-Bewertung, gelegentlich Empfehlungsbitte (STOPP jederzeit)“. Sichtbar, nie vorausgefüllt. Satz zum Vorlesen
   aufklappbar. Gespeichert wird die lange Fassung mit Zeitpunkt, Quelle `vermittler`, Wortlaut.
2. **Automatik** (wie heute, nur mit Einwilligung): Tag X Bewertungsbitte (neutral, gleicher Link für alle), KI ordnet
   die Antwort ein. Kritik → Aufgabe „Kunde anrufen“. Lob → Empfehlungsbitte mit Thema und Lebensereignis.
3. **Heute fragen** (Modulseite oben): Kunden, die bereit sind (Lob, Google-Klick, Abschluss vor 21+ Tagen, Termin
   stattgefunden), noch nicht gefragt, ohne Kritik, ohne STOPP, unter der Obergrenze. Je Zeile Grund + „Link senden“.
   Ohne Einwilligung: Zeile mit „Kunde hat zugestimmt“ bzw. „Im Termin zeigen“ (QR, ohne Versand erlaubt).
4. **Der Empfehlende teilt** über sein eigenes WhatsApp (Seite /empfehlung/[token], eine Aktion, Text in Du oder Sie).
5. **Die empfohlene Person** trägt Name und Handy ein (Rest hinter „Mehr angeben“) oder schreibt per WhatsApp.
   Erfolgsseite: „Nummer speichern“ (vCard).
6. **Vermittler** bekommt Push „Empfehlung von {Vorname}: jetzt anrufen“, Lead steht oben in Heute mit Satz
   „{Empfehlender} hat mir erzählt, dass …“. Kennzahl „Zeit bis zum ersten Anruf“.
7. **Dank** an den Empfehlenden ohne Details zur empfohlenen Person, mit dem Link „funktioniert weiterhin“ (nur mit
   Einwilligung des Empfehlenden und unter der Obergrenze). Konkreter Stand nur mit statusConsent.

## 3. Seitenstruktur

### /buyer/empfehlungen, Reiter „Übersicht | Teilen | Einstellungen“

**Übersicht (von oben nach unten):**
1. Wert-Zeile: „Aus Empfehlungen: 2 Neukunden, ca. 640 € Provision (90 Tage, geschätzt)“ + „das 3,6-Fache der
   Modulkosten“ (nur wenn > 1). Darunter 3 kleine Werte: Empfehlungen, Termine, Neukunden.
2. **Heute fragen (n)** mit Grund je Zeile („hat gelobt“, „Abschluss vor 24 Tagen“, „Termin gestern“) und
   primärem Knopf „Link senden“ (bestehende Aktion `sendReferralLinkNow`). Höchstens 5 sichtbar, „Alle anzeigen“.
   Kein „Allen senden“ (Makler wollen einzeln; Massenversand widerspricht dem Einzelfall-Prinzip).
3. **Zu erledigen** nur wenn vorhanden, je Karte ein Knopf: „Kritik: Kunde anrufen“ (Anrufen, Geklärt),
   „Einwilligung fehlt (x von y Abschlüssen)“ (Liste mit „Kunde hat zugestimmt“), „Google: Bewertung ohne Antwort“
   (aus dem Bewertungs-Wächter).
4. Eine Trichter-Zeile „Links → geöffnet → Empfehlungen → Neukunden“ mit dem einen Tipp aus `funnelHint`.
   Volle Auswertung hinter „Auswertung ansehen“ (aufklappen).
- Weg: 8 gleich große Kacheln, Trichter-Fußnote, Rechtsabsatz am Seitenende (→ docs/hilfe.md).

**Leerer Zustand:** Startliste mit Fortschritt (1 Google-Link hinterlegen, Schnellformular wie heute; 2 Angebot für
Empfohlene wählen; 3 ersten Link senden, Kandidaten aus den Abschlüssen). Keine Nullkacheln.

**Teilen:** QR-Code des allgemeinen Links groß (im Termin ohne Kontakt, Bild bleibt nach dem Laden offline zeigbar),
„Link kopieren“, Signatur-Zeile mit „Kopieren“ eingeklappt unter „E-Mail-Signatur“ (Allianz und Großagentur nutzen sie
kaum). Hinweis in einem Satz: „Persönliche Links senden Sie im Kontakt.“

**Einstellungen:** sichtbar nur Automatik an/aus, Google-Bewertungslink (Feld + ein Satz „Ohne eigenes Profil?
Fragen Sie Ihre Agentur nach dem Bewertungslink.“), Angebot für Empfohlene (Auswahl mit Vorschau). Unter „Erweitert“:
Tage (Auswahl 7/14/21/30), Nachfassen, Bitte nach Termin (Standard aus), Rückmeldungen, Dankeschön (Standard aus,
Hinweis § 48b VAG und Versicherer-Vorgaben), Texte (nur die gerade bearbeitete Vorlage mit Vorschau; Ein-Satz-Hinweis
„Neutral um eine ehrliche Bewertung bitten, für alle gleich.“).

### Kontakt-Karte (EmpfehlungLeadCard im Lead-Detail)
- Verlauf in einer Zeile als Badges: Bewertungsbitte · Antwort (Lob/Kritik/Frage) · Empfehlung, je mit Datum.
- Ein primärer Knopf „Empfehlungslink senden“, Anlass automatisch (unter „Mehr“ änderbar). Zweitknopf „Im Termin
  zeigen“ (QR). „Nicht anfragen“ und Anlass unter „Mehr“.
- Einwilligung fehlt: ein Satz „Ohne Zustimmung des Kunden geht keine Nachricht raus.“ + Knopf „Kunde hat zugestimmt“.
- Weg: Erklärabsatz zu „Nicht anfragen“ (→ Hilfe), Statussätze als Fließtext.

### Navigation
- Eintrag „Empfehlungen“ im Mehr-Menü mit eigener Markierung (nur wenn Modul aktiv oder Testphase).
- Heute-Hinweis (`EmpfehlungHeuteHint`): „n Kunden bereit für eine Empfehlung“ mit Link auf die Liste.
- Vorschlag an Ole (nicht von uns geändert): „Kollegen empfehlen“ (/buyer/empfehlen) in „Kollegen werben“ umbenennen.

### Öffentliche Seiten
- **/empfehlung/[token] (Empfehlender):** Überschrift, Angebot, Auswahl „An wen?“ (Freunde/Familie = du,
  Kollegen/Nachbarn = Sie), großer Knopf „Per WhatsApp weiterleiten“, ein Satz Einleitung, „Gern an mehrere schicken“.
- **/empfehlung/[token]/kontakt (Empfohlene):** Vertrauenszeile (Foto nur wenn hochgeladen; Google-Sterne erst in
  einem späteren Paket, siehe 6), Name und Handy, „Mehr angeben“ für E-Mail/Thema/Nachricht, Knopf „Rückruf anfordern“,
  Einwilligung als Satz direkt unter dem Knopf, statusConsent als eigenes freiwilliges Häkchen. WhatsApp-Weg darunter.
  Erfolgsseite mit Nummer und „Nummer speichern“ (vCard). Rechtlicher Fuß bleibt.

## 4. Texte (alle an Kunden, Empfehlende und Empfohlene in beiden Fassungen über `a(an, du, sie)`, ohne Gedankenstriche)

Grundsatz: `renderText` erzwingt heute Sie („Empfehlungen siezen immer“, shared.ts). Neu folgt die Ansprache
`Customer.leadAddress` bzw. bei Bestandskunden deren Feld, Standard „sie“. Teilen-Text an Bekannte wählt der
Empfehlende selbst. Meta-Vorlagen gibt es heute nur als Sie-Fassung: Bis Du-Fassungen eingereicht sind, gehen
Vorlagen in Sie raus, freie Texte im 24-h-Fenster in beiden Fassungen.

| Stelle | Sie | Du |
|---|---|---|
| Bewertungsbitte (`review`) | {Anrede}, passt bei Ihrem neuen Vertrag alles? Wenn nicht, antworten Sie einfach hier. Über eine ehrliche Bewertung bei Google freue ich mich: {Link} Keine Nachrichten mehr? Antworten Sie mit STOPP. {Vertreter} | {Anrede}, passt bei deinem neuen Vertrag alles? Wenn nicht, antworte einfach hier. Über eine ehrliche Bewertung bei Google freue ich mich: {Link} Keine Nachrichten mehr? Antworte mit STOPP. {Vertreter} |
| Empfehlungsbitte (`referral`) | {Anrede}, hier ist {Vertreter}. Schön, dass Ihre {Thema} jetzt gut geregelt ist. Wer in Ihrem Umfeld hat gerade ein neues Auto, ist umgezogen, hat Nachwuchs bekommen oder seine Verträge lange nicht angeschaut? Leiten Sie diesen Link einfach weiter, die Person meldet sich dann selbst bei mir: {Link} Danke für Ihr Vertrauen! Keine Nachrichten mehr? STOPP. | {Anrede}, hier ist {Vertreter}. Schön, dass deine {Thema} jetzt gut geregelt ist. Wer in deinem Umfeld hat gerade ein neues Auto, ist umgezogen, hat Nachwuchs bekommen oder seine Verträge lange nicht angeschaut? Leite diesen Link einfach weiter, die Person meldet sich dann selbst bei mir: {Link} Danke für dein Vertrauen! Keine Nachrichten mehr? STOPP. |
| Bei Lob (`praiseReferral`) | {Anrede}, vielen Dank, das freut mich wirklich! Wenn Ihnen jemand einfällt, dem ich genauso helfen kann, zum Beispiel ein Kollege oder jemand aus der Familie: Schicken Sie einfach diesen Link weiter, dann meldet er sich selbst bei mir: {Link} Herzliche Grüße, {Vertreter} | {Anrede}, vielen Dank, das freut mich wirklich! Wenn dir jemand einfällt, dem ich genauso helfen kann, zum Beispiel ein Kollege oder jemand aus der Familie: Schick einfach diesen Link weiter, dann meldet er sich selbst bei mir: {Link} Herzliche Grüße, {Vertreter} |
| Dank (`referralThanks`, ohne statusConsent) | {Anrede}, danke, dass Sie mich weiterempfohlen haben. Das ist das schönste Lob für meine Arbeit. Ihr Link funktioniert weiterhin, falls Ihnen noch jemand einfällt: {Link} {Vertreter} | {Anrede}, danke, dass du mich weiterempfohlen hast. Das ist das schönste Lob für meine Arbeit. Dein Link funktioniert weiterhin, falls dir noch jemand einfällt: {Link} {Vertreter} |
| Teilen an Bekannte (`shareText`) | Ich kann Ihnen {Vertreter} sehr empfehlen, ich bin dort gut beraten. Über meinen Link bekommen Sie {Angebot}, {Vertreter} meldet sich dann persönlich bei Ihnen: {link} | Hey, ich bin bei {Vertreter} und richtig zufrieden. Falls du deine Versicherungen mal checken lassen willst: Über meinen Link bekommst du {Angebot}, {Vertreter} meldet sich dann persönlich bei dir: {link} |
| Teilen-Seite, Einleitung | Leiten Sie die Nachricht an jemanden weiter, der gerade an Versicherungen denkt, die Person meldet sich dann selbst. | Leite die Nachricht an jemanden weiter, der gerade an Versicherungen denkt, die Person meldet sich dann selbst. |
| Kontaktseite, Kopf | {Empfehlender} hat Ihnen {Vertreter} empfohlen. Nummer hinterlassen, {Vertreter} ruft Sie an. Kostenlos und unverbindlich. | {Empfehlender} hat dir {Vertreter} empfohlen. Nummer hinterlassen, {Vertreter} ruft dich an. Kostenlos und unverbindlich. |
| Kontaktseite, unter dem Knopf | Mit dem Absenden bitten Sie {Vertreter}, Sie per Telefon, WhatsApp oder E-Mail zu Ihrer Anfrage zu kontaktieren. Widerruf jederzeit. Datenschutz | Mit dem Absenden bittest du {Vertreter}, dich per Telefon, WhatsApp oder E-Mail zu deiner Anfrage zu kontaktieren. Widerruf jederzeit. Datenschutz |
| statusConsent (Häkchen) | {Empfehlender} darf erfahren, ob ich mich gemeldet habe, einen Termin hatte und Kunde wurde (nur Vorname, keine Details). Freiwillig. | gleich (Ich-Form) |
| Kontaktseite, Erfolg | Danke, Ihre Anfrage ist angekommen! {Vertreter} ruft Sie von dieser Nummer an: {Nummer}. Speichern Sie sie am besten gleich. [Nummer speichern] | Danke, deine Anfrage ist angekommen! {Vertreter} ruft dich von dieser Nummer an: {Nummer}. Speicher sie am besten gleich. [Nummer speichern] |
| Signatur | PS: Kennen Sie jemanden, der seine Versicherungen mal prüfen lassen möchte? Über diesen Link bekommt er {Angebot}: {link} | PS: Kennst du jemanden, der seine Versicherungen mal prüfen lassen möchte? Über diesen Link bekommt er {Angebot}: {link} |

Ohne eingestelltes Angebot entfällt der Angebotsteil („… meldet sich dann persönlich“). {Thema} aus Gesundheitssparten
(Kranken, BU, Pflege, Zahn, Leben mit Gesundheitsprüfung) wird in allem, was an Dritte geht (shareText, Kontaktseite,
Link-Vorschau), durch „Versicherungen und Vorsorge“ ersetzt (Art. 9 DSGVO).

**Vermittler-Oberfläche (Sie):**
- Einwilligung, Häkchen: „Kunde hat zugestimmt: Nachfrage, ehrliche Google-Bewertung, gelegentlich Empfehlungsbitte (STOPP jederzeit)“.
- Einwilligung, lange Fassung (gespeichert, zum Vorlesen): „Der Kunde ist einverstanden, dass ich ihn per WhatsApp nach
  dem Abschluss frage, ob alles gepasst hat, und ihn um eine ehrliche Google-Bewertung sowie gelegentlich (höchstens
  3-mal im Jahr) um eine Empfehlung bitte. Widerspruch jederzeit mit STOPP.“
- Nachfassen (`followUpNote`): „Empfehlung nachfassen: {Vorname} anrufen. Satz: ‚Haben Sie schon an jemanden gedacht?
  Zum Beispiel Kollegen oder jemand mit neuem Auto?‘“
- Trichter-Tipp `start`: „Größter Hebel: öfter fragen. Senden Sie heute 3 Kunden aus ‚Heute fragen‘ ihren Link.“
- Trichter-Tipp `abschluss`: „Rufen Sie Empfohlene schnell an und beginnen Sie mit dem Namen: ‚{Empfehlender} hat mir erzählt, dass …‘“
- Push: „Empfehlung von {Vorname}: jetzt anrufen“.
- Werbeseite (Modul inaktiv): Titel „Aus zufriedenen Kunden neue Abschlüsse“, Untertitel „Die App fragt nach jedem
  Abschluss in Ihrem Namen nach einer ehrlichen Bewertung und einer Empfehlung. Empfohlene melden sich selbst, Sie rufen
  nur noch an.“, 3 Punkte, Hauptaktion „30 Tage kostenlos testen“.

**Einheitliche Begriffe:** Bewertungsbitte, Empfehlungsbitte, Empfehlungslink, Empfehlungen (statt Empfehlungs-Leads),
Neukunden aus Empfehlungen, Lob / Kritik / Frage, Einwilligung (Oberfläche: „Kunde hat zugestimmt“). Status überall als
Badge der bestehenden Komponente.

## 5. Kennzahlen

Oben sichtbar (4): Provision aus Empfehlungen (90 Tage, „geschätzt“, Grundlage an der Zahl, Vergleich zu 177 €
Modulkosten je 90 Tage), Empfehlungen, Termine, Neukunden aus Empfehlungen.
In „Zu erledigen“: Abschlüsse mit Einwilligung x von y, offene Kritik, Google-Bewertungen ohne Antwort.
In „Auswertung ansehen“: Trichter, Empfehlungsquote (Kunden mit mindestens einer Empfehlung / Kunden mit Abschluss),
Abschlussquote Empfehlung gegen Werbe-Leads, Zeit bis zum ersten Anruf (Median), Google neue Bewertungen und Sterne seit
Start (mit Quellenhinweis), Kritik am selben Tag geklärt, Wiederholungs-Empfehler.
Für uns (nach dem Einschalten, `nutzung-woche`): Anteil Abschlüsse mit Einwilligung, Bitten je Vermittler und Woche,
Bleiberate nach Testphase.

## 6. Was wegfällt, versteckt oder später kommt

- **Weg:** 8-Kachel-Raster, Trichter-Fußnote, Rechtsabsatz unten, Erklärabsätze (Nicht anfragen, allgemeiner Link,
  Im Termin zeigen), Einwilligungs-Häkchen auf der Kontaktseite (ersetzt durch Satz am Knopf), Satz „Ich konnte weiterhelfen“.
- **Versteckt:** Trichter-Details, Signatur, alle Einstellungen außer Automatik/Google-Link/Angebot, Anlass-Auswahl,
  „Nicht anfragen“, Dankeschön (Standard aus).
- **Bewusst nicht gebaut (Begründung):** „Allen senden“ (Einzelfall, Makler-Wunsch); Bitte nach Termin standardmäßig an
  (peinlich nach Schadenterminen, Personas und Recht); Lob-Erkennung in allen WhatsApps (neuer AVV-Zweck, später);
  Schaden als Auslöser (Bestandsmodul, anderes Team); automatische Erstnachricht an Empfohlene (gelb, eigene Meta-Vorlage,
  später).
- **Eigenes späteres Paket (nach Abstimmung):** Google-Sterne auf Kontaktseite, in Erstnachricht und auf /book (§ 5b
  UWG, berührt Admin und alle Leads; stärkstes Kaufargument für Makler); Berater-Sicht und Lead-Zuordnung für
  Großagenturen; Provision je Sparte; Policen-Check als Angebot für Empfohlene (Policen-Team).

## 7. Rechtliche Auflagen (interne Prüfung, keine Anwaltsfreigabe)

- **R1:** `sendAfterAppointmentReferrals` (requests.ts) prüft `feedbackAllowed` bzw. bei Bestandskunden `optOutAt`/`blockedAt`. Mit Test.
- **R2:** `sendReferralLinkNow`, Lead-Zweig: bei `feedbackOptOutAt` immer blocken; ohne Einwilligung nur im offenen
  24-h-Fenster als freie Antwort, sonst Rückgabe „Einwilligung fehlt“ mit Knopf. QR ohne Einwilligung erlaubt. Signatur
  der Aktion für `src/components/bestand/customer-actions.tsx` unverändert lassen.
- **R3:** neuer Einwilligungswortlaut (siehe 4), gemeinsame Obergrenze 3 Empfehlungsbitten in 365 Tagen je Kontakt über
  alle Wege; Einwilligungen mit altem Wortlaut decken nur eine Empfehlungsbitte.
- `sendReferralThanks`: ohne statusConsent kein anlassbezogener Dank (gemeldet, Termin, Abschluss); mit erneutem Link nur
  bei Einwilligung des Empfehlenden und unter der Obergrenze. statusConsentText um „und Kunde wurde“ erweitert.
- Kein Gating: gleicher Google-Link für alle, KI steuert nie den Google-Link. Keine Gegenleistung für Bewertungen.
  Kein Feld für Daten Dritter, kein Versand an Dritte durch uns. Keine Einwilligungsbitte per Vorlage.
- Dankeschön aus bis Offen Nr. 4 (§ 48b VAG, höchstens 15 € je Jahr, kein Bargeld, nie an Empfohlene).
- Euro-Werte als „geschätzt“ mit Grundlage, keine Hochrechnung als Versprechen. Nie „Garantie“.
- Pflichtangaben auf der Kontaktseite bleiben: Wer, Kanäle, Zweck, Widerruf, Datenschutzlink; Wortlaut und Zeitstempel
  weiter gespeichert; rechtlicher Fuß bleibt; Ref-Code in der WhatsApp-Nachricht bleibt; Drosselung beim persönlichen
  Link bleibt; Versandfenster Mo bis Sa 9 bis 19 Uhr bleibt; `redactHealthText` bleibt.
- Laut AGENTS.md gehen die öffentlichen Texte (Kontaktseite, Teilen-Seite) vor dem Bauen durch einen Hilfsagenten
  „Conversion-Texter“; die Texte in Abschnitt 4 sind die Vorlage dafür. Danach Pflichtangaben-Abgleich.
- Bewertung als `docs/recht/empfehlungsmodul-2026-11-19.md` ablegen (Paket 1).

## 8. Beim späteren Einschalten nötig (Stufe A, Ole)

- `EMPFEHLUNG_MODULE_AVAILABLE = true` nur durch Ole.
- ProductUpdate-Migration (`kind` neu, `audience` software), Eintrag in `docs/webseite-offen.md` (Du-Form, „demnächst“
  nur für Angekündigtes).
- Vorlagen bei Meta neu einreichen: `review_request`, `referral_request`, `referral_thanks` (neue Texte mit STOPP),
  zusätzlich Du-Fassungen; `referral_update` freigeben.
- AGB-Testphase (Offen Nr. 1), AVV mit Zweck „Nachfrage, Empfehlungen, KI-Einordnung“ und Betroffenen „empfohlene
  Personen“ (Nr. 2), Datenschutzhinweise zu ReferralVisit (Nr. 6), Löschfrist 12 Monate für Empfehlungs-Leads ohne Abschluss.
- `docs/hilfe.md` und `docs/empfehlungen-modul.md` auf neuen Stand, Hilfeartikel „Ohne eigenes Google-Profil“.
- Erklärvideos prüfen (`tools/erklaervideos/betroffen.py`); das Modul darf heute in keinem vorkommen.
- Paketpreis für Agenturen mit mehreren Beratern klären.
- Bestand-Team: Kampagne „Jährliche Empfehlungsbitte“ nutzt dieselbe Einwilligung und die gemeinsame Obergrenze.

## 9. Pakete (nacheinander, je ein Agent)

1. **Fundament: Recht, Einwilligung beim Abschluss, Texte in beiden Ansprachen** (Engpass Menge, rote Punkte).
2. **Modulseite als Arbeitsliste „Heute fragen“ + Kontakt-Karte + Einstellungen + Navigation** (Hauptaktion, SUS).
3. **Empfehlung zu Abschluss: öffentliche Seiten, Sofort-Anruf, Dank-Schleife** (Conversion beim Empfohlenen).

Details, Dateien und Abnahme je Paket stehen in der Rückgabe des CPO an den Orchestrator (gleicher Stand) und sind
unten zusammengefasst.

### Paket 1
- `src/lib/empfehlung/shared.ts`: neuer `FEEDBACK_CONSENT_TEXT` (lang) + Kurzlabel, `statusConsentText` erweitert,
  `renderText` mit Ansprache (`a()` aus `src/lib/ansprache.ts`), neue `DEFAULT_TEXTS`/`OCCASIONS`/`shareText`/Signatur in
  beiden Fassungen, Gesundheitsthemen-Filter, Konstante `REFERRAL_ASK_LIMIT = 3` / 365 Tage, `referralThanks.needsLink = true`.
- `src/lib/empfehlung/requests.ts`: R1, R2, Obergrenze über alle Wege, `sendReferralThanks` mit statusConsent-Regel,
  alte Einwilligung = eine Bitte.
- Abschluss-Karte im Lead-Detail (`src/components/lead-detail-body.tsx`, Einbindung `FeedbackConsentToggle`):
  Häkchen sichtbar beim Abschluss, nie vorausgefüllt.
- Tests in `tests/unit/` (R1, R2, Obergrenze, Ansprache, keine Gedankenstriche, Gesundheitsthema).
- `docs/recht/empfehlungsmodul-2026-11-19.md`.

### Paket 2
- `src/app/buyer/empfehlungen/page.tsx`, `src/components/empfehlung/server.tsx`, `client.tsx`, `waechter.tsx`:
  Reiter, Wert-Zeile, „Heute fragen“, „Zu erledigen“, eingeklappter Trichter, leerer Zustand, Einstellungen mit
  „Erweitert“, schlanke Kontakt-Karte. Neue Abfrage `loadReferralCandidates` in `requests.ts`.
- Mehr-Menü-Eintrag, `EmpfehlungHeuteHint` mit Anzahl. Erklärtexte nach `docs/hilfe.md`.
- Screenshots 390/1280 vorher/nachher, SUS-Messung.

### Paket 3
- `src/app/empfehlung/[token]/page.tsx` (An wen?, eine Aktion), `kontakt/page.tsx` + `kontakt/actions.ts` (2 Felder,
  Mehr angeben, Einwilligung am Knopf, vCard-Route), Push und Heute-Priorität für Quelle Empfehlung
  (`src/lib/lead-intake.ts`, Heute-Sortierung), Gesprächseinstieg, Kennzahl Zeit bis zum ersten Anruf.
- Conversion-Texter-Hilfsagent vor dem Bauen, Pflichtangaben-Abgleich danach.

## 10. Risiko, Kosten, Stufe

- **Risiko:** SUS 90+ ist ohne echte Screenshots nicht belegt (Spanne nach Umbau 80 bis 92); Speicher der Dev-Server
  kann Abnahmen verhindern, dann Screenshots nachholen statt schönrechnen. Ansprache Du ändert Meta-Vorlagen
  (Neueinreichung beim Einschalten). Obergrenze senkt die Zahl automatischer Bitten leicht, schützt aber vor Abmahnung.
- **Kosten:** 2 bis 3 Arbeitstage Agentenzeit, keine externen Kosten.
- **Stufe:** Umbau C (Branch, Modul aus). Einwilligungstext und Ansprache B (Recht intern, erledigt in diesem Plan).
  Einschalten, Preis für Agenturen, Dankeschön: A (Ole).
