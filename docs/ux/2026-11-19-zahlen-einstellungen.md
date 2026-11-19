# Zahlen und Einstellungen: UX-Runde Team D (19.11.2026)

Bereich: /buyer/wachstum (= /buyer/zahlen), /buyer/einstellungen mit Unterseiten (assistent, assistent/ablauf, branding,
erinnerungen, meta), /buyer/konto, /buyer/konto/sicherheit (+ zwei-faktor), /buyer/team. Ausgeblendete Module (/bestand,
/empfehlungen) nicht angefasst. Screenshots (Desktop 1440, Handy 390, lokale Testdaten „Agentur Hofmann“ mit Paket und Team,
„Max Berger“ Pay-per-Lead, leeres Konto) lagen im Arbeitsordner der Sitzung (ux-runde/d-zahlen/vorher, nachher), nicht im Repo.

Personas: (1) Einzelkämpfer 50+, Handy zwischen Terminen, (2) Makler am Desktop, will Zahlen und Kontrolle, (3) Agentur mit
2 Beratern und Assistenz, verteilt Leads.

## Konto & Rechnungen
**Warum schwer?**
- Erster Blick: Die Frage „Was zahle ich?“ steckt in 12 gleich aussehenden Zeilen („Monatlich“, „Zahlweise“, „Monatlich gesamt“
  verteilt). Am Handy bricht jede Zeile zweimal um (Spalte 150 px).
- Falscher Weg: „Pause / Urlaub: Jederzeit selbst einstellbar (siehe unten)“, die Pause steht aber seit 15.11. unter Wachstum.
- Dichte: 7 Karten; „Zahlung und Rechnungsdaten“ und „Rechnungen“ getrennt, ohne Stripe beide nur mit je einem Satz.
- Thema fremd: „Neue Leads per E-Mail“ (Benachrichtigung) mitten zwischen Vertrag und Geld.
- „Weitere Verkäufer“ wiederholt „2 aktive Verkäufer sind inklusive“ aus dem Vertrag.

**Geändert**
- Oben im Vertrag die eine Antwort: „Sie zahlen 2.500,00 € netto im Monat“ (bei Vorauszahlung der Jahres- bzw. 6-Monats-Betrag),
  darunter Rhythmus und Weg („Monatlich, per Rechnung, zzgl. USt.“). „Monatlich gesamt“ und „Zahlweise“ entfallen als Zeilen,
  bei Vorauszahlung bleibt der Monatspreis als Zeile.
- „Pause / Urlaub“ verlinkt auf **Wachstum → Pause**.
- „Rechnungen und Zahlung“ in einer Karte, Rechnungen zuerst; ohne Online-Zahlung ein Satz („kommen per E-Mail, Sie zahlen per
  Überweisung“ plus Weg für neue Rechnungsadresse).
- „Neue Leads per E-Mail“ zieht nach Einstellungen → Erinnerungen & Aufgaben (Abschnitt „Neue Leads“, nur Inhaber).
- Zusatzmodul „Weitere Verkäufer“ ohne Wiederholung; Abstände der Karten „Ihr Vertrag“ und „Ihre Daten“ korrigiert.
- Kündigen („Vertrag hier kündigen“), Datenexport und Aufbewahrungshinweis unverändert sichtbar (Pflicht).

**KPI**: Bindung/Abrechnung verständlich (weniger Rückfragen zu Betrag und Zahlweise), Selbstständigkeit (Pause-Link statt Suche).
**SUS** 74 → 90.

## Einstellungen (Übersicht)
**Warum schwer?** Gruppe „Arbeiten“ mit 7 Zeilen in zufälliger Reihenfolge (Meta vor Assistent), „Mehr“ (Kollegen empfehlen)
stand zwischen den Einstellungen und den Schaltern Beratung/Datenschutz.
**Geändert**: zwei Gruppen nach Aufgabe, Häufiges zuerst: **Kunden ansprechen** (Assistent, Erinnerungen & Aufgaben, E-Mail-Postfach)
und **Termine und Zahlen** (Mein Kalender, Präsentation, Meine Provisionen, Rückmeldung an Meta); „Mehr“ ganz unten. Zeile als
kleine Komponente statt doppeltem Markup.
**KPI**: Selbstständigkeit (Einstellung schneller gefunden). **SUS** 82 → 91.

