# KI-Hinweis nur in der ersten Nachricht (24.11.2026)

Anlass: Ole (24.11.2026) gibt für die Erinnerung an Leads, die nicht antworten (Zweck `followup_nudge`), einen neuen
Wortlaut vor, ohne „digitaler KI-Assistent“: „Guten Tag Herr Kranert, hier ist noch einmal [Agentur]. Sollen wir mit Ihrer
Anfrage zur Kfz-Versicherung weitermachen? Es dauert nur ein paar Minuten.“ Regel dazu: Der KI-Hinweis steht nur in der
ERSTEN Nachricht an den Lead (wie heute „Digitaler KI-Assistent“), nicht in jeder Erinnerung; fragt der Lead, ob er mit
einem Menschen schreibt, antwortet der Assistent immer ehrlich.

Interne Prüfung ohne Anwaltsfreigabe (AGENTS.md, 18.11.2026). Grundlage: Art. 50 Abs. 1 und 5 KI-VO (klar erkennbar,
spätestens bei der ersten Interaktion) und die Prüfung der Fußzeile vom 19.11.2026
(`docs/recht/erstanschreiben-fusszeile.md`: „KI-Assistent“ in der Fußzeile genügt, das Wort „KI“ muss bleiben). Der
Wortlaut der Kennzeichnung ist unverändert der von Ole freigegebene („Digitaler KI-Assistent“), es gibt keinen neuen Text.

## Regel in der App

- Kennzeichnung = „KI-Assistent“ im gespeicherten Text einer ausgehenden Nachricht (`hasKiHinweis`, Fußzeilen werden
  mitgespeichert).
- `kiKennzeichnungOffen` (templates.ts): Steht im Chat noch keine zugestellte Nachricht mit Kennzeichnung und hat der
  Assistent dort noch nicht selbst geantwortet, muss die nächste Systemnachricht sie tragen. Nur, wo eine KI antwortet
  (Assistent beim Kunden an, im Chat nicht pausiert); nicht bei Bestandskampagnen, Empfehlungen und Bewertungen
  (Absender ist der Vermittler persönlich). Hat der Assistent schon geantwortet, gilt wie bisher seine eigene Regel: Die
  erste Antwort trägt den Hinweis bzw. holt ihn nach (`kiHinweisNoetig`, z. B. in Chats von vor dem 15.11.2026).
- Offenes 24-Stunden-Fenster (Freitext): kursive Zeile „_Digitaler KI-Assistent_“ unter dem Text, bei jedem Zweck.
- Vorlage (Fenster zu): für Terminbestätigung und Erinnerung gibt es je Fassung zusätzlich eine Vorlage mit der Fußzeile
  „Digitaler KI-Assistent“ (`…_ki`, `…_ki_sie`, `…_ki_sie_ohne_name`, `KI_ERST`). Sie geht nur als erste Nachricht raus.
- Danach wird der Hinweis nicht wiederholt. Unverändert: nach über 30 Tagen Pause stellt ihn der Assistent seiner
  Antwort kurz voran, und er antwortet ehrlich auf die Frage nach Mensch oder KI.

## Wege zur ersten Nachricht

