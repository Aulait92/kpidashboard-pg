# Plan: E-Mail-Vorlagen in der Customer Journey (M0 bis M9)

Stand 17.11.2026. Auftrag Ole, Teil des Soll-Verlaufs (`docs/plan-lead-verlauf.md`). Erst Staging, Abnahme durch Ole.
`src/lib/mail/vorlagen.ts` enthält 12 Vorlagen.

## Stufen je Vorlage (Voreinstellung, je Vermittler umstellbar: automatisch / ein Tipp / aus)

- **Automatisch:** termin_vorbereitung (Bestätigung + Vortags-Mail; die Bestätigung selbst ist Pflicht, der Schalter betrifft nur
  Vorbereitungsteil und Vortags-Mail), nicht_erreicht (einmal nach dem 2. erfolglosen Versuch im Anrufplan), nicht_erschienen
  (No-Show-Rettung, selber Tag), wie_besprochen (Bedenkzeit, zum genannten Datum), nachfassen_angebot (Tag 5).
- **Ein Tipp:** angebot (nur Weg „über die App“), beratungsdoku (mit dem Angebot; KI-Entwurf, Ablage als „Beratungsdokumentation“),
  unterlagen_fehlen (Erinnerung nach 3 Tagen automatisch), nach_abschluss (Haken neben „Glückwunsch per WhatsApp“, zeitneutral),
  willkommen (Aufgabe „Police da?“ nach 14 Tagen), tuer_offen (Haken bei Verlustgrund „kein Interesse“, einmalig).
- **Von Hand:** kuendigung (Aufgabe, wenn der Komplettcheck einen zu ersetzenden Vertrag zeigt).

## Regeln

1. WhatsApp ist Hauptkanal. Mail ergänzend (Kalender, Angebot, Dokumente, Zusammenfassung) oder Ersatz ohne WA (`kein-whatsapp-mail.ts`).
2. Alles unter „Nächste Nachrichten“ am Kontakt (Nachrichtenplan aus P1, Aktionen aus P6).
3. Absender: verbundenes Postfach, sonst dein-beratungstermin.de mit „Name | Agentur“, Reply-To, Signatur (`mail/lead-versand.ts`, `lead-absender.ts`).
4. Ohne Postfach: BCC-Kopie an wählbare Adresse (Standard: eigene). Weiterleitungsadresse `<kurz>.<code>@antwort.dein-beratungstermin.de`
   als Reply-To (M2), nicht bei verbundenem Postfach. Bei Vorlagen „ein Tipp“/„von Hand“ zusätzlich „Im eigenen Mailprogramm öffnen“
   (mailto) und „Text kopieren“, danach „Gesendet?“ mit Eintrag im Verlauf und Folgen (Nachfassen starten/stoppen).
5. Stopp-Regeln (Antwort, Abschluss, Absage, Abmeldung) für alle Mails, Abmeldelink wo werblich.
6. Mail 2 h nach der WA am selben Anlass, entfällt bei Antwort; höchstens eine automatische Mail je Lead und Tag.
7. „Meine Gesellschaft erlaubt das nicht“ (`mailFeaturesOff`): alle Mails aus, nur Kopieren und mailto.

## Pakete

| # | Inhalt | Aufwand | Hängt ab von |
|---|---|---|---|
| M0 | Grundlage: `Customer.mailAblauf` (JSON, Voreinstellungen oben), zentrale Funktion je Lead+Vorlage (Kunden-Vorlage oder Standard, Platzhalter, Rahmen: Knöpfe, Anhänge, Signatur, Abmeldelink), zentrale Sperren (Abmeldung, Status, gelöscht, `mailFeaturesOff`, ruhend, Tageslimit), Idempotenz je Lead/Vorlage/Anlass, Mail-Arten. Dialog „E-Mail schreiben“ sendet über `sendeLeadMail` (ohne Postfach über Resend). | 9 h | – |
| M1 | BCC-Kopie (nur Resend-Weg, Bounce der Kopie markiert nicht die Lead-Mail). Komponente „Über die App senden / Im eigenen Mailprogramm öffnen / Text kopieren“ + „Gesendet?“. mailto: `encodeURIComponent`, Umbrüche `%0D%0A`, max. ca. 1.800 Zeichen kodiert, sonst Text in die Zwischenablage und Hinweis im Link; Signatur entfällt im mailto; Anhänge: Link `/ihr-angebot/<token>`, auf dem Handy „PDF teilen“ (Web Share mit Dateien), Desktop „PDF herunterladen“. „Gesendet?“ beim Zurückkehren, „Nein“ ändert nichts. | 8 h | M0 |
| M2 | Antwortadresse mit Eingang (Resend Receiving, Subdomain antwort.dein-beratungstermin.de, MX+DKIM, nur Empfang). `email.received` im Webhook, Inhalt/Anhänge über API, Zuordnung Code → Absender → Kunde, Eingang im Kontaktverlauf, Push, Stopp-Regeln. Eigene Weiterleitung (nicht `receiving.forward`, das setzt kein reply_to): `emails.send` mit Reply-To = Lead. Schutz: Auto-Submitted, Schleifen, Spam, ausführbare Anhänge, Löschung. | 16 h | M0, DNS durch Ole |
| M3 | Termin-Mails mit Bereitlegen-Liste (`bereitlegenListe` aus P2), Komplettcheck-Satz, „im Browser, ohne App“; `terminUnterlagen` entfällt. | 5 h | P2 |
| M4 | Automatisch: nicht_erreicht (Auslöser `call-attempts.ts`, Rückrufzeiten aus Anrufplan), nicht_erschienen (`SEQUENCES.no_show`), nachfassen_angebot (P3-Schritt `email` mit `vorlage`), wie_besprochen (Bedenkzeit). | 9 h | P3, P5 |
| M5 | Angebot + Gesprächszusammenfassung (KI-Entwurf über EU-KI, gekennzeichnet, Gesundheitsangaben nur mit Einwilligung, Ablage als Dokumentart „Beratungsdokumentation“, Ausnahme in `erasure.ts`). | 16 h | P3 |
| M6 | nach_abschluss, unterlagen_fehlen (+ Erinnerung), willkommen, kuendigung (Abgleich `Lead.vorvertraege`), tuer_offen. Konflikt `Lead.followUpAt` mit P7 lösen. | 13 h | P4 |
| M7 | Einstellungen → Assistent → Ablauf → „E-Mails“ (Stufe je Vorlage, BCC, Antwortweg), Nachrichtenplan-Quelle „Mail“ und „Vorschläge“. | 7 h | P6 |
| M8 | Texte Stand 4 (nach_abschluss zeitneutral, `{rueckruf_link}`, Abmeldehinweis), Abmeldelink für Leads, Neuigkeiten, Webseite-Liste, Erklärvideos, Screenshots. | 5 h | je Paket |
| M9 | Erklärschritt „Service-Mails in Ihrem Namen“ (Einstellungen, später Onboarding mit P8). | 9 h | M0, M1 |

