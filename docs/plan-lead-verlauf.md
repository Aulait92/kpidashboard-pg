# SOLL/IST-Abgleich Lead-Strecke (Stand origin/claude/whatsapp-crm @ 09bbab1, nur gelesen)

Legende Aufwand: S unter 1 h, M 1 bis 3 h, L 3 bis 8 h, XL mehr als 1 Tag. Pfade relativ zu `/home/user/kpidashboard-pg/`.

## 1. Erstkontakt
| Unterpunkt | Status | Fundstelle | Was fehlt oder abweicht | Aufwand |
|---|---|---|---|---|
| WA 1 Text | teilweise | `src/lib/whatsapp/erstanschreiben.ts` `ERSTANSCHREIBEN_V7`, `erstanschreibenText`, `erstanschreibenKopf`; `templates.ts` `PURPOSE_VERSION` (v7) | Im IST steht „zum Thema Privatschutz“ (aus `Lead.source`) statt „zu Haftpflicht und Hausrat“ (aus dem Versicherungsinteresse). Der Nutzen-Halbsatz „und kläre kurz zwei Dinge, damit er Ihnen den passenden Schutz für Ihre Familie zeigen kann“ fehlt. Das Emoji ist in `OutreachProdukt.emoji` angelegt, wird aber nirgends genutzt. Die Frage ist seit v7 bewusst nicht fett, das SOLL zeigt sie fett. Der Wortlaut weicht leicht ab („Sind Haftpflicht und Hausrat schon irgendwo versichert, oder wäre beides neu?“). | M (Code), dazu neue Vorlage v8 je Kunde bei Meta |
| Erste Frage dynamisch | vorhanden | `frageplan`, `ersteFrage`, `vorhandenFrage`, `erstanschreibenV6Params` | – | – |
| WA 2 Erstinfo-PDF | vorhanden | `src/lib/whatsapp/erstinfo-pdf.ts` `sendErstinfoPdf`/`sendErstinfo`, `outreach.ts` | PDF im Vorlagenkopf oder als Nachricht 2 | – |

## 2. Terminvorschlag
| Status | Fundstelle | Abweichung | Aufwand |
|---|---|---|---|
| teilweise | `gespraech.ts` `terminNutzenSatz`, `terminVorschlagText`, `terminKnoepfe`; `bot.ts` `schlageVor`; `termin-vorschlaege.ts` `pickTwoSlots` | Nutzen, Video, Knöpfe und „kein Link“ sind vorhanden. `pickTwoSlots` nimmt aber die früheste Zeit plus die früheste **an einem anderen Tag**, nicht die zwei frühesten Zeiten. Das war eine frühere Entscheidung von Ole (15.11.2026), also vor einer Änderung bei ihm nachfragen. | S |

## 3. Buchung
| Unterpunkt | Status | Fundstelle | Abweichung | Aufwand |
|---|---|---|---|---|
| Sofort reservieren, E-Mail bestätigen | teilweise | `bot.ts` `buche`, Knopf-Buchung (`opts.knopfZeit && knownEmail`); `gespraech.ts` `terminRegeln`, `einladungAnText` | Bei bekannter E-Mail wird sofort gebucht und die Adresse genannt. Ist sie unbekannt, fragt der Assistent erst danach und bucht dann (keine sofortige Reservierung). | S |
| WA-Bestätigung mit Link und Satz „reserviert … nur für Sie“ | teilweise | `gespraech.ts` `buchungsText`, `BUCHUNG_VERBINDLICH` | Der Link ist dabei. Der Text lautet „hält sich diese Zeit nur für Sie frei und bereitet Ihre Beiträge vorab vor“ statt „reserviert diese Zeit nur für Sie“. | S |
| E-Mail: .ics | vorhanden | `src/lib/calendar/lead-email.ts` `sendLeadEmailInner` (Anhang plus Knöpfe) | – | – |
| E-Mail: Videolink „im Browser, ohne App“ | teilweise | `lead-email.ts` `content()` | Der Link ist drin, der Hinweis „funktioniert im Browser, ohne App“ fehlt. In der WA steht er schon. | S |
| E-Mail: Verschieben-Link | vorhanden | `lead-email.ts` (`manageUrl`) | – | – |
| E-Mail: Signatur | teilweise | `lead-email.ts` | Nur „Viele Grüße, Name“. Agentur, Anschrift, Telefon und Erstinfo-Link fehlen. Der Name ist der volle Name (`advisorPerson`), nicht „Herrn Kannapinn“. | M (siehe Punkt 14) |
| E-Mail: Link zur Erstinformation | teilweise | `lead-email.ts` `erstinfoAnhang`, `erstinfoMailZeile` | Es gibt nur den PDF-Anhang, und der nur bei vollständiger Erstinfo. Ein Link fehlt (`erstinfoUrlFor` gibt es schon). | S |

