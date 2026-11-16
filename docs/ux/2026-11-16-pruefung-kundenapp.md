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

| Bereich | Runde 1 | Runde 2 | Runde 3 | Begründung (Stand Runde 3) |
|---|---|---|---|---|
| Heute | 7 | 9 | 9 | Eine Hauptaktion (Anrufliste starten), Begrüßung stimmt wieder (war immer „Guten Abend“), Kontakt-Fenster rechts ohne abgeschnittene Phasenleiste. Rest: „Nächste Tage“ zeigt Schiebe-Knöpfe an jeder Wiedervorlage. |
| Anrufliste | 8 | 9 | 10 | Ziel, Schritte und „Aus dem Chat“ auf einen Blick, ohne zusätzliche Karte; Name öffnet den Kontakt, nach gebuchtem Termin geht es weiter. |
| Kontakte (Liste, Pipeline) | 7 | 9 | 9 | Umschalter ruhig, 40-px-Chips, leere Zustände mit „Gesamten Zeitraum anzeigen“. |
| Kontakt | 6 | 9 | 9 | Wiedervorlage-Datum lesbar (Kachel bleibt, Ole), kein doppelter Termin-Knopf, Ziel des nächsten Anrufs oben, Angaben halb so hoch und ohne doppelten Namen, Zurück-Link überall „Alle Kontakte“ bzw. „Pipeline“. |
| Termin buchen, verschieben | 7 | 8 | 8 | Fehlerfall „freie Zeiten laden nicht“ führt jetzt zum Kalender. Ohne echten Kalender nicht ganz durchspielbar. |
| Terminvorbereitung | 5 | 8 | 9 | Am Handy kein Querscrollen mehr (war 450 px breit), Baustein-Chips umbrechen sauber. Seite ist gut gegliedert (neu seit heute Nacht). |
| Präsentation | 7 | 9 | 9 | Knöpfe am Handy in einer Zeile, Logo-Hinweis aus dem Kopf, eine Hauptaktion. |
| Kundenlink (/beratung) | 4 | 8 | 8 | Am Handy waren die Folien unlesbar (7 px); jetzt antippen, quer und bildschirmfüllend. Abgelaufener Link erklärt sich auf Deutsch statt englischer 404. |
| Nachrichten | 7 | 9 | 9 | Datum „14.11..“ behoben, Tippziele, leerer Zustand in der richtigen Sprache, kein iPhone-Zoom beim Tippen. |
| Wachstum | 6 | 7 | 8 | Pause zugeklappt, Trichter am Handy kompakt und ohne doppelte Kopfzahlen, „Leads ohne WhatsApp: 0 %“ weg. Tipps füllen die Breite. Bleibt lang (Kosten-Karten mit viel Kleintext). |
| Einstellungen und Unterseiten | 5 | 9 | 9 | Überall dasselbe „Zurück“ oben links (Oles Fund), kein falsches „Neu“, Texte ohne ausgeblendete Module. |
| Konto & Rechnungen | 7 | 8 | 8 | Daten-Export ein Satz. „Vertrag hier kündigen“ steht weiter oben in der Vertragskarte. |
| Kalender | 5 | 7 | 8 | Erst verbinden, dann teilen; Zeitzeilen am Handy einzeilig; „Zeit blockieren“ zugeklappt. Bleibt: 15 Einzelzeiten statt Zeitfenster je Tag. |
| Hilfe, Neuigkeiten, Einführung, Team | 7 | 9 | 9 | Hilfe nur noch an einem Ort je Gerät und gleich benannt. |
| Login, Passwort vergessen | 7 | 9 | 9 | Keine englischen Reste („Email“, „Reset-Link“), Zurück zur Anmeldung gut tippbar. |
| Öffentliche Buchung (/book) | 7 | 9 | 9 | Bestätigung in Sie-Form (stand fest in Du-Form). |
| Leere Zustände | 5 | 9 | 9 | Jede leere Liste sagt, was als Nächstes passiert oder was zu tun ist. |
| Gesamt (SUS-Schätzung) | ca. 68 | ca. 84 | ca. 86 | Von „okay“ zu „sehr gut“. Für die Höchstnote fehlen Wachstum (Länge, Kleintext) und Kalender (Einzelzeiten), beides größere Umbauten mit Entscheidung von Ole (Vorschläge 1 und 2). |

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

