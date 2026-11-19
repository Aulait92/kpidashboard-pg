# UX-Runde Kundenbereich: Leads und Nachrichten (Team B, 19.11.2026)

Bereich: Kontakte (Liste, Pipeline), Kontakt-Detail (auch Vollseite /buyer/leads/[id] und Modal), Nachrichten (Chats),
E-Mail-Postfach, WhatsApp-Vorlagen. Testdaten lokal (Agentur mit 13 Leads: neu vor Minuten, Chat wartet, Termin morgen,
Ergebnis fehlt, Wiedervorlage fällig, Angebot ohne Schritt, Abschluss, verloren, Berater-Lead, kein WhatsApp, Assistent im Gespräch).
Screenshots (1440 und 390, vorher/nachher) lagen im Arbeitsordner der Sitzung (`ux-runde/b-leads/`), nicht im Repo.

## Personas: „Wer wartet auf mich, und was mache ich als Nächstes?“

**Einzelkämpfer, 50+, Handy zwischen Terminen**
1. Kontakte: sieben Ansichten in einer Wischleiste („Rückruf nötig“, „Nur ohne W…“, „Ohne nächsten Schritt“), am Handy abgeschnitten. Welche ist für ihn?
2. Eine Anfrage von vor 4 Minuten steht als „eingegangen 19.11.2026“ da, genau wie eine von heute früh. Nichts sagt „jetzt anrufen“.
3. Frau Hoffmann hat im Chat geantwortet: in der Liste steht „Nächsten Schritt festlegen“, nicht „wartet auf Sie“.
4. Im Kontakt stehen als Erstes „Abschluss“ und „Verloren“, „Anrufen“ erst darunter. Danach zwei Banner übereinander: „Kein nächster Schritt“ (gelb) und „Wartet auf Sie“ (rot). Was gilt?
5. „Zuständig“ steht vor dem Gesprächsziel, obwohl er allein arbeitet und es nie ändert.

**Makler (Tierkranken/Privatschutz), Desktop, will Kontrolle**
1. Spalte „Lead-Kosten“ mit „0,00 €“ in jeder Zeile (eigene Leads).
2. Pipeline: in der Spalte „Termin vereinbart“ bricht „Jana Hoffmann“ Buchstabe für Buchstabe um (Abzeichen nehmen die Breite), leere Spalten sind so breit wie volle.
3. Warndreieck an Karten nur mit Tooltip: Bedeutung unklar.
4. Postfach: zwei lange Absätze mit 20 Platzhaltern vor den Vorlagen; der Schalter „E-Mail-Funktionen nutzen“ steht ganz oben.
5. WhatsApp-Vorlagen: „6 noch nicht freigegeben“ in Warnfarbe, obwohl alles normal in Prüfung ist und er nichts tun kann.

**Agentur, 2 Berater + Assistenz, verteilt Leads**
1. Will morgens eine Liste „was ist offen“, sortiert nach Dringlichkeit: gibt es nur als vier getrennte Ansichten.
2. „Zuständig“ ist für sie wichtig, darf aber im Kontakt unter dem Gesprächsziel stehen.

## Warum ist das schwer zu verstehen?
- **Aufgabe**: Die Liste beantwortet „wer wartet auf mich?“ nicht auf einen Blick (sieben Ansichten, Antwort im Chat unsichtbar).
- **Erster Blick**: Eingangsdatum statt Alter; frische Leads sehen aus wie alte (Reaktionszeit).
- **Hauptaktion**: im Kontakt am Handy zuerst Abschluss/Verloren statt Anrufen; Wartendes steht unter Zuständig und Karten.
- **Doppelt/widersprüchlich**: „Kein nächster Schritt“ neben „Wartet auf Sie“; im Ziel stand die Chat-Nachricht des Kunden als „Ihre Notiz“.
- **Begriffe**: „Nur ohne WhatsApp“, „Ohne nächsten Schritt“, Warndreieck ohne Text, „noch nicht freigegeben“.
- **Dichte**: Lead-Kosten 0,00 €, Platzhalter-Absätze, „Zeile anklicken für Details“.
- **Handy**: Ansichtsleiste abgeschnitten, Hinweis „Kein nächster Schritt“ dreizeilig.
- **Leere Zustände**: neue Ansicht „Zu erledigen“ braucht einen positiven leeren Zustand.

