# App-Store-App (iOS/Android) – Kundenbereich

Stand 11.11.2026. Die App ist eine **Capacitor-Hülle** (Ordner `mobile/`) um den
bestehenden Kundenbereich `https://app.performancegrowth.de/buyer`. Inhalte
kommen weiter vom Server: jede Änderung an der Web-App ist sofort in der App,
ohne neues Store-Update. Neu bauen muss man die App nur bei Änderungen an
`mobile/` (Symbol, Plugins, Berechtigungen, Version).

| | |
|---|---|
| Name | performancegrowth |
| Bundle-ID / Paketname | `de.performancegrowth.app` |
| Start-URL | `https://app.performancegrowth.de/buyer` (lokal überschreibbar mit `CAP_SERVER_URL`) |
| In der App erlaubt | `app.performancegrowth.de`, `staging.performancegrowth.de` – alles andere öffnet im System-Browser; `tel:`/`mailto:` öffnen Telefon bzw. Mail |
| Kennung im User-Agent | `performancegrowthApp/1.0` |
| Kein Netz | eingebaute Seite „Keine Verbindung“ mit „Erneut versuchen“ |

## Was die App kann

- **Native Push** (APNs für iPhone, Firebase Cloud Messaging für Android) – zusätzlich
  zu Web-Push. Die Anfrage zur Erlaubnis kommt erst, wenn man in der App
  „Benachrichtigungen einschalten“ tippt (wie bisher im Web). Tippen auf eine
  Benachrichtigung öffnet direkt den Lead/die Seite.
- **Zähler am App-Symbol**: neue, noch nicht kontaktierte Leads der letzten 14 Tage
  (Berater: nur die eigenen). Aktualisiert bei jedem Push, beim Öffnen und bei
  Rückkehr in die App.
- **Haptik** (Liste unten), natives **Teilen**, Anrufen über `tel:`.
- **Ziehen zum Aktualisieren** auf allen Seiten des Kundenbereichs (Heute, Kontakte,
  Nachrichten, …), Rückkehr in die App lädt die Daten neu.
- **iOS: Wischen vom linken Rand = zurück**, Android: Zurück-Taste geht zurück bzw.
  legt die App ab.
- Tastatur mit „Fertig“-Leiste, Statusleiste hell, Inhalte unter Notch und
  Home-Leiste frei.
- Kein Hinweis „Zum Home-Bildschirm hinzufügen“ in der App.

### Wo welche Haptik

| Haptik | Wo |
|---|---|
| Auswahl (leichter Klick) | untere Navigation, Reiter/Tabs, Filter-Chips, Schalter, Segmente, Checkboxen, Auswahllisten |
| Impact leicht | Ziehen zum Aktualisieren (beim Erreichen der Schwelle), „Rückgängig“ im Hinweis, Aufklappblatt (Sheet) öffnet |
| Impact mittel | Anruf starten (`tel:`-Links), langes Drücken (Kontextmenü, `data-longpress`) |
| Erfolg | Aufgabe erledigt, Gespeichert/Erfolgs-Hinweis |
| Warnung | Löschen und andere rote („gefährliche“) Knöpfe |
| Fehler | Fehler-Hinweis (Formular/Server) |
| Benachrichtigung | neuer Lead oder neue Nachricht kommt live herein, während die App offen ist |
| keine | Scrollen, normale Links/Seitenwechsel |

Technik: `src/lib/haptics.ts` (semantische Funktionen `tap`, `selection`,
`impact`, `success`, `warning`, `error`, `notification`). Neue Knöpfe bekommen
Haptik einfach per Attribut, z. B. `data-haptic="success"`. Im Browser passiert
nichts – außer auf Android-Browsern eine kurze Vibration bei Erfolg/Warnung/Fehler.

### App-Gefühl (nur in der App, Klasse `html.native-app`)

Kein Markieren von Text/Lupe bei langem Drücken (außer in Eingabefeldern), kein
Nachfedern der ganzen Seite (Listen und Dialoge federn weiter), kein
Doppeltipp-Zoom, dezente Einblendung beim Seitenwechsel. Überall (auch Web):
kein grauer Tipp-Blitz, Knöpfe geben beim Drücken leicht nach (97 %).

### Bekannte Grenzen

- **„Mit Google/Microsoft anmelden“ ist in der App ausgeblendet** – Google erlaubt
  keine Anmeldung in eingebetteten Ansichten. Anmeldung in der App mit E-Mail +
  Passwort.
