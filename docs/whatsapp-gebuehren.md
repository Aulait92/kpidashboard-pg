# WhatsApp-Gebühren

> **Stand 11.11.2026: Die Gebühren sind im Preis enthalten und werden nicht mehr weiterberechnet**
> (`PRICE_LIST.whatsappIncluded = true` in `src/lib/offer-pricing.ts`). Die monatliche
> Weiterberechnung im Cron läuft nur, wenn der Schalter auf `false` steht; der Code bleibt.
> Erfasst werden die Gebühren weiter: je Kunde (Karte im Admin-Reiter „WhatsApp-Assistent“) und
> gesamt als direkte Software-Kosten auf der Zahlen-Seite (`monthlyFeeCosts`) – nie als Umsatz.
> Bestandskunden-Kampagnen: bis 500 Nachrichten/Monat inklusive (Fair Use), darüber startet keine
> neue Kampagne; Admin erhöht das Kontingent je Kunde unter „Abrechnung“.
>
> Der folgende Text beschreibt die (abgeschaltete) Weiterberechnung.


Meta berechnet WhatsApp je Nachricht. Wir berechnen genau das an den Kunden weiter
(AGB: „nach tatsächlichem Verbrauch“), ohne Aufschlag.

## So funktioniert es

1. **Erfassen:** Zu jeder ausgehenden Nachricht schickt Meta im Status-Webhook
   `pricing.billable` und `pricing.category` (marketing, utility, authentication, service).
   Das landet in `Message.billable` / `Message.pricingCategory`. Beim Senden einer Vorlage
   wird die Kategorie der Vorlage vorbelegt, bis Metas Angabe kommt.
2. **Preise:** Standard ist der Meta-Tarif Deutschland in EUR: Marketing 0,1131 €,
   Utility, Authentifizierung und berechnete Service-Nachrichten 0,0456 € je Nachricht.
   Änderungen über die Variable `WHATSAPP_FEES_EUR`, z. B.
   `{"marketing":0.1131,"utility":0.0456,"authentication":0.0456,"service":0.0456}`.
3. **Abrechnen:** Am 1.–3. des Monats (Cron, 03 Uhr UTC) wird der Vormonat je Kunde
   festgehalten (`WhatsAppFeeCharge`, einmal je Kunde und Monat). Mit Stripe-Kunde entsteht
   ein Rechnungsposten „WhatsApp-Gebühren Meta <Monat>“, der automatisch auf der nächsten
   Abo-Rechnung erscheint. Ohne Stripe steht in der Kundenakte „von Hand abrechnen“.
4. **Anzeigen:** Kundenbereich → Konto (laufender Monat und Verlauf), Admin → Kunde →
   WhatsApp-Assistent.

## Monatlich prüfen

- Summe aller `WhatsAppFeeCharge` des Monats mit der 360dialog-/Meta-Abrechnung vergleichen.
  Weicht der Tarif ab (Meta ändert Preise meist zum 1. eines Quartals), `WHATSAPP_FEES_EUR`
  anpassen.
- Nachrichten von vor der Einführung (ohne `billable`) werden nicht berechnet.
