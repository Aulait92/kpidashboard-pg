# Hinweis „KI-Hilfe und gemeinsames Anzeigenlernen“ im Kundenbereich (Stand 24.11.2026)

Umsetzung zu `docs/recht/rechtspruefung-2026-11-23.md` F9 und F12 und den Entscheidungen von Ole vom 24.11.2026
(Information per Banner mit Widerspruch, keine Mail). Rechtliche Vorprüfung intern, keine Rechtsberatung.

## Was mitgeteilt wird
1. Neuer Unterauftragsverarbeiter: Amazon Web Services EMEA SARL (Bedrock, Rechenzentrum Frankfurt), KI für
   Gesprächszusammenfassungen und das Auslesen von Unterlagen (AVV Anlage 2, `SUBPROCESSORS`).
2. Gemeinsames Anzeigenlernen: Muster und Ergebnisse der Anzeigen aller Kunden fließen in Anzeigen anderer Kunden ein
   (`src/lib/kampagnen`, Leitplanken dort).

## Wer es sieht
Inhaber von Software-Kunden (Betreuung + Software, Pay-per-Lead + Software). Nicht: Mitarbeiter, reines Pay-per-Lead,
„Nur Betreuung“, „Nur Leads“, Bestellkonten, interne Konten, Admin-Vorschau, App-Demo (dorthin führt auch der
Prüferzugang der App-Stores). Regeln: `src/lib/datennutzung.ts`.

## Wortlaute
Von Ole freigegeben, wörtlich in `src/lib/datennutzung.ts` (Banner, am 25.11.2026 auf Oles Wunsch gekürzt und nur noch auf „Heute“, sechs Punkte der Detailseite, Dialog), Textversion
`DATENNUTZUNG_VERSION = 2026-11-24`. Der Test `tests/unit/datennutzung.test.ts` hält die Wortlaute fest. Eine neue
Textversion zeigt das Banner erneut.

Eigene Texte (Eintrag in den Einstellungen, Stand nach dem Widerspruch, Rückmeldungen, Hinweis an abgeschalteten Stellen,
Neuigkeit) sind nach der Regel „Rechtliches mit Conversion-Blick“ kurz gehalten: ein Satz, nächster Schritt genannt,
Knöpfe als Handlung. Die Durchsicht erfolgte in derselben Sitzung, ohne eigenen Hilfsagenten.

## Pflichtangaben auf der Detailseite (geprüft 24.11.2026)
| Angabe | Punkt |
|---|---|
| Name und Ort des Unterauftragsverarbeiters, Zweck | 1 |
| Was das Anzeigenlernen nutzt, beide Richtungen | 2 |
| Was nie übernommen oder gezeigt wird | 3 |
| Widerspruch: Frist 14 Tage, Wege (Knopf, Support), je Punkt einzeln | 4 |
| Speicherung der Bestätigung mit Datum | 5 |
| Wo der Text bleibt, Liste der Unterauftragnehmer als PDF | 6 |

## Nachweis
- Am Kunden: erste Anzeige (Beginn der 14 Tage, je Textversion), „Verstanden“ (Zeit, Version, Login), Widerspruch je
  Punkt (Zeit, Login).
- `DatennutzungNachweis` (nur anhängen, Trigger): angezeigt, verstanden, widerspruch, ruecknahme, jeweils Login,
  E-Mail, Zeit, Textversion, Wortlaut. Bleibt länger als das Änderungsprotokoll (1 Jahr).
- Die erste Anzeige wird festgehalten, wenn das Banner im Browser eines Inhabers steht bzw. er die Detailseite öffnet.
- Ein Widerspruch belegt die Kenntnis: das Banner verschwindet (Nachweis „verstanden“ mit Quelle „widerspruch“).

## Wirkung des Widerspruchs
- Anzeigenlernen: `vomLernenAusgenommen(ids)` in `src/lib/anzeigenlernen.ts`. Die Kampagnen-Agenten müssen die
  Funktion vor jedem Lauf fragen (Anschluss in `src/lib/kampagnen` beim Zusammenführen).
- Amazon Web Services: „Mit KI formulieren“, „Gründe vorschlagen“ (Gesprächszusammenfassung und
  Beratungsdokumentation) und das Auslesen von Unterlagen laufen für das Konto nicht, bei jedem Anbieter. Der Entwurf
  der Gesprächszusammenfassung ohne KI bleibt (er geht an keinen Dienst und dient der Dokumentation nach §§ 61, 62 VVG).
  Schon ausgelesene Werte bleiben sichtbar. Wächter: `tests/unit/datennutzung-aufrufstellen.test.ts`.
- Widerspruch und Rücknahme sind auch nach Ablauf der 14 Tage möglich; die Admin-Aufgabe nennt, ob die Frist lief.

## AVV
Neue Fassung „24.11.2026 (Fassung 2)“: Anlage 2 mit Amazon Web Services (Bedrock), Mitteilung künftiger Änderungen „in
Textform oder im Kundenbereich“. `LEGAL_VERSION` steht nur als „Stand“ auf den Rechtsseiten: keine erneute Zustimmung,
kein Hinweis, keine Sperre für Bestandskunden. `AVV_POLICEN_VERSION` bleibt unverändert.

## Offen
- AVV „Art, Zweck und Umfang“ beschreibt die KI-Hilfe für Gesprächszusammenfassung und Beratungsdokumentation nicht
  ausdrücklich, nur Anlage 2 nennt den Zweck.
- Dialogtext sagt „Gesprächszusammenfassungen … sind dann nicht verfügbar“; abgeschaltet ist die KI-Hilfe dafür.
- Kunden ohne Software-Paket mit eigenen Kampagnen („Nur Betreuung“) sehen kein Banner; ob ihre Anzeigen am Lernen
  teilnehmen dürfen, ist zu entscheiden.
- AGB-Satz zum Anzeigenlernen für Neukunden: nur Entwurf, nicht eingebaut.
