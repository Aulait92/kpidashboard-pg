# Prüfung Kundenapp (16.11.2026)

Auftrag (Ole): „Teste nochmal die ganze Kundenapp auf Designfehler, Unstimmigkeiten und mögliche UX/UI-Optimierungen.
Es muss die intuitivste und einfachste App sein, die der Vermittler nutzt.“ Erweitert: Funde selbst umsetzen, auch
größere, in Runden bis zur Höchstpunktzahl; je Runde Bewertung nach Nielsen-Heuristiken bzw. SUS-Maßstab.

Geprüft: Vermittlerbereich `/buyer` (alle Seiten aus der Navigation, alle Unterseiten), dazu was Kunden des Vermittlers
sehen (`/book`, `/book/manage`, `/beratung/[token]`, `/erstinformation`), Login und Passwort vergessen. Admin nicht.
Jede Seite auf 390 px und 1280 px mit Playwright, programmatisch (Querscrollen, Überlauf, Tippziele unter 40 px,
Gedankenstriche, Du-Form, englische Reste, Konsolenfehler und 404/500, Links ohne Ziel, Hauptaktionen je Seite) und
per Screenshot. Dazu ein Konto ohne Leads (leere Zustände). Daten: Demo-Kunde (Max Berger, 28 Kontakte, Termine,
Chats), Stand `origin/claude/whatsapp-crm` ab dc617fd.

Screenshots: `/tmp/claude-0/-home-user-kpidashboard-pg/5666182b-f0f3-50fb-a1b4-146b28494aa3/scratchpad/ux-pruef/shots/`
(Präfix `r1-` Ausgangsstand, `fix-`/`r3-`/`r4-` nach den Änderungen, `leer-` Konto ohne Leads, `pub-` öffentliche Seiten).

## Bewertung je Runde (1 bis 10)

Maßstab: 10 = ein Vermittler erledigt die Aufgabe ohne Erklärung, ohne Suchen und ohne Fehlgriff, auf Handy und Rechner;
Grundlage sind die zehn Heuristiken von Nielsen (Sichtbarkeit des Zustands, Sprache der Nutzer, Kontrolle und Zurück,
Einheitlichkeit, Fehlervermeidung, Wiedererkennen statt Erinnern, Effizienz, Reduktion, Fehlerhilfe, Hilfe).

