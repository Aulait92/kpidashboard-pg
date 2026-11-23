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

- **„Mit Google/Microsoft anmelden“ läuft in der App über den System-Browser**
  (Ole, 23.11.2026) – Google erlaubt keine Anmeldung in eingebetteten Ansichten.
  Ablauf: Knopf öffnet `/api/auth/<anbieter>/start?app=1` im System-Browser
  (In-App-Safari bzw. Chrome Custom Tab). Das App-Kennzeichen steht nur im
  signierten SSO-Status-Cookie. Der Callback setzt dann **keine** Sitzung im
  Browser, sondern erzeugt einen Einmal-Code (Tabelle `AppHandoff`, Zweck
  `app-sso:<anbieter>`, an den Login gebunden, gehasht, 5 Minuten, einmalig) und
  leitet auf `performancegrowth://login?code=…` (Fehler: `?fehler=…`). Die App
  fängt das ab (App-Plugin `appUrlOpen`, `src/lib/native-bridge.ts`), schließt den
  Browser und öffnet `/api/app/login-handoff?code=…` in der App-Ansicht. Dort wird
  der Code eingelöst und wie beim normalen Google/Microsoft-Login angemeldet
  (2FA-Schritt, falls das Gerät nicht vertraut ist), weiter nach `/buyer` bzw. zur
  Admin-Startseite. Code: `src/lib/app-handoff.ts`, Tests
  `tests/unit/app-sso-login.test.ts`.
  **Braucht einen neuen App-Build** (URL-Schema `performancegrowth` in
  `mobile/ios/App/App/Info.plist` und `mobile/android/app/src/main/AndroidManifest.xml`).
  In älteren App-Versionen landet man nach der Anmeldung im System-Browser und
  kommt nicht zurück; dort weiter mit E-Mail + Passwort anmelden. Nach dem Build auf
  echten Geräten prüfen: iOS fragt ggf. „In ‚performancegrowth‘ öffnen?“; wurde die
  App währenddessen vom System beendet, kommt der Rücksprung nicht an (erneut tippen).
- **Kalender verbinden** öffnet im System-Browser (Safari/Chrome) mit einem
  Einmal-Link (5 Minuten gültig, nur einmal nutzbar). Nach dem Verbinden zurück in
  die App wechseln – die Seite lädt sich beim Zurückkehren neu.
- **Face-ID-Sperre**: bewusst weggelassen. Der Login bleibt wie im Browser
  angemeldet; eine App-Sperre per Face ID kann später mit einem
  Biometrie-Plugin ergänzt werden, falls Kunden das wünschen.
- Der Admin-Bereich funktioniert in der App ebenfalls, ist aber nicht das Ziel.
- In dieser Umgebung gibt es weder Xcode noch Android-SDK: gebaut wird nur in
  Codemagic.

## Apple-Developer-Konto der UG (23.11.2026)

- D-U-N-S-Nummer: **313591176** (Ole Kannapinn UG (haftungsbeschränkt), Lorenzstr. 58, 12209 Berlin).
- Apples Antragsformular nimmt kein ä/ß (löscht es stillschweigend). Funktioniert hat `Ole Kannapinn UG (haftungsbeschrankt)`
  (ä → a); „haftungsbeschraenkt“ wird als „passt nicht zum D&B-Profil“ abgelehnt. Adresse übernimmt Apple aus D&B
  (`Lorenzstr. 58`). Antrag am 23.11.2026 abgeschickt, Enrollment-ID **PLB247QF64** (in Prüfung: Apple bestätigt die
  Unterschriftsberechtigung, meist per Anruf, dann Mail mit den nächsten Schritten und der Gebühr).

## Stand Einrichtung (23.11.2026)

- Apple-Konto freigeschaltet, Team ID `JUGFRKCVL4`.
- App ID `de.performancegrowth.app` mit Push Notifications angelegt.
- APNs-Schlüssel „performancegrowth Push“, Key ID `A734GR4PSM` (.p8 nur bei Ole). Railway: `APNS_KEY_ID`, `APNS_TEAM_ID`,
  `APNS_BUNDLE_ID`, `APNS_PRODUCTION=1` gesetzt; `APNS_PRIVATE_KEY` trägt Ole selbst ein.
- App Store Connect: App „performancegrowth“ angelegt, Apple-ID der App **6838442707** (für Codemagic `APP_STORE_APPLE_ID`).
- App Store Connect API Team-Schlüssel „Codemagic“ (App-Manager): Key ID `TL3574822A`, Issuer ID
  `5a11393d-570f-4b3a-997e-34045b2f35bf` (.p8 nur bei Ole, in Codemagic als `PG_ASC_KEY`).

- 23.11.2026, 23:05: Version 1.0 (Build 3) zur App-Prüfung eingereicht (Wirtschaft/Produktivität, 4+, kostenlos,
  DE/AT/CH, manuelle Veröffentlichung, EU-Händlerstatus aktiv). Nach Freigabe: ProductUpdate-Neuigkeit mit App-Store-Link
  und Eintrag in docs/webseite-offen.md, dann veröffentlichen.

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
> Demo account: **E-Mail:** `appreview@performancegrowth.de` **Password:** (in App Store Connect)
> The demo account opens a read-only customer area with fictional sample data
> (leads, WhatsApp conversations, appointments, numbers). Nothing is saved and no
> messages are sent from the demo account.
>
> How to test: log in → “Heute” shows today’s tasks → “Kontakte” lists the leads →
> “Nachrichten” shows the WhatsApp history with each lead → open an appointment →
> “Wachstum” shows the numbers. “Abmelden” in the blue bar logs out.
>
> Native features: push notifications (APNs) for new leads, app icon badge with
> new leads, haptic feedback, native share sheet, phone calls, pull-to-refresh,
> swipe-back navigation, offline screen. Push notifications are sent to real
> customer accounts when a new lead arrives; the demo account receives none.

