# Pilot „Beiträge automatisch rechnen“ (Allianz), Machbarkeit

Stand: 16.11.2026, geprüft von 07:50 bis 08:15 UTC. Abrufe aus dem Container mit curl, ehrlicher User-Agent
`PerformanceGrowth-Terminvorbereitung/1.0 (+https://performancegrowth.de)`, je Endpunkt höchstens ein Abruf,
keine Lead-Daten übertragen, keine Preisberechnung ausgelöst.

## Ergebnis in einem Satz

**Für keine Sparte wird eine automatische Abfrage gebaut.** Die Nutzungsbedingungen von allianz.de verbieten das
systematische Auslesen, das Speichern und die gewerbliche Verwendung von Preisen und Tarifen ausdrücklich, auch
„mit technischen Mitteln“ und durch „Robots oder ähnliche Datensammel- und Extraktionsprogramme“. Das trifft genau
den geplanten Adapter (Abfrage, 24-h-Cache, Nutzung im Vertrieb). Dazu kommt technischer Schutz an den Rechner-Schnittstellen.
Gebaut wird deshalb die Rückfall-Variante (Rechner öffnen, Angaben kopieren, Ergebnis über „Angebot ablegen“ einlesen),
hinter einem Admin-Schalter je Gesellschaft und Sparte, Standard aus.

## Nutzungsbedingungen (gilt für alle Sparten)

Quelle: https://www.allianz.de/nutzungsbedingungen/ (Abruf 16.11.2026), Abschnitt „Urheberrechte“:

> Dies gilt besonders für die auf den Allianz Webseiten zugänglichen bzw. abrufbaren Daten, Preise und Tarife. Das
> systematische Auslesen dieser Daten, sei es manuell oder mit technischen Mitteln, die Speicherung von Tarif- und
> Preisdaten sowie die Verwendung ermittelter Daten, Preise oder Tarife zu gewerblichen Zwecken ist nicht gestattet.
> Data Mining, Robots oder ähnliche Datensammel- und Extraktionsprogramme dürfen nicht eingesetzt werden, um
> Informationen oder Daten der Allianz Webseiten zur Wiederverwendung zu extrahieren.

Die Rechner sind in die Seiten von allianz.de eingebettet (Rechner-Seiten unter `www.allianz.de/.../rechner/`), ihre
Schnittstellen liegen auf Allianz-Servern (`privatschutz-prod.allianz.de`, `live.inno.kxlabs.allianz.de`). Sie zählen
damit zu den „Allianz Webseiten“. Laut Bedingungen ist eine Nutzung nur mit vorheriger schriftlicher Zustimmung erlaubt.

robots.txt von www.allianz.de sperrt die Rechner nicht (nur Newsletter, Login-Rückrufe, CSRF-Token). Die Rechner-App
für Unfall setzt `<meta name="robots" content="none">`. Ausschlaggebend ist das Verbot in den Nutzungsbedingungen.

## Je Sparte

| Sparte | Offizieller Rechner | Art der Abfrage (im Browser sichtbar) | Benötigte Angaben (laut Rechner) | Schutz | Entscheidung |
|---|---|---|---|---|---|
| Tierkranken Katze | https://www.allianz.de/gesundheit/tierkrankenversicherung/rechner/#tier=katze | Angular-App „ps20“ (`privatschutz-prod.allianz.de/privatschutz/frontend/endkunde/`), Tarifierung per `POST /privatschutz/api/taas/endkunde` | Tierart, Rasse (bzw. Mischling, Rasse der Mutter), Geburtsdatum des Tiers, Geschlecht, Versicherungsbeginn | ja: Kopfzeilen (Rolle, Sparte, Einstiegsseite) werden im Browser mit einem eingebetteten RSA-Schlüssel verschlüsselt, XSRF-Cookie; ohne diese antwortet schon `GET /privatschutz/api/tierrassen` mit 403. Dazu das Verbot in den Nutzungsbedingungen | Rückfall-Variante |
| OP Katze | wie Tierkranken Katze (gleicher Rechner, Tarifwahl OP) | wie oben | wie oben | wie oben | Rückfall-Variante |
| Tierkranken Hund | https://www.allianz.de/gesundheit/tierkrankenversicherung/rechner/#tier=hund | wie oben | wie oben, Hunderasse | wie oben | Rückfall-Variante |
| OP Hund | wie Tierkranken Hund | wie oben | wie oben | wie oben | Rückfall-Variante |
| Privathaftpflicht | https://www.allianz.de/recht-und-eigentum/privat-haftpflichtversicherung/rechner/ | gleiche App „ps20“ (`app: ph`), gleiche Tarifierung `taas/endkunde` | Geburtsdatum, Familienstand (Single, Paar, Familie), PLZ, öffentlicher Dienst | wie Tierkranken (verschlüsselte Kopfzeilen, 403) und Verbot | Rückfall-Variante |
| Hausrat | https://www.allianz.de/recht-und-eigentum/hausratversicherung/rechner/ | „ps20“ (`app: vhv_v2`), `taas/endkunde`, Adressprüfung über `adressverzeichnis` | PLZ bzw. Adresse, Wohnfläche, Geburtsdatum, Selbstbeteiligung | wie oben | Rückfall-Variante |
| Rechtsschutz | https://www.allianz.de/recht-und-eigentum/rechtsschutzversicherung/rechner/ | „ps20“ (`app: rs`), `taas/endkunde` | Geburtsdatum, Familienstand, Lebensbereiche (Privat, Beruf, Verkehr, Wohnen), Berufsgruppe | wie oben | Rückfall-Variante |
| Wohngebäude | https://www.allianz.de/recht-und-eigentum/wohngebaeudeversicherung/rechner/ | „ps20“ (`app: vwg`), `taas/endkunde`, Adressprüfung | Adresse, Wohnfläche, Baujahr, Wohneinheiten, Keller, Bauweise | wie oben | Rückfall-Variante |
| Unfall | https://www.allianz.de/vorsorge/unfallversicherung/rechner/ | eigene App (`live.inno.kxlabs.allianz.de`), Camunda-Prozess „unfallversicherung-1.19.5“ mit Anmeldung je Vorgang (`/auth/login`), Schritte „Daten eingeben“ → „Angebot erhalten“ | Geburtsdatum, Beruf (Gefahrengruppe), gewünschte Summen | technisch: Ratenbegrenzung (120 je Minute), jede Berechnung startet einen Vorgang im Allianz-Prozess, `robots: none`. Rechtlich: Verbot in den Nutzungsbedingungen | Rückfall-Variante |
| Hundehalterhaftpflicht | https://www.allianz.de/recht-und-eigentum/tierhalterhaftpflicht/rechner/#tier=hund | eigene App (`inno-prod.allianz.de/inno-launcher`) | Hunderasse, Anzahl der Hunde, PLZ | Verbot in den Nutzungsbedingungen (nicht weiter technisch geprüft) | Rückfall-Variante |
| Pferdehalterhaftpflicht | https://www.allianz.de/recht-und-eigentum/tierhalterhaftpflicht/rechner/#tier=pferd | wie Hund | Anzahl der Pferde, Rasse, Nutzung | wie Hund | Rückfall-Variante |