| Bereich | Runde 1 | Runde 2 | Runde 3 | Runde 4 | Begründung (Stand Runde 4) |
|---|---|---|---|---|---|
| Heute | 7 | 9 | 9 | 9 | Eine Hauptaktion (Anrufliste starten), Begrüßung stimmt wieder (war immer „Guten Abend“), Kontakt-Fenster rechts ohne abgeschnittene Phasenleiste. Rest: „Nächste Tage“ zeigt Schiebe-Knöpfe an jeder Wiedervorlage. |
| Anrufliste | 8 | 9 | 10 | 10 | Ziel, Schritte und „Aus dem Chat“ auf einen Blick, ohne zusätzliche Karte; Name öffnet den Kontakt, nach gebuchtem Termin geht es weiter. |
| Kontakte (Liste, Pipeline) | 7 | 9 | 9 | 9 | Umschalter ruhig, 40-px-Chips, leere Zustände mit „Gesamten Zeitraum anzeigen“. |
| Kontakt | 6 | 9 | 9 | 10 | Wiedervorlage-Datum lesbar (Kachel bleibt, Ole), kein doppelter Termin-Knopf, Ziel des nächsten Anrufs oben, Angaben halb so hoch und ohne doppelten Namen, Zurück-Link überall „Alle Kontakte“ bzw. „Pipeline“. |
| Termin buchen, verschieben | 7 | 8 | 8 | 8 | Fehlerfall „freie Zeiten laden nicht“ führt jetzt zum Kalender. Ohne echten Kalender nicht ganz durchspielbar. |
| Terminvorbereitung | 5 | 8 | 9 | 9 | Am Handy kein Querscrollen mehr (war 450 px breit), Baustein-Chips umbrechen sauber. Seite ist gut gegliedert (neu seit heute Nacht). |
| Präsentation | 7 | 9 | 9 | 9 | Knöpfe am Handy in einer Zeile, Logo-Hinweis aus dem Kopf, eine Hauptaktion. |
| Kundenlink (/beratung) | 4 | 8 | 8 | 9 | Am Handy waren die Folien unlesbar (7 px); jetzt antippen, quer und bildschirmfüllend. Abgelaufener Link erklärt sich auf Deutsch statt englischer 404. |
| Nachrichten | 7 | 9 | 9 | 9 | Datum „14.11..“ behoben, Tippziele, leerer Zustand in der richtigen Sprache, kein iPhone-Zoom beim Tippen. |
| Wachstum | 6 | 7 | 8 | 9 | Pause zugeklappt, Trichter am Handy kompakt und ohne doppelte Kopfzahlen, „Leads ohne WhatsApp: 0 %“ weg. Tipps füllen die Breite; Kosten-Karten mit einer Zahl und einer Zeile, Rechenwege hinter „So rechnen wir“; „Arbeitsweise“ als eine Zeile. |
| Einstellungen und Unterseiten | 5 | 9 | 9 | 9 | Überall dasselbe „Zurück“ oben links (Oles Fund), kein falsches „Neu“, Texte ohne ausgeblendete Module. |
| Konto & Rechnungen | 7 | 8 | 8 | 9 | Daten-Export ein Satz. „Vertrag hier kündigen“ steht weiter oben in der Vertragskarte. |
| Kalender | 5 | 7 | 8 | 9 | Erst verbinden, dann teilen; Zeitzeilen am Handy einzeilig; „Zeit blockieren“ zugeklappt; gleiche Zeiten an allen Tagen stehen einmal da (Wochentage als Schalter), „Tage einzeln einstellen“ für Ausnahmen. Am Handy 3.838 → 2.114 px. |
| Hilfe, Neuigkeiten, Einführung, Team | 7 | 9 | 9 | 9 | Hilfe nur noch an einem Ort je Gerät und gleich benannt. |
| Login, Passwort vergessen | 7 | 9 | 9 | 9 | Keine englischen Reste („Email“, „Reset-Link“), Zurück zur Anmeldung gut tippbar. |
| Öffentliche Buchung (/book) | 7 | 9 | 9 | 10 | Bestätigung in Sie-Form (stand fest in Du-Form). |
| Leere Zustände | 5 | 9 | 9 | 9 | Jede leere Liste sagt, was als Nächstes passiert oder was zu tun ist. |
| Gesamt (SUS-Schätzung) | ca. 68 | ca. 84 | ca. 86 | ca. 90 | Von „okay“ zu „sehr gut“. Für über 95 fehlen vor allem: Präsentation am iPhone im Hochformat (Folie klein, siehe Vorschläge) und echte Nutzertests mit Vermittlern; die Schätzung beruht auf Heuristiken, nicht auf Messung. |

## Was in Runde 1 und 2 umgesetzt ist (Commits)

Erste Charge (live 16.11. früh): einheitliches Zurück auf Unterseiten; kein „Neu“ im Profilmenü für das ausgeblendete
Modul; Terminvorbereitung ohne Querscrollen; Kontakt (Wiedervorlage, Terminknöpfe, Angaben); Knöpfe am Handy 40 px;
Heute mit einer Hauptaktion; Kontakte-Umschalter; Nachrichten-Datum; Eingabefelder 16 px (kein iPhone-Zoom); Wachstum
(Pause, „Leads ohne WhatsApp“); Kalender-Reihenfolge und Zeitzeilen; Texte ohne ausgeblendete Module.

Zweite Charge: Buchungsbestätigung in Sie-Form, deutsche 404, abgelaufener Kundenlink, Passwort vergessen;
Begrüßung nach Tageszeit; Verschieben-Fehler mit Link; Kontakt-Fenster mit Status-Chip; leere Zustände; Hilfe einmal;
Kontakt ohne doppelten Termin-Knopf; Tippziele Dokumente und „Nächste Tage“.

Runde 2 danach: Kundenlink-Folien am Handy lesbar; Präsentation am Handy; Wachstum-Trichter; Kopfzeile am Handy;
Wachstum ohne Leads; Anruf mit „Aus dem Chat“ und Ziel im Kontakt; Angaben ohne doppelten Namen; „Vorbereitet“
beschriftet.

Runde 3: Zurück-Link im Kontakt einheitlich; „Zeit blockieren“ zugeklappt; Tipps auf Wachstum in voller Breite.
Erneut geprüft: alle Seiten auf 390 und 1280 px ohne Querscrollen, ohne Gedankenstriche, ohne Konsolenfehler (bis auf
Abbrüche durch Neustarts des lokalen Dev-Servers); Du-Form nur in Lead-Chats und bei der Wahl „Du (persönlich)“.

