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

Admin → Einstellungen → „Kollegen empfehlen“: an/aus, Prämie (1 Monat Betreuung = aktueller `retainerMonthly` des
Empfehlers, oder fester Betrag), Neukunden-Vorteil (keiner / Einrichtung gratis – im Angebot vorbelegt / eigener
Text). Übersicht: Vertrieb → Empfehlungen (Top-Empfehler, neuer Monatsumsatz, Prämien, offene manuelle Prämien).
Kundenakte zeigt „hat X Kunden geworben“.

## Offen für Ole

- **Steuer:** Mit dem Steuerberater klären, wie die Gutschriften verbucht werden (Entgeltminderung beim
  Empfehler-Kunden vs. Provision/Werbekosten) und ob die Rechnungsdarstellung so passt.
- **AGB:** Prüfen, ob das Empfehlungsprogramm (Prämie, Bedingungen, kein Anspruch bei Selbstempfehlung/Bestandskunden)
  in den AGB bzw. als Teilnahmebedingungen erwähnt werden soll.
- Prämie ist B2B (wir an den Vermittler), keine Zuwendung an Versicherungsnehmer – das Provisionsabgabeverbot ist
  nicht berührt.
