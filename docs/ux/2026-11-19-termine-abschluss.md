# Termine und Abschluss: UX-Runde Team C (19.11.2026)

Bereich: Terminseite (`/buyer/termine/<id>`), Terminvorbereitung um die Angebotskarte herum, Vergleichsblatt,
Abschluss-Blatt (`/buyer/abschluss`), Meine Provisionen, Mein Kalender. Präsentation nicht (anderes Team).
Screenshots (lokal, Seed „Allianz Agentur Max Berger“, Desktop 1440 und Handy 390) im Arbeitsordner der Sitzung
(`ux-runde/c-termine/vorher`, `nachher`), nicht im Repo.

## 1. Terminseite `/buyer/termine/<id>`
Wer: Vermittler am Handy, aus dem Push „Ist Frau Becker da?“, von „Heute“ oder vom Kontakt. Aufgabe je Zeitpunkt:
vorher vorbereiten und wissen, ob der Kunde kommt; zu Beginn „da?“ beantworten; danach das Ergebnis festhalten.

**Warum schwer (vorher, SUS ≈ 64)**
- Nach dem Termin Sackgasse: „Erschienen. Das Ergebnis tragen Sie nach dem Termin auf ‚Heute‘ ein.“ Kein Knopf dafür,
  dafür noch „Videocall starten“ (nach dem Termin sinnlos).
- Vor dem Termin keine Hauptaktion: vier gleich graue Knöpfe (Videocall, Vorbereitung, Chat, Kontakt), dazu der Satz
  „Zum Terminbeginn fragt die App hier, ob alle da sind.“
- Show-up unsichtbar: ob der Kunde zugesagt hat und welche Erinnerungen er bekommt, steht nirgends.
- Anders aufgebaut als die Terminkarte im Kontakt (gleiches Ding, anderes Aussehen).

**Lösung**
- Vor dem Termin: die bestehende Terminkarte aus dem Kontakt (`components/termin-karte.tsx`, unverändert), also eine
  Hauptaktion je Zeit (Vorbereiten, schon vorbereitet: Präsentation; ab 10 Minuten vorher Videocall bzw. Anrufen),
  Verschieben daneben, Seltenes unter „Mehr“.
- Darunter „Erinnerungen an Frau Winter“: gesendete und geplante Erinnerungen mit Zeit (WhatsApp am Vortag,
  1 Stunde vorher, 15 Minuten vorher, Mail am Vortag; übersprungen bzw. pausiert gekennzeichnet). Ohne Zusage oben
  „Noch nicht bestätigt“ (gelb), nach „Bitte verschieben“ „Möchte verschieben“ (rot). Ohne geplante Erinnerung:
  „Ein kurzer Anruf vorher hilft.“ (`lib/termin-seite.ts`, Test `tests/unit/termin-seite.test.ts`).
- Zu Beginn (Video): „Ist Herr Becker da?“ unverändert als einzige Hauptaktion, die Terminkarte ruhig darunter.
- Nach dem Termin: „Wie lief der Termin mit Frau Kraus?“ mit **Abschluss** (Hauptaktion), „Angebot senden“ (solange
  offen) und „Anderes Ergebnis“ (bestehendes Ergebnis-Blatt: Wiedervorlage, nicht erschienen, verloren). Nach
  „Abschluss“ sofort inline Beitrag, Provision und Glückwunsch (dieselbe Komponente wie `/buyer/abschluss`).
  Keine zweite Karte mit „Ergebnis eintragen“ daneben.
- Chat und Kontakt als kleine Links am Ende.

KPI: Abschlussquote und Erfassung (Ergebnis und Beitrag in einem Zug statt Umweg über „Heute“), Show-up-Quote
(Zusage und Erinnerungen sichtbar, „Noch nicht bestätigt“ führt zum Anruf). SUS nachher ≈ 91.

## 2. Terminvorbereitung (um die Angebotskarte herum)
**Warum schwer (vorher, SUS ≈ 84)**
- Zwei blaue Hauptknöpfe: „Jetzt einrichten“ (Zwei-Faktor-Login, großer gelber Kasten in „Das will der Kunde“) und
  „Präsentation öffnen“. Am Handy schiebt der Kasten das Angebot eine halbe Seite nach unten.