Runde 4 (Ole: „Alles freigegeben“): Kosten-Karten auf Wachstum mit einer Zahl und einer Zeile; Kalender mit gemeinsamen
Zeiten (nur Oberfläche, gleicher gespeicherter Zeitplan, Test); Kontakt-Fenster auf Heute mit „Anrufen“ und allen Kacheln
in einer Reihe; Name auf der Buchungsseite einheitlich; „Arbeitsweise“ als Zeile; abgelaufener Kundenlink nennt den
Vermittler. Integrationstests Kalender und Verfügbarkeit grün.

Grundsatz seit 16.11. früh (Ole): Kacheln und Knöpfe, die Ole kennt und häufig nutzt, bleiben; vereinfachen ja, keine
gewohnten Wege streichen. Die Kachel „Wiedervorlage“ im Kontakt ist deshalb wieder immer da. Zu prüfen nach diesem
Grundsatz: „Hilfe“ im Profilmenü ist entfallen (Hilfe steht weiter in der Seitenleiste bzw. oben am Handy).

## Vorschläge (offen, nach Wirkung)

Nicht umgesetzt, weil größer oder eine Entscheidung von Ole nötig ist. Punkte aus der Aufräumliste vom 15.11., die
noch offen sind, stehen gesondert darunter.

| # | Seite | Problem | Vorschlag | Aufwand | Bild |
|---|---|---|---|---|---|
| 1 | Präsentation (Vermittler, iPhone) | Im Hochformat ohne Vollbild-Schnittstelle bleibt die Folie auf Handybreite (Text sehr klein). | Im Ersatz-Vollbild die Folie im Hochformat quer drehen, wie beim Kundenlink. Betrifft das gemeinsame FolienDeck (auch Admin und Demo). | S | `shots/r3-praes-390.png` |
| 2 | Einstellungen | „Rückmeldung an Meta“ ist interne Technik. | Für Kunden ausblenden und immer an lassen (Entscheidung Ole). | S | `shots/back-390-buyer_einstellungen-ganz.png` |
| 3 | Nachrichten (Handy) | Die Seite hat keine Überschrift; man sieht nur Reiter und Suche. | Bewusst so gelassen (mehr Platz für die Liste); nur ändern, wenn Nutzer sich verlaufen. | S | `shots/fix-chats-390.png` |

### Aus der Aufräumliste vom 15.11. noch offen (geprüft am aktuellen Stand)
- Konto: „Vertrag hier kündigen“ steht am Ende der Vertragskarte (erste Karte der Seite); so bleibt er rechtlich gut erreichbar.
- Kalender: „Zeit blockieren“ und Profilmenü „Ich bin abwesend“ sind zwei Wege für fast dasselbe (Formular jetzt zugeklappt).
- Heute: „+1 Tag / +1 Woche“ an jeder Wiedervorlage unter „Nächste Tage“.

## Nicht geprüft
- Einrichtung (`/buyer/einrichtung`): Das Demo-Konto ist fertig eingerichtet, die Seite leitet auf Heute.
- Buchung mit echten freien Zeiten und Verschieben mit Zeitauswahl: ohne verbundenen Kalender lädt die App keine Zeiten.
- Native App (iOS/Android-Hülle), Push-Benachrichtigungen, echte WhatsApp-Zustellung.
- Datumsfelder: Headless-Chromium zeigt sie im US-Format; im deutschen Browser erscheinen sie deutsch.

## Runde 4 (unabhängig)

Prüfer: unabhängige Runde ohne Übernahme des Urteils aus Runde 1 bis 3. Blick: 50-jähriger Vermittler, am Handy
zwischen zwei Kundenterminen, Demo-Konto ohne verbundenen Kalender. Stand `origin/claude/whatsapp-crm` ab accc79e.
Jede Änderung auf 390 und 1280 px per Screenshot geprüft (kein Querscrollen, nichts abgeschnitten); programmatisch
Tippziele unter 40 px, Gedankenstriche, Du-Form, englische Reste. Ausgenommen (andere Agenten): Wachstum, Kosten-Karten,
Kalender/Verfügbarkeit, Kennzeichen „Kein WhatsApp“, `lib/lead-intake.ts`.