| Weg | Hinweis | Fundstelle | Geändert |
|---|---|---|---|
| Erstanschreiben als Vorlage, aktuelle Fassung v12 bzw. v13 (alle 9 Zwecke, Fassung a und b) | ja, Fußzeile „Digitaler KI-Assistent“ | template-plan.ts `buildTemplateRequest`, erstanschreiben.ts `ERSTINFO_FOOTER_V12` | nein |
| Rückfall v10 bzw. v11 | ja, Fußzeile „KI-Assistent“ | `ERSTINFO_FOOTER_V10` | nein |
| Rückfall v9 | ja, Fußzeile „KI-Assistent · Erstinformation im PDF oben“ | `ERSTINFO_FOOTER_V9` | nein |
| Rückfall v8 | ja, Fußzeile „KI-Assistent · Oben: Erstinformation (gesetzlich)“ (im Text nur „digitale Assistent“) | templates.ts `ERSTINFO_FOOTER_V8` | nein |
| Rückfall v6 und v7 | ja, im Text „Ich bin der digitale KI-Assistent von …“ | erstanschreiben.ts `ERSTANSCHREIBEN_V6`, `_V7` | nein |
| Rückfall v3 bis v5 | ja, im Text (v3 „Hier schreibt der digitale KI-Assistent … Ich bin kein Mensch“, v4 und v5 „Ich bin der digitale KI-Assistent von …“; Wortlaut nur noch in der git-Historie, 5d235ad, 76dc6bf, 4a82825) | bei Meta freigegebene Vorlagen | nein |
| v1 und v2 („digitaler Assistent“ ohne „KI“), `_ohnepdf`, von Hand angelegte Vorlagen ohne PDF-Kopf | werden als Erstanschreiben nie gesendet | templates.ts `rankOutreach` (nur Vorlagen mit PDF-Kopf, den gab es erst ab v4) | nein |
| Erstanschreiben als Freitext (Fenster offen, Lead hat noch nicht geschrieben) | ja, kursive Zeile „_Digitaler KI-Assistent_“ bzw. „_KI-Assistent · Erstinformation folgt als PDF_“ | erstanschreiben.ts `erstanschreibenText` | nein |
| Lead schreibt zuerst (Assistent antwortet) | ja, Kopf „Hier schreibt der digitale KI-Assistent von …“ | bot.ts (`kiHinweisNoetig` „erst“, `erstanschreibenKopf`) | nein |
| Lead schreibt zuerst und will einen Menschen | ja, „hier schreibt der digitale KI-Assistent von … Ich bin kein Mensch …“ | ki-hinweis.ts `humanHandoverReply` | nein |
| Terminbestätigung als erste Nachricht (Lead bucht online vor dem Erstanschreiben, Vermittler bucht für den Lead, übernommene Nummer aus der Buchung) | **fehlte** (Vorlage v4 und Freitext) | reminders.ts `sendBookingConfirmation` | **ja**: neue Fassung mit KI-Fußzeile `pg_booking_confirmation_v4_ki…`, wird eingereicht; bis zur Freigabe die bisherige. Freitext mit kursiver Zeile |
| Erinnerung als erste Nachricht („Nicht erreicht“ ohne Erstanschreiben und ohne Kalender, Nachfassen an die Nummer aus der Buchung, Nachfassen von Hand) | bisher im Text; mit dem neuen Wortlaut nicht mehr | lead-sequences.ts, buchungsnummer.ts, followup.ts | **ja**: Fassung mit KI-Fußzeile `pg_followup_nudge_v5_ki…`; bis zur Freigabe die alte v4 (Hinweis im Text); ist beides nicht freigegeben, keine Vorlage, sondern Anruf-Aufgabe |
| Übrige Nachfass-Vorlagen als erste Nachricht (followup, followup_offer, followup_offer_selbst, offer_bedenkzeit, followup_noshow, followup_absage, followup_last) | ja, im Text | templates.ts `TEMPLATE_BODY` | nein |
| Nachfass-Freitexte im offenen Fenster als erste Nachricht | fehlte (praktisch nur, wenn vorher kein Assistent geantwortet hat) | lead-sequences.ts | **ja**: kursive Zeile über die zentrale Regel |
| Termin-Erinnerungen, „Termin verschoben“, „wartet im Videoraum“, Angebot, Glückwunsch, Maklervollmacht als erste Nachricht | Vorlage: nein. Freitext: ja über die zentrale Regel | reminders.ts, showup-server.ts, angebot-senden-server.ts, abschluss-server.ts, maklervollmacht/whatsapp.ts | Vorlagen nicht geändert: nur denkbar, wenn die Terminbestätigung nicht rausging. Siehe „Offen“ |
| Mail-Strecke (Leads ohne WhatsApp), Erstmail | ja, „Hier schreibt der digitale KI-Assistent von …“; Folgemails mit kleiner Zeile | mail-strecke/texte.ts `erstmailInhalt` | nein |
| Mail-Strecke mit SMS, erste SMS | ja, „Hier ist der KI-Assistent von …“ | mail-strecke/texte.ts `smsText` | nein |
| Nur-SMS (E-Mail-Funktionen beim Kunden aus) | **nein, bewusst** (Ole, 22.11.2026: „ohne KI-Satz“; feste Nachricht mit Link zur Terminwahl, kein KI-Gespräch, auf die SMS kann nicht geantwortet werden) | mail-strecke/nur-sms.ts `nurSmsText` | nein, siehe „Offen“ |
| Einmal-Mail „kurz zu …“ (nur wenn die Mail-Strecke abgeschaltet ist) | nein: persönliche Mail des Vermittlers aus seinem Postfach, Antworten gehen an ihn | kein-whatsapp-mail.ts | nein, kein KI-Kontakt |
| Bestandskampagnen, Empfehlungen, Bewertungen (ausgeblendete Module) | nein: Absender ist der Vermittler persönlich. Antwortet der Kontakt und übernimmt der Assistent, beginnt dessen erste Antwort mit dem Hinweis | bestand/campaigns.ts, empfehlung/requests.ts, bot.ts | nein |