## 4. Komplettcheck
| Unterpunkt | Status | Fundstelle | Abweichung | Aufwand |
|---|---|---|---|---|
| Direkt nach der Buchung, vor den Angebotsfragen | teilweise | `bot.ts` (gebucht-Zweig, ca. Z. 1150 bis 1190); `termin-strecke.ts` `komplettcheckAntwort`, `vertraegeAntwort`, `sendeAbschluss`, `runStreckeAbschliessen` | Die Reihenfolge im IST ist umgekehrt: erst Angebotsfragen, dann Komplettcheck, dann Abschluss. Nach der Antwort auf den Komplettcheck müssten die Angebotsfragen folgen, nicht der Abschluss. Dafür muss der 1-h-Rückfall `runStreckeAbschliessen` angepasst werden. | M |
| Ja: Vertragsfrage und Policen-Einladung | vorhanden | `gespraech.ts` `vertragsFrage`; `termin-strecke.ts` `vertraegeAntwort`; `lib/policen/assistent` | – | – |
| Ja: Im Schutz-Überblick | teilweise | `src/lib/schutz-ueberblick.ts` `schutzVorschlag`; `tarifauswahl-server.ts` Z. 151 | `Lead.vorvertraege` erscheint nur als Karte „Bestehende Verträge“. Er fließt nicht als „woanders“ in die Ampel ein, und das Kennzeichen `komplettcheck` wird dort nicht genutzt. | M |
| Ja: Vortags-Erinnerung „Legen Sie gern Ihre bestehenden Verträge bereit.“ | fehlt | `src/lib/whatsapp/reminders.ts` `runReminders` | Fehlt in Freitext und Vorlage (die Vorlage braucht eine neue Fassung). | S (Freitext), dazu eine Vorlage |
| Ja: auf 45 Min verlängern, sonst Hinweis | fehlt | `lib/calendar/index.ts` (Dauer und Verschieben vorhanden, `durationMin`) | Frei/Belegt prüfen, Termin und Kalenderereignis verlängern, aktualisierte Einladung schicken. Ist der Kalender belegt, eine Aufgabe oder einen Push an den Vermittler. | M |

## 5. Angaben fürs Angebot
| Status | Fundstelle | Abweichung | Aufwand |
|---|---|---|---|
| vorhanden | `src/lib/preise/rechner-angaben.ts` `RECHNER_ANGABEN` (haftpflicht: geburt, familienstand, plz, oeffentlicherDienst; hausrat: plz, wohnflaeche, geburt), `folgefragen`, `folgefrageText`; `gespraech.ts` `nachBuchungRegel` | Nebenbefund: Rechtsschutz fragt `lebensbereiche`, der Prompt sagt aber „keine Lebensbereiche“. Das ist ein Widerspruch. | S |

## 6. Abschluss der Strecke
| Unterpunkt | Status | Fundstelle | Abweichung | Aufwand |
|---|---|---|---|---|
| Bereitlegen: Geburtsdaten der Mitversicherten | teilweise | `gespraech.ts` `bereitlegenListe` | Kommt nur bei Unfall plus Familie, nicht bei Haftpflicht/Hausrat plus Familie. | S |
| Bereitlegen: IBAN | vorhanden | dto. | – | – |
| Bereitlegen: Verträge nur bei Komplettcheck | teilweise | dto., `mitPolicenHinweis` | „Ihre bisherigen Policen, falls vorhanden“ steht immer als erster Punkt, auch ohne Komplettcheck. | S |
| Kalenderfrage, „Ja“ gilt als zugesagt | vorhanden | `abschlussText`, `KALENDER_KNOEPFE`, `kalenderAntwort` | – | – |

