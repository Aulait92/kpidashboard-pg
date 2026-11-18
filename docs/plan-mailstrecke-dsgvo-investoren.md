# Plan: Mail-Strecke ohne WhatsApp, Betroffenenrechte, Investoren-Kennzahlen (18.11.2026)

Aufträge Ole (17./18.11.). Bau auf Staging, Livegang im Abendfenster. Grundlage: claude/whatsapp-crm @ 17159bb.

## 1. Mail-Strecke für Leads ohne WhatsApp (ca. 97 h; erster Schnitt E0–E4, E7, E10–E12 ca. 61 h)

Vorhanden: kein-whatsapp.ts (131026/1013 → Assistent aus, Push, eine Mail mit Terminlink), zustellfehler.ts, Kennzahl
keinWhatsAppQuote, sendeLeadMail (M0), Antwortadresse/Eingang (M2, Schalter aus), bookAppointment, Einladung (P2),
Zwischenfrage, KOMPLETTCHECK_TEXT, bereitlegenListe, erstinfoAnhang, seven.io (nur Vertrieb). Lücken: Postfach nur Senden;
Buchungsseite verlangt Telefon; PolicenNachweis hängt an Telefon.

| # | Inhalt | h |
|---|---|---|
| E0 | Auslöser ≤ 5 Min (131026/1013, keine Nummer, Festnetz, waConsent nein), Minuten-Cron, Diagnose q=mail-strecke | 5 |
| E1 | Modell LeadMailStrecke (Schritt, HMAC-Token, Antworten, Zeiten, Nachfass-Zähler, Pause), Appointment.bookedVia | 3 |
| E2 | Erstmail (Erstinfo-PDF, Text wie v8, Öffnungsfrage 2–3 Knöpfe, 2 Zeiten + „Andere Zeit“, Abmeldelink, Impressum) | 8 |
| E3 | Antwortseite /t/[token] (noindex; speichert erst im Browser; Termin nur mit Knopf „Termin festmachen“) | 12 |
| E4 | Strecke nach Buchung auf der Seite (Komplettcheck, Angebotsformular, Bereitlegen, Adresse, Einladung einmal) | 10 |
| E5 | Policen-Upload auf der Seite (Einwilligung, Tor, EU-Bucket, Nachweis quelle web, keine KI) – Anwalt Text | 12 |
| E6 | Erinnerungen per Mail | 4 |
| E7 | Nachfassen max. 2 Mails; Anrufplan parallel | 5 |
| E8 | Freie Mail-Antworten mit KI (runMailAgent, Beratungssperre, keine Anhänge an KI) | 14 |
| E9 | Antwort des Vermittlers pausiert den Assistenten (Reply-To Lead + Antwortadresse), „Ich übernehme“ | 6 |
| E10 | Recht/Texte (Datenschutzhinweis, SUBPROCESSORS Resend, Neuigkeit, Webseite) | 4 |
| E11 | Kennzahl Anteil Termin über Mail-Strecke (Admin Liefern/Betreuen) | 4 |
| E12 | Tests (Link-Scanner, Doppelklick, Zeit vergeben, Einladung einmal, Tor, Pause, max. 2, Abmeldung), Screenshots | 10 |

SMS optional: seven.io (Berlin, schon angebunden), grob 7–8 ct/SMS (ungeprüft), 4–6 h.

## 2. Betroffenenrechte (ca. 81 h)

| # | Inhalt | h |
|---|---|---|
| D0 | DsgvoAnfrage, DsgvoAnfrageLog (3 Jahre), LeadSperre (Hash Telefon/Mail, Umfang gelöscht/werbung) | 4 |
| D1 | Erkennung ohne KI (Chat, Mail-Eingang), Abgrenzung Policen-Widerruf/STOPP | 6 |
| D2 | Formular /datenschutz/anfrage/[slug] mit Bestätigung über bekannten Kanal | 6 |
| D3 | Sofortbestätigung im Namen des Vermittlers | 3 |
| D4 | Vermittler: Heute-Karte, Kontakt-Banner, Erinnerung 7 Tage vorher | 6 |
| D5 | Admin Betreuen › Datenschutz-Anfragen mit Ampel | 4 |
| D6 | Auskunft als PDF (+ JSON), Versand nur an bekannten Kanal | 14 |
| D7 | Löschung erweitert + Import-Sperre an 7 Einstiegen; sperren statt löschen bei Aufbewahrungspflicht | 14 |
| D8 | Widerspruch Werbung sofort (Abfolgen, Kampagnen, Nachfassen, CAPI) | 4 |
| D9 | Berichtigung | 2 |
| D11 | Bestandskunden (Auskunft/Löschung einzeln) | 5 |
| D12 | Tests | 10 |
| D13 | Doku, AVV-Unterstützungspflicht, Neuigkeit, Webseite | 3 |

