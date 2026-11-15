# „Kollegen empfehlen“ (intern)

Kunden (Vermittler) empfehlen performancegrowth an Kollegen. Code: `src/lib/kollegen.ts`,
`src/lib/kollegen-shared.ts`. Kundenhilfe: `docs/hilfe.md` („Kollegen empfehlen“).

## Ablauf

1. Kundenbereich → Profilmenü / Konto → „Kollegen empfehlen“ (nur Inhaber): persönlicher Link
   `/empfehlen/<code>` (stabil je Kunde), Teilen per Web Share/WhatsApp/E-Mail, QR-Code, Stand der Empfehlungen.
2. Landingpage `/empfehlen/<code>` (öffentlich): Empfohlener trägt Name, Agentur, E-Mail, Telefon ein und willigt
   ein (auch, dass der Empfehler den Stand sieht). Bot-Falle und Bremse (5 je Code und Stunde, 30 insgesamt je
   10 Minuten). Selbstempfehlung (eigene Login-Adresse oder gleiche eigene Firmen-Domain; Freemail und
   Versicherer-Domains ausgenommen) wird abgelehnt.
3. Daraus: Vertriebskontakt (Dublette nur über die E-Mail, `findContactIdByEmail`), Quelle „Empfehlung“,
   Notiz „Empfehlung von …“, Aufgabe „Empfehlung – heute anrufen“, Push an Admins. Ist der Kontakt schon Kunde:
   nur festgehalten (ohne Prämie, ohne Aufgabe); der Besucher sieht dieselbe Bestätigung.
4. Prämie: Stripe-Webhook (`checkout.session.completed`/`async_payment_succeeded` mit Zahlung bzw. `invoice.paid`
   mit Betrag) → Angebot des Kontakts angenommen und Empfehlung lag vor der Annahme → genau einmal
   (`rewardStatus` none → processing) Gutschrift beim Empfehler als negativer Rechnungsposten (wie
   Garantie-Gutschriften, netto zzgl. USt., mit der nächsten Rechnung verrechnet). Ohne Stripe-Kunde oder bei
   Fehler: Aufgabe „Prämie manuell gutschreiben“; nach dem Buchen in Vertrieb → Empfehlungen „Gutgeschrieben“
   klicken (dann Push + Mail an den Empfehler).
5. Hinweise im Kundenbereich („Heute“, nur Inhaber): Garantie erreicht, 5./10. Abschluss, Feedback Tag 30/90 ab
   4 von 5. Je Anlass einmal, mindestens 30 Tage Abstand, läuft nach 14 Tagen ab. Gutes Feedback zeigt den Link
   auch direkt im Danke-Bildschirm.

## Einstellungen

Admin → Einstellungen → „Kollegen empfehlen“: an/aus, Hinweise im Kundenbereich an/aus (Standard aus, Programm wird
vorerst nicht aktiv beworben), Prämie (Standard seit 15.11.2026: fester Betrag 300 € netto je Empfehlung, die Kunde wird, ohne Obergrenze;
vorher 14.11.2026 bis 15.11.2026: Bestandskunden-Modul N Monate gratis, Standard 3, weiter wählbar; alternativ
1 Monat Betreuung = aktueller `retainerMonthly` des Empfehlers). Datenmigration
`20261118704800_empfehlung_praemie_300`: Oles Einstellung auf 300 € umgestellt, nur wenn sie noch auf dem alten
Standard (3 Monate Modul) stand, Neukunden-Vorteil
(keiner / Einrichtung gratis, im Angebot vorbelegt / Rabatt auf die Einrichtung als Betrag netto, rechnet automatisch /
eigener Text, wird nicht gerechnet).

Empfehlungsrabatt (lib/kollegen.ts `referralSetupDiscount`, lib/offer-pricing.ts `applySetupDiscount`):
- Neues Angebot an einen empfohlenen Kontakt: Rabatt automatisch, im Formular übersteuerbar (0 = keiner).
  Voraussetzungen: offene Empfehlung mit Kontakt, keine Selbstempfehlung, Kontakt nicht schon Kunde, nicht schon vorher
  im CRM (`existingContact`), kein Angebot vor der Empfehlung, Empfehlung jünger als 12 Monate.
- Gilt für jede Laufzeit, nie unter 0; „Setup abweichend“ wird nicht addiert, der günstigere Betrag gilt.
- Gespeichert am Angebot: `setupListFee` (Listenpreis), `setupDiscount` (vereinbarter Rabatt), `setupDiscountLabel`,
  `referralId`; `setupFee` bleibt der zu zahlende Betrag (Umsatz, Kundenerfolg und Agenturkosten rechnen damit).
- Stripe: Setup-Posten zum Listenpreis plus einmaliger Gutschein „Empfehlungsrabatt“ (amount_off, nur auf den
  Setup-Posten), Rechnungsbetrag = `setupFee`.
- Offene Angebote nachziehen: Vertrieb → Empfehlungen → „Offene Angebote an Empfohlene“ (Liste = Trockenlauf,
  Knopf übernimmt).

Prämie „fester Betrag“ (lib/kollegen.ts `grantCreditReward`): negativer Rechnungsposten über `addGarantieGutschrift`
(netto, USt. wird mit gemindert) auf der nächsten Rechnung; ist die Rechnung kleiner, legt Stripe den Rest als
Guthaben (Customer Balance) an und verrechnet ihn mit den folgenden Rechnungen. Einmal je Empfehlung: Status
`none` → `processing` (nur wer umstellt, bucht) und Stripe-Idempotenzschlüssel `garantie-empfehlung-<id>`.

Prämie „Bestandskunden-Modul gratis“ (lib/kollegen.ts `grantBestandReward`, nur noch wenn im Admin gewählt; laufende
Gratiszeiten aus früheren Prämien enden wie zugesagt, inkl. Hinweis vorher): Modul nicht gebucht → `setBestandModule`
„book“ und N Monatsbeiträge als Gutschrift, `Customer.bestandFreeUntil` = heute + N Monate (Hinweis 14 Tage vorher,
`remindBestandFreeEnd` im täglichen Cron). Modul gebucht → N Monatsbeiträge gutschreiben (läuft eine Gratiszeit, wird
sie verlängert). Modul kostenlos (Bestandsschutz, inklusive, Makler mit 0 €) → Admin-Aufgabe. Übersicht: Vertrieb → Empfehlungen (Top-Empfehler, neuer Monatsumsatz, Prämien, offene manuelle Prämien).
Kundenakte zeigt „hat X Kunden geworben“.

## Offen für Ole

- **Steuer:** Mit dem Steuerberater klären, wie die Gutschriften verbucht werden (Entgeltminderung beim
  Empfehler-Kunden vs. Provision/Werbekosten) und ob die Rechnungsdarstellung so passt.
- **AGB:** Prüfen, ob das Empfehlungsprogramm (Prämie, Bedingungen, kein Anspruch bei Selbstempfehlung/Bestandskunden)
  in den AGB bzw. als Teilnahmebedingungen erwähnt werden soll.
- Prämie ist B2B (wir an den Vermittler), keine Zuwendung an Versicherungsnehmer – das Provisionsabgabeverbot ist
  nicht berührt.