## 7. Erinnerungen
| Unterpunkt | Status | Fundstelle | Abweichung | Aufwand |
|---|---|---|---|---|
| Vortag WA (Nutzen, Link, „Passt es weiterhin?“, Knöpfe) | teilweise | `reminders.ts` `runReminders`, `reminderDue`; Vorlage `templates.ts` `reminder` | Läuft 24 h vorher (bei kurzfristiger Buchung 2 h vorher), nicht am Vortag. Ein Nutzensatz fehlt. Die Frage lautet „Passt der Termin für Sie?“. Die Vorlage sagt „Termin bei [Firma]“, der Freitext nennt den vollen Namen, nicht „Herrn Kannapinn“. Die Knöpfe sind vorhanden. | M, dazu eine Vorlage |
| Vortags-E-Mail (Betreff, Link, Verschieben, Signatur) | teilweise | `lead-email.ts` `content("reminder")` | Der Betreff lautet „Erinnerung: Ihr Termin mit Susanne Meier, Mittwoch, 18. November um 10:00 Uhr“ statt „Morgen um 10 Uhr: Ihr Videotermin mit Herrn Kannapinn“. Die Signatur ist unvollständig (siehe Punkt 14). | S (Text), M mit Signatur |
| 1 h vorher WA | vorhanden | `reminders.ts` `runSoonReminders` (`SOON_MS` = 1 h), Vorlage `reminder_soon` | Entfällt, wenn erst unter 3 h vorher gebucht wurde. | – |
| 15 Min vorher WA mit Link | fehlt | – | Neuer Lauf, eigenes Merkerfeld am Termin, Vorlage. | M, dazu eine Vorlage |
| Push „Ist Frau Becker da?“, dann „Fehlt noch“, dann WA „wartet im Videoraum“ | fehlt | `src/lib/push.ts` (`PushPayload` hat keine Aktionsknöpfe), `public/sw.js` | Der Push braucht einen Deep-Link auf ein Entscheidungsblatt (die Knöpfe in nativen und Web-Pushes fehlen). Dazu die WA-Vorlage „wartet“ und den Zustand am Termin. | L |
| No-Show-Rettung | teilweise | `today-inbox.tsx` „Nicht erschienen“ (manuell), `inbox-actions.ts` Z. 234, dann `lead-sequences.ts` `SEQUENCES.no_show` (WA Tag 0, Anruf Tag 2) | Läuft nur manuell, nichts wird automatisch erkannt. Der Auftrag dazu liegt mir nicht vor. | L (Teil des Show-up-Pakets) |

## 8. Angebot nach dem Termin
| Unterpunkt | Status | Fundstelle | Abweichung | Aufwand |
|---|---|---|---|---|
| „Angebot ablegen“ landet unter Dokumente am Kontakt | vorhanden | `src/app/buyer/termine/[id]/vorbereitung/neu-client.tsx` `ablegen` (`/api/buyer/leads/{id}/dateien?kind=angebot`) | – | – |
| „Angebot senden“ (Kundenlink plus PDF, WA und E-Mail, Text) | fehlt | Bausteine: `praesentation/kundenlink.tsx` (nur Kopieren), `src/app/beratung/[token]/` mit `pdf/route.ts`, `termin-vorbereitung-server.ts` `kundenlinkErstellen` | Es gibt keinen Versand an den Lead. „Genau diese Fassung“ ist unklar: Gemeint sein kann das abgelegte Gesellschafts-PDF oder Kundenlink und PDF der Präsentation. Bei Ole klären. | L |
| Kombi-Rabatt nur, wenn berechnet | teilweise | `src/lib/kombi-rabatt.ts` (Berechnung vorhanden) | Der Bedingungstext im Versand fehlt. | S |
| Heute-Aufgabe „Angebot ablegen und senden“ mit Hinweis | fehlt | `src/lib/inbox.ts`, `today-inbox.tsx` („Wie lief der Termin?“: „Angebot gesendet“ setzt nur den Status) | Fehlt. Heute startet „Angebot gesendet“ das Nachfassen sofort, auch ohne Versand. | M |
| Sichtbarkeit „abgelegt“ und „gesendet“ in Terminvorbereitung und Kontakt | teilweise | Dateien `kind=angebot`; `Lead.status` | Es gibt kein Kennzeichen „abgelegt am“ oder „gesendet am“ an Termin oder Kontakt. | M |
| Nachfassen Tag 2 WA, Tag 5 Mail mit [Rückruf], Tag 10 WA, danach Anruf | teilweise | `lead-sequences.ts` `SEQUENCES.offer` (Tag 3 WA, Tag 7 Anruf), `runSequences`, `sendStep` | Andere Taktung. Die Abfolgen kennen keinen E-Mail-Schritt (Aktionen nur `whatsapp` und `call`), eine letzte WA fehlt. Start nur über den Status „Angebot gesendet“. | M |
| Abbruch bei Antwort, Abschluss, Absage oder STOPP | vorhanden | `stopReasonFor`, `onLeadStatus` | – | – |