## Lösung (umgesetzt)
1. **Kontakte-Liste** (`buyer-leads-body.tsx`, `buyer-leads-table.tsx`, `lib/kontakt-liste.ts`):
   - Vier Ansichten: **Alle · Zu erledigen · Neu · Termin**. „Zu erledigen“ sammelt Antwort im Chat, frische Leads ohne Kontakt
     (außer der Assistent schreibt), Ergebnis fehlt, fällige Wiedervorlage, Rückruf, kein nächster Schritt; sortiert nach Dringlichkeit;
     Zähler rot, wenn etwas wartet; leerer Zustand „Alles erledigt, kein Kontakt wartet auf Sie.“
     Die bisherigen Ansichten (`rueckruf`, `ohne-whatsapp`, `wiedervorlage`, `ohne-schritt`) bleiben per Link nutzbar (Heute, Zahlen, Erinnerung) und erscheinen nur, solange sie offen sind.
   - Eingang als **„vor 4 Min.“ / „vor 3 Std.“ / „gestern“ / „10.11.“**, rot solange ein frischer Lead unberührt ist.
   - „Nächster Schritt“ immer mit Inhalt: **Antwort wartet** (rot), Termin, Wiedervorlage, Rückruf nötig, **Assistent schreibt**, **Noch kein Kontakt**, sonst „Festlegen“ bzw. „Ergebnis eintragen“.
   - Spalte „Lead-Kosten“ nur, wenn es Kosten gibt; Hinweis „Zeile anklicken für Details“ weg.
2. **Kontakt** (`lead-detail-body.tsx`, `lead-actions.tsx`): „eingegangen vor 4 Min.“; am Handy Abschluss/Verloren unter den Aktionen (Anrufen zuerst);
   direkt darunter, was wartet (Antwort im Chat, kein WhatsApp, Einwilligungshinweis, Storno); dann Termin, nächster Schritt, Gesprächsziel;
   Zuständig, Maklervollmacht, Empfehlung unter „Nächste Nachrichten“. „Kein nächster Schritt“ entfällt, wenn der Kontakt im Chat wartet;
   das Anliegen aus dem Chat steht nicht mehr als „Ihre Notiz“ im Ziel. Hinweis am Handy einzeilig.
3. **Pipeline** (`kanban-board.tsx`): Name über volle Breite, darunter „Ergebnis fehlt“ / „Nächster Schritt fehlt“ als Text, leere Spalten schmal, Eingang relativ.
4. **E-Mail-Postfach**: Seite beginnt mit „Ihr Postfach“; Platzhalter hinter „Platzhalter für eigene Vorlagen“; Signatur-Hinweis ein Satz; Schalter „E-Mail-Funktionen nutzen“ ans Ende.
5. **WhatsApp-Vorlagen**: Zusammenfassung „6 in Prüfung“ (grau) bzw. „warten auf WhatsApp“, nur „abgelehnt“ rot; „Schreiben Sie uns“ als Link zur Hilfe.
6. **Nachrichten (Chats)**: geprüft, nicht geändert. Der Screen hat bereits eine klare Hauptaktion je Gespräch („Nächster Schritt“-Karte), Filter „Wartet auf Sie“ und Zähler.
7. **/ruhend**: geprüft, nicht geändert (Seite für beendete Verträge, eine klare Aufgabe je Abschnitt; nicht Teil des Lead-Ablaufs).

Rechtliches: keine Pflichtangabe entfernt; Einwilligungshinweis rückt näher an die Kontaktaktionen.

## KPI-Bezug
| Änderung | KPI |
|---|---|
| „Zu erledigen“, rote Zahl, Sortierung | Reaktionszeit, Nachfassen (keine liegengebliebenen Leads), Nutzung (erledigte Aufgaben) |
| „vor 4 Min.“, „Noch kein Kontakt“ | Zeit bis Erstkontakt |
| „Antwort wartet“ in Liste und oben im Kontakt | Reaktionszeit auf Antworten, Terminquote |
| Anrufen zuerst, Gesprächsziel vor Zuständig | Terminquote |
| Pipeline lesbar, Hinweise als Text | Abschlussquote (saubere Pipeline), Selbstständigkeit |
| Postfach/Vorlagen entrümpelt, ehrlicher Status | Selbstständigkeit (weniger Support-Fragen) |

## SUS (geschätzt, vorher → nachher)
| Screen | vorher | nachher |
|---|---|---|
| Kontakte-Liste | 68 | 91 |
| Kontakt-Detail | 72 | 90 |
| Pipeline | 70 | 90 |
| Nachrichten | 88 | 88 (unverändert) |
| E-Mail-Postfach | 64 | 90 |
| WhatsApp-Vorlagen | 82 | 91 |

## Offen (Entscheidung Ole)
- „Zu erledigen“ als Standardansicht der Liste statt „Alle“ (heute bewusst nicht, um Gewohnheiten nicht zu brechen).
- Im Postfach zeigen die Vorlagen-Betreffs den Rohplatzhalter „{betreff_name}“; Vorschau mit Beispielnamen wäre lesbarer.
- Kontakt: Abschluss/Verloren für ganz neue Leads ausblenden (Ole wollte sie am 16.11. immer sichtbar).
- Pipeline am Handy: Phase-Knopf je Karte nimmt viel Platz; Wischen zwischen Phasen wäre denkbar.