### Prüfer-Zugang (Demo-Login, 23.11.2026)

Kein echtes Konto: Die reservierte E-Mail `appreview@performancegrowth.de` führt bei richtigem Passwort in die
**App-Demo** (`/app-demo`, eigene Datenbank `APP_DEMO_DATABASE_URL`, Beispielmarke „Max Berger“, nachts neu
angelegt). Die Demo ist nur lesend (Postgres `default_transaction_read_only`, gesperrte Schreib-Operationen),
in Demo-Anfragen geht nichts nach außen (`fetch`/`http(s)` gesperrt, `lib/app-demo/ausgang.ts`), Server Actions
und `/api/…` aus der Demo beantwortet die Middleware selbst. Es gibt **keine Sitzung** und **keinen Zugriff auf
echte Kundendaten**; WhatsApp, SMS, Mails, Push und Meta-Aufrufe sind damit ausgeschlossen.

- Anmeldung (`src/app/login/actions.ts` → `src/lib/app-demo/app-review-server.ts`): Passwort nur aus
  `APP_REVIEW_PASSWORT` (mind. 12 Zeichen, Vergleich in konstanter Zeit). Fehlt die Variable, ist sie zu kurz oder
  ist die Demo nicht eingerichtet, ist der Zugang aus (Meldung wie bei falschem Passwort). Die reservierte E-Mail
  erreicht nie die echte Anmeldung.
- Drossel: wie jede Anmeldung 30 Versuche je IP / 15 Min., zusätzlich höchstens 10 Fehlversuche je 15 Min. über
  alle IPs (gezählt im Änderungsprotokoll), danach gesperrt.
- Protokoll: `app_review.login` bzw. `app_review.failed` im Änderungsprotokoll (Akteur `appreview@…`, Rolle `app-review`).
- Nach der Anmeldung setzt der Server das Kennzeichen-Cookie `pg_app_review=1` (30 Tage). Ohne Sitzung leitet die
  Middleware `/buyer/…` dann in die Demo; ein Neustart der App (Start-URL `/buyer`) landet also wieder in der Demo.
  Das Cookie gewährt nichts, was nicht ohnehin öffentlich ist. „Abmelden“ im blauen Demo-Banner löscht es; eine
  echte Anmeldung oder Abmeldung ebenfalls.
- In der App: Zähler am Symbol wird in der Demo auf 0 gesetzt (die Demo beantwortet `/api/app/device` mit 403),
  der Hinweis „Benachrichtigungen einschalten“ ist in der Demo ausgeblendet, Ziehen zum Aktualisieren und Rückkehr
  in die App laden die Demo-Seite neu. Lokal mit simuliertem Capacitor geprüft.
- Tests: `tests/unit/app-review-login.test.ts`.

**Ole, vor der Einreichung:**

1. Railway (`live-app`): `APP_REVIEW_PASSWORT` = ein neues, zufälliges Passwort (mind. 12 Zeichen, z. B. aus dem
   Passwort-Manager). `APP_DEMO_DATABASE_URL` ist bereits gesetzt (die Demo läuft).
2. App Store Connect → App → Versionsinformationen → **App-Review-Informationen**: „Anmeldung erforderlich“
   anhaken, Benutzername `appreview@performancegrowth.de`, Passwort wie in Railway. **Nur dort eintragen**, nicht
   ins Repository, nicht in Chats. Notizen: Text oben (englisch).
3. Kurz selbst prüfen: in der App mit diesen Daten anmelden → „Demo mit Beispieldaten“ erscheint.
4. Nach der Freigabe kann das Passwort bleiben (Apple prüft jedes Update erneut); bei Verdacht einfach in Railway
   ändern und in App Store Connect nachziehen.

**Behoben (23.11.2026):** „Heute“ in der Demo lieferte 500 (beim Rendern der Kontaktakte wurden die
E-Mail-Vorlagen angelegt, der Lese-Client lehnt das ab). Die Vorlagen legt jetzt das nächtliche Neuanlegen an
(`src/lib/app-demo/seed.ts`). Wirkt in Produktion nach dem Deploy erst mit dem nächsten Neuanlegen (beim Start, wenn
die Daten älter als 20 Stunden sind, sonst nachts); zum sofortigen Prüfen: nach dem Deploy `/app-demo` aufrufen,
notfalls `scripts/app-demo-seed.ts` gegen die Demo-Datenbank.

## Screenshots (iPhone 6,9", 1320 × 2868)

`docs/app-store/screenshots/`: `01-heute.png`, `02-kontakte.png`, `03-chat.png` (WhatsApp-Verlauf mit
Terminbuchung), `04-termin.png` (Terminvorbereitung), `05-zahlen.png` (Wachstum). Aus der App-Demo mit
Beispieldaten, ohne Demo-Banner, mit iOS-Statusleiste 9:41. Neu erzeugen (z. B. nach Änderungen der Oberfläche):

```
node tools/app-store/screenshots.js https://app.performancegrowth.de
# lokal: node tools/app-store/screenshots.js http://localhost:3000  (mit APP_DEMO_DATABASE_URL)
# eigener Chromium: PW_CHROME=/pfad/zu/chrome
```

Hinweis: In der Terminvorbereitung steht als Tarifbeispiel ein echter Versicherername (Beispieldaten der Demo).
Falls Apple das bemängelt (Markenrechte, 5.2), ein anderes Motiv wählen (z. B. die Präsentation) oder die
Tarifempfehlung der Demo neutral setzen und neu aufnehmen.

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