## 9. Abschluss vom Vermittler
| Unterpunkt | Status | Fundstelle | Abweichung | Aufwand |
|---|---|---|---|---|
| Push am Vorabend jedes Angebots-Nachfassens mit Knöpfen | fehlt | `push.ts` | Neuer Lauf, Push ohne Knöpfe, daher Deep-Link auf ein Blatt mit „Abschluss eintragen / Pausieren / Passt so“. | M |
| Kunde schreibt „schon unterschrieben“ | fehlt | `bot.ts` (keine passende Werkzeug-Funktion) | Werkzeug oder Erkennung nötig: Nachfassen stoppen, Push oder Aufmerksamkeit an den Vermittler, Abschluss mit einem Tipp. | M |
| Abschluss aus Push und Heute | teilweise | `today-inbox.tsx` `askWin`, dann `appointmentOutcomeResult(…,"closed")` | Auf Heute geht es nur bei Terminen ohne Ergebnis und bei Rückruf-Aufgaben, mit Abfrage von Wert und Sparte (also nicht „ein Tipp“). Aus dem Push geht es nicht. | M |

## 10. Rückruf wünschen
| Unterpunkt | Status | Fundstelle | Abweichung | Aufwand |
|---|---|---|---|---|
| Seite, Bestätigung, Push und Aufgabe mit Zeitfenster, Nachfassen pausiert | fehlt | Nur `mail/platzhalter.ts` `rueckrufZeiten` (Platzhalter für manuelle Mails) | Komplett neu: öffentliche Seite mit Token, drei Fenster, Bestätigungstext, Push, Wiedervorlage mit Fenster, `LeadSequence` pausieren oder neu planen. | L |

## 11. Bedenkzeit
| Unterpunkt | Status | Fundstelle | Abweichung | Aufwand |
|---|---|---|---|---|
| Erkennen und antworten | teilweise | `bot.ts` Werkzeug `schedule_followup`; `lead-sequences.ts` `scheduleBotRecall` | Die KI erkennt „später melden“ allgemein. Ohne Datum gibt es keinen Standard von 14 Tagen. Die Antwort formuliert die KI frei. | M |
| Nachfassen ab dem Datum neu | teilweise | `SEQUENCES.recall` | `recall` beendet die Angebots-Abfolge und schickt danach eine allgemeine Nachricht. Außerhalb des Fensters geht sie als Vorlage `followup` **mit Terminvorschlägen** raus, das passt im Angebotsstand nicht. Die Angebots-Abfolge startet danach nicht neu. | M |
| Pause in der Akte sichtbar | vorhanden | `src/components/lead-sequence-card.tsx` („Wiedervorlage vom Assistenten: …“) | – | – |

## 12. Abschluss
| Unterpunkt | Status | Fundstelle | Abweichung | Aufwand |
|---|---|---|---|---|
| WA plus E-Mail „Herzlichen Glückwunsch …“ | fehlt | – | Fehlt (außerhalb des 24-h-Fensters braucht es eine Vorlage). | M |
| Bewertungsbitte nach 14 Tagen, nur mit Modul | teilweise | `src/lib/empfehlung/requests.ts` `scheduleReviewRequests`/`sendDueReviews`; `empfehlung/shared.ts` `DEFAULT_DELAYS.review = 7`, `EMPFEHLUNG_MODULE_AVAILABLE = false` | Standard ist 7 statt 14 Tage. Das Modul ist ausgeblendet. | S |
| Cross-Selling-Aufgabe aus dem Schutz-Überblick, Wiedervorlage 3 Monate | teilweise | `src/lib/vertraege.ts` `runCrossSellReminders`, `crossSellNote`, `lueckenAusTermin` (`CROSS_SELL_AFTER_DAYS = 21`) | Lücken aus `tarifauswahl.schutz` sind drin, aber nach 21 Tagen statt 3 Monaten. Die Aufgabe entfällt, wenn gerade eine andere Wiedervorlage offen ist (Zeitfenster nur 7 Tage). | S |

## 13. Nächste Nachrichten sichtbar
| Unterpunkt | Status | Fundstelle | Abweichung | Aufwand |
|---|---|---|---|---|
| Bereich am Kontakt (Zeit, Kanal, Vorschau; Jetzt senden, Verschieben, Überspringen, Alle pausieren) | teilweise | `lead-sequence-card.tsx`, `lead-sequences.ts` `loadLeadSequences`, `LeadSequenceStop` | Es gibt nur den nächsten Schritt einer Abfolge („WhatsApp“ oder „Anruf-Aufgabe“) und „stoppen“. Termin-Erinnerungen fehlen, eine Vorschau fehlt, Jetzt, Verschieben und Überspringen fehlen. „Stoppen“ hält Erinnerungen nicht an. | L |
| Heute: „Morgen gehen X automatische Nachrichten raus“ | fehlt | `lib/inbox.ts` | Fehlt (braucht dieselbe Planberechnung). | M |
| Assistent-Einstellungen: Übersicht „Ablauf“ | teilweise | `/buyer/vorlagen` (Vorlagen mit „wann“ aus `template-plan.ts`), `/buyer/einstellungen/erinnerungen` | Es gibt keine durchgehende Ablaufübersicht mit Zeitpunkten. „Automatisch nachfassen“ (`followUpSequencesEnabled`) ist nur im Admin schaltbar. | M |