Nicht versucht (bewusst): verschlüsselte Kopfzeilen nachbauen, Browser-Kennung oder Herkunft (`Origin`, `Referer`)
vortäuschen, Headless-Browser, eine Berechnung mit Testdaten auslösen.

## Was stattdessen gebaut ist (Rückfall-Variante)

- In der Terminvorbereitung oben in der Versicherung: Knopf **„Beiträge rechnen“**, nur wenn die Sparte Allianz-Tarife
  hat und der Schalter für Allianz und diese Sparte an ist.
- Er öffnet ein Fenster mit dem Hauptknopf **„In Ihrem Allianz-System berechnen“** (Entscheidung Ole, 16.11.2026,
  siehe unten), darunter die Angaben aus Lead und Formular zum Antippen und Kopieren (nur Rechner-Angaben: keine Namen,
  Telefonnummern, E-Mail, keine Gesundheitsangaben zu Menschen), fehlende Angaben als „im Termin klären“. Der
  öffentliche Rechner auf allianz.de steht nur noch als Textlink „Öffentlichen Allianz-Rechner öffnen“ darunter.
- Darunter der Weg zurück: Ergebnis als Screenshot über **„Angebot ablegen“** einlesen. Beiträge, die so gelesen
  werden, stehen als Richtwert im Feld („Aus dem Angebot gelesen, bitte prüfen“). Der Vermittler bestätigt mit einem Tipp;
  solange nicht bestätigt ist, zeigt „Präsentation öffnen“ einen kurzen Hinweis.
- Admin: Einstellungen → Beiträge rechnen (Pilot), Schalter je Gesellschaft und Sparte, Standard aus, Änderungen im
  Änderungsprotokoll.

## Entscheidung Ole, 16.11.2026: Rechnen im Vertriebssystem des Vertreters

- Die automatische Abfrage bleibt aus; die Screenshot-Variante ist „erstmal gut genug“. Freigabe ab 16.11.2026, 18 Uhr.
- Der Hauptweg ist das **Vertriebssystem des Allianz-Vertreters**, nicht der öffentliche Rechner auf allianz.de.
  Hauptknopf im Fenster: **„In Ihrem Allianz-System berechnen“**, darunter ein Satz: „Rechnen Sie in Ihrem
  Allianz-Vertriebssystem und legen Sie das Ergebnis als Screenshot ab.“
- Für das Vertriebssystem ist keine Adresse hinterlegt (es gibt keine geprüfte, allgemein gültige). Der Knopf kopiert
  deshalb alle bekannten Angaben auf einmal (eine Zeile je Angabe), zum Einfügen im eigenen System. Liefert Ole eine
  feste Adresse, kann der Knopf sie zusätzlich öffnen.
- Der öffentliche Rechner bleibt als zweite, unauffällige Wahl: Textlink „Öffentlichen Allianz-Rechner öffnen“.
- Angaben zum Kopieren, „Screenshot ablegen“, Richtwert „bitte prüfen“ und der Knopf „Beiträge rechnen“ in der
  Terminvorbereitung bleiben wie gebaut.

## Sauberer Weg zur echten Automatik (für Ole)

1. **Schriftliche Zustimmung der Allianz** (die Bedingungen nennen sie ausdrücklich), am besten über den
   Vertriebsweg der Vermittler, oder
2. eine **freigegebene Schnittstelle** für Vermittler (z. B. Tarifierung über die Vermittler-Systeme der Allianz
   oder eine BiPRO-Tarifierung), die Allianz-Vertreter ohnehin nutzen dürfen.

Sobald eins davon vorliegt, kann je Sparte ein Adapter unter `src/lib/preise/allianz/<sparte>.ts` entstehen
(Zeitlimit, Cache nur mit Erlaubnis, Fehler → leer und Hinweis, Protokoll). Die Kennzeichnung „bitte prüfen“ und der
Hinweis vor der Präsentation sind schon da und gelten dann auch für diese Preise.