## Erinnerungen & Aufgaben
**Warum schwer?** Drei verschiedene Bedienelemente auf einer Seite (grüner Schalter mit Symbol, das wie ein Link wirkte, blaue
Schalter, Kästchen), Beschreibungen mit 2 bis 3 Sätzen, „Neue Leads per E-Mail“ fehlte hier.
**Geändert**: überall derselbe Schalter rechts (Markenfarbe), Titel plus ein Satz, Abschnitt **Neue Leads** mit „Neue Leads per
E-Mail“ (vom Konto hierher). Kachel-Text in den Einstellungen nennt die E-Mail bei neuen Leads.
**KPI**: Selbstständigkeit, Reaktionszeit auf neue Leads (E-Mail-Benachrichtigung leichter zu finden). **SUS** 78 → 92.

## Rückmeldung an Meta
**Warum schwer?** 6 Karten, davon zwei mit 30/90-Tage-Statistik und Empfehlung zu „Conversion Leads“ (Werbe-Fachsprache); der
Status stand erst an dritter Stelle; Kästchen statt Schalter.
**Geändert**: Schalter und Status in einer Karte oben; **Was genau an Meta geht** und **Auswertung und Empfehlung** (30 und 90 Tage)
aufklappbar, Inhalt unverändert (Transparenz bleibt einen Klick entfernt, keine Pflichtangabe entfernt).
**KPI**: Selbstständigkeit (weniger „Was ist das?“-Fragen). **SUS** 66 → 90.

## Assistent
**Warum schwer?** Die WhatsApp-Vorlagen standen ganz unten unter dem langen E-Mail-Abschnitt; zwei einzelne Link-Karten mit je
eigener Überschrift; die offene Entscheidung „Mails in meinem Namen senden“ (Hauptaktion) stand unter den selten geänderten
Terminarten.
**Geändert**: oben eine Liste **Nachrichten** mit „So arbeitet Ihr Assistent“ und „WhatsApp-Vorlagen“ (wie in den Einstellungen),
danach **E-Mails in Ihrem Namen**, dann Termine und Maklervollmacht.
**KPI**: Selbstständigkeit, Nutzung (Vorlagen gefunden, Mails freigegeben). **SUS** 72 → 90.

## Team
**Warum schwer?** Gut nutzbar; Einladen-Hinweis wiederholte „Mitglieder ohne Leads sind kostenlos“ aus dem Platz-Hinweis direkt darüber.
**Geändert**: Hinweis bei „Bekommt Leads“ auf einen kurzen Satz.
**KPI**: Team-Nutzung. **SUS** 88 → 90.

## Wachstum (Zahlen)
**Warum schwer?** Hero „Rechnet sich das?“ (Gewinn zuerst, Aus 1 € werden …) ist seit 18.11. stark. Schwach war „Team im Zeitraum“:
am Handy eine Tabelle mit 9 bis 10 Spalten zum Wischen, die Agentur sieht nicht auf einen Blick, wer wie viel bringt; dazu doppelter
Abstand über der Karte.
**Geändert**: am Handy eine Zeile je Person: Name, Provision (bei „Inkl. Bestand“ mit künftigem Bestand), „x Leads · y Termine ·
z Abschlüsse (Quote)“, rote Zeile nur bei offenen Leads ohne nächsten Schritt; am Rechner bleibt die Tabelle.
**KPI**: Team-Nutzung, Bindung (Agentur sieht den Wert je Berater). **SUS** Seite 86 → 90 (Team-Karte am Handy 55 → 88).

## Unverändert geprüft
Anmeldung & Sicherheit, Zwei-Faktor-Login, Präsentation (Branding), Ablauf: klare Aufgabe je Karte, keine Änderung nötig
(SUS je etwa 88 bis 90).

## Offen für Ole
- Konto: nächste Rechnung (Datum, Betrag) direkt unter „Sie zahlen“ anzeigen, sobald Stripe-Rechnungen für alle laufen.
- Assistent: Terminarten-Text (components/termin-formate) hat 3 Sätze, wird auch in der Einrichtung genutzt; kürzen gemeinsam entscheiden.
- Team: „Team im Zeitraum“ zusätzlich auf der Team-Seite (Agentur-Persona sucht es dort), oder Link dorthin.
