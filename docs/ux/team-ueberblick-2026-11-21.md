# Team-Überblick für Inhaber (21.11.2026)

Auftrag Ole: Der Inhaber einer Agentur sieht, welche Termine für seine Mitarbeiter gebucht sind und wer seine Aufgaben
nicht erledigt.

## Wer, Situation, Aufgabe

- **Wer:** Inhaber einer Agentur mit 3 bis 10 Beratern (z. B. Allianz-Generalvertretung). Er arbeitet selbst mit,
  verteilt Leads und muss wissen, ob jemand hängt.
- **Situation:** morgens am Handy oder zwischen zwei Terminen. Er will nicht jeden Kontakt einzeln durchsehen.
- **Die eine Aufgabe:** „Bei wem bleibt etwas liegen, und was ist es?“ Daneben: „Was hat Frank diese Woche an Terminen?“

## Wo es hingehört

- **Team-Seite** (`/buyer/team`, nur Inhaber): Die Mitgliederzeile gibt es schon. Statt einer neuen Seite wird die
  Zeile zur aufklappbaren Karte (Akkordeon). Zugeklappt: eine Statuszeile „2 Termine in 7 Tagen · 3 offen“, gelb nur
  über der Schwelle. Aufgeklappt: zwei Blöcke **Termine** (nächste 7 Tage) und **Offen** (Warten auf Anruf,
  Wiedervorlage überfällig, Ergebnis fehlt, Ohne nächsten Schritt). Jeder Eintrag öffnet den Kontakt.
- **Heute** (nur Inhaber, nur Teams ab 2 Personen): höchstens eine kleine Karte „Team“ mit einer Zeile je betroffener
  Person (max. 3), Link direkt auf die aufgeklappte Person. Ohne Befund keine Karte.
- **Zahlen/Wachstum** bleibt die Auswertung im Zeitraum (Quoten, Provision). Der Überblick hier ist „Stand jetzt“.

## Was wegfällt oder zusammengelegt wird

- Die zweite Zeile der Mitgliederzeile („12 Leads in 30 Tagen · Kalender verbunden“) wird durch die Statuszeile
  ersetzt. Leads in 30 Tagen und Kalenderstatus stehen im aufgeklappten Teil.
- Tippen auf die Zeile öffnete bisher sofort das Menü (Namen ändern, Abwesenheit, Entfernen). Diese seltenen Aktionen
  liegen jetzt im aufgeklappten Teil hinter „Verwalten“; das Häufige (Überblick) ist einen Tipp entfernt.
- Kein neuer Menüpunkt, keine neue Seite, kein neuer Push.

## Definitionen (keine neuen Regeln)

| Block | Quelle | Gleich wie |
|---|---|---|
| Termine | `Appointment` gebucht, ab jetzt bis +7 Tage; zuständig: `calendarKey = user:<id>`, sonst zuständiger Berater des Leads, sonst Inhaber | `appointmentScope` |
| Warten auf Anruf | `getCallbackLeads` | Rückrufliste auf Heute des Beraters |
| Wiedervorlage überfällig | `followUpAt` vor jetzt, gleiche offenen Status wie Heute, Wiedervorlage hinter Termin ausgeblendet | Heute „Wiedervorlagen“ |
| Ergebnis fehlt | Termin gebucht, Beginn vor mehr als 30 Min., bis 30 Tage zurück, Lead noch nicht Angebot/Abschluss/Verloren | Heute „Wie lief's?“ |
| Ohne nächsten Schritt | `withoutNextStepWhere` ohne die Leads aus den Blöcken davor | Heute, Zahlen |

## Schwellen (gelb ab)

- Warten auf Anruf: ein neuer Lead (niemand schreibt ihn an) wartet länger als 2 Std., oder 3 und mehr warten.
- Wiedervorlage überfällig: 3 und mehr, oder eine seit über 24 Std. fällig.
- Ergebnis fehlt: 3 und mehr, oder ein Termin liegt über 24 Std. zurück.
- Ohne nächsten Schritt: Quote unter 80 % (`NEXT_STEP_WARN_BELOW`, wie Zahlen und Admin).

## „Warum ist das noch schwer zu verstehen?“ (vor dem Vorlegen)

Geprüft an Screenshots (Desktop 1280 px und Handy 390 px, `docs/ux/screens/team-ueberblick-*.png`) mit Testteam
(Inhaber und 3 Berater). Behoben vor dem Vorlegen:

1. Statuszeile „6 offen“: offen was? Jetzt „6 Aufgaben offen“ bzw. „alles erledigt“.
2. Ganze Zeile gelb, auch die Termine: jetzt wird nur der offene Teil gelb, Termine bleiben grau.
3. Statuszeile brach am Handy um: „in 7 Tagen“ nur am Desktop, am Handy „2 Termine · 6 Aufgaben offen“
   (Zeitraum steht im aufgeklappten Teil).
4. Heute-Zeile „6 Aufgaben offen“ sagte nicht, was los ist: jetzt der dringendste Punkt zuerst
   („2 Leads warten auf Anruf, 4 weitere offen“).
5. „Termin Gestern 12:20“ (groß mitten im Satz): jetzt „Termin gestern 12:20“.
6. Testdaten: Wiedervorlagen erschienen als „neu, seit 1 Min.“, weil die Leads frisch angelegt waren; Testdaten
   realistisch (Leads 5 Tage alt), Regel unverändert.

SUS-Schätzung (Kunden-Persona Agenturinhaber mit 3 bis 10 Beratern): Team-Seite zugeklappt 92, aufgeklappt 90,
Heute-Karte 91. Rest unter Beobachtung: Tippen auf die Zeile öffnet jetzt den Überblick statt des Menüs
(Verwalten eine Ebene tiefer); in der Sitzungsauswertung auf Fehlklicks achten.