## 3. Investoren-Kennzahlen Geld › Auswertung (ca. 36 h)

Vorhanden: revenue-ledger.ts (MRR-Bewegung, Kohorten, NRR-Ansatz, Churn), zahlen.ts (CAC, Amortisation, LTV, Marge).
MRR = vertraglicher Wert (keine Stripe-Rechnungen in der DB). KI-Kosten nicht eigens erfasst.

| # | Inhalt | h |
|---|---|---|
| K0 | Diagnose q=investoren (Datenlücken) | 3 |
| K1 | Rechenkern (Bindung 3/6/12, NRR, CLV, CAC+Amortisation, Kohorten ≥ 5, Marge) | 6 |
| K2 | KI-Kosten (Bankkategorie „ki“, optional Token-Protokoll) | 5 |
| K3 | Seite: 5 Kacheln, MRR-Bewegung, Kohorten, Marge, Abo vs. PPL, „So rechnen wir“ | 12 |
| K4 | Export CSV/PDF | 6 |
| K5 | Gegenprobe, Screenshots, SUS | 4 |

## Reihenfolge

1. E0–E4 + D0, D1, D3, D8. 2. E7, E10–E12 + D2, D4–D7, D12. 3. Nach M2 an: E5, E8, E9, D9, D11, D13. 4. K0–K5.
Gesamt ca. 214 h (27 PT) + Anwaltsprüfungen.

## Arbeitsannahmen (Empfehlungen, bis Ole anders entscheidet)

1. Mail-Strecke immer mit Antwortadresse als Reply-To, auch bei verbundenem Postfach (nur für diese Strecke).
2. Antworten erst im Browser speichern, Termin nur per Bestätigungsknopf (Link-Scanner).
3. Auslöser: 131026/1013, keine Nummer, Festnetz, waConsent nein; nicht 131050.
4. Nach Löschung: Importe/Pool/Airtable gesperrt; eigene neue Formular-Einsendung erlaubt, Vermittler sieht „früher gelöscht“.
5. Sperren statt löschen bei Abschluss/Beratungsdoku, Grund aus Liste (Anwalt), Löschen nur auf Weisung des Vermittlers.

## Bestandskunden-Modul einblenden: was fehlt

BESTAND_MODULE_AVAILABLE (bestand/sichtbar.ts:10) an + 20 Fundstellen prüfen; neuer Sammel-Neuigkeitseintrag statt 7 alter;
AVV/AGB-Ergänzungen (Bestandsdaten, Mail-Kampagnen über Postfach, Kündigung Zusatzmodule bei Jahreszahlung), Einwilligung „laut
Versicherer“ und Ausschließlichkeitsvertreter-Bestätigung vom Anwalt; Löschen einzelner Bestandskunden (D11); Preise bestätigen
(149 €, Kontingente, Pakete); Webseite; Erklärvideos (3–4 h); Echttest auf Staging inkl. Meta-Marketing-Vorlagen je Konto.

## Nachtrag Ole (18.11. nachts)

**A) SMS über seven.io zusätzlich zur Mail (nur Leads ohne WhatsApp)** (+ ca. 8 h): SMS kurz mit Link auf die Antwortseite,
Absender = Vermittler-Name (≤ 11 Zeichen, sonst SMS_ABSENDER), STOP. Takt über 10 Tage: Tag 1 Mail + SMS, Tag 2 vormittags Mail
mit 2 Zeiten, Tag 4 nachmittags SMS, Tag 6 abends Mail mit Nutzensatz, Tag 10 letzte Mail „Soll ich Ihre Anfrage schließen?“.
Max. 2 SMS, nichts 20–8 Uhr, Stopp bei jeder Reaktion. **seven.io steht noch NICHT in SUBPROCESSORS/AVV/datenschutz.md** →
Schalter MAIL_STRECKE_SMS aus, bis ergänzt.

**B) Beratungsdokumentation als Angebot (Schalter je Vermittler, Standard aus)** (ca. 8 h, weil M5 die Grundlage schon hat:
Editor, PDF, Ablage „Beratungsdokumentation“, Aufbewahrung): eigener Knopf nach dem Termin „Beratungsdokumentation erstellen“
(unabhängig vom Angebot), Abschnitte Wünsche und Bedürfnisse, Beratung, Empfehlung mit Begründung, Entscheidung des Kunden,
Hinweise (z. B. Verzicht); Vorbelegung aus Terminvorbereitung, Vergleichsblatt, Angaben, Notizen; Versand in Textform mit
Bestätigung per Klick (Zeitstempel); Hinweis „Inhalte verantwortet der Vermittler, keine Beratung durch die App“; Schalter in
Onboarding und Einstellungen; Nutzung messen (Vermittler eingeschaltet, Dokumente je Termin) unter Betreuen › Nutzung.
Digitale Unterschrift erst bei Nutzung.