## 14. Absender der E-Mails
| Unterpunkt | Status | Fundstelle | Abweichung | Aufwand |
|---|---|---|---|---|
| Postfach verbunden, dann von seiner Adresse | teilweise | `src/lib/mail/postfach.ts` `sendViaPostfach`; genutzt in `kein-whatsapp.ts`, Kampagnen und manuellen Mails | Termin-Mails (Bestätigung, Erinnerung, Absage) laufen immer über Resend (`lead-email.ts`), nie über das Postfach. | M |
| Sonst Versanddomain mit „Vorname Nachname \| Agentur“, Reply-To an den Vermittler | teilweise | `lead-email.ts`, `kein-whatsapp.ts` | Reply-To und neutrale Domain sind vorhanden. Der Anzeigename ist nur die Person, ohne Agentur. | S |
| Signatur (Name, Agentur, Anschrift, Telefon, Erstinfo-Link) | teilweise | `User.mailSignature` (nur Postfach) | Für Resend-Mails gibt es keine Signatur aus den Anbieterangaben. | M |
| Keine fremde Domain im Absender | vorhanden | `lead-email.ts` (ohne `BOOKING_EMAIL_FROM` wird bewusst nicht gesendet) | – | – |

---

## Umsetzungsplan (Pakete, Reihenfolge)

| # | Paket | Inhalt (Punkte) | Aufwand |
|---|---|---|---|
| P0 | **Lead-Mail-Baustein** (vor dem Show-up-Paket) | Ein Versandweg für alle Mails an Leads: erst Postfach, sonst Resend mit „Name \| Agentur“ und Reply-To. Signatur aus den Anbieterangaben mit Erstinfo-Link. Vermittler als „Herr/Frau Nachname“ wie `vermittlerName`. Bestätigungs-Mail ergänzen (Browser-Hinweis, Erstinfo-Link). (3, 14) | L (ca. 5 h) |
| P1 | **Show-up-Paket** (geplant) | Vortags-WA neu (Nutzen, „Passt es weiterhin?“, Komplettcheck-Satz). Vortags-Mail mit Betreff „Morgen um …“. 15-Min-WA. Push „Ist X da?“ mit Entscheidungsblatt (Deep-Link), WA „wartet im Videoraum“, No-Show-Rettung. 45-Min-Verlängerung. Alle neuen Meta-Vorlagen gesammelt einreichen. Datenfunktion „Nachrichtenplan“ (alle geplanten Nachrichten je Lead) gleich mit anlegen. (7, 4c/4d, 13-Basis) | XL (ca. 2 Tage) |
| P2 | **Strecke nach der Buchung** | Komplettcheck vor die Angebotsfragen, Rückfall-Lauf anpassen. Bereitlegen-Liste korrigieren. Schutz-Überblick aus `vorvertraege`. WA-Bestätigungstext anpassen, sofort reservieren auch ohne E-Mail. Erstanschreiben v8 und Wahl der zwei frühesten Zeiten nur nach Klärung mit Ole. (1, 2, 3, 4, 6) | L (ca. 6 h) |
| P3 | **Angebot senden und nachfassen** | „Angebot senden“ (WA und Mail, Link plus PDF, Kombi-Rabatt nur, wenn berechnet). Kennzeichen „abgelegt“ und „gesendet“. Heute-Aufgabe nach dem Termin. Abfolge `offer` neu mit Tag 2, 5, 10 und Anruf, dafür eine neue Schrittart `email`. Start erst beim Senden, das Blatt „Wie lief es?“ entsprechend umbauen. (8) | XL (ca. 1,5 bis 2 Tage) |
| P4 | **Abschluss erkennen und melden** | Vorabend-Push mit Blatt (nutzt das Blatt aus P1). Bot-Werkzeug „schon abgeschlossen“. Abschluss mit einem Tipp. Glückwunsch per WA und Mail. (9, 12a) | L (ca. 7 h) |
| P5 | **Rückruf und Bedenkzeit** | Öffentliche Rückruf-Seite, Push und Aufgabe mit Zeitfenster, Abfolge pausieren. Bedenkzeit mit Standard 14 Tage und Neustart der Angebots-Abfolge, ohne Terminvorschlags-Vorlage. (10, 11) | L bis XL (ca. 9 h) |
| P6 | **Nächste Nachrichten sichtbar** | Kontakt-Bereich mit Aktionen, Zeile auf Heute, Ablaufübersicht in den Einstellungen, alles auf dem Nachrichtenplan aus P1. „Alle pausieren“ hält auch Erinnerungen an. (13) | XL (ca. 1,5 Tage) |
| P7 | **Nach dem Abschluss** | Bewertung nach 14 Tagen, Cross-Selling nach 3 Monaten (Sperre durch offene Wiedervorlage entschärfen). (12b/c) | S bis M (ca. 1,5 h) |

