# Mahnwesen: Texte zum Gegenlesen (Stand 17.11.2026)

Alle Texte an Kunden (Vermittler) im Mahnwesen, Sie-Form, ohne Gedankenstriche, Absender Ole Kannapinn.
Quelle im Code: `src/lib/mahnwesen.ts` (`mahnText`, `anrufAufgabe`, WhatsApp-Vorlagen). Wer etwas ändern
möchte, bitte dort ändern und diese Datei mitziehen. Beispielwerte: Rechnung PG-1234-0007 über 1.416,10 €,
fällig am 01.12.2026. Anrede und Signatur kommen wie bei allen Kundenmails aus `sendCustomerMail`.

## Ablauf

| Stufe | Wann | Kanal |
|---|---|---|
| 1 Erinnerung | 3 Tage vor Fälligkeit (nur Überweisung) | E-Mail |
| 2 Zahlungserinnerung | am Fälligkeitstag bzw. am Tag der fehlgeschlagenen Abbuchung | E-Mail und WhatsApp (sobald die Vorlage freigegeben ist) |
| 3 1. Mahnung | 7 Tage nach Fälligkeit | E-Mail mit Rechnung als PDF |
| 4 2. Mahnung | 14 Tage nach Fälligkeit | E-Mail mit Rechnung als PDF |
| 5 Kunde anrufen | 21 Tage nach Fälligkeit | Aufgabe auf Admin „Heute“, Push |

Versand 9 bis 19 Uhr (Berlin), Stufen streng nacheinander, mindestens 3 Tage Abstand. Stopp sofort bei
Zahlungseingang (Stripe oder Geschäftskonto) oder per Schalter in der Kundenakte (Abrechnung). Das Datum
„bis zum …“ in den Mahnungen ist jeweils 7 Tage nach dem Versandtag.

Nicht enthalten (vorbereitete Schalter, Standard aus): Verzugspauschale, Leads-Pause.

## E-Mails

### Stufe 1: Erinnerung 3 Tage vor Fälligkeit (nur Überweisung, E-Mail)

**Betreff:** Erinnerung: Rechnung PG-1234-0007 ist am 01.12.2026 fällig

> Guten Tag Herr Mustermann,
>
> eine kurze Erinnerung: Unsere Rechnung PG-1234-0007 über 1.416,10 € ist am 01.12.2026 fällig.
>
> Bitte überweisen Sie den Betrag an die IBAN auf der Rechnung. Geben Sie als Verwendungszweck bitte die Rechnungsnummer an, dann ordnen wir Ihre Zahlung automatisch zu.
>
> Haben Sie schon überwiesen? Dann ist alles erledigt, vielen Dank.
>
> [Knopf: Rechnung ansehen]
>
> Ole Kannapinn  
> performancegrowth

### Stufe 2: Zahlungserinnerung am Fälligkeitstag, Überweisung (E-Mail und WhatsApp)

**Betreff:** Zahlungserinnerung: Rechnung PG-1234-0007

> Guten Tag Herr Mustermann,
>
> heute ist unsere Rechnung PG-1234-0007 über 1.416,10 € fällig. Bei uns ist noch keine Zahlung eingegangen.
>
> Bitte überweisen Sie den Betrag in den nächsten Tagen an die IBAN auf der Rechnung. Geben Sie als Verwendungszweck bitte die Rechnungsnummer an, dann ordnen wir Ihre Zahlung automatisch zu.
>
> Falls sich das mit Ihrer Zahlung überschnitten hat, betrachten Sie diese Nachricht bitte als gegenstandslos.
>
> [Knopf: Rechnung ansehen und bezahlen]
>
> Ole Kannapinn  
> performancegrowth

### Stufe 2: Zahlungserinnerung, Lastschrift oder Karte fehlgeschlagen (E-Mail und WhatsApp)

**Betreff:** Zahlung nicht erfolgreich: Rechnung PG-1234-0007

> Guten Tag Herr Mustermann,
>
> leider hat die Abbuchung für unsere Rechnung PG-1234-0007 über 1.416,10 € nicht geklappt. Das passiert zum Beispiel, wenn das Konto gerade nicht gedeckt ist oder die Karte abgelaufen ist.
>
> Über den Knopf können Sie die Rechnung direkt online bezahlen. Dort können Sie auch eine andere Zahlungsart wählen.
>
> Falls sich das mit Ihrer Zahlung überschnitten hat, betrachten Sie diese Nachricht bitte als gegenstandslos.
>
> [Knopf: Rechnung jetzt bezahlen]
>
> Ole Kannapinn  
> performancegrowth

### Stufe 3: 1. Mahnung, 7 Tage nach Fälligkeit (E-Mail mit Rechnung als PDF)

**Betreff:** 1. Mahnung: Rechnung PG-1234-0007

