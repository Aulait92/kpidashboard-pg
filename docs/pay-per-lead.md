# Pay-per-Lead in der App (ersetzt Verteil-Zap, Auslieferungs-Zap, Airtable)

## Ablauf
1. **Eingang** `POST /api/leads/pool?token=<LEAD_WEBHOOK_TOKEN>&produkt=<slug oder Name>`
   - Perspective-Payload (profile/values) wird wie der frühere „Übersetzer“ übersetzt
     (`src/lib/ppl/perspective.ts`), flaches JSON wird direkt übernommen.
   - Dublette: gleiche Telefonnummer oder E-Mail in **irgendeinem Produkt** in 30 Tagen
     (wie der Zap; `DUPLICATE_ACROSS_PRODUCTS`/`DUPLICATE_DAYS` in `engine.ts`). Verglichen
     wird mit Pool-Leads, die ausgeliefert oder geparkt sind (auch die per Import übernommene
     Airtable-Historie), nicht mit Dubletten oder ungültigen. Der Grund nennt das andere Produkt.
   - Ungültig: weder Telefon noch E-Mail.
2. **Verteilung** (`src/lib/ppl/engine.ts`, `rules.ts`): d'Hondt nach Kontingent und
   Geliefertem, fällige Test-Bezüge zuerst. Filter je Bezug: PLZ, schwach (Beamte oder
   Beitrag unter Grenze, Standard 700 €), Beamte, nur schwache, Score, Gesellschaften
   ein/aus, Regeln. Kein freies Kontingent → geparkt (Push und Slack mit Frist), Cron verteilt erneut, aber nur bis
   48 h ab Eingang (`PPL_PARK_MAX_HOURS`, `parken.ts`). Danach verwirft der Cron den Lead endgültig (Status `expired`,
   Grund „verworfen (geparkt > 48 h)“, Name, Telefon, E-Mail, Antworten gelöscht); er wird nie wieder ausgeliefert,
   auch nicht über „Ausliefern“ im Admin (Ole, 20.11.2026). In der Auswertung eigene Spalte mit Werbekosten.
   Löschfrist verworfener Leads (Ole, 20.11.2026): ungültige, doppelte, von Hand verworfene und verfallene Pool-Leads
   verlieren 30 Tage nach Eingang (`PPL_DISCARD_DELETE_DAYS`, `loeschfrist.ts`, Cron `expireDiscarded`) Name, Telefon,
   E-Mail und Antworten; Status, Grund und Auswertungsfelder bleiben. Ausgelieferte Leads sind nie betroffen.