## Ehrliche Antwort auf „Schreibe ich mit einem Menschen?“

- Feste Erkennung ohne KI (`wantsHuman`): Antwort „Ich bin der digitale KI-Assistent von …, kein Mensch.“ mit Übergabe an
  den Vermittler. Ergänzt um die dritte Person („Schreibt hier ein Mensch?“, „Antwortet da eine KI?“, „Ist da ein Mensch
  dran?“), weil die Erinnerung den Assistenten nicht mehr nennt.
- System-Prompt: „Gib dich nie als Mensch aus“, ehrliche Antwort auch auf „wer schreibt hier“.
- Neues Sicherheitsnetz (`gibtSichAlsMenschAus`, wie die Beratungssperre): Behauptet eine Antwort der KI doch, ein Mensch
  bzw. keine KI zu sein, geht stattdessen „Ich bin der digitale KI-Assistent von …, kein Mensch. Wenn Sie direkt mit …
  sprechen möchten, schreiben Sie ‚Mensch‘.“ raus; der Verlauf vermerkt das.

## Offen (Entscheidung Ole)

1. **Nur-SMS ohne KI-Satz.** Ole hat den Satz am 22.11.2026 bewusst gestrichen (4281a7c). Die Prüfung vom selben Tag
   (`2026-11-22-sms-ohne-whatsapp.md`, Abschnitt 3) nennt ihn noch als gegeben. Einschätzung: vertretbar, weil die SMS ein
   fester Text ist und kein Gespräch mit einer KI beginnt (Art. 50 Abs. 1 setzt eine Interaktion mit dem KI-System
   voraus); wer daraufhin bucht und später per WhatsApp angeschrieben wird, bekommt dort den Hinweis in der ersten
   Nachricht. Soll er trotzdem hinein, kostet er rund 40 Zeichen von höchstens zwei SMS-Teilen (dann fällt eher das Thema weg).
2. **Übrige Termin-Vorlagen** (Erinnerung Vortag, 1 Stunde, 15 Minuten, verschoben, Angebot, Glückwunsch, Maklervollmacht)
   haben keine Fassung mit KI-Fußzeile. Sie können nur erste Nachricht sein, wenn die Terminbestätigung nicht rausging.
   Eine eigene Fassung je Zweck wären 21 weitere Vorlagen je Kunde; nicht gebaut.
3. **Andere Nachfass-Vorlagen wiederholen den Hinweis weiter im Text** („hier ist nochmal der digitale KI-Assistent von
   …“): followup, followup_offer, followup_offer_selbst, offer_bedenkzeit, followup_noshow, followup_absage,
   followup_last (a und b). Auftrag war nur die Erinnerung.
4. **Freigabe bei Meta:** je Kunde 3 neue Vorlagen der Erinnerung (v5) und 6 Fassungen mit KI-Fußzeile. Bis dahin gilt
   der Rückfall aus der Tabelle: Die Terminbestätigung geht als Vorlage wie bisher ohne Hinweis raus (der Hinweis folgt
   mit dem Erstanschreiben, das auch gebuchte Leads bekommen, bzw. in der ersten Antwort des Assistenten); die
   Erinnerung geht als erste Nachricht nur mit Hinweis raus (alte v4), sonst gar nicht.
5. **B-Fassung der Erinnerung** (AGENTS.md, A/B-Tests): direkter Auftrag ohne Test; eine B-Fassung über das
   A/B-Test-Labor steht aus.