Reihenfolge: M0, M1, M9 (Einstellungen), M3, M2, M4, M5, M6, M7; M8 je Paket.

Stand 18.11.2026: M4 und M6 umgesetzt. Mail-Schritte der Abfolgen über `lib/mail/abfolgen-mail.ts` (zentral über
`sendeVorlagenMail`), Begleit-Abfolgen `nicht_erreicht_mail` und `unterlagen` (laufen neben den anderen), Haken mit einem
Tipp über `lib/mail/ein-tipp.ts` (Danke-Mail im Abschluss-Blatt, „Tür offen“ bei „Kein Interesse“), Aufgaben „Alten
Vertrag kündigen“ und „Unterlagen nachfassen“ über `planeAufgabe` (LeadTask). Texte Stand 4: „Nach dem Abschluss“
zeitneutral, „Wie besprochen“ mit `{melde_wann}` („heute“ beim Neustart nach der Bedenkzeit, „am …“ aus dem Dialog).

## M9 Erklärschritt (Sie-Form, freigegeben)

- Überschrift: „Ihre Kunden bekommen jede wichtige Mail. Sie schreiben keine davon.“
- Text: „Terminbestätigung, Erinnerung, ‚Ich habe Sie nicht erreicht‘: Diese Mails schicken wir automatisch in Ihrem Namen. Absender ist Ihr Name, unten steht Ihre Signatur, Antworten landen direkt bei Ihnen. Für Ihre Kunden kommt die Mail von Ihnen.“
- Punkte mit Icon: „Weniger vergessene Termine: Bestätigung mit Kalendereintrag und Erinnerung am Vortag.“ / „Nichts geht verloren: Sie bekommen eine Kopie jeder Mail in Ihr Postfach.“ / „Angebote und Vertragsunterlagen schicken Sie weiter wie gewohnt, auf Wunsch auch aus dem System Ihrer Gesellschaft.“
- Vorschau: echte Terminbestätigung aus denselben Funktionen wie der Versand (`content("booked")`, `leadEmailBody`, `leadSignatur`), Absenderzeile „Name | Agentur“ (`leadAnzeigename`), darunter klein die technische Adresse (`leadMailAdresse`; mit Postfach dessen Adresse).
- Hauptknopf „Ja, Mails in meinem Namen senden“ (Standard an): setzt die Voreinstellungen und BCC an. Zweitlink „Selbst entscheiden je Mail“: Liste automatisch / ein Tipp / aus (dieselbe Liste wie M7).
- Hinweis: „Sie können das jederzeit ändern. Ist Ihr Postfach verbunden, senden wir direkt von Ihrer Adresse.“
- Fehlende Signaturangaben (Name, Agentur, Telefon, Anschrift) vorher abfragen, mit Live-Vorschau (Felder wie `einrichtung/erstinfo-form.tsx`).
- Bei `mailFeaturesOff` anderer Text (nur Kopieren/mailto).
- Screenshots 390 und 1280 px.

## Risiken

Domainruf von dein-beratungstermin.de (DMARC-Überwachung, Bounce-/Abmeldegrenzen); Anzeigename mit fremder Marke kann Spoofing-Filter auslösen; doppelte Nachrichten WA+Mail (Tageslimit, Versatz); ohne M2 stoppt nur eine WA-Antwort das Nachfassen; UWG bei wiederholtem Nachfassen und tuer_offen (Abmeldelink, Standard „ein Tipp“); eingehende Mails/Anhänge mit Gesundheitsdaten (Resend USA, AVV, Löschung, Datenschutzerklärung); Aufbewahrung der Beratungsdokumentation (VVG) vs. Lead-Löschung.
