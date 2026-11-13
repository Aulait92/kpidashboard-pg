# Selbst-Einrichtung neuer Kunden

Ziel: Neue Kunden erledigen ihren Teil der Einrichtung selbst unter **Kundenbereich → Einrichtung**,
die App erinnert sie und Ole sieht nur noch die Fälle, die wirklich hängen.

## Schritte (Fortschritt „Einrichtung x von y“)

| Schritt | Erledigt, wenn … |
|---|---|
| Login | der Kunde sich einmal eingeloggt hat |
| Fragebogen | der Fragebogen gespeichert ist |
| App aufs Handy und Mitteilungen | auf mindestens einem Gerät Mitteilungen erlaubt sind (Push-Anmeldung) |
| Kalender | Google/Microsoft verbunden oder freie Zeiten per Kalender-Link bzw. Allianz-Online-Kalender |
| Provisionen | eigene Provisionssätze unter „Meine Provisionen“ hinterlegt sind |
| Meta freigeben | die Prüfung Werbekonto + Seite + Leads grün ist (oder Ole hakt es in der Kundenakte ab) |
| WhatsApp verbinden | die Nummer über das Selbst-Verbinden verbunden ist (ohne Selbst-Verbinden: macht performancegrowth) |
| Einwilligung im Leadformular | der Kunde es bestätigt oder Ole es in der Kundenakte abhakt |
| Testlead | Ole hakt es ab (unser Schritt) |

Bei „Nur Betreuung“ entfallen Kalender, WhatsApp und Einwilligung.

## Meta freigeben

Der Kunde trägt **Werbekonto-ID** (act_…) und **Facebook-Seite** ein und hat zwei Wege:

1. **„Anfrage von uns senden lassen“**: Die App ruft die Business-to-Business-Funktionen der Meta Business Management API auf
   (`POST /{BUSINESS_ID}/client_ad_accounts` mit `adaccount_id` und `permitted_tasks=["ADVERTISE","ANALYZE"]`,
   `POST /{BUSINESS_ID}/client_pages` mit `page_id` und vollen Seitenrechten). Die Admins des Kunden bekommen eine Benachrichtigung
   in Meta und bestätigen. **Hinweis laut Meta-Doku:** Seit 8.6.2021 ist der Zugang zu diesen Endpunkten eingeschränkt („Apps without
   access will receive an error“). Bekommt unsere App einen Fehler, sieht der Kunde das und nutzt Weg 2. Ob unsere App Zugang hat, zeigt
   sich beim ersten echten Versuch (Fehler stehen in Sentry unter `setup-meta-request-ad` bzw. `-page`).
2. **Klick-Anleitung**: Business-Einstellungen → Partner → Hinzufügen → „Einem Partner Zugriff auf deine Assets gewähren“ → unsere
   Business-ID → Werbekonto („Kampagnen verwalten“) und Seite („Volle Kontrolle“).

**„Zugriff prüfen“** liest mit unserem Systemnutzer-Token (`META_ACCESS_TOKEN`) das Werbekonto, holt das Seiten-Token der Seite und
liest ihre Leadformulare. Jedes der drei Ergebnisse steht einzeln mit verständlicher Erklärung da. Ist alles grün:

- Schritt erledigt, Werbekonto-ID und Seiten-ID stehen in der Kundenakte (`Customer.metaAdAccountId`, `metaPageId`, für die
  Kampagnen-Agenten und Leads),
- Push an Ole „✅ Meta-Zugriff bei <Kunde> ist da“.

Offene Fälle mit eingetragenen IDs prüft der Cron etwa einmal am Tag selbst nach (bestätigt der Kunde die Anfrage nur in Meta, wird
der Schritt ohne weiteres Zutun grün).

**Wichtig für die Anfrage-Funktion:** Der Systemnutzer braucht die Berechtigung `business_management`, und unsere Business-ID muss
stimmen.

## Business-ID und Videos

**Admin → Einstellungen → Einrichtung neuer Kunden**

- **Business-ID**: Vorrang hat der Eintrag dort, sonst die Env `META_BUSINESS_ID` (bzw. alt `PG_META_BUSINESS_ID`), sonst der
  bisherige Standard 3089330734489612. Bitte einmal prüfen (Business Manager → Einstellungen → Unternehmensinfo).
- **Videos**: je Schritt ein Loom- oder YouTube-Link, wird beim Schritt eingebettet (andere Links erscheinen als „Erklärvideo ansehen“).

### Welche Videos sich lohnen (je 1–2 Minuten, Bildschirm aufnehmen)

1. **Meta freigeben** (wichtigstes Video): Business Manager öffnen → Partner → Hinzufügen → Business-ID einfügen → Werbekonto
   „Kampagnen verwalten“ → Seite „Volle Kontrolle“ → speichern. Und: wo man die Werbekonto-ID findet. Und: wie man eine Anfrage von
   uns bestätigt (Benachrichtigung in Meta).
2. **WhatsApp verbinden**: der geführte Ablauf mit Nummer und Bestätigungscode.
3. **Kalender verbinden**: Google bzw. Microsoft verbinden, freie Zeiten festlegen.
4. **App aufs Handy**: iPhone „Zum Home-Bildschirm“, Mitteilungen erlauben.
5. **Einwilligung im Leadformular**: im eigenen Meta-Formular ein Pflicht-Häkchen mit dem Text hinzufügen.
6. **Provisionen**: Sätze eintragen (optional).

## Erinnerungen und „Heute“

- **Kunde**: Ab Start der Einrichtung (Willkommens-Mail) an **Tag 1, 3 und 7** jeweils einmal E-Mail + Mitteilung mit den offenen
  Schritten (werktags 9–18 Uhr). Noch nie eingeloggt → stattdessen erneut die Willkommens-Mail mit frischem Link. Ersetzt die
  bisherige Erinnerung alle 2 Tage.
- **Ole**: Am Tag 7 einmal Push „⏳ Einrichtung hängt“. Ab Tag 7 steht der Fall in **Admin → Heute** („Einrichtung hängt: … seit
  X Tagen“) mit den offenen Schritten. Vorher nicht.
- **Kundenakte → Selbst-Einrichtung**: alle Schritte mit Status, letzte Meta-Prüfung, gesendete Erinnerungen, Knöpfe „Erinnerung jetzt
  senden“ und „Meta-Zugriff jetzt prüfen“; Meta, Einwilligung und Testlead lassen sich per Klick als erledigt markieren.
