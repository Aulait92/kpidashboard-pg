# Zusatzmodul „Empfehlungen & Bewertungen“: Leitplanken nach dem Umbau (Paket 1)

Stand: 19.11.2026. Interne Prüfung (Ole, 18.11.2026: bis Budget für eine Anwältin da ist, keine Anwaltsfreigabe
abwarten). Keine Rechtsberatung. Grundlage: Umbauplan `docs/ux/2026-11-19-empfehlung-champions.md`, Abschnitt 7.
Das Modul bleibt für Kunden ausgeblendet (`EMPFEHLUNG_MODULE_AVAILABLE = false`), Einschalten entscheidet Ole.

## Ampel

| Punkt | Vorher | Jetzt | Wo |
|---|---|---|---|
| R1 Bitte nach Termin ohne Einwilligung | rot | grün | `sendAfterAppointmentReferrals` prüft `feedbackAllowed` und beim Bestandskunden `optOutAt`/`blockedAt` |
| R2 „Link senden“ ohne Einwilligung bzw. nach STOPP | rot | grün | `sendReferralLinkNow`: STOPP blockt immer; ohne Einwilligung nur als freie Nachricht im offenen 24-h-Fenster, sonst „Einwilligung fehlt“ |
| R3 Einwilligung „einmal“, aber mehrere Wege | rot | grün | Neuer Wortlaut „gelegentlich (höchstens 3-mal im Jahr)“, gemeinsame Obergrenze 3 Bitten in 365 Tagen je Person über alle Wege; alter Wortlaut deckt eine Bitte |
| Dank an Empfehlende verrät den Abschluss | gelb | grün | Dank nur mit statusConsent der empfohlenen Person („und Kunde wurde“) und Einwilligung des Empfehlenden |
| Gesundheitsthemen an Dritte | gelb | grün | `themaFuerDritte`: Kranken, Zahn, Pflege, BU, Leben, Sterbegeld werden „Versicherungen und Vorsorge“; Teilen-Text ohne Thema |
| Meta-Vorlagen ohne STOPP und nur in Sie | gelb | gelb | Neueinreichung beim Einschalten (siehe unten); bis dahin gehen Vorlagen in Sie, freie Texte in beiden Ansprachen |
| Dankeschön (Prämie) | gelb | gelb | Standard aus, 15 € je Empfehler und Jahr, kein Bargeld, nie an Empfohlene (unverändert, Offen Nr. 4) |

## Leitplanken

1. **Einwilligung vor jeder Bitte (UWG § 7 Abs. 2 Nr. 2, BGH VI ZR 225/17).** Bewertungs- und Empfehlungsbitten per
   WhatsApp sind Werbung. Keine Vorlage geht ohne `feedbackConsentAt` oder mit `feedbackOptOutAt` raus: Tag X
   (Bewertung), Tag Y (Empfehlung), bei Lob, nach Termin, „Link senden“, Dank, Rückmeldung an Empfehlende. Belegt in
   `tests/unit/empfehlung-einwilligung.test.ts`.
2. **Einholen beim Abschluss.** Häkchen in der Abschluss-Karte im Kontakt, nie vorausgefüllt, ein Tipp. Gespeichert:
   Zeitpunkt, Quelle `vermittler`, langer Wortlaut (`FEEDBACK_CONSENT_TEXT`). Satz zum Vorlesen in der Ansprache des
   Kunden (aufklappbar). Keine Einwilligungsbitte per Vorlage.
3. **Wortlaut (gespeichert):** „Der Kunde ist einverstanden, dass ich ihn per WhatsApp nach dem Abschluss frage, ob alles
   gepasst hat, und ihn um eine ehrliche Google-Bewertung sowie gelegentlich (höchstens 3-mal im Jahr) um eine
   Empfehlung bitte. Widerspruch jederzeit mit STOPP.“ Beschriftung in der App: „Kunde hat zugestimmt: Nachfrage,
   ehrliche Google-Bewertung, gelegentlich Empfehlungsbitte (STOPP jederzeit)“.
4. **Obergrenze.** `REFERRAL_ASK_LIMIT = 3` in `REFERRAL_ASK_WINDOW_DAYS = 365` je Person (alle Links als Kontakt und
   als Bestandskunde zusammen). Gezählt über das Änderungsprotokoll (`empfehlung.link_sent`, `empfehlung.bitte`; Protokoll
   hält ein Jahr). Der Dank enthält den Link nur unter der Obergrenze, sonst Dank ohne Link.