> Guten Tag Herr Mustermann,
>
> unsere Rechnung PG-1234-0007 über 1.416,10 €, fällig am 01.12.2026, ist leider noch offen. Die Rechnung finden Sie im Anhang.
>
> Bitte begleichen Sie den Betrag bis zum 15.12.2026. Geben Sie als Verwendungszweck bitte die Rechnungsnummer an, dann ordnen wir Ihre Zahlung automatisch zu.
>
> Gibt es einen Grund, warum Sie noch nicht zahlen konnten? Antworten Sie einfach auf diese E-Mail, dann finden wir gemeinsam eine Lösung.
>
> Falls sich das mit Ihrer Zahlung überschnitten hat, betrachten Sie diese Nachricht bitte als gegenstandslos.
>
> [Knopf: Rechnung ansehen und bezahlen]
>
> Ole Kannapinn  
> performancegrowth

(Bei Lastschrift oder Karte entfällt der Satz zum Verwendungszweck. Ist das PDF nicht abrufbar, entfällt der Satz zum Anhang, der Knopf bleibt.)

### Stufe 4: 2. Mahnung, 14 Tage nach Fälligkeit (E-Mail mit Rechnung als PDF)

**Betreff:** 2. Mahnung: Rechnung PG-1234-0007

> Guten Tag Herr Mustermann,
>
> unsere Rechnung PG-1234-0007 über 1.416,10 €, fällig am 01.12.2026, ist trotz Zahlungserinnerung und 1. Mahnung noch offen. Die Rechnung finden Sie noch einmal im Anhang.
>
> Bitte begleichen Sie den Betrag bis spätestens 22.12.2026. Geben Sie als Verwendungszweck bitte die Rechnungsnummer an, dann ordnen wir Ihre Zahlung automatisch zu.
>
> Wenn Sie Fragen zur Rechnung haben oder eine andere Lösung besprechen möchten, antworten Sie auf diese E-Mail oder rufen Sie mich an.
>
> Falls sich das mit Ihrer Zahlung überschnitten hat, betrachten Sie diese Nachricht bitte als gegenstandslos.
>
> [Knopf: Rechnung ansehen und bezahlen]
>
> Ole Kannapinn  
> performancegrowth

### Stufe 5: Aufgabe auf Admin „Heute“ (21 Tage nach Fälligkeit, geht nicht an den Kunden)

**Titel:** Kunde anrufen: Versicherungsbüro Mustermann

**Notiz:** Rechnung PG-1234-0007 über 1.416,10 € ist seit 01.12.2026 fällig und noch offen. Zahlungserinnerung, 1. und 2. Mahnung sind verschickt. Bitte anrufen und klären; bei einer Absprache in der Kundenakte unter Abrechnung die Mahnungen stoppen.

## WhatsApp-Vorlagen (nur vorbereitet, NICHT eingereicht)

Über die Support-Nummer, Kategorie UTILITY, Sprache de. Platzhalter: {{1}} Anrede („Herr Mustermann“),
{{2}} Rechnungsnummer, {{3}} Betrag, {{4}} Link zur Stripe-Rechnung. Zum Einreichen in `SUPPORT_TEMPLATES`
(`src/lib/vertrieb/termin-whatsapp.ts`) aufnehmen; bis zur Freigabe geht am Fälligkeitstag nur die E-Mail raus.

### pg_rechnung_faellig_sie_v1 (Überweisung, Fälligkeitstag)

> Guten Tag {{1}}, eine kurze Erinnerung: Unsere Rechnung {{2}} über {{3}} ist heute fällig, bei uns ist noch keine Zahlung eingegangen. Hier können Sie die Rechnung ansehen und bezahlen: {{4}} Falls sich das mit Ihrer Zahlung überschnitten hat, ist alles in Ordnung. Bei Fragen antworten Sie einfach auf diese Nachricht. Viele Grüße, Ole Kannapinn

### pg_rechnung_fehlgeschlagen_sie_v1 (Lastschrift oder Karte fehlgeschlagen)

> Guten Tag {{1}}, leider hat die Abbuchung für unsere Rechnung {{2}} über {{3}} nicht geklappt. Hier können Sie die Rechnung direkt bezahlen, auch mit einer anderen Zahlungsart: {{4}} Bei Fragen antworten Sie einfach auf diese Nachricht. Viele Grüße, Ole Kannapinn

## Angebotsseite

Auswahl der Zahlart (nur wenn am Angebot „Überweisung erlauben“ gesetzt ist), dritte Option:

> **Per Überweisung zahlen**
> Rechnung per E-Mail, zahlbar innerhalb von 14 Tagen.

Nach der Wahl:

> **Vielen Dank! Ihre Rechnung kommt per E-Mail.**
> Bitte überweisen Sie das Setup innerhalb von 14 Tagen. Die laufende Vergütung bekommen Sie ab dem Start
> ebenfalls als Rechnung. Ihren Zugang zur Einrichtung erhalten Sie gleich per E-Mail.
> IBAN: (virtuelle IBAN des Kunden bei Stripe) · Verwendungszweck: Rechnungsnummer (steht auf der Rechnung)

Die Rechnung selbst (mit IBAN) verschickt Stripe.