**Gesamt: etwa 65 bis 80 Stunden, also 8 bis 10 Personentage.** Hinzu kommen die Wartezeit auf die Meta-Freigabe je Kunden-Konto, eine Neuaufnahme des Erklärvideos „Ausführlich“ (Heute „Wie lief es?“ und die Terminvorbereitung ändern sich, ca. 3 bis 4 h) und Neuigkeiten-Einträge laut AGENTS.md.

**Überschneidungen mit dem Show-up-Paket:**
- P0 liefert Absender, Signatur und Betreffzeilen der Vortags-Mail. Deshalb P0 vorziehen.
- Punkt 4c (Satz zu den Verträgen in der Vortags-Erinnerung) und 4d (45 Min) gehören in P1.
- Das Push-Entscheidungsblatt aus P1 („Ist X da?“) wird in P4 (Vorabend-Push) und P5 (Rückruf-Push) wiederverwendet.
- Die neue Schrittart `email` und die neue Taktung der Abfolgen (P3) nutzen auch die No-Show-Abfolge.
- Den Nachrichtenplan (P6) beim Bau der Erinnerungen in P1 gleich mitdenken, sonst werden die Erinnerungen doppelt gebaut.
- Alle neuen Meta-Vorlagen (v8 Erstanschreiben, Vortag, 15 Min, Videoraum, Angebot, Nachfassen, Glückwunsch) in **einem** Einreichungslauf bündeln (`template-plan.ts`, `template-submit.ts`).

## Risiken und Widersprüche zu bestehenden Regeln
1. **24-h-Fenster:** Vortags-WA, 15-Min-WA, Videoraum-WA, Angebot senden, Nachfassen an Tag 2 und 10, Glückwunsch und Rückruf-Bestätigung laufen meist außerhalb des Fensters. Jede braucht eine freigegebene Vorlage **je Kunden-Konto**. Nachfassen, Glückwunsch und Bewertung stuft Meta voraussichtlich als Marketing ein: Das kostet mehr, und 131050 (Marketing abbestellt) sperrt den Kontakt. Fehlt eine Vorlage, gilt die bisherige Regel: Anruf-Aufgabe statt WA (`NoTemplateError`).
2. **Erstanschreiben v8:** Der feste Text „kläre kurz zwei Dinge“ stimmt nicht, wenn das Formular schon alles bis auf eine Frage beantwortet (`MAX_FRAGEN_VOR_TERMIN`). Die Wortwahl muss neutral sein. Die fette Frage widerspricht der v7-Entscheidung von Ole (17.11.2026). Kein Platzhalter am Textende (Meta-Regel).
3. **Sie-Form in der Vermittler-Oberfläche:** Der SOLL-Hinweis „Das Nachfassen zum Angebot startet erst, wenn **du** es hier sendest“ verstößt gegen AGENTS.md („Oberfläche für Vermittler bleibt Sie-Form“). Richtig wäre „wenn Sie es hier senden“.
4. **Keine Gedankenstriche, Sie/Du:** Alle neuen Lead-Texte brauchen beide Fassungen über `a(an, du, sie)`. Für den Vermittler gilt im Du der Vorname („Ole“ statt „Herr Kannapinn“). `tests/unit/gedankenstriche.test.ts` prüft feste Texte. Termin-Mails und Erinnerungen nennen heute den vollen Namen bzw. „[Firma]“, nicht „Herrn Kannapinn“. Das muss überall einheitlich werden (über `vermittlerName`).
5. **Keine Versprechen:** „Ihre Familie ist jetzt … abgesichert“ ist eine Eignungsaussage. „Unterlagen kommen in den nächsten Tagen“ verspricht etwas für die Gesellschaft. Beides abschwächen. Kombi-Rabatt mit „%“ würde in Bot-Texten von `beratungs-sperre.ts` geblockt. Er darf nur im vom Vermittler ausgelösten App-Versand stehen. Folgefragen des Leads zum Angebot gehen an den Vermittler.
6. **E-Mail-Absender:** Es gilt weiter keine fremde Domain. „Name \| Agentur“ nur als Anzeigename auf unserer Domain, die Adresse des Vermittlers nur über das verbundene Postfach (OAuth oder SMTP).
7. **Komplettcheck vorziehen:** Die Kette bis zu den Angebotsfragen wird länger (Komplettcheck, Verträge, Policen-Einladung). Der 1-h-Rückfall `runStreckeAbschliessen` würde sonst den Abschluss schicken, obwohl Angebotsfragen offen sind.
8. **45-Min-Verlängerung:** Der Lead hat schon eine .ics. Es braucht eine Aktualisierungs-Mail und Schreibzugriff auf den externen Kalender. Ist der Kalender belegt, nur ein Hinweis an den Vermittler.
9. **„Abschluss mit einem Tipp“:** Heute fragt `askWin` Wert und Sparte ab, das brauchen Provision, Zahlen und Meta-Rückmeldung. Vorschlag: erst ein Tipp, Wert danach freiwillig.
10. **Bedenkzeit über `recall`:** Die Vorlage `followup` hängt Terminvorschläge an und passt nicht zum Angebotsstand. Außerdem stoppt jede Antwort des Leads die Angebots-Abfolge.
11. **Cross-Selling 3 Monate** widerspricht den bisher festgelegten 21 Tagen, das bei Ole bestätigen. Die Police-Aufgabe (14 Tage) kann über `followUpAt` die Cross-Selling-Aufgabe verdrängen.
12. **Empfehlungen und Bewertungen** sind ausgeblendet (`EMPFEHLUNG_MODULE_AVAILABLE = false`). Sie dürfen in keinem Erklärvideo und nicht auf der Webseite vorkommen.
13. **Erklärvideos:** Werden „Wie lief es?“, Heute oder die Terminvorbereitung umgebaut, muss das Video „Ausführlich“ neu aufgenommen werden (`tools/erklaervideos/README.md`). Das Deployen nur außerhalb werktags 8 bis 20 Uhr.
14. **Offene Fragen an Ole:** Was ist mit „genau diese Fassung“ beim Angebot gemeint (Gesellschafts-PDF oder Kundenlink und Präsentations-PDF)? Wie lautet der No-Show-Auftrag? Sollen es die zwei frühesten Zeiten sein oder eine pro Tag? Bleibt es bei 3 Monaten statt 21 Tagen?