3. **Auslieferung** (`delivery.ts`): Kundenbereich (Push, WhatsApp-Assistent falls aktiv),
   E-Mail (optional nach Vorlage, z. B. Leadbörse Heinrich von Kleist) oder Webhook
   (Format Standard oder Convexa).
   - Mehrere Lieferadressen mit Komma: jede Adresse bekommt eine eigene Mail.
   - Mail-Vorlage „Standard maschinenlesbar“ (z. B. Make-Mailhook): Betreff `Neuer Lead: {Produkt} ({Lead-ID})`,
     feste Zeilen `Feld: Wert` (Lead-ID, Datum ISO, Produkt, Anrede, Vorname, Nachname, Telefon E.164, E-Mail,
     PLZ, Ort, alle Antworten, Einwilligungstext und Zeitpunkt), am Ende `JSON: {…}` und Anhang `lead.json`
     (`src/lib/ppl/lead-mail.ts`). Einwilligungstext am Bezug, Zeitpunkt = Eingang des Funnel-Formulars.
   - **Kundenbereich + PDF per Mail** (`app_pdf`, z. B. Novus-Makler mit Login, die das PDF wie früher aus dem
     Zap wollen): wie Kundenbereich, danach je Adresse eine Mail mit dem Lead als PDF (`src/lib/ppl/lead-pdf.ts`,
     Layout des alten Zap-PDFs: Kontakt, Angaben je Kategorie, Einwilligung mit Text und Zeitpunkt; Chromium,
     sonst schlicht mit pdf-lib). Mailfehler machen die Lieferung in den Kundenbereich nicht rückgängig.
     Airtable-Import: Liefermethode „PDF“ mit Login und Empfänger-Mail → `app_pdf`.
   - Bezug → **Testdatensatz senden**: „TEST Lead“ mit allen Feldern des echten Funnels, Betreff mit [TEST], an
     alle Lieferadressen (bei `app_pdf` nur die PDF-Mail); legt keinen Lead an (zählt nicht ins Kontingent, Umsatz,
     Auswertung), steht im Änderungsprotokoll („Testdatensatz gesendet“).
   - **Pivacom (Heinrich von Kleist) nur ISO-8859-1** (17.11.2026): Pivacom lehnt Mails mit `charset=utf-8` ab.
     Für Adressen aus `PPL_LATIN1_DOMAINS` (Standard `pivacom.com`) baut die App eine eigene Textmail in
     ISO-8859-1 (`src/lib/mail/latin1.ts`) und schickt sie über das **Versand-Postfach** in Microsoft 365
     (`src/lib/ppl/versand-postfach.ts`, Postfach `PPL_VERSAND_POSTFACH`, Standard `leads@performancegrowth.de`):
     Graph `POST /users/{postfach}/sendMail` mit der kompletten MIME-Mail (base64, `text/plain`), so bleibt der
     Zeichensatz erhalten. Resend schreibt ihn auf utf-8 um. Ist das Postfach nicht verbunden, geht die Mail wie
     vorher über Resend-SMTP raus, mit Admin-Push und Slack-Hinweis „Versand-Postfach nicht verbunden“.
     `MAIL_NUR_AN` gilt auch hier. Notausgang: `PPL_VERSAND_FORMAT=json` sendet eine normale Graph-Nachricht
     (wie der alte Zap, Exchange wählt den Zeichensatz).
     **Einrichtung:** Entra (portal.azure.com) → App-Registrierungen → die App der Microsoft-Anmeldung
     (`MICROSOFT_CLIENT_ID`) → API-Berechtigungen → Berechtigung hinzufügen → Microsoft Graph → Delegierte
     Berechtigungen → `Mail.Send` und `Mail.Send.Shared` → hinzufügen → „Administratorzustimmung für … erteilen“.
     Dann Admin → Pay-per-Lead → HvK-Abrechnungen → **Versand-Postfach verbinden** und mit
     `leads@performancegrowth.de` anmelden (oder mit einem eigenen Konto, das „Senden als“ für leads@ hat).
     **Testmail senden** schickt eine Mail mit Umlauten an die eigene Adresse; in Outlook „Quelle anzeigen“ muss
     `Content-Type: text/plain; charset=ISO-8859-1` stehen. Danach am Bezug „Nochmal zustellen“ bzw. Testdatensatz.
   - **Slack** je Lead (`src/lib/ppl/slack.ts`): Railway-Variable `SLACK_PPL_WEBHOOK_URL` (Incoming Webhook);
     Ergebnis, Produkt, Bezieher, Vorname und PLZ/Ort, Lieferweg mit Status, Link in den Admin; bei
     Zustellfehler eigene Warnung. Schalter „Slack-Nachricht je Lead“ am Bezug. Prüfen: Pay-per-Lead → **Slack testen**.
4. **Kontingent**: Wochenbestellung im Kundenbereich (Vorkasse über Stripe, „jede Woche
   wiederholen“, Verlängerung freitags ab 10 Uhr) oder Monats-/Einmal-Ziel von Hand
   (Heinrich von Kleist, Convexa: rechnen selbst ab, nur gezählt).
5. **Storno** (`storno.ts`, seit 17.11.2026): im Fenster, ersatzlos; Gutschrift auf die nächste
   Bestellung. Zugelassener Grund → sofort voll gutgeschrieben, auch bei Quote > 20 % (30 Tage);
   dann bekommt der Admin eine Push-Meldung, um mit dem Kunden zu sprechen. „Sonstiges“ →
   automatisch 50:50 (halbe Gutschrift, Umsatz zur Hälfte bleibt), keine Prüfung mehr.
   Bezug mit „immer automatisch anerkennen“ (`stornoAutoApprove`): alles voll.
6. **Reklamationen Heinrich von Kleist** (`hvk-abrechnung.ts`): kommen über die wöchentliche
   Abrechnung (PDF), nicht über die App. Zuordnung zu unserem Lead automatisch, siehe
   `docs/ppl-abloesung-plan.md` Abschnitt 4; nur Unklares landet unter **Storno prüfen**.

## Bestellkonto: Hauptkunde bestellt für Vertriebspartner (22.11.2026)