- **Kalender verbinden** öffnet im System-Browser (Safari/Chrome) mit einem
  Einmal-Link (5 Minuten gültig, nur einmal nutzbar). Nach dem Verbinden zurück in
  die App wechseln – die Seite lädt sich beim Zurückkehren neu.
- **Face-ID-Sperre**: bewusst weggelassen. Der Login bleibt wie im Browser
  angemeldet; eine App-Sperre per Face ID kann später mit einem
  Biometrie-Plugin ergänzt werden, falls Kunden das wünschen.
- Der Admin-Bereich funktioniert in der App ebenfalls, ist aber nicht das Ziel.
- In dieser Umgebung gibt es weder Xcode noch Android-SDK: gebaut wird nur in
  Codemagic.

## Was Ole tun muss (sobald das Apple-Konto freigeschaltet ist)

Bitte **keine Schlüssel in Chats oder E-Mails kopieren** – nur direkt in Railway
bzw. Codemagic eintragen.

### 1. Apple Developer (developer.apple.com → Certificates, IDs & Profiles)

1. **Identifiers → +** → App IDs → App → Bundle ID *explicit*
   `de.performancegrowth.app`, Beschreibung „performancegrowth“.
   Unter Capabilities **Push Notifications** anhaken → Speichern.
2. **Keys → +** → Name „performancegrowth Push“, **Apple Push Notifications service
   (APNs)** anhaken → Weiter → Registrieren → **.p8 herunterladen** (geht nur
   einmal!). Notieren: **Key ID** (10 Zeichen) und oben rechts die **Team ID**.

### 2. App Store Connect (appstoreconnect.apple.com)

1. **Apps → + → Neue App**: Plattform iOS, Name „performancegrowth“, Sprache
   Deutsch, Bundle-ID `de.performancegrowth.app`, SKU z. B. `pg-app-1`.
   Die **Apple-ID der App** (Zahl unter „App-Informationen“) notieren.
2. **Benutzer und Zugriff → Integrationen → App Store Connect API → Team-Schlüssel
   → +**: Name „Codemagic“, Zugriff **App-Manager** → .p8 herunterladen,
   **Issuer ID** und **Key ID** notieren.
3. **TestFlight → Interne Tests**: Gruppe „Team“ anlegen, Ole (und wer testen soll)
   hinzufügen.

### 3. Firebase (für Android-Push)

1. console.firebase.google.com → Projekt „performancegrowth“ anlegen (Analytics aus).
2. **Android-App hinzufügen**: Paketname `de.performancegrowth.app` →
   `google-services.json` herunterladen.
3. **Projekteinstellungen → Dienstkonten → Neuen privaten Schlüssel generieren**
   → JSON-Datei (für den Server).
4. iOS-App in Firebase ist **nicht nötig** (iPhone-Push geht direkt über APNs).

### 4. Google Play Console (für Android)

1. App anlegen „performancegrowth“, Standardsprache Deutsch, App, kostenlos.
2. **Einrichtung → API-Zugriff**: Dienstkonto verknüpfen (Google Cloud), Rolle
   „Release-Manager“ → JSON-Schlüssel herunterladen (für Codemagic).
3. Upload-Schlüssel: In Codemagic einen Keystore erzeugen oder hochladen (siehe 6).
   **Play App Signing** aktiv lassen.

### 5. Railway (Server, Produktion – Staging optional gleich)

| Variable | Wert |
|---|---|
| `APNS_KEY_ID` | Key ID aus 1.2 |
| `APNS_TEAM_ID` | Team ID aus 1.2 |
| `APNS_PRIVATE_KEY` | kompletter Inhalt der .p8 aus 1.2 (mit `-----BEGIN PRIVATE KEY-----`; Zeilenumbrüche dürfen als `\n` stehen) |
| `APNS_BUNDLE_ID` | `de.performancegrowth.app` (optional, ist Standard) |
| `APNS_PRODUCTION` | `1` (TestFlight und App Store nutzen den Produktions-APNs; nur bei Builds direkt aus Xcode weglassen) |
| `FIREBASE_SERVICE_ACCOUNT` | Dienstkonto-JSON aus 3.3, einzeilig oder Base64 |

Ohne diese Variablen läuft alles weiter, nur ohne Push an die App (Web-Push bleibt).

### 6. Codemagic (codemagic.io, mit GitHub verbinden, Repository auswählen)

