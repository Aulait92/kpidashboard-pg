# Einwilligung im Meta-Leadformular per Knopf statt Häkchen (22.11.2026)

Anlass: Seit dem Pflicht-Häkchen (Anwalts-Memo Punkt 1, 15.11.2026) kaum Abschlüsse im Formular (Lohmann Kfz, Formular v3:
10 Link-Klicks, 1 Lead). Interne Rechtsprüfung (Rechts-Agent), Ampel **Gelb (gering)**, Stufe A (Rechtstext, Freigabe Ole).

## Ergebnis
- Klick auf einen eindeutig beschrifteten Knopf ist eine eindeutige bestätigende Handlung (Art. 4 Nr. 11 DSGVO); Planet49
  verbietet nur vorab gesetzte Häkchen. Kontakt zur eigenen Anfrage stützt sich ohnehin auf Art. 6 Abs. 1 lit. b DSGVO.
- (a) Kontakt per WhatsApp, E-Mail, Telefon zur Anfrage: grün; gelb, sobald andere Sparten beworben werden (§ 7 UWG).
- (b) KI-Assistent: nur Information (Art. 50 KI-VO), grün. Hinweis in der ersten Nachricht bleibt.
- (c) Elektronische Erstinformation: Wahl nach § 16 Abs. 2, 3 VersVermV, per Klick zulässig, wenn Papier genannt ist: grün.
- Restrisiko: einzelne Aufsichtsbehörden verlangen für WhatsApp eine eigene Handlung (Bußgeld/Abmahnung im unteren Bereich).

## Wortlaut (CONSENT_VERSION_KNOPF = 2026-11-22-knopf, src/lib/einwilligung-leadformular.ts)
Titel: „Fast geschafft: Jetzt unten auf „Senden“ tippen“
Text: „Ihr Angebot und Ihren Termin bekommen Sie per WhatsApp, E-Mail oder Telefon. Mit Klick auf „Senden“ willigen Sie ein,
dass {Vermittler}, {Anschrift}, Sie zu dieser Anfrage kontaktiert. Zuerst antwortet ein KI-Assistent und schlägt Termine vor.
Die Erstinformation nach § 15 VersVermV erhalten Sie elektronisch als Link und PDF, auf Wunsch auf Papier. Widerruf jederzeit
mit „STOPP“ oder per E-Mail an {E-Mail}. Datenschutz: {Link}“

## Auflagen
1. Text auf dem Bildschirm mit dem Knopf, der den Lead abschickt; je Textversion ein Handy-Screenshot der Vorschau ablegen.
2. Nachweis am Lead: Formular-ID, Textversion, Wortlaut, Zeitpunkt (lib/lead-intake.ts: Zuordnung mit Fassung „-knopf“).
3. Nur Kontakt zu dieser Anfrage, kein Nachfassen zu anderen Sparten ohne neue Einwilligung.
4. Vor dem Einsatz Conversion-Texter/UX, danach Pflichtangaben prüfen (Vermittler, Anschrift, Kanäle, KI, Erstinformation
   mit Papier, Widerruf, Datenschutz).

## Nachweis Auflage 1 (22.11.2026)
Vorschau Lohmann Kfz v4 Knopf, Seite 4 von 5 („Privacy review“): Titel und Wortlaut stehen direkt über dem Knopf
„Senden“, der den Lead abschickt (Seite 5 ist die Dankeseite). Screenshot: `nachweise/2026-11-22-leadformular-knopf-vorschau.png`.
Darunter folgt der feste Meta-Hinweis (Du-Form, von Meta vorgegeben, nicht änderbar). Keine SMS-Bestätigung.