5. **Widerspruch (UWG § 7 Abs. 3 analog, DSGVO Art. 21).** Jede Bewertungsbitte, Empfehlungsbitte (auch Anlässe und
   Dank bei Lob) und jeder Dank mit Link nennt STOPP; `validateText` verlangt das für eigene Texte. STOPP setzt
   `feedbackOptOutAt` und sperrt alle Wege.
6. **Kein Review-Gating, keine Gegenleistung (UWG § 5, § 5b Abs. 3, Google-Richtlinien).** Gleicher Google-Link für alle,
   neutrale Bitte um eine ehrliche Bewertung, die KI steuert nie den Google-Link. Keine Prämien in Bewertungsbitten
   (`validateText`), keine Prämien, Beträge oder Garantien im Angebot (`validateOffer`). Echtheitshinweis
   `REVIEW_SOURCE_NOTE`, sobald Sterne angezeigt werden.
7. **Prämien für Empfehlungen (§ 48b VAG).** Dankeschön standardmäßig aus, höchstens 15 € je Empfehler und Kalenderjahr,
   kein Bargeld, nie an die empfohlene Person, nie bei Selbstempfehlung, nie über den allgemeinen Link.
8. **Daten Dritter.** Kein Feld für Daten Dritter, kein Versand durch uns an empfohlene Personen. Die empfohlene Person
   meldet sich selbst (Einwilligung auf der Kontaktseite: Wer, Kanäle, Zweck, Widerruf, Datenschutzlink; Wortlaut und
   Zeitstempel gespeichert). Rückmeldung und Dank an Empfehlende nur mit freiwilliger, eigener Einwilligung der
   empfohlenen Person (`statusConsentText`, jetzt mit „und Kunde wurde“), nur Vorname, keine Details.
9. **Gesundheitsdaten (Art. 9 DSGVO).** Keine Sparte aus dem Gesundheitsbereich in Texten an Dritte; `redactHealthText`
   vor jeder KI-Einordnung.
10. **Ansprache.** Texte an Kunden, Empfehlende und Empfohlene in Du und Sie (`Customer.leadAddress`, bei
    Bestandskunden `Customer.bestandAddress`, Standard Sie), ohne Gedankenstriche, ohne „Garantie“, keine Versprechen.
11. **Versandfenster und Abstände.** Mo bis Sa 9 bis 19 Uhr, nach Termin höchstens alle 180 Tage, zusätzlich die
    Obergrenze aus Punkt 4. Drosselung beim persönlichen Link per Handynummer bleibt.

## Pflichtangaben, die bei jedem Umbau erhalten bleiben

- Einwilligungstext mit Zeitpunkt, Quelle, Wortlaut (`setFeedbackConsent`).
- STOPP in Bewertungsbitte und allen Empfehlungstexten; STOPP-Sperre (`feedbackOptOutAt`, `optOutAt`, `blockedAt`).
- Kontaktseite der empfohlenen Person: Wer, Kanäle (Telefon, WhatsApp, E-Mail), Zweck, Widerruf, Datenschutzlink;
  serverseitige Prüfung bzw. „Absenden = Einwilligung“ mit gespeichertem Wortlaut und Zeitstempel.
- Freiwilliges, nicht vorausgefülltes Häkchen für die Rückmeldung an Empfehlende.
- Hinweis am WhatsApp-Knopf („Damit nehmen Sie selbst Kontakt … auf“ plus Datenschutz) und Ref-Code in der Nachricht.
- Rechtlicher Fuß (Impressum bzw. Erstinformation, Datenschutz) auf allen öffentlichen Empfehlungsseiten
  (§ 5 DDG, § 15 VersVermV).
- `REVIEW_SOURCE_NOTE` bei jeder Anzeige von Bewertungen.

## Beim Einschalten nötig (Stufe A, Ole)

- Meta-Vorlagen neu einreichen: `review_request`, `referral_request`, `referral_thanks` mit STOPP-Hinweis und Link im
  Dank, jeweils mit Du-Fassung; `referral_update` freigeben. Bis dahin enthält die Vorlage `referral_thanks` keinen Link
  (der Dank zählt dann nicht als Bitte).
- AVV mit Zweck „Nachfrage, Empfehlungen, KI-Einordnung“ und Betroffenen „empfohlene Personen“, Datenschutzhinweise zu
  `ReferralVisit`, Löschfrist 12 Monate für Empfehlungs-Leads ohne Abschluss, AGB-Testphase.
- Bestandsmodul: Kampagne „Jährliche Empfehlungsbitte“ an dieselbe Obergrenze binden (`referralAskCheck`,
  `recordReferralAsk` in `src/lib/empfehlung/requests.ts`) und Texte in `bestandAddress` senden.
