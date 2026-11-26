# Allianz Onlinerechner: Tierkrankenversicherung

**Stand:** 26.11.2026
**URL:** https://www.allianz.de/gesundheit/tierkrankenversicherung/rechner/
**Technik:** Allianz Privatschutz App (Angular, `privatschutz-prod.allianz.de`).
**Testwerte (erfunden):** PLZ 10115, Hund männlich, Tiername "Bello", Tier-Geburtsdatum 01.01.2022, Rasse Labrador, keine Vorerkrankungen.
**Erreicht:** Schritt 1 und 2 vollständig. Schritt 3 (Antrag) nicht betreten.

Ablauf: 1 Daten eingeben, 2 Angebot erhalten, 3 Antrag stellen.

## Schritt 1: Daten eingeben

Satzformular "Ich wohne in [PLZ]. [Mein Hund] ist [männlich] und heißt [Name]."

| Nr | Feld / Frage | Typ | Optionen | Pflicht | Abhängigkeiten, Hinweise |
|---|---|---|---|---|---|
| 1 | PLZ | Text | | ja | |
| 2 | Tierart | Auswahl | Mein Hund; Meine Katze; Mein Pferd | ja (vorbelegt Hund) | steuert 6 und 7 |
| 3 | Geschlecht | Auswahl | männlich; weiblich | ja (vorbelegt) | |
| 4 | Tiername | Text | | ja ("Bitte geben Sie den Namen Ihres Tieres an.") | |
| 5 | Wann wurde Ihr Tier geboren? | Datum | | ja | Tier mit Geburtsjahr 2005 wurde im Rechner nicht abgelehnt |
| 6 | Rasse, **Hund**: Welche Hunderasse hat Ihr Tier? | Auswahl (Radio) | Rasse auswählen; Mischling; Rasse unbekannt | ja | siehe 6a bis 6c |
| 6a | Hunderasse | Auswahl | 405 Einträge | ja bei "Rasse auswählen" | |
| 6b | Welche Hunderasse hat die Mutter von Ihrem Tier? | Auswahl (Radio) plus Liste | Rasse auswählen (Liste 405); Die Rasse ist unbekannt / Die Mutter ist auch ein Mischling | ja bei "Mischling" | |
| 6c | Wie groß ist Ihr Tier im ausgewachsenen Zustand (Schulterhöhe)? | Auswahl (Radio) | 0 bis 44 cm; 45 bis 120 cm | ja bei "Rasse unbekannt" | |
| 6d | Rasse, **Katze**: Welche Katzenrasse hat Ihr Tier? | Auswahl | 158 Einträge | ja bei Katze | |
| 6e | Wie wird Ihre Katze gehalten? | Auswahl (Radio) | ausschließlich in der Wohnung; Freigänger | ja bei Katze | |
| 6f | Rasse, **Pferd**: Welche Pferderasse hat Ihr Tier? | Auswahl | 93 Einträge | ja bei Pferd | |
| 7 | Hat oder hatte Ihr Tier in den letzten 24 Monaten: Krankheiten, Fehlentwicklungen, Symptome, Diagnosen oder Befunde, die noch keine Behandlung erfordern, Unfallfolgen, Beeinträchtigungen, Verhaltensauffälligkeiten? | Ja/Nein | | ja | Ja öffnet 7a |
| 7a | Bitte wählen Sie aus, welche Bereiche hiervon betroffen sind bzw. waren | Mehrfachauswahl | Augen; Ohren; Maulhöhle und Zähne; Bewegungsapparat; Haut und Fell; Atmungsorgane; Herz-Kreislauf-System; Leber; Verdauungsorgane; Geschlechtsorgane; Hormondrüsen; Harnorgane; Infektionskrankheiten; Nervensystem; Verhaltensauffälligkeiten; Sonstiges | ja bei Ja | kein Abbruch, Beitrag steigt (Test Basis: 11,58 € ohne, 18,52 € mit Augen und Sonstiges) |
| 8 | Was ist Ihnen bei der Tarifauswahl am wichtigsten? | Auswahl (Radio) | Basis-Schutz; Günstiger Preis; Bestes Preis-Leistungs-Verhältnis | ja | |

## Schritt 2: Angebot erhalten

| Feld | Typ | Optionen | Vorbelegung |
|---|---|---|---|
| Selbstbeteiligung | Auswahl | keine; 10 % (max. 500 €); 20 % (max. 1.000 €) | 20 % (max. 1.000 €) |
| Zahlungsperiode | Auswahl | monatlich, vierteljährlich, halbjährlich, jährlich | monatlich |
| Welche Tierkrankenversicherung möchten Sie abschließen? | Auswahl (Radio) | OP-Schutz; Vollschutz | |
| Produktlinie | Auswahl (Karten) | Basis, Smart, Komfort | Komfort. Premium nur über Beratung (u. a. unbegrenzte Jahreshöchstleistung) |

Beispielbeiträge (Testfall, monatlich, SB 20 %): Basis 11,58 €, Smart 24,88 €, Komfort 42,95 €.

| Leistung | Basis | Smart | Komfort |
|---|---|---|---|
| Jahreshöchstleistung | 2.500 € | 5.000 € | 10.000 € |
| Erstattung nach GOT | 2-fach | 4-fach (im Notfall) | 4-fach (im Notfall) |
| Nachbehandlung nach OP | bis 20 Tage | bis 20 Tage | bis 30 Tage |
| Basisvorsorge | | bis 50 € | bis 100 € |
| Physiotherapie | | bis 150 € | bis 500 € |
| Zahnbehandlungen / Maulhöhle | | bis 1.000 € | bis 2.500 € |
| Chirurgische Kastration/Sterilisation | | bis 300 € | bis 1.000 € |

Keine Zusatzbausteine. Wartezeiten: keine für Jungtiere unter 6 Monaten, bei Unfall und Basisvorsorge; 3 Monate bei Krankheit sowie Kastration/Sterilisation.

## Abgleich mit unserer Liste

| Unser Punkt | Fragt die Allianz? | Anmerkung |
|---|---|---|
| Geburtsdatum | nein (Halter) | nur Geburtsdatum des Tieres |
| Familienstand / Mitversicherte | nein | |
| Beruf / Status | nein | |
| Aktueller Versicherer und Ablauf | nein | |
| Vorschäden 5 Jahre | anders | Gesundheitsfrage zum Tier, Rückblick 24 Monate, mit Organbereichen |
| Selbstbeteiligung | ja | prozentual: keine, 10 %, 20 % |

**Fragt die Allianz zusätzlich:** Tierart, Geschlecht, Name, Tier-Geburtsdatum, Rasse bzw. Mischling (Mutterrasse) oder Schulterhöhe, Katzenhaltung, OP-Schutz oder Vollschutz.

Screenshot: `tierkranken-angebot.png`