Im Repo wurde nichts geändert.

---

## Ergänzungen von Ole (17.11.2026, 18:28 Uhr), in die Pakete eingeordnet

- **A) Lead antwortet nicht** (neu, ins Paket P1, nutzt die bestehende Anrufliste für Leads ohne Erstanschreiben):
  - 30 Min nach dem Erstanschreiben ohne Antwort (in den Geschäftszeiten des Vermittlers, sonst zu Arbeitsbeginn am nächsten Morgen): Push „Frau Becker hat noch nicht geantwortet. Jetzt anrufen?“ und Eintrag auf der Anrufliste.
  - Tag 2: WA-Nachfassen und erneut die Aufgabe „Anrufen“.
  - Tag 5: letzte WA, danach Status „kein Kontakt“. Abbruch bei Antwort oder STOPP.
- **B) Angebot, zwei Wege** (P3):
  - „Über die App senden“: Upload nötig, also das abgelegte PDF. Damit ist Frage 1 beantwortet.
  - „Habe ich selbst gesendet“: ein Tipp, Upload optional. Nachfassen nur per WA mit dem Text „das Angebot, das Herr Kannapinn Ihnen geschickt hat“, keine Angebots-Mail.
- **C) Nachfassen zum Angebot** (P3): Tag 2 WA, Tag 3 Anruf-Aufgabe plus Push „Frau Becker anrufen: Fragen zum Angebot?“, Tag 5 Mail mit Rückruf-Link, Tag 10 WA, danach Anruf-Aufgabe. Vorab-Check-Push vor jedem automatischen Nachfassen.
- **D) Glückwunsch** (P4): nicht automatisch und nicht per Mail. Beim Eintragen des Abschlusses der Haken „Glückwunsch per WhatsApp senden“, vorausgewählt nur, wenn der Termin höchstens 3 Tage zurückliegt. Text: „Schön, dass Sie sich für Ihren neuen Schutz entschieden haben, Frau Becker! Bei Fragen erreichen Sie Herrn Kannapinn jederzeit hier.“ Damit ist Frage 5 beantwortet.
- **E) Onboarding** (neues Paket P8, nach P6, weil es den Nachrichtenplan und die Texte daraus nutzt):
  - Schritt „So arbeitet dein Assistent“: Zeitleiste mit drei Spuren und den 5 Momenten für den Vermittler plus den Anruf-Momenten.
  - Beispielverlauf in WhatsApp-Optik (eigene Komponente) aus denselben Texten wie der Assistent, im gewählten Produkt, in der eingestellten Ansprache und mit dem Namen des Vermittlers.
  - Dauerhaft erreichbar unter Einstellungen → Assistent → Ablauf.
  - Screenshots 390 und 1280 px. Aufwand ca. 1 bis 1,5 Tage.

