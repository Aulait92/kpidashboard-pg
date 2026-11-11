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

Danach reicht die App die WhatsApp-Vorlagen automatisch bei Meta ein (siehe unten). Sobald
„Erstanschreiben“ freigegeben ist, Assistent einschalten.

## WhatsApp-Vorlagen automatisch einreichen

Ohne freigegebene Vorlage darf WhatsApp neue Leads nicht anschreiben (und niemanden nach 24 h
Funkstille). Die App reicht deshalb je Kunde alle nötigen Vorlagen selbst bei Meta ein und holt
den Freigabestatus ab. Code: `src/lib/whatsapp/template-plan.ts` (was, wie), `template-submit.ts`
(Einreichen, Abgleich), Texte zentral in `SUGGESTED_TEMPLATE_TEXT` (`src/lib/whatsapp/templates.ts`).

**Wann eingereicht wird**

- direkt nach dem Selbst-Verbinden (auch wenn der Cron den Key nachholt),
- wenn der Admin in Admin → WhatsApp-Assistent einen neuen API-Key speichert,
- Admin-Knopf **Vorlagen einreichen** (oben in den Vorlagen),
- im WhatsApp-Cron gedrosselt: fehlende Vorlagen oder offene Prüfung alle 30 Minuten, sonst alle
  6 Stunden (pausierte/abgelehnte erkennen), höchstens 10 Kunden je Lauf,
- sofort, wenn der Partner-Webhook ein Vorlagen-Ereignis meldet (Typ mit „template“).

**Welche Vorlagen** (Name `pg_<zweck>_v1`, Sprache `de`)

| Zweck | Kategorie beim Einreichen |
|---|---|
| outreach, followup, followup_offer, followup_noshow, followup_last | MARKETING |
| booking_confirmation, reminder | UTILITY |
| campaign_cross_sell, campaign_review, campaign_birthday, campaign_renewal (nur mit Bestandskunden-Modul) | MARKETING, mit Schnellantwort-Knopf „Keine Nachrichten mehr“ |

`[Berater]` wird durch den Kundennamen ersetzt (ohne vorangestelltes „Allianz“). Platzhalter
`{{1}}`, `{{2}}` … bekommen Beispielwerte für die Prüfung (`example.body_text`). Meta stuft die
Kategorie ggf. selbst um (das Feld `allow_category_change` wird nicht mehr unterstützt); die App
übernimmt die Kategorie aus der Liste.

Hat der Admin für einen Zweck schon eine Vorlage von Hand angelegt (freigegeben oder wartend),
reicht die App für diesen Zweck nichts ein.

**Status**

- `APPROVED` → `MessageTemplate.status = "approved"`: ab dann wird die Vorlage zum Senden genutzt.
- `REJECTED`/`DISABLED` → `rejected` mit Grund (`rejectionReason`), Aufgabe „WhatsApp-Vorlage
  abgelehnt: <Kunde>“ unter Vertrieb → Aufgaben und Push an die Admins (je Vorlage einmal).
  In Admin → WhatsApp-Assistent steht der Grund mit Knopf **neu einreichen**: Meta erlaubt jeden
  Namen nur einmal, daher als Revision `pg_<zweck>_v1_r2`, `_r3` … (vorher den Text in
  `SUGGESTED_TEMPLATE_TEXT` anpassen).
- `PAUSED` → `paused` (Meta pausiert bei schlechter Qualität), sonst `pending`.
- Go-live: Einrichtung/Onboarding-Checkliste hat den Punkt „WhatsApp-Vorlage fürs Erstanschreiben
  von Meta freigegeben“ (automatisch).

**Texte ändern:** Text in `SUGGESTED_TEMPLATE_TEXT` ändern und `TEMPLATE_VERSION` in
`template-plan.ts` hochsetzen (`v2`). Dann reicht der Cron die neuen Namen ein; die alte, freigegebene
Version bleibt nutzbar, bis die neue freigegeben ist. Texte ohne Gedankenstriche.

**Abmelde-Knopf (Bestandskunden):** Tippt jemand auf „Keine Nachrichten mehr“, kommt das als
Nachricht vom Typ `button` an. Die App liest den Knopftext und behandelt ihn wie „STOPP“
(Sperre `ExistingCustomer.optOutAt`, Assistent schweigt, Bestätigung „Alles klar, …“).
Widerspruch nach Art. 21 Abs. 4 DSGVO ist damit mit einem Tipp möglich.

**Kunde sieht** unter Profil-Menü → **WhatsApp-Vorlagen** (`/buyer/vorlagen`) jede Vorlage als
WhatsApp-Blase mit Beispielwerten und Status (In Prüfung bei Meta / Freigegeben / Abgelehnt, wir
kümmern uns). Nur lesen.

**360dialog-API** (Header `D360-API-KEY` = Channel-Key des Kunden, Base `https://waba-v2.360dialog.io`):

- `GET /v1/configs/templates?limit=1000` → `{ waba_templates: [{ name, language, status, category, rejected_reason, … }] }`
- `POST /v1/configs/templates` mit `{ name, category, language, components: [{ type: "BODY", text,
  example: { body_text: [[…]] } }, { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text }] }] }`
  → Antwort mit `status: "submitted"`.
- Vorlagen gehören zum WhatsApp-Business-Konto (WABA), nicht zur Nummer.

## Coexistence (Kunde nutzt WhatsApp Business App weiter)

- Nachrichten, die der Kunde selbst in der Business-App schreibt, kommen als Echo
  (`smb_message_echoes`, im Webhook als `value.message_echoes`) an die Nummer-Webhook-URL. Die App
  speichert sie als ausgehende Nachricht („App“) und pausiert den Assistenten für diesen Chat.
- `history` und `smb_app_state_sync` (alter Verlauf, Kontakte) werden nicht übernommen.
- Live noch nicht mit einer echten Coexistence-Nummer getestet.

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
- Vorlagen anlegen und verwalten (POST/GET `/v1/configs/templates`, `rejected_reason`,
  `allow_category_change` nicht mehr unterstützt):
  https://docs.360dialog.com/partner/messaging/template-messages/create-and-manage-template-messages
- Vorlagen-Status: https://docs.360dialog.com/partner/messaging/template-messages/template-statuses
- Vorlagen-Bausteine (Knöpfe, Schnellantwort):
  https://docs.360dialog.com/partner/messaging/template-messages/template-elements
- Vorlagen senden: https://docs.360dialog.com/partner/messaging/template-messages/sending-template-messages
- Partner-Webhook-Ereignisse:
  https://docs.360dialog.com/partner/onboarding/webhook-events-and-setup/webhook-events-partner-and-messaging-api
- Coexistence-Webhooks (`smb_message_echoes`, `history`, `smb_app_state_sync`):
  https://docs.360dialog.com/partner/onboarding/whatsapp-coexistence/coexistence-webhooks