Für PPL-Kunden mit Vertriebspartnern (Nico Yagci → Dennis Müller, Tobias D'Angelo → Lukas Socki). `Customer.bestelltUeberId`
(lib/ppl/bestellkonto.ts) zeigt auf den Hauptkunden. Der Hauptkunde bestellt unter **/buyer/bestellen** je Partner die
Wochenmenge („Jede Woche wiederholen“, Verlängerung freitags), bezahlt über seine eigene Zahlungsart, Rechnung an ihn,
Umsatzsteuer nach **seiner** Registerprüfung. Leads landen im Konto des Partners; der Partner sieht die Bestellung, bestellt
aber nicht selbst. Logins eines reinen Bestellkontos (Partner, aber kein eigener Bezug) sehen nur diese Seite.
Admin: Pay-per-Lead → Bezug → „Bestellt und bezahlt über“; Registerprüfung dort gilt dann für den Hauptkunden.
Donnerstags-Erinnerung (lib/ppl/bestell-erinnerung.ts, Cron jede Minute, wirkt donnerstags ab 10 Uhr): Mail und Mitteilung an
die Inhaber-Logins des Zahlers (Hauptkunde bzw. Kunde selbst), wenn für nächste Woche nichts bestellt ist und keine
Verlängerung am Freitag ansteht. Eine Mail je Zahler und Woche mit allen offenen Partnern (Protokoll `ppl.bestellerinnerung`).

Livegang je Hauptkunde: 1. Login für das Konto „Nico Yagci“ bzw. „Tobias D'Angelo“ anlegen (Einladung), 2. Registernummer
am Bezug des Partners prüfen (gilt für den Hauptkunden, sonst 19 %), 3. Hauptkunde hinterlegt Zahlungsart, 4. Bezug des
Partners von `month`/`once` auf Wochenbestellung umstellen (vorher keine Lieferung ohne bezahlte Woche, darum erst wenn
Schritt 3 erledigt ist; Socki hat noch Rest aus dem Einmal-Kontingent).

## Unterschiede zum bisherigen Zap (bewusst)
- Dubletten wie im Zap produktübergreifend (bis 15.11.2026 prüfte die App nur im selben
  Produkt). Abschaltbar über `DUPLICATE_ACROSS_PRODUCTS = false` in `src/lib/ppl/engine.ts`.
- `schwach_grenze`, `akzeptiert_beamte`, `nur_schwach`, `ausschluss_regeln` werden
  ausgewertet (im Zap ignoriert). Heinrich von Kleist (Grenze 450 €) bekommt dann auch
  Leads mit 450–700 € Beitrag.
- Jeder Lead bekommt ein Lieferdatum (im Zap blieb `ausgeliefert_am` bei E-Mail/Convexa leer).
- Kein SMS-Preis, keine Weitergabe-Zustimmung (Superchat entfällt).
- Keine Live-Telefonprüfung über Byteplant. Stattdessen genaue Formatprüfung (lib/ppl/telefon-pruefung.ts, 16.11.2026):
  nur deutsche Nummern, Länge Festnetz 7 bis 11 / Mobil 10 bis 11 Ziffern ohne 0, keine Sonderrufnummern, keine
  Fantasienummern (6 gleiche Ziffern, Ziffernreihen). Falsche Nummern: Status „invalid“, keine Auslieferung, Slack.
- Anrede in der Leadbörsen-Mail: nur wenn der Funnel sie liefert (der Zap leitete sie aus
  einer Vornamensliste ab); ohne Wert entfällt die Zeile.

## Umstellung (Vorschlag: 1.12., weil Monatsziele ab Stichtag zählen)
1. Admin → Leads → Pay-per-Lead → **Aus Airtable übernehmen**: Vorschau prüfen,
   „Leads der letzten 30 Tage für den Dubletten-Abgleich“ anhaken, übernehmen.
2. Bezug Heinrich von Kleist: Lieferung E-Mail an `leads@pivacom.com`, Betreff
   `Neuer Lead - Performancegrowth`, Vorlage:
   ```
   Brokercode: <aus dem bisherigen Zap>
   Art: KVV-Opt
   Geprüft: nein
   Anrede: {anrede}
   Name: {nachname}
   Vorname: {vorname}
   Strasse: Unbekannt
   PLZ: {plz}
   Ort: {ort}
   Geburtsdatum: {geburtsdatum}
   Berufsstatus: {berufsstatus}
   Email: {email}
   Tel_mobil: {telefon}
   Leadgen_ID: {id}
   Wo versichert: {versicherer}
   Wie versichert: {versicherungsart}
   Monatsbeitrag: {beitrag}
   ```
   Pivacom vorher fragen, ob `Leadgen_ID` jetzt eine App-ID statt Airtable-ID sein darf.
3. Convexa: Webhook-Adresse aus Airtable wird übernommen, Format „Convexa“.
4. Käufer mit Login: Bezug auf „Wochenbestellung“ stellen; Käufer hinterlegt Zahlungsart
   und bestellt im Kundenbereich unter „Bestellen“.
5. Perspective: Webhook je Funnel auf
   `https://app.performancegrowth.de/api/leads/pool?token=…&produkt=pkv-tarifoptimierung`
   (bzw. den jeweiligen Slug) umstellen, einen Testlead schicken (Admin → Pay-per-Lead → Eingang).
6. Zaps ausschalten: „Zap 0 - Verteil-Zap“, „Verteil-Zap (SMS-Verifizierung)“,
   „Auslieferungs-Zap“, „Monatlich erhaltene Leads zurücksetzen“ (veraltet).
7. Zugangsdaten rotieren, die im Zap-Code im Klartext stehen (Airtable-Token,
   HMAC-Secret „Sascha“, Google-Service-Account-Schlüssel).