Grundsatz seit 16.11. früh (Ole): Kacheln und Knöpfe, die Ole kennt und häufig nutzt, bleiben; vereinfachen ja, keine
gewohnten Wege streichen. Die Kachel „Wiedervorlage“ im Kontakt ist deshalb wieder immer da. Zu prüfen nach diesem
Grundsatz: „Hilfe“ im Profilmenü ist entfallen (Hilfe steht weiter in der Seitenleiste bzw. oben am Handy).

## Vorschläge (offen, nach Wirkung)

Nicht umgesetzt, weil größer oder eine Entscheidung von Ole nötig ist. Punkte aus der Aufräumliste vom 15.11., die
noch offen sind, stehen gesondert darunter.

| # | Seite | Problem | Vorschlag | Aufwand | Bild |
|---|---|---|---|---|
| 1 | Wachstum | Am Handy rund 3.900 px lang; fünf Kosten-Karten mit je 3 bis 5 Zeilen Kleintext, „So holen Sie mehr raus“ als großer Kasten. | Je Karte eine Zahl und eine Zeile; Rechenwege hinter „So rechnen wir“; Tipp als eine Zeile mit Knopf. | M | `shots/r3-wachstum-1280.png` |
| 2 | Kalender | 15 Zeilen Einzelzeiten (je Tag drei Zeiträume à 30 Minuten). | Zeitfenster je Tag („10 bis 17 Uhr“) plus Termindauer; Einzelzeiten nur unter „Genauer einstellen“. | M | `shots/fix-kalender-390.png` |
| 3 | Kontakt im Fenster rechts (Heute, 1280 px) | Aktionen brechen um („Mehr“ allein in der zweiten Zeile), die Telefonnummer ist der breiteste Knopf. | Im schmalen Fenster „Anrufen“ statt Nummer (Container-Abfrage wie bei der Phasenleiste). | S | `shots/fix-pane-1280.png` |
| 4 | Buchungsseite / Termin verwalten | Der Vermittler heißt auf /book „Max Berger“, auf /book/manage „Allianz Max Berger“. | Überall derselbe Anzeigename. | S | `shots/pub-390-book_manage_demo_90bff1347720891fbf4323bd-ganz.png` |
| 5 | Wachstum | „Arbeitsweise: 100 %“ steht allein in einem Drei-Spalten-Raster, die Kosten-Karten darunter lassen eine Lücke. | Kennzahl in die Lücke der Kosten-Karten oder nur zeigen, wenn unter 100 %. | S | `shots/r3-wachstum-1280.png` |
| 6 | Nachrichten (Handy) | Die Seite hat keine Überschrift; man sieht nur Reiter und Suche. | Kleine Überschrift „Nachrichten“ oder Reiter mit Zähler als Überschrift. | S | `shots/fix-chats-390.png` |
| 7 | Kundenlink (/beratung) | Abgelaufener Link nennt keinen Vermittler, weil der Token unbekannt ist; der Kunde muss wissen, wen er fragt. | Abgelaufene Links 30 Tage lang erkennen (Token behalten) und Name plus Telefon des Vermittlers zeigen. | M | `shots/pub2-390-beratung_abcdefghijklmnopqrstuv.png` |
| 8 | Präsentation (Vermittler, Handy) | Die Folie ist auf 390 px ebenso klein wie beim Kundenlink. | Gleiche Vergrößerung beim Antippen (FolieGross) wie im Kundenlink. | S | `shots/r3-praes-390.png` |

### Aus der Aufräumliste vom 15.11. noch offen (geprüft am aktuellen Stand)
- Konto: „Vertrag hier kündigen“ steht als zweites Element der Seite (rechtlich muss er gut erreichbar bleiben; ans Ende der Vertragskarte reicht).
- Einstellungen: „Rückmeldung an Meta“ ist interne Technik.
- Kalender: „Zeit blockieren“ und Profilmenü „Ich bin abwesend“ sind zwei Wege für fast dasselbe (Formular jetzt zugeklappt).
- Heute: „+1 Tag / +1 Woche“ an jeder Wiedervorlage unter „Nächste Tage“.

## Nicht geprüft
- Einrichtung (`/buyer/einrichtung`): Das Demo-Konto ist fertig eingerichtet, die Seite leitet auf Heute.
- Buchung mit echten freien Zeiten und Verschieben mit Zeitauswahl: ohne verbundenen Kalender lädt die App keine Zeiten.
- Native App (iOS/Android-Hülle), Push-Benachrichtigungen, echte WhatsApp-Zustellung.
- Datumsfelder: Headless-Chromium zeigt sie im US-Format; im deutschen Browser erscheinen sie deutsch.
