# Menü entschlacken: Vorschlag „alt → neu“ (25.11.2026)

Grundlage: wöchentlicher Usability-Check vom 25.11.2026, Abschnitt 3 „Menü und Begriffe“. **Nur Vorschlag, nichts
umgesetzt. Ole entscheidet.** Ziel: Profilmenü und Einstellungen zusammen höchstens etwa 12 Einträge, keine Dubletten,
ein Hilfe-Einstieg, einheitliche Begriffe.

## 1. Profilmenü (heute 9 Einträge plus 3 Rechtslinks)

Fundstelle: `src/components/buyer-shell.tsx` (Profilmenü ab etwa Zeile 370, Rechtslinks etwa Zeile 485).

| Alt | Neu | Grund |
|---|---|---|
| Einrichtung (nur bei offener Einrichtung) | bleibt | Steht auch in der Seitenleiste, im Profil nur solange offen; Kandidat zum Streichen, wenn die Seitenleiste reicht |
| Einstellungen | bleibt | Einstieg zu allen Einstellungen |
| Abwesenheit ändern | bleibt | Häufig, mit einem Klick erreichbar |
| Etwas unklar? Feedback | wandert in „Hilfe“ | Drei Hilfe-Wege (Seitenleiste „Hilfe“, Feedback, Einführung) zu einem |
| Einführung ansehen | wandert in „Hilfe“ (oben als „Einführungsvideo“) | wie oben |
| Neuigkeiten | bleibt (mit Punkt bei Ungelesenem) | |
| Empfehlungen (Modul) | bleibt nur bei aktivem Modul | Modul derzeit ausgeblendet |
| Kollegen empfehlen | bleibt nur hier | Dublette, siehe Einstellungen „Mehr“ |
| Abmelden | bleibt | |
| Impressum, Datenschutz, Sicherheit | nur noch im Fuß der Einstellungen | Dublette (Profilmenü und Fuß der Einstellungen, `src/app/buyer/einstellungen/page.tsx` etwa Zeile 140) |

Neu im Profilmenü: Einstellungen, Abwesenheit, Neuigkeiten, Kollegen empfehlen, (Empfehlungen), Abmelden, (Einrichtung) =
**5 bis 7 Einträge**.

## 2. Hilfe: ein Einstieg statt drei

| Alt | Neu |
|---|---|
| „Hilfe“ in Seitenleiste bzw. oben am Handy (`buyer-shell.tsx`, Hilfe-Chat `src/components/hilfe-chat.tsx`) | bleibt der einzige Einstieg |
| „Etwas unklar? Feedback“ im Profilmenü (`buyer-shell.tsx` etwa Zeile 428) | im Hilfe-Fenster unten: „Etwas unklar? Feedback geben“ |
| „Einführung ansehen“ im Profilmenü (`/buyer/einfuehrung`) | im Hilfe-Fenster oben: „Einführungsvideo (3 Minuten)“ |

## 3. Einstellungen (heute 15 Punkte in 6 Gruppen)

Fundstelle: `src/app/buyer/einstellungen/page.tsx` (Gruppen ab etwa Zeile 42).

| Alt (Gruppe › Eintrag) | Neu | Grund |
|---|---|---|
| Mein Konto › Konto & Rechnungen | **Konto & Vertrag** (Vertrag, Zahlung, Rechnungen, Werbebudget, Produkte, Pause, Ihre Daten) | Vertragsdinge an einem Ort; heute verweist das Konto mit „Unter Wachstum“ weg (`src/app/buyer/konto/page.tsx` etwa Zeile 319–326) |
| Mein Konto › Team | bleibt | |
| Mein Konto › Anmeldung & Sicherheit | bleibt | |
| Kunden ansprechen › Assistent | bleibt | |
| Kunden ansprechen › Erinnerungen & Aufgaben | bleibt | |
| Kunden ansprechen › E-Mail-Postfach | bleibt | |
| Termine und Zahlen › Mein Kalender | bleibt | |
| Termine und Zahlen › Präsentation | bleibt (nur Inhaber) | |
| Termine und Zahlen › Meine Provisionen | bleibt | |
| Termine und Zahlen › Rückmeldung an Meta | als Schalter in „Assistent“ oder unter „Datenschutz & Daten“, Titel „Anzeigen aus Ergebnissen lernen lassen“ | „Meta“ ist für Vermittler ein technischer Begriff |
| Schalter Beratungsdokumentation (ohne Unterseite) | in „Assistent“ | Schalter ohne Unterseite gehören zum Thema |
| KI-Hilfe und Anzeigenlernen | Gruppe **Datenschutz & Daten** | |
| Schalter Nutzungsanalyse (ohne Unterseite) | Gruppe **Datenschutz & Daten** | |
| Support-Zugriffe | Gruppe **Datenschutz & Daten** | |
| Mehr › Kollegen empfehlen | entfällt | Dublette, steht im Profilmenü |
| Fuß: Impressum, Datenschutz, Sicherheit | bleibt (einziger Ort) | |

