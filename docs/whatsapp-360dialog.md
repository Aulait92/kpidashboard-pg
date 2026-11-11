# WhatsApp: Kunden verbinden ihre Nummer selbst (360dialog)

Stand 14.11.2026. Partner-Konto „Ole Kannapinn UG“, Partner Starter Plan (Partner bezahlt →
API-Key-Freigabe der Kunden kommt automatisch).

## Ablauf

1. Kunde (Inhaber, Paket mit Software) tippt in **Einrichtung → WhatsApp verbinden**.
2. Die App leitet zu 360dialog weiter:
   `https://app.360dialog.com/dashboard/app/<PARTNER_ID>/permissions?redirect_url=…&state=…&lang=de`
   (state = signiert mit `AUTH_SECRET`, enthält Kunde + Ablauf, 2 Stunden gültig).
3. Bei 360dialog: Konto anlegen, Meta-Anmeldung (Embedded Signup), Nummer wählen und bestätigen.
4. Zurück an `https://app.performancegrowth.de/api/whatsapp/360dialog/callback?client=…&channels=[…]&state=…`.
5. Die App prüft den state, erzeugt per Partner-API einen API-Key für den Channel
   (`POST https://hub.360dialog.io/api/v2/partners/<PARTNER_ID>/channels/<CHANNEL>/api_keys`,
   Header `X-API-Key`), speichert ihn verschlüsselt, setzt den Webhook und liest Nummer und Namen.
6. Ist der Channel noch in Einrichtung (360dialog antwortet 409), steht beim Kunden „wird eingerichtet“.
   Der Key wird dann automatisch nachgeholt: sofort beim Partner-Webhook „channel_running“, sonst im
   WhatsApp-Cron (alle 5 Minuten, höchstens 3 Tage lang).
7. Klappt es nicht: Aufgabe „WhatsApp-Verbindung prüfen: <Kunde>“ unter Vertrieb → Aufgaben und
   Push an die Admins. Der Kunde sieht „Wir melden uns“. Rückfall wie bisher: API-Key in
   Admin → WhatsApp-Assistent von Hand eintragen.

Danach wie bisher: Vorlagen bei Meta einreichen, Assistent einschalten.

## Einstellungen im 360dialog Partner Hub (einmalig)

1. **Integration** → **Integration Settings**: **Partner ID** kopieren.
2. **Integration** → **Redirect URL**: `https://app.performancegrowth.de/api/whatsapp/360dialog/callback`
3. **Integration** → **Webhook URL** (Partner-Webhook):
   `https://app.performancegrowth.de/api/whatsapp/360dialog/partner-webhook?token=<WHATSAPP_WEBHOOK_SECRET>`
   (Wert in Railway → kpidashboard-pg → Variables).
4. **API Keys** → Partner-API-Key erzeugen (wird nur einmal angezeigt).
5. **IO Signature** ausgeschaltet lassen (wir schützen über den eigenen signierten state).

## Railway (Service kpidashboard-pg)

| Variable | Wert |
|---|---|
| `DIALOG360_PARTNER_ID` | Partner ID aus Schritt 1 |
| `DIALOG360_PARTNER_API_KEY` | Partner-API-Key aus Schritt 4 |
| `DIALOG360_HUB_URL` | optional, Standard `https://hub.360dialog.io` |
| `DIALOG360_ONBOARDING_URL` | optional, Standard `https://app.360dialog.com/dashboard/app/{partner_id}/permissions` |

Ohne `DIALOG360_PARTNER_ID` und `DIALOG360_PARTNER_API_KEY` ist der Knopf ausgeblendet; die
Einrichtung bleibt dann beim Admin-Weg.

## Quellen (360dialog-Doku)

- Integrated Onboarding (URL-Parameter state, redirect_url, lang, email, name):
  https://docs.360dialog.com/partner/onboarding/integrated-onboarding
- Using Custom IO (Onboarding-URL, Redirect mit `client` und `channels`, API-Key nach `running`):
  https://docs.360dialog.com/partner/onboarding/integrated-onboarding/using-custom-io
- Using Direct Link (Partner-ID im Integration-Tab, Partner-bezahlte Kunden: Freigabe automatisch):
  https://docs.360dialog.com/partner/onboarding/integrated-onboarding/using-direct-link
- Partner-API (Base-URL `https://hub.360dialog.io/api/v2`, Header `x-api-key`):
  https://docs.360dialog.com/partner/partner-api/overview
- Channel Management (api_keys: 409 = noch in Einrichtung mit Retry-After, 1 Anfrage je 30 s und
  Channel; channels mit `setup_info.phone_number`):
  https://docs.360dialog.com/partner/partner-api/api-reference/channel-management