Neue Summe: etwa 10 bis 12 Personentage. Noch offen bei Ole: Fragen 2 (zwei früheste Zeiten), 3 (Cross-Selling 3 Monate), 4 (Frage fett) und 6 (Sie-Form in der Vermittler-Oberfläche).

## Entscheidungen Ole (17.11.2026, abends)

1. **Angebot senden:** Der Vermittler entscheidet. Vorausgewählt ist das abgelegte PDF der Gesellschaft. Gibt es einen Kundenlink zur Beratungspräsentation, kann er ihn optional mitsenden.
2. **Terminvorschlag:** bleibt die früheste Zeit plus die früheste an einem anderen Tag (zwei Tage).
3. **Cross-Selling:** Empfehlung 6 Wochen nach dem Abschluss (siehe Rückmeldung), Entscheidung Ole offen.
4. **Erste Frage im Erstanschreiben:** nicht fett (bleibt wie v7).
5. **Glückwunsch:** Text laut Ergänzung D, einverstanden.
6. **Vermittler-Oberfläche:** Sie-Form („wenn Sie es hier senden“).

## Korrektur zu A (Ole, 17.11.2026, 18:34 Uhr)

Es kommt **keine eigene Anruf-Logik**. Es gilt der bestehende Anrufplan aus `src/lib/call-plan.ts`: 6 Versuche über mindestens 3 Tage, „Anrufversuch X von 6“ auf Heute, der Verlustgrund „nicht erreichbar“ erst nach 6 Versuchen.

- **Auslöser:** Antwortet der Lead 30 Min nach dem Erstanschreiben nicht (in den Geschäftszeiten), startet der Anrufplan. Versuch 1 kommt als Push „Frau Becker hat noch nicht geantwortet. Jetzt anrufen?“ mit Anruf-Knopf.
- **WA-Nachfassen:** mit der bestehenden Nicht-erreicht-Abfolge (`lead-sequences.ts`) abstimmen, nicht doppeln. Antwortet der Lead im Chat, stoppt der Anrufplan.
- **Entfällt:** „Tag 2 / Tag 5 / Status kein Kontakt“ aus A.
- **Anzeige:** Onboarding-Grafik und „Nächste Nachrichten“ zeigen den 6er-Plan.

## Entscheidungen Ole (17.11.2026, ab 20 Uhr)

- **P2 Reihenfolge nach der Buchung:** Buchungsnachricht → Komplettcheck-Frage (nur Ja/Nein-Knopf) → fehlende Angaben fürs Angebot → bei Ja: Vertragsfrage und Policen-Einladung → Abschluss mit Bereitlegen und Kalenderfrage. Rückfall `runStreckeAbschliessen`: kein Abschluss, solange Angebotsfragen offen sind.
- **P2 Policen-Bitte immer:** Jeder Lead bekommt genau einmal die Bitte, Verträge zu schicken. Bei Komplettcheck = Ja die volle Bitte (alle Verträge, Policen-Einladung). Bei Nein oder ohne Antwort eine enge, freiwillige Fassung in der Abschlussnachricht, nur der Vertrag in der angefragten Sparte („Falls Sie schon eine … haben: Schicken Sie mir gern ein Foto der Police, dann vergleiche ich direkt und achte auf die Kündigungsfrist.“). Test: jeder Pfad genau eine Bitte.
- **P3 Mails aus Vorlagen:** `angebotMail` und `nachfassMail` holen den Text aus `src/lib/mail/vorlagen.ts` (`angebot`, `nachfassen_angebot`; Kunden-Vorlage, sonst Standard). Schrittart `email` in `lead-sequences.ts` mit `vorlage: VorlageKey`. Platzhalter `{rueckruf_link}` in `platzhalter.ts`.
- **Mail-Vorlagen in der Journey (M0 bis M9):** Plan in `docs/plan-mail-vorlagen.md`. Entscheidungen: Weiterleitungsadresse nicht bei verbundenem Postfach; Terminlink in Mails erlaubt; KI-Zusammenfassung als gekennzeichneter Entwurf (EU-KI); automatische Mails auch für Allianz-Vertreter über dein-beratungstermin.de mit Weiterleitungsadresse; Mail 2 h nach der WA, entfällt bei Antwort, höchstens eine automatische Mail je Lead und Tag. Erklärschritt in Sie-Form mit den abgeschwächten Formulierungen. Start M0, M1, dann M9 (nur Einstellungen).