Die Datei `codemagic.yaml` im Repository wird automatisch erkannt.

| Wo in Codemagic | Name | Inhalt |
|---|---|---|
| Team → Integrations → Developer Portal | `PG_ASC_KEY` | Issuer ID, Key ID und .p8 aus 2.2 |
| Gruppe `app_store` | `APP_STORE_APPLE_ID` | Apple-ID der App aus 2.1 |
| Gruppe `google_play` | `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS` | Play-Dienstkonto-JSON aus 4.2 (als „Secret“) |
| Gruppe `google_play` | `GOOGLE_SERVICES_JSON` | `base64 -i google-services.json` aus 3.2 |
| Code signing identities → Android keystores | `PG_UPLOAD_KEYSTORE` | Upload-Keystore (Codemagic kann einen erzeugen – **Passwörter sicher aufbewahren**) |
| Code signing identities → iOS | – | „Fetch“ für `de.performancegrowth.app`, Typ App Store (Codemagic erstellt Zertifikat + Profil selbst) |

Builds starten mit einem **Git-Tag `app-v…`** (z. B. `app-v1.0.0`) oder von Hand
in Codemagic („Start new build“, Workflow wählen). Ergebnis:

- **iOS → TestFlight**: nach ca. 15–30 Min. Verarbeitung in der TestFlight-App auf
  dem iPhone installierbar.
- **Android → Play, interner Test** (als Entwurf): in der Play Console
  freigeben, Tester-Link öffnen.

### 7. Testen (TestFlight)

1. TestFlight-App installieren, Einladung annehmen, „performancegrowth“ installieren.
2. Mit dem Kundenzugang anmelden → Einstellungen → Benachrichtigungen einschalten.
3. Testlead schicken: Push kommt, Zähler am Symbol steht, Tippen öffnet den Lead.
4. Durchklicken: Heute, Leads, Nachrichten, Anrufen, Teilen, Ziehen zum
   Aktualisieren, Wischen zurück, Haptik (Liste oben), Flugmodus → „Keine Verbindung“.

## Store-Texte (Deutsch)

**Name:** performancegrowth
**Untertitel (30):** Leads, Termine und Kunden
**Kategorie:** Business (zweite: Produktivität)
**Altersfreigabe:** 4+
**Werbetext (170):** Neue Leads sofort aufs Handy, in Sekunden anrufen oder per
WhatsApp antworten – und nie wieder einen Rückruf vergessen.

**Beschreibung:**

> performancegrowth ist die App für Versicherungsvermittler und Makler, die mit
> uns Neukunden gewinnen. Jeder neue Lead landet sofort auf deinem Handy – mit
> Push-Benachrichtigung, Zähler am App-Symbol und allen Angaben aus dem Formular.
>
> • Heute: alles, was jetzt zu tun ist – neue Leads, Rückrufe, Termine, Antworten
> • Ein Tipp zum Anrufen, danach kurz festhalten, wie es lief
> • WhatsApp- und E-Mail-Verlauf mit jedem Kontakt an einem Ort
> • Wiedervorlagen und Nachfass-Erinnerungen, damit kein Lead liegen bleibt
> • Termine direkt im eigenen Kalender
> • Deine Zahlen: Leads, Termine, Abschlüsse und Kosten pro Abschluss
> • Für Teams: Leads an Berater verteilen, jeder sieht seine eigenen
>
> Die App ist für Kunden von performancegrowth. Den Zugang bekommst du mit dem
> Start deiner Kampagne.

**Schlüsselwörter (100):** leads,versicherung,makler,crm,vertrieb,termine,rückruf,whatsapp,kunden,vermittler
**Support-URL:** https://performancegrowth.de/kontakt
**Datenschutz-URL:** https://performancegrowth.de/datenschutz
*(beide vor der Einreichung prüfen)*

## App Privacy (App Store „Datenschutz-Etiketten“)

Kein Tracking, keine Werbung, keine Weitergabe an Dritte zu Werbezwecken.
Alle Angaben **„mit der Identität verknüpft“, „nicht für Tracking“**:

| Datentyp | Zweck |
|---|---|
| Kontaktdaten: Name, E-Mail, Telefonnummer | App-Funktionalität (Login, Kundenkonto) |
| Kontakte / Nutzerinhalte: Lead-Daten, Nachrichten, Notizen | App-Funktionalität (Kernfunktion CRM) |
| Kennungen: Benutzer-ID, Geräte-ID (Push-Token) | App-Funktionalität (Push) |
| Nutzungsdaten: Produktinteraktion | Analysen (eigene Nutzungsmessung, nicht an Dritte) |
| Diagnose: Absturz-/Fehlerdaten | App-Funktionalität (Fehlerüberwachung Sentry) |

Google Play „Datensicherheit“: gleiche Angaben; Daten verschlüsselt übertragen;
Löschung auf Anfrage möglich (Kontakt: Support).

## Hinweise für die Prüfung (Review Notes)

> performancegrowth is a business app for insurance agents who receive leads from
> our marketing campaigns. Access is only for our customers; there is no
> sign-up in the app.
>
> Demo account: **E-Mail:** `<DEMO_LOGIN_EMAIL>` **Password:** `<DEMO_LOGIN_PASSWORT>`
> (contains sample leads, messages and appointments)
>
> How to test: log in → “Heute” shows today’s tasks → tap a lead to call or
> message → “Einstellungen → Benachrichtigungen” enables push notifications.
>
> Native features: push notifications (APNs) for new leads, app icon badge with
> new leads, haptic feedback, native share sheet, phone calls, pull-to-refresh,
> swipe-back navigation, offline screen.

**Ole:** vor der Einreichung einen Demo-Login (Kunde „Demo“ mit Beispieldaten)
anlegen und die Platzhalter ersetzen – nur in App Store Connect eintragen, nicht
ins Repository.

## Warum das keine „reine Website-Hülle“ ist (Richtlinie 4.2)

Apple lehnt Apps ab, die nur eine Website anzeigen (4.2 Minimum Functionality).
Argumente, falls die Prüfung nachfragt:

1. **Native Push-Benachrichtigungen über APNs** für neue Leads und Antworten –
   der Kernnutzen: Ein Lead muss in unter einer Minute angerufen werden.
2. **Zähler am App-Symbol** mit der Zahl unbearbeiteter Leads, aktualisiert per
   Push und beim Öffnen.
3. **Haptisches Feedback** durchgängig (Taptic Engine) bei Aktionen, Auswahl,
   Erfolg/Fehler, eingehenden Leads.
4. **Native Bedienung**: Teilen-Menü, Anrufen, Ziehen zum Aktualisieren,
   Wischen-zurück, Tastatur-Leiste, Offline-Bildschirm, eigene Startanimation.
5. **Geschäfts-App für einen geschlossenen Nutzerkreis** (Kunden mit Vertrag) mit
   personalisierten Daten – kein öffentlicher Web-Inhalt, der im Browser
   gleichwertig wäre.

Falls trotzdem abgelehnt: Antwort mit diesen Punkten und einem kurzen
Bildschirmvideo (Push → Tippen → Anruf → Haptik). Plan B laut
`docs/ppl-abloesung-plan.md`: native Neuentwicklung (Expo/React Native) der
Kernabläufe.

## Technik (für Entwickler)

- `mobile/` hat ein eigenes `package.json` (Capacitor 8, Plugins fest
  versioniert) und ist aus Next-Build, TypeScript, ESLint und Vitest ausgenommen.
- Die Web-App lädt **keine** Capacitor-Pakete: `src/lib/native-bridge.ts` spricht
  die von der App eingespeisten Plugins unter `window.Capacitor.Plugins` an und
  ist im Browser ein No-op. `src/components/native-app-bridge.tsx` startet alles
  (nur wenn `isNativeApp()`).
- Server: `DeviceToken` (Tabelle der App-Geräte), `AppHandoff` (Einmal-Links);
  API `POST/DELETE/GET /api/app/device`, `POST/GET /api/app/handoff`.
  Versand in `src/lib/native-push.ts`, angebunden in `src/lib/push.ts`
  (`sendToUser`, `sendToBuyersOfCustomer`, `sendToAdmins` schicken an Web und App).
  Ungültige Tokens (APNs 410/BadDeviceToken, FCM UNREGISTERED/404) werden gelöscht.
- Symbol/Startbild neu erzeugen: Quellbilder in `mobile/assets/`, dann
  `cd mobile && npm run assets`.
- Lokal (Mac mit Xcode): `cd mobile && npm ci && npx cap sync ios && npx cap open ios`.
  Gegen Staging: `CAP_SERVER_URL=https://staging.performancegrowth.de/buyer npx cap sync`.
