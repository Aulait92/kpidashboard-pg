# Buchungsseite nach dem Leadformular: nur Handynummer (interne Einschätzung, 22.11.2026)

Ergebnis: **Grün mit Auflagen** (eingehalten). Interne Prüfung, keine Anwaltsfreigabe (Ole, 18.11.2026).
Technik: `src/lib/buchung-formular.ts`, `src/app/book/[slug]/actions.ts`, Tests `tests/unit/buchung-formular.test.ts`.

## Zweck
Der Lead hat gerade beim Vermittler (Verantwortlicher) eine Beratung angefragt und tippt auf der Dankeseite auf
„Jetzt Termin buchen“. Damit er Name und E-Mail nicht noch einmal eingeben muss, nimmt die Buchung diese Angaben aus
seiner eigenen Anfrage. Rechtsgrundlage wie bisher Art. 6 Abs. 1 lit. b DSGVO (Durchführung der vom Lead gewünschten
Terminvereinbarung). Keine neuen Daten, kein neuer Zweck, kein Empfänger außer dem Vermittler.

## Ablauf und verwendete Daten
- Erkennung über den Marker `von=formular` im Link der Dankeseite (neue Formulare; ältere Formulare ohne Marker zeigen die
  Seite wie bisher). Optional `dk` (Fassung der Dankeseite) nur als Kennung im internen Buchungsvermerk.
- Eingabe: Uhrzeit, Gesprächsart, Handynummer. Abgleich nur mit Leads **desselben Vermittlers** (Kurzname der Seite),
  gleiche Nummer (normalisiert), Anfrage oder erneute Eintragung **höchstens 2 Stunden** alt, nicht gelöscht.
- Treffer: Termin mit Name und E-Mail aus der Anfrage, am bestehenden Lead (kein zweiter Lead), bookedVia wie bisher.
- Kein Treffer: Die Seite fragt Name und E-Mail wie bisher ab. Die eingetippte Nummer wird dafür nur verschlüsselt
  (AES-GCM, 1 Stunde gültig) in der Adresse mitgegeben, nie im Klartext.
- Andere Nummer als im Formular, aber gleiche E-Mail einer frischen Anfrage (gleiche Grenzen): Termin am bestehenden
  Lead. Die Formular-Nummer wird nicht überschrieben; die neue Nummer steht nur als Vermerk im Verlauf des Leads. Hat
  der Lead schon einen WhatsApp-Chat mit der Formular-Nummer, läuft der Termin dort (Bestätigung, Assistent), damit der
  Assistent keine weiteren Termine vorschlägt; sonst über die neue Nummer.

## Keine Anzeige von Daten
Der Besucher sieht weder Name noch E-Mail noch andere Angaben des Leads. Bestätigung nur allgemein („Ihr Termin ist
gebucht“, „Die Einladung geht an die E-Mail-Adresse aus Ihrer Anfrage“). Ob eine Nummer passt, ist nur daran erkennbar,
dass Name und E-Mail nicht abgefragt werden (vertretbar, siehe Risiken).

## Einwilligung und Pflichtangaben
Unverändert: Einwilligungs-Häkchen bzw. Datenschutzhinweis am Knopf (Splittest buchungsseite_kompakt) mit gleichem
Wortlaut und Link auf die Datenschutzhinweise des Vermittlers; Erinnerungs-Häkchen (Policen, A8) unverändert, nicht
vorausgewählt; Impressum/Datenschutz im Fuß.

## Risiken und Maßnahmen
| Risiko | Maßnahme | Rest |
|---|---|---|
| Dritter tippt eine fremde Nummer und bucht im Namen des Leads | nur frische Anfragen (2 h) desselben Vermittlers; Drosselung je IP (6 Abgleiche / 10 Min.) plus bestehende Grenzen (20 Buchungen je IP, 10 je Vermittler in 10 Min.); Lead erhält Einladung und WhatsApp-Bestätigung und kann absagen | gering |
| Rückschluss „Nummer hat gerade angefragt“ | keine Daten angezeigt, nur Felder entfallen; Zeitfenster und Drosselung begrenzen Ausprobieren | gering, vertretbar |
| Gleiches über die E-Mail (abweichende Nummer) | gleiche Grenzen, keine Anzeige, neue Nummer nur im Verlauf | gering |
| Nummer in Server-Logs über die Adresse | nur verschlüsselt, 1 h gültig | sehr gering |
| Bestehend (nicht neu): Bestätigungsseite kann die Komplettcheck-Frage leicht an die Anfrage anpassen (Familie, Beispielsparten) und bei schon gebuchtem Lead den bestehenden Termin zeigen | wie bisher bei jeder Buchung über die Nummer; optional später neutralisieren | gering |

## Auflagen
1. Keine Lead-Daten auf der Seite oder in der Adresse anzeigen (Test prüft das).
2. Zeitfenster nicht über 2 Stunden ausweiten ohne neue Prüfung.
3. Datenschutzhinweise des Vermittlers decken die Terminvereinbarung bereits ab; keine Änderung nötig.
