# Einrichtung für Allianz-Vertreter (20.11.2026)

Anlass: echte Einrichtung von Herrn Lohmann (Allianz-Vertreter) am 20.11.2026. Er hat für den Kalender nacheinander
Google, Microsoft, ICS-Link und den Link seiner Vertreter-Seite versucht; nur die Vertreternummer hat funktioniert
(die Allianz sperrt den Zugriff auf Microsoft 365, das Veröffentlichen von Kalendern und den Abruf von
vertretung.allianz.de). Name, Telefon, Anschrift und Registernummer wurden in drei Schritten erneut abgefragt.
Freigegeben von Ole: Punkte 3, 4 und 10.

## Wer, Situation, Aufgabe

- **Wer:** Allianz-Ausschließlichkeitsvertreter (Persona „Allianz-Vertreter, 50+, Outlook der Allianz, Handy im Auto“),
  daneben alle anderen Vermittler mit Software-Paket.
- **Situation:** Einrichtung am ersten Tag, oft am Handy oder im Kickoff-Call mit uns, Unterlagen (IHK-Urkunde,
  Vertreter-Seite) nicht immer griffbereit.
- **Aufgabe:** In 20 bis 30 Minuten startklar sein, ohne Sackgassen und ohne dieselbe Angabe zweimal zu tippen.

## Wo es hingehört (bestehendes erweitern, nichts stapeln)

1. **Schritt 1 „Ihre Angaben“** (bisher „Kurzer Fragebogen“, kein neuer Schritt, keine neue Zählung):
   Anrede, Vor- und Nachname, Telefon, Anschrift, Registernummer (beide IHK-Formate), bei Allianz-Vertretern optional der
   Webex-Link. Gespeichert in die bestehenden Stellen: Erstinformation (Name, Anrede, Telefon, Anschrift, Registernummer;
   ohne „bestätigt“, das bleibt im Schritt Erstinformation) und AgentConfig.videoRoomUrl. Ansprache, Terminarten und
   „Was macht Sie besonders?“ liegen eingeklappt darunter, mit den Standardwerten in der Zeile („Sie · Video“).
   Telefon kommt vorausgefüllt aus unserem Vertriebskontakt, Anrede aus dem Vornamen, der Rest aus Impressum und Angebot.
2. **Kalender bei Allianz-Vertretern** (nicht Makler; erkannt an Versicherer Allianz in der Erstinformation bzw. im
   Kundennamen, an der Wahl „Allianz“ unter Versicherer, an einer Vertreter-Seite oder einem schon verbundenen
   Allianz-Kalender): eine Sache zuerst, „Ihre Allianz-Vertreternummer“ mit einem Satz, wo sie steht. Danach der
   Webex-Link (schon bekannt: nur anzeigen mit „ändern“), dann die Beratungszeiten. Gebucht wird über den App-Kalender,
   Einladungen kommen per Mail. Google, Outlook und Kalender-Link liegen eingeklappt unter „Anderen Kalender verbinden“.
   Alle anderen Kunden behalten den bisherigen Aufbau.
3. **Erstinformation:** Name, Anrede, Anschrift, Telefon und Registernummer sind schon bekannt und stehen als eine Zeile
   „Aus Ihren Angaben … ändern“ statt als Eingabefelder. Alle Pflichtangaben nach § 15 VersVermV bleiben, die Prüfung in
   `saveErstinfo` ist unverändert, bestätigt wird weiter hier.
4. **Service-Mails:** fragen ohnehin nur fehlende Angaben ab; durch Schritt 1 fehlt dort in der Regel nichts mehr.
5. **Meta freigeben** (nur Pakete mit Kampagne): vor der Anleitung ein Kasten „Vorher kurz prüfen“ im selben Muster wie
   bei WhatsApp: zweistufige Authentifizierung an, zweiter Admin bestätigt die Freigabe. Je ein Satz, was zu tun ist.

## Was wegfällt

- Doppelte Fragen nach Name, Anrede, Telefon, Anschrift, Registernummer (Erstinformation) und Webex-Link (Kalender).
- Für Allianz-Vertreter der Weg über Google, Outlook und ICS als Erstes (drei Sackgassen), der Kasten
  „Andere Quelle für freie Zeiten“ als Hauptweg und der Knopf „Kalender-Link (ICS) nutzen“ nach einer Sperre.
- Der lange Erklärabsatz der Erstinformation (drei Sätze, jetzt einer).

## Prüffrage „Warum ist das noch schwer zu verstehen?“ (Runden mit Screenshots, lokaler Testkunde Allianz)

Gefunden und behoben:
1. Webex-Feld war `type="url"`: „allianz.webex.com/…“ ohne https ließ den Browser das Speichern still blockieren
   (auch im bestehenden Feld im Kalender). Jetzt Text mit URL-Tastatur, https ergänzt der Server.
2. Zwei blaue Hauptknöpfe im Kalender-Schritt („Verbinden“ und „Zeiten speichern“): Solange der Allianz-Kalender nicht
   verbunden ist, ist „Zeiten speichern“ zweitrangig.
3. Aufklapper in einem Schritt zeigten den Pfeil falsch herum und versteckten die Standardwerte (Tailwind-`group` des
   Schritts griff durch). Eigene Gruppen.
4. Reihenfolge Schritt 1: Anschrift direkt unter dem Namen (wie auf einer Visitenkarte), Telefon und Registernummer
   nebeneinander.
5. Erstinformation: Hinweis „aus Ihrem Impressum vorausgefüllt“ entfällt, wenn die Angaben aus Schritt 1 kommen.
6. „Mein Versicherer erlaubt das nicht“ im Kalender entfällt für Allianz-Vertreter (die Vertreternummer klappt immer).
7. Webex-Hinweis sagte bei Allianz „Leer lassen, dann Meet bzw. Teams“; jetzt „Bitte eintragen“, weil der App-Kalender
   keinen eigenen Raum hat.

## SUS (geschätzt, Persona Allianz-Vertreter am Handy)

Vorher rund 70 (drei Sackgassen im Kalender, fünf Angaben doppelt). Nachher 91: eine Sache je Abschnitt, Bekanntes nur
angezeigt, Seltenes eingeklappt, Standardwerte sichtbar. Rest-Abzug: Die Erstinformation bleibt der längste Schritt
(Pflichtangaben), und die Einwilligung zum Abruf ist ein zusätzlicher Haken.

Screenshots: `docs/ux/screens/onboarding-allianz-*.png` (Desktop 1280 px und Handy 390 px, 2fach).
