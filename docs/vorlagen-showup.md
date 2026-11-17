# WhatsApp-Vorlagen Show-up-Paket (P1)

Stand 17.11.2026. Alle vier Vorlagen sind von Ole **freigegeben und eingereicht ab 17.11.2026** (Texte unverändert;
der Cron reicht sie je Kunde bei Meta ein). Kategorie jeweils UTILITY. Im offenen 24-h-Fenster gehen die Texte als
Freitext raus (ohne Vorlagenkosten). Ist das Fenster zu und hat Meta die neue Vorlage für den Kunden noch nicht
freigegeben, gilt die bisherige Regel:

- Vortag und 1 Stunde: die bisher freigegebenen Vorlagen `reminder` bzw. `reminder_soon` (v4) mit ihrem alten Text.
- 15 Minuten vorher: entfällt (bisher gab es keine).
- „Wartet im Videoraum“: keine WhatsApp, der Vermittler sieht den Anruf-Knopf.

Platzhalter: {{1}} ist immer der Name (Sie „Frau Schneider“, Du „Julia“; die Sie-Fassung ohne Namen beginnt mit
„Guten Tag,“ und die übrigen Platzhalter rücken auf). Es gibt je Vorlage drei Fassungen: Du, Sie, Sie ohne Namen.

## 1. Vortag (Zweck `reminder`, neue Fassung v5)

Etwa 24 Stunden vorher, nur wenn mindestens 26 Stunden vorher gebucht wurde. Dazu kommt die Vortags-Mail (P0).

- Sie: „Guten Tag {{1}}, kurze Erinnerung an Ihren Termin {{2}}. {{3}} So geht es los: {{4}} Passt es weiterhin?“
- Du: „Hallo {{1}}, kurze Erinnerung an deinen Termin {{2}}. {{3}} So geht es los: {{4}} Passt es weiterhin?“
- Knöpfe: „Ja, passt“ · „Bitte verschieben“
- {{2}} Wann: „morgen um 10 Uhr“
- {{3}} Nutzensatz aus den Angaben (wie beim Terminvorschlag), bei Komplettcheck = Ja mit „Legen Sie gern Ihre
  bestehenden Verträge bereit.“ (Du: „Leg gern deine bestehenden Verträge bereit.“)
- {{4}} Zugang: Videolink, beim Telefontermin „Herr Kannapinn ruft Sie an.“

Beispiel (Freitext, Sie):

> Guten Tag Frau Becker, kurze Erinnerung an Ihren Termin morgen um 10 Uhr. In einem kurzen Videotermin zeigt Ihnen
> Herr Kannapinn, was Haftpflicht und Hausrat für Ihre Familie kosten und worauf Sie achten sollten. Legen Sie gern
> Ihre bestehenden Verträge bereit.
>
> So geht es los: https://meet.google.com/abc-defg-hij
>
> Passt es weiterhin?

## 2. Eine Stunde vorher (Zweck `reminder_soon`, neue Fassung v5)

Nur wenn mindestens 2 Stunden vorher gebucht wurde. Ohne Link.

- Sie: „Guten Tag {{1}}, in einer Stunde ist Ihr {{2}} mit {{3}}. Passt bei Ihnen alles? Falls etwas dazwischengekommen ist, finden wir gern eine neue Zeit.“
- Du: „Hallo {{1}}, in einer Stunde ist dein {{2}} mit {{3}}. Passt bei dir alles? Falls etwas dazwischengekommen ist, finden wir gern eine neue Zeit.“
- Knöpfe: „Ja, passt“ · „Bitte verschieben“
- {{2}} „Videotermin“ bzw. „Telefontermin“, {{3}} „Herrn Kannapinn“ (Du: „Ole“)

## 3. 15 Minuten vorher (neuer Zweck `reminder_start`, v5)

Nur Videotermine mit Link.

- Sie: „Guten Tag {{1}}, gleich geht es los: {{2}} ist um {{3}} für Sie im Videoraum. Der Link funktioniert direkt im Handy-Browser, ohne App: {{4}} Bis gleich!“
- Du: „Hallo {{1}}, gleich geht es los: {{2}} ist um {{3}} für dich im Videoraum. Der Link funktioniert direkt im Handy-Browser, ohne App: {{4}} Bis gleich!“
- Knopf: „Bitte verschieben“
- {{2}} „Herr Kannapinn“ (Du: „Ole“), {{3}} „10 Uhr“, {{4}} Videolink

## 4. Wartet im Videoraum (neuer Zweck `appt_waiting`, v5)

Geht raus, wenn der Vermittler zum Terminbeginn „Fehlt noch“ antippt.

- Sie: „Guten Tag {{1}}, {{2}} wartet schon im Videoraum auf Sie. Hier ist der Link: {{3}} Bis gleich!“
- Du: „Hallo {{1}}, {{2}} wartet schon im Videoraum auf dich. Hier ist der Link: {{3}} Bis gleich!“
- Keine Knöpfe. {{2}} „Herr Kannapinn“ (Du: „Ole“), {{3}} Videolink
- Freitext im Fenster genau wie von Ole vorgegeben: „Guten Tag Frau Becker, Herr Kannapinn wartet schon im Videoraum
  auf Sie: <Link>“. In der Vorlage darf der Link nicht am Ende stehen (Meta-Regel), daher „Bis gleich!“ dahinter.

## Abweichungen von Oles Wortlaut (mit der Freigabe bestätigt)

- Alle Nachrichten beginnen mit der üblichen Anrede-Zeile („Guten Tag Frau Becker,“ bzw. „Hallo Julia,“), so wie alle
  anderen Termin-Nachrichten. Danach folgt Oles Text mit kleinem Anfangsbuchstaben.
- Vortag: Der Nutzensatz nennt den Vermittler schon („zeigt Ihnen Herr Kannapinn …“), deshalb heißt es davor nur
  „kurze Erinnerung an Ihren Termin morgen um 10 Uhr“.

## Freigeben (Technik, erledigt am 17.11.2026)

Die bisherige Platzhalter-Belegung von Vortag und 1 Stunde (v4) steht jetzt in `PLATZHALTER_AB` (templates.ts).


- Vortag und 1 Stunde: in `src/lib/whatsapp/templates.ts` den Text aus `VORBEREITETE_FASSUNG` nach `TEMPLATE_BODY`
  übernehmen, `REST_PARAMS` auf die neuen Platzhalter setzen, `PURPOSE_VERSION` auf „v5“, Eintrag löschen. Die
  Absender belegen die Platzhalter je Version der gewählten Vorlage schon richtig (`paramsFor`).
- 15 Minuten und „Wartet“: in `src/lib/whatsapp/template-plan.ts` aus `VORBEREITETE_PURPOSES` in `CORE_PURPOSES`
  verschieben. Der Cron reicht sie dann je Kunde automatisch ein.
- Alle neuen Meta-Vorlagen (auch aus P2 bis P4) möglichst in einem Lauf einreichen.