### Aufgaben durchgespielt (Klicks am Handy, vorher → nachher)

| Aufgabe | vorher | nachher | Stolperstelle (vorher) |
|---|---|---|---|
| Morgens Heute öffnen, wissen was zu tun ist | 0 | 0 | keine; alles „Überfällig“ rot, wenn alles überfällig ist (bleibt) |
| Neuen Lead anrufen, Ergebnis eintragen | 3 | 3 | gut |
| Termin vereinbaren nach dem Anruf (ohne Kalender) | 6+ (Anrufliste beenden, Kontakt, Termin, Formular) | 3 | „Termin vereinbart“ fehlte im Ergebnis-Fenster ganz, wenn kein Kalender verbunden ist |
| Termin vorbereiten und präsentieren (von Heute) | 3 bis 4 (über den Kontakt), Zurück landete im Kontakt | 2, Zurück führt nach Heute | Termin-Fenster auf Heute bot weder Vorbereiten noch Präsentation |
| Kontakt finden | 3 | 3 | Phase in der Trefferzeile abgeschnitten |
| Lead auf Gewonnen/Verloren | 2 | 2 | Knopf „Gewonnen“ öffnete Fenster „Abschluss“ |
| Chat beantworten und zum Kontakt | 2 + 2 (Infos aufklappen, kleiner Link „Lead öffnen“) | 2 + 1 (Name antippen) | kein direkter Weg vom Chat zum Kontakt am Handy |
| Einstellungen ändern | 2 (Menü, 7. Eintrag) | 2 (1. Eintrag) | Einstellungen ganz unten im Profilmenü |
| Hilfe finden | 1 | 1 | Untertitel abgeschnitten |

### Umgesetzt (Commits 2a1ba01 bis 34e91b5)

- Heute: Termin antippen bietet „Vorbereiten“ und „Präsentation“; von dort führt Zurück („Heute“) wieder nach Heute. „Termin buchen“ im Anruf-Fenster auch ohne Kalender.
- Anrufliste: „Termin vereinbart“ auch ohne verbundenen Kalender; das Buchungsfenster zeigt dann gleich „Termin von Hand eintragen“, mit Kalender aufklappbar unter den freien Zeiten. Danach geht die Liste weiter. Ein Formular für Kontakt und Buchungsfenster (`ManualTerminForm`).
- Kontakt: überfällige Wiedervorlage „· überfällig“ in Rot (auch in der Kontaktliste); im Fenster rechts auf Heute dieselben Kacheln wie am Handy statt einer umbrechenden Knopfreihe, „Anrufen“ statt Telefonnummer; Terminzeit „Heute, 10:00 Uhr“ bzw. „Morgen“, nie abgeschnitten; Termin-Fenster mit einer Hauptaktion („Kalender verbinden“ als Zweitknopf, Hinweise je ein Satz); „Gewonnen“ öffnet „Gewonnen“; „Phase ändern“; Kartentitel „Angaben“; Tippflächen 40 px (Phasen-Chip unsichtbar vergrößert, Wiedervorlage, Stift, Dokumentart).
- Kontaktliste: „eingegangen …“ und „Termin …“ beschriftet, Suche und Filter 40 px, Spalte „Eingang“ statt „Datum“.
- Pipeline: „Phase ändern“ statt „Verschieben“ (Verschieben heißt sonst Termin verschieben).
- Nachrichten: Name im Chatkopf öffnet den Kontakt; „Kontakt öffnen“, „Infos zum Kontakt“, „Anfrage“, „Phase“; Seitentitel am Handy (Vorschlag 6); Reiter 14 px; Knöpfe 40 px.
- Terminvorbereitung: „Heute, 10:00 Uhr“ im Kopf; Sparten-Chips, Monat/Jahr, Entfernen-Kreuze am Handy 36 bis 40 px.
- Profilmenü: „Einstellungen“ als erster Eintrag. Anmeldung: Passwort anzeigen, „Passwort vergessen?“ 40 px. Konto: ohne Online-Zahlung kein grauer Knopf, sondern ein Satz mit dem Weg. Suche: Phase zuerst. KI-Hilfe: Untertitel passt.
- Neuigkeit `20261118705260_neuigkeit_bedienung_feinschliff`, Eintrag in `docs/webseite-offen.md`.

### Bewertung Runde 4 (1 bis 10, frisch geprüft)