- „Als vorbereitet markieren“ ist ein eigener Schritt, den viele vergessen; die Aufgabe auf „Heute“ bleibt offen.
- Ohne Zusage kein Hinweis (nur „zugesagt“, wenn ja).

**Lösung**
- Zwei-Faktor-Hinweis als eine kompakte Zeile mit Pfeil (gleicher Titel und gleiche Begründung, AVV § 5), kein
  zweiter blauer Knopf.
- „Präsentation öffnen“ vor dem Termin markiert den Termin automatisch als vorbereitet (Haken bleibt zum Zurücknehmen).
- Im Kopf „noch nicht bestätigt“ (gelb, führt zur Terminseite mit den Erinnerungen), solange der Termin ansteht.
- Angebotskarte unverändert.

KPI: Abschlussquote (Vorbereitung in einem Zug, unter 2 Minuten), Show-up-Quote. SUS nachher ≈ 90.

## 3. Meine Provisionen
**Warum schwer (vorher, SUS ≈ 70)**
- Gelber Warnkasten ganz oben, dann „Stornoquote pro Jahr“ (selten) vor den eigenen Produkten.
- Je Produkt eine Karte mit 3 bis 7 Feldern untereinander; am Handy über zwei Bildschirme, bevor man etwas sieht.
- „Speichern“ unten, immer sichtbar, auch ohne Änderung.

**Lösung** (Muster der Angebotskarte)
- Eine Karte „Ihre Sätze als Vertreter“ (bzw. Makler, „Ändern“ daneben), Hinweis als ein Satz: „Vorausgefüllt mit
  Erfahrungswerten. Bitte mit Ihrer Provisionsliste abgleichen.“
- Eine Zeile je Produkt mit dem Satz auf einen Blick („55 % Abschluss · 10 % Bestand“), „Eigener Wert“ nur wenn
  geändert; Felder nur in der aufgeklappten Zeile (immer eine).
- „Weitere Sparten“ und „Stornoquote pro Jahr (10 % Standard)“ zugeklappt in derselben Karte.
- „Speichern“ erscheint erst bei einer Änderung, als feste Leiste am Handy; danach Meldung „Gespeichert“.

KPI: Erfassung (richtige Sätze, damit die Zahlen stimmen), Bindung, Selbstständigkeit. SUS nachher ≈ 90.

## 4. Mein Kalender
Vorher SUS ≈ 84 (klar, aber vier Karten). „Zeit blockieren“ ist jetzt der Abschnitt „Ausnahmen“ in der Karte
„Wann dürfen Leads Termine buchen?“; der Satz „Sobald Ihr Kalender verbunden ist …“ entfällt, weil die Karte darüber
schon die Knöpfe zum Verbinden hat. Gemeinsame Bausteine (Buchungsseite, Zeitenformular) unverändert, weil sie auch in
Einrichtung und Admin stehen. SUS nachher ≈ 87. Offen: zwei blaue Knöpfe („Kopieren“, „Zeiten speichern“), siehe unten.

## 5. Abschluss-Blatt `/buyer/abschluss` und Vergleichsblatt
Beide schon nah am Ziel (SUS ≈ 90 bzw. 88). Abschluss: „Noch nicht“ meldet nur noch „Nachfassen läuft weiter“, wenn
wirklich eines läuft, sonst „Bleibt offen“. Vergleichsblatt unverändert.

## Offen für Ole
- Kalender: „Kopieren“ (Buchungsseite) und „Zeiten speichern“ sind beide blau; die Bausteine teilen sich Einrichtung
  und Admin. Vorschlag: „Zeiten speichern“ nur bei Änderung zeigen (wie jetzt bei den Provisionen).
- Terminvorbereitung am Handy: „Noch klären im Termin“ steht vor dem Angebot. Vorschlag: am Handy nach dem Angebot.
- Terminseite: Erinnerungen dort direkt überspringen (heute nur im Kontakt unter „Nächste Nachrichten“).