Neu: 4 Gruppen (Konto, Kunden ansprechen, Termine, Datenschutz & Daten) mit **12 Einträgen**. Zusammen mit dem
Profilmenü (ohne die doppelten Einträge Einstellungen/Abmelden gezählt) etwa 12 bis 14 Ziele, heute 23.

## 4. „Wachstum“ entlasten

| Alt | Neu | Fundstelle |
|---|---|---|
| Wachstum › Werbebudget | Konto & Vertrag › Werbebudget | `src/app/buyer/wachstum/page.tsx`, `src/app/buyer/konto/budget-card.tsx` |
| Wachstum › Produkte (weitere Sparte buchen) | Konto & Vertrag › Produkte | `src/app/buyer/wachstum/page.tsx` |
| Wachstum › Pause | Konto & Vertrag › Pause | `src/app/buyer/wachstum/page.tsx` |
| Wachstum › Monatsberichte | bleibt unter Wachstum | Auswertung |
| Konto: Hinweis „Werbebudget, Produkte und Pause: Unter Wachstum“ | entfällt | `src/app/buyer/konto/page.tsx` etwa Zeile 319 |

Vorsicht: AGENTS.md nennt den Weg **Konto & Rechnungen → Produkte**; Neuigkeiten und Erklärvideos (Wachstum) wären
betroffen, deshalb erst nach Oles Entscheidung und mit neuer Aufnahme.

## 5. Einheitliche Begriffe

| Alt | Neu | Fundstellen (sichtbare Texte, Auswahl) |
|---|---|---|
| Chat, Chats, Chat öffnen | **Nachrichten** („Nachricht schreiben“, „Nachrichten öffnen“) | `src/components/lead-actions.tsx` (Kachel „Chat“, etwa Zeile 339), `src/components/today-inbox.tsx` („Chat öffnen“, etwa Zeile 501), Designregeln „Chats“ in `.claude/skills/pg-design/SKILL.md` und `docs/design-system.md`; Navigation heißt schon „Nachrichten“ |
| Später melden, Später nochmal | **Wiedervorlage** („Wiedervorlage setzen“) | `src/components/naechste-nachrichten.tsx` (etwa Zeile 194), `src/components/spaeter-melden.tsx`, `src/components/call-outcome.tsx` („Später nochmal“, etwa Zeile 200); Kachel heißt schon „Wiedervorlage“ (`lead-actions.tsx`) |
| Videocall, Video | **Videotermin** (Knopf „Videotermin starten“) | `src/components/today-inbox.tsx` (etwa Zeile 494), `src/components/termin-karte.tsx` (etwa Zeile 39), `src/components/lead-mail.tsx` (etwa Zeile 395, 400), `src/components/reschedule-dialog.tsx` (etwa Zeile 231), `src/components/lead-booking.tsx` (etwa Zeile 127), öffentlich `src/app/book/[slug]/page.tsx` (etwa Zeile 218, 239, 264, 291), Lead-Texte in `src/lib/vertrieb/termin-whatsapp.ts`, `src/lib/mail/platzhalter.ts` |

Hinweis: „Später melden“ ist fachlich eine Pause der automatischen Nachrichten mit Bedenkzeit, nicht nur eine
Erinnerung. Vorschlag: Knopf „Wiedervorlage“, im Blatt die Wahl „Nachrichten bis dahin pausieren“.
Betroffene Erklärvideos nach der Umsetzung mit `python3 tools/erklaervideos/betroffen.py` prüfen.