Ehrlich: Mein Ausgangsurteil lag unter Runde 3. Die fehlende Terminwahl nach dem Anruf ohne Kalender, die nicht erkennbar
überfällige Wiedervorlage im Kontakt, der fehlende Weg vom Chat zum Kontakt am Handy und rund 20 Tippziele unter 40 px
hätte ich mit etwa 83 statt 86 bewertet.

| Bereich | Runde 3 | R4 vorher | R4 nachher | Begründung |
|---|---|---|---|---|
| Heute | 9 | 8,5 | 9,5 | Termin führt direkt zu Vorbereiten/Präsentation. Rest: „+1 Tag/+1 Woche“ an jeder Wiedervorlage unter „Nächste Tage“. |
| Anrufliste | 10 | 8 | 9,5 | Ohne Kalender fehlte „Termin vereinbart“. Jetzt drei Tipps. |
| Kontakte (Liste, Pipeline) | 9 | 8,5 | 9,5 | Beschriftete Daten, überfällig rot, „Phase ändern“. |
| Kontakt | 9 | 8,5 | 9,5 | Überfällig sichtbar, Tippziele, Fenster rechts aufgeräumt. Rest: „Gewonnen“ vs. Phase „Abschluss“. |
| Termin buchen | 8 | 7 | 9 | Eine Hauptaktion, Formular überall gleich. Ohne echten Kalender nicht ganz durchspielbar. |
| Terminvorbereitung | 9 | 8,5 | 9 | Tippziele, „Heute“. Seite bleibt lang (viel Inhalt, aber gegliedert). |
| Präsentation | 9 | 8 | 8,5 | Folie am Handy weiter klein (Vorschlag 8). |
| Nachrichten | 9 | 8 | 9,5 | Name führt zum Kontakt, Titel, Begriffe. |
| Einstellungen, Profilmenü | 9 | 8,5 | 9,5 | Einstellungen oben. Rest: „Rückmeldung an Meta“ ist Technik. |
| Konto | 8 | 7,5 | 8,5 | Kein grauer Knopf mehr. Rest: Kündigen recht weit oben. |
| Login, Hilfe, Neuigkeiten | 9 | 8,5 | 9,5 | Passwort anzeigen, Tippziele, Untertitel. |
| Gesamt (SUS-Schätzung) | ca. 86 | ca. 83 | ca. 89 | |

### Was für über 95 noch fehlt (Vorschläge, nach Wirkung)

1. Ein Begriff für den Erfolg: Knopf „Gewonnen“, Phase und Ergebnis-Auswahl „Abschluss“. Vorschlag: Ergebnis-Auswahl „Gewonnen“ (Phase bleibt „Abschluss“), Erklärvideo-Text prüfen. Entscheidung Ole.
2. Fenster „Gewonnen“: drei Textblöcke (Feld, Provisionsrechnung, Meta-Satz). Vorschlag: Meta-Satz nur, wenn die Rückmeldung an Meta aktiv ist, Rechenweg hinter „So rechnen wir“.
3. Wachstum und Kalender (Vorschläge 1, 2, 5 aus Runde 3, anderer Agent).
4. Präsentation am Handy: Vollbild dreht die Folie quer wie im Kundenlink (Vorschlag 8).
5. „Nächste Tage“ auf Heute: „+1 Tag/+1 Woche“ nur am geöffneten Eintrag statt an jeder Zeile (Ole hat die Knöpfe eingeführt, daher nur Vorschlag).
6. Echter Test mit 5 Vermittlern (SUS-Fragebogen); über 95 lässt sich nicht am Schreibtisch schätzen, nur messen.
7. Einrichtung und Konto ohne Leads in dieser Runde nicht prüfbar (Demo-Konto fertig eingerichtet).

### Erklärvideos betroffen (`tools/erklaervideos/betroffen.py accc79e..HEAD`)

- Ausführlich: Kontakt rechts auf Heute (Kacheln statt Knopfreihe, „Angaben“ statt „Angaben zum Lead“, Termin „Heute, …“), Nachrichten (Name mit Pfeil, Titel am Handy). Aufnahmeskript `rec_ev.js` auf „Angaben“ angepasst; neu aufnehmen.
- Kurz: Termin im Kontakt und Nachrichten (gleiche Punkte). Gesprochener Text bleibt gültig; nur Bild.
- WhatsApp verbinden: nicht betroffen (nur Link-Höhe auf der Hilfe-Seite).
