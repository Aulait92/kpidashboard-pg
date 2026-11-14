# Vertrieb: Später-Follow-ups

Kontakte, die auf eine Cold Mail „gerne später“ antworten („aktuell nicht, aber ab März“, „melden Sie sich
nächstes Jahr“, „in 3 Monaten“), werden nicht mehr als Absage behandelt, sondern zum genannten Zeitpunkt
wieder angeschrieben. Code: `src/lib/vertrieb/spaeter.ts` (Erkennung, Datum, Werktage),
`src/lib/vertrieb/followup.ts` (Einplanen, Versand, Abbruch), Übersicht unter **Vertrieb → Follow-ups**.

## Ablauf

1. **Erkennen**: `classifyReply` liefert `SPAETER` (Regeln, keine KI). Klare Absagen (abmelden, „auch später
   nicht“, Ruhestand …) bleiben Absagen. Kurzfristiges („Termin nächste Woche“) ist eine normale Antwort.
   Stufe wird „Später“, keine sofortige Anruf-Aufgabe. Auch per Hand: Antwort als „später“ einordnen oder
   Ausgang „Später wieder (Monate)“ im Kontakt.
2. **Zeitpunkt**: spätester genannter (Monat, Quartal, Jahreszeit, „nächstes Jahr“, „in N Monaten“),
   ohne Angabe 3 Monate. Immer Werktag (Mo–Fr, ohne bundesweite Feiertage, 24./31.12.) vormittags 9–11:30.
3. **Mail 1** als Antwort im selben Instantly-Thread: `POST /api/v2/emails/reply` mit `reply_to_uuid` =
   Instantly-ID der Antwort des Kontakts und `eaccount` = unser Postfach, das sie empfangen hat. Nie aus einem
   anderen Postfach: ohne bekanntes Postfach wird nicht gesendet. Betreff „Re: …“, Signatur des Postfachs
   (Instantly → Accounts), Verlauf zitiert (macht Instantly nicht selbst).
4. **Mail 2** nach 5 Werktagen ohne Antwort („Kurz nachgehakt …“), zitiert Mail 1.
5. Nach weiteren 5 Werktagen ohne Antwort: Aufgabe **„Wieder melden“** (Anruf). Die 60-Tage-Aufgabe vom
   Ausgang „Später wieder“ wird beim Einplanen entfernt und erst hier wieder angelegt (nie doppelt).

Texte: KI (`runAgent`, gleicher Helfer wie die Kampagnen-Agenten) aus unserer Originalmail und seiner Antwort,
Sie-Form, ohne Gedankenstriche; ungültige Antwort → feste Vorlage. Im Kontakt änderbar (Text, Datum),
„Jetzt senden“, „Stoppen“.

## Abbruch

Sofort bei jeder echten Antwort, Abmeldung (Instantly), Stufe Termin/Gewonnen/Verloren/Ungültig (auch Calendly-
Buchung) oder „Stoppen“. Vor jedem Versand wird das zusätzlich geprüft. Eine Abwesenheitsnotiz nach Mail 1
verschiebt Mail 2 (auf den Tag nach dem genannten Rückkehrdatum, sonst um 5 Werktage). Antwortet der Kontakt
erneut mit „später“, wird neu eingeplant.

## Versand

Über den zentralen Cron (`/api/whatsapp/cron`, alle 5 Minuten): werktags 8–17 Uhr deutsche Zeit, höchstens
`perDay` Mails je Postfach und Tag (Standard 15), nur mit `INSTANTLY_AUTO_SYNC=1` und `INSTANTLY_API_KEY`
(also nicht in Test-/Staging-Umgebungen). Sperre je Follow-up und Schritt gegen Doppelversand; ist die Mail
raus, wird der Schritt zuerst gespeichert. Gesendete Mails stehen im Kontakt unter den Cold-Mail-Antworten
(„Gesendet“) und im Verlauf.

## Bestand

Beim ersten Cron-Lauf werden alle Kontakte mit Stufe „Später“ bzw. Später-Antwort eingeplant, Status
**„wartet auf Freigabe“**: es geht nichts raus, bis unter Vertrieb → Follow-ups „Alle freigeben“ (oder einzeln)
geklickt wird. Vergangene Zeitpunkte werden über die nächsten Werktage verteilt. Kontakte, die früher wegen
„aktuell nicht …“ automatisch auf „Verloren“ gesetzt wurden, sind nicht dabei: im Kontakt die Antwort als
„später“ einordnen, dann wird eingeplant. Antworten älter als 14 Tage (z. B. beim ersten vollständigen
Instantly-Abgleich) warten ebenfalls auf Freigabe.

## Einstellungen

Vertrieb → Follow-ups → Einstellungen (auch unter Einstellungen → Vertrieb & Wachstum): Automatik ein/aus,
Tageslimit je Postfach, KI-Texte, Buchungslink, Ein-Satz-Beschreibung des Angebots.
