# Nutzungs-Audit Admin-Bereich (Stand 17.11.2026)

Auftrag (Ole): Wie oft wurden die rund 420 Admin-Funktionen aus `funktionsinventar.json` (tatsächlich 431 Einträge)
in den letzten 60 Tagen auf Produktion genutzt? Datenzugang ausschließlich über den lesenden Diagnose-Endpunkt
`/api/ops/diagnose`. Nur gelesen, nichts geändert.

## Ergebnis in Kürze

1. **Die Nutzung des Admin-Bereichs wird heute nicht gemessen.** Die Nutzungsmessung (`UsageEvent`) läuft nur im
   Vermittlerbereich `/buyer`. Seitenaufrufe im alten Admin (`/admin/*`, 63 Seiten) und im neuen Admin
   (`/admin/neu/*`, 63 Seiten) werden nirgends gespeichert. **Top 20 Admin-Seiten: nicht erfasst.**
2. **Nur Aktionen mit Änderungsprotokoll hinterlassen Spuren.** 114 von 431 Funktionen schreiben beim Ausführen einen
   `AuditLog`-Eintrag (58 direkt in der Server Action, 56 über eine aufgerufene Hilfsfunktion). Die übrigen
   **317 Funktionen (74 %) sind nicht erfasst**, darunter fast der ganze Vertrieb (72 von 77) und Heute (34 von 37).
3. **Auch das Erfasste ist über den Diagnose-Endpunkt nicht abrufbar.** Keine der 25 Abfragen auf Produktion liest
   `AuditLog` oder `UsageEvent` gesammelt aus (geprüft am 17.11.2026, 20:21 UTC). Darum steht in der Tabelle bei
   allen Funktionen entweder „nicht erfasst“ oder „erfasst, nicht abrufbar“, aber keine Zahl.
4. **60 Tage sind mit den vorhandenen Daten unmöglich.** `UsageEvent` gibt es seit 08.11.2026, `AuditLog` seit
   10.11.2026. Selbst mit einer neuen Abfrage reicht die Historie höchstens 7 bis 9 Tage zurück. Was davor war, lässt
   sich nur grob aus Zeitstempeln von Fachdaten ableiten (Aufgaben, Aktivitäten, Angebote).
5. **Vorschlag „täglich / wöchentlich / selten / nie“ ist darum überall „offen“.** Für eine belastbare Einteilung
   braucht es (a) eine kleine lesende Diagnose-Abfrage für das Änderungsprotokoll (unten beschrieben, nicht gebaut)
   und (b) eine Klickmessung im neuen Admin über die schon vorhandenen `data-funktion`-Attribute, die direkt auf die
   Funktions-IDs des Inventars zeigen. Danach 2 bis 4 Wochen sammeln.

## Was überhaupt erfasst wird

| Quelle | Was | Admin-Bezug | Seit | Aufbewahrung |
|---|---|---|---|---|
| `UsageEvent` (`src/lib/usage.ts`, `/api/usage`, `buyer-shell.tsx`) | Seitenaufrufe, Aktionen, Fehler-Toasts, Feedback im Vermittlerbereich. Schreibt nur mit Vermittler-Kontext (`getBuyerContext`) | **Keiner** für Admin-Seiten. Einzige Admin-Spur: „Als Kunde ansehen“ erzeugt Ereignisse mit `preview = true`, aber `userId = null` (kein Admin zuordenbar; auch die Demo ohne Login schreibt `preview = true`) | 08.11.2026 (Commit „Nutzungsmessung“) | 180 Tage (`pruneUsage`) |
| `AuditLog` (`src/lib/audit.ts`) | rund 190 Aktionsnamen im Code (z. B. `user.create`, `billing.retainer`, `kpi.kosten`, `bank.sync`, `login`). Speichert Zeitpunkt, `actorId`, `actorRole` (ADMIN, BUYER, system, lead), Aktion, Objekt | Ja, für 114 Inventar-Funktionen (s. Tabelle). Admin-Logins (`login`, `login.2fa`) zeigen aktive Tage je Admin. Umschalten auf den neuen Admin: `admin.new_ui` | 10.11.2026 (Migration `20261110090000_aenderungsprotokoll`) | 365 Tage, `login.failed` 30 Tage |
| Server-Action-Aufrufe allgemein | **nicht erfasst.** Kein Wrapper und keine Middleware protokolliert Aufrufe. Server Actions gehen als POST an die Seiten-URL | nein | – | – |
| Schalter alter/neuer Admin | Cookie `pg_admin_neu` (nur im Browser), Umschalten wird als `admin.new_ui` protokolliert | Welche Oberfläche bei welchem Aufruf genutzt wurde: nicht erfasst | 16.11.2026 (neuer Admin) | – |
| Push-Klicks (`?von=push`) | Middleware leitet nur um, speichert nichts | nicht erfasst | – | – |
| Fachdaten mit Zeitstempel | z. B. `SalesTask.createdAt/doneAt`, `SalesActivity.occurredAt`, `AdminDismissal.createdAt` (Heute ausblenden), `Offer.createdAt`, `MonthlyReport`, `ProductUpdate` | Indirekt: zeigen Ergebnisse von Admin-Arbeit, aber nicht wer, nicht wie oft geklickt, teils auch automatisch erzeugt | je Modell | – |

Hinweise:
- Die Seite `/admin/nutzung` und `/api/ops/usage` werten nur die Nutzung der **Vermittler** aus (`preview = false`),
  nicht die der Admins. `/api/ops/usage` braucht außerdem `ADMIN_API_TOKEN` und wurde nicht verwendet.
- Einige protokollierte Aktionen laufen auch automatisch mit `actorRole = system` (z. B. `optimierung.lauf`,
  `bericht.send`, `kampagne.angelegt`, `produkt.start`). Eine Auswertung muss nach `actorRole = 'ADMIN'` filtern.
- Railway-HTTP-Logs (Anfragen je Pfad) könnten Seitenaufrufe grob nachliefern, liegen aber außerhalb des erlaubten
  Datenzugangs und wurden nicht genutzt. Server Actions wären dort nur als POST auf die Seite sichtbar, nicht je Funktion.

## Diagnose-Endpunkt: was es gibt

Abfragen auf Produktion (Liste aus der Fehlermeldung bei unbekannter Abfrage, entspricht `src/app/api/ops/diagnose/route.ts`):
`zustellfehler, variablen, uebersicht, stripe, followups, vorlagen, demo, kunden, whatsapp, d360, d360webhook, angebote,
gedankenstriche, login, meta, capi, ppl, hvk, instantly, instantly-auswertung, vertrieb-termine, kette, ki-eu,
kunde-abrechnung, anzeige-abdeckung`.

- Keine Abfrage zählt `UsageEvent` oder `AuditLog` nach Aktion, Zeitraum oder Rolle.
- `login&email=…` liest `AuditLog`, aber nur Login-Ereignisse einer einzelnen E-Mail. Für ein Nutzungs-Audit
  ungeeignet und hätte Admin-E-Mails gebraucht, darum nicht verwendet.
- Die übrigen Abfragen liefern Betriebszustände (Kunden, Vorlagen, Follow-ups, Termine), keine Nutzungszahlen.

## Was man ergänzen müsste (Vorschlag, nicht gebaut)

**1. Lesende Diagnose-Abfrage `q=admin-nutzung[&tage=60]`** in eigenem Modul `src/lib/ops/admin-nutzung.ts`,
eingetragen in `WEITERE` der Diagnose-Route. Ausgabe nur Zahlen, keine Namen, E-Mails oder IDs von Personen:

```ts
const seit = new Date(Date.now() - tage * 864e5);
// a) Aktionen der Admins je Aktionsname
prisma.auditLog.groupBy({ by: ["action"], where: { actorRole: "ADMIN", at: { gte: seit } }, _count: true, _max: { at: true } });
// b) Anzahl verschiedener Admins je Aktion (nur Zahl)
prisma.$queryRaw`SELECT "action", COUNT(DISTINCT "actorId")::int AS nutzer FROM "AuditLog"
                 WHERE "actorRole" = 'ADMIN' AND "at" >= ${seit} GROUP BY "action"`;
// c) Zum Vergleich: dieselben Aktionen automatisch (actorRole = 'system')
// d) Erfasst seit: MIN("at") aus AuditLog und UsageEvent
// e) Admin-Vorschau: UsageEvent mit preview = true ohne Demo-Kunde, gruppiert nach name (Seiten im Vermittlerbereich)
// f) optional Fachdaten-Spuren: SalesTask angelegt/erledigt, SalesActivity je type, AdminDismissal je Schlüssel-Präfix,
//    Offer angelegt, MonthlyReport versendet (je Anzahl und letzter Zeitpunkt)
```

Mit (a) und (b) lassen sich die 114 Funktionen mit Spalte „Messbar über = Audit“ unten direkt füllen.

**2. Messung im Admin selbst (Code-Änderung, ebenfalls nicht gebaut):** Seitenaufrufe in den Layouts von
`/admin` und `/admin/neu` sowie ein Klick-Listener auf Elemente mit `data-funktion` (gibt es im neuen Admin bereits
für jede Inventar-Funktion), die Pfad bzw. Funktions-ID pseudonym speichern. `UsageEvent.customerId` ist Pflicht und
setzt einen Vermittler voraus, darum eigener Typ oder eigenes kleines Modell. Erst damit gibt es echte Zahlen für die
317 nicht erfassten Funktionen und die Top 20 Seiten.

## Top 20 meistgenutzte Admin-Seiten

**Nicht erfasst.** Weder alte (`/admin/*`) noch neue (`/admin/neu/*`) Admin-Seiten erzeugen Seitenaufrufe.
Eine Rangliste wäre geraten und wird darum nicht angegeben.

## Funktionen je Bereich

Lesart der Spalten:
- **Aufrufe 60 T / letzte Nutzung / Nutzer (Admin):** „nicht erfasst“ = keine Messung vorhanden.
  „erfasst, nicht abrufbar“ = die Aktion schreibt ins Änderungsprotokoll, der Diagnose-Endpunkt kann es aber nicht
  auslesen; Historie ohnehin erst ab 10.11.2026.
- **Vorschlag:** „offen (keine Daten)“, weil ohne Zahlen keine Einteilung in täglich / wöchentlich / selten / nie
  möglich ist.
- **Messbar über:** Audit-Aktion(en), die beim Ausführen geschrieben werden. „direkt“ = `audit(…)` steht in der
  genannten Server Action; „über Hilfsfunktion, prüfen“ = die Action ruft eine Funktion auf, die protokolliert
  (automatisch per Code-Suche zugeordnet, eine Ebene tief; Namensgleichheiten möglich, darum markiert). Funktionen,
  die nur etwas anzeigen (Seiten, Karten, Listen, Filter), sind grundsätzlich „nicht erfasst“.
  Zuordnung über Datei und Symbol im Inventarfeld `quelle`.

Überblick:

| Bereich | Funktionen | Audit direkt | Audit über Hilfsfunktion | nicht erfasst |
|---|---:|---:|---:|---:|
| Heute | 37 | 0 | 3 | 34 |
| Vertrieb | 77 | 4 | 1 | 72 |
| Kunden | 107 | 21 | 21 | 65 |
| Leads & Kampagnen | 71 | 8 | 11 | 52 |
| Marketing | 23 | 0 | 3 | 20 |
| Zahlen | 49 | 11 | 0 | 38 |
| Einstellungen | 64 | 14 | 17 | 33 |
| Was ist wo | 3 | 0 | 0 | 3 |
| **Summe** | **431** | **58** | **56** | **317** |

### Heute (37 Funktionen)

| Funktions-ID | Funktion | Bereich | Aufrufe 60 T | letzte Nutzung | Nutzer (Admin) | Vorschlag | Messbar über |
|---|---|---|---|---|---|---|---|
| `admin-shell-adminareas--seitenleiste-mit-bereichen-heute-vertrieb-kunden` | Seitenleiste mit Bereichen Heute, Vertrieb, Kunden, Chats, Zahlen | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `admin-shell-count--zaehler-badge-an-heute-offene-punkte` | Zähler-Badge an Heute (offene Punkte) | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `admin-shell-mobilenav--handy-leiste-unten-mit-allen-bereichen` | Handy: Leiste unten mit allen Bereichen | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `admin-shell-logo--logo-fuehrt-zu-heute` | Logo führt zu Heute | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `command-palette--befehlspalette-mit-seiten-spruengen-35-ziele` | Befehlspalette mit Seiten-Sprüngen (35 Ziele) | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `route-get--suche-nach-kunden-kontakten-leads-api` | Suche nach Kunden, Kontakten, Leads (API) | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `search-dialog-usesearchshortcut--tastenkuerzel-cmd-strg-k-oeffnet-suche-pfeile` | Tastenkürzel Cmd/Strg+K öffnet Suche, Pfeile/Enter/Esc darin | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `notifications-button-usepush--push-benachrichtigungen-aktivieren-abschalten` | Push-Benachrichtigungen aktivieren, abschalten, Test senden | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `admin-profile-menu--profilmenue-einstellungen-sicherheit-abmelden` | Profilmenü: Einstellungen, Sicherheit, Abmelden | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `layout--begruessung-und-zusammenfassung-der-offenen` | Begrüßung und Zusammenfassung der offenen Punkte | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `heute-list--liste-braucht-sie-aus-allen-bereichen-mit` | Liste Braucht Sie aus allen Bereichen mit Sprungknopf | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `admin-heute-heute-filters--filter-alle-vertrieb-kunden-chats-freigaben` | Filter Alle, Vertrieb, Kunden, Chats, Freigaben | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-completetaskaction--aufgabe-erledigt-schnellknopf` | Aufgabe erledigt (Schnellknopf) | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-postponetaskaction--aufgabe-verschieben-auf-morgen-schnellknopf` | Aufgabe verschieben auf morgen (Schnellknopf) | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-meetingoutcomeaction--termin-ergebnis-eintragen-stattgefunden-nicht` | Termin-Ergebnis eintragen (stattgefunden, nicht erschienen, ...) | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-decidestornoquickaction--reklamation-ppl-storno-direkt-annehmen-oder` | Reklamation (PPL-Storno) direkt annehmen oder ablehnen | Heute | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `storno.approve`, `storno.reject` |
| `actions-garantiegewaehrenaction--garantie-fall-gewaehren` | Garantie-Fall gewähren | Heute | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `garantie.gewaehrt` |
| `actions-garantieablehnenaction--garantie-fall-ablehnen-mit-begruendung` | Garantie-Fall ablehnen mit Begründung | Heute | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `garantie.abgelehnt` |
| `actions-offerfollowedupaction--angebot-als-nachgefasst-markieren` | Angebot als nachgefasst markieren | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-dismissaction--punkt-ausblenden-fuer-x-tage-spaeter-gelesen` | Punkt ausblenden für X Tage (Später, Gelesen, Erledigt) | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-undoheuteaction--ausblenden-rueckgaengig-machen-toast` | Ausblenden rückgängig machen (Toast) | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `admin-heute-forms--punkte-formulare-ohne-zuordnung-geparkte-leads` | Punkte: Formulare ohne Zuordnung, geparkte Leads, Reklamationen | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `admin-heute-pay--punkte-zahlung-offen-lastschrift-fehlgeschlagen` | Punkte: Zahlung offen, Lastschrift fehlgeschlagen, Ausgaben zuordnen | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `admin-heute-ob--punkte-onboarding-wartet-einrichtung-haengt` | Punkte: Onboarding wartet, Einrichtung hängt, Kunde reagiert nicht auf Leads, ruhende Konten vor Löschung | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `admin-heute-modul--punkte-bestandskunden-modul-gewuenscht-hilfe` | Punkte: Bestandskunden-Modul gewünscht, Hilfe-Anfragen, Feedback/KI-Antworten schlecht | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `admin-heute-linkedin--punkte-linkedin-entwuerfe-post-fehlgeschlagen` | Punkte: LinkedIn-Entwürfe, Post fehlgeschlagen, LinkedIn neu verbinden | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `admin-heute-chats--punkte-support-chats-monatsberichte-pruefen` | Punkte: Support-Chats, Monatsberichte prüfen, Optimierung freigeben, Später-Follow-ups freigeben | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `admin-heute-rechnung--punkt-rechnungen-ohne-steuernummer` | Punkt: Rechnungen ohne Steuernummer | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `admin-heute-heartbeatproblem--punkt-hintergrund-jobs-bzw-werbedaten-abgleich` | Punkt: Hintergrund-Jobs bzw. Werbedaten-Abgleich hängt | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `admin-heute-meet--termine-heute-und-aufgaben-heute-als-zeilen` | Termine heute und Aufgaben heute als Zeilen | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `admin-heute-autorow--laeuft-von-allein-was-die-app-in-7-tagen` | Läuft von allein: was die App in 7 Tagen automatisch erledigt hat | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `admin-buchungen-neu-countneuebuchungen--hinweis-neue-buchungen-seit-letztem-besuch` | Hinweis neue Buchungen seit letztem Besuch | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `forecast-computemonthlyforecast--umsatz-bzw-gewinn-bis-heute-mit-monats` | Umsatz bzw. Gewinn bis heute mit Monats-Hochrechnung | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `vertrieb-blick--vertrieb-auf-einen-blick-neue-anfragen-der` | Vertrieb auf einen Blick: neue Anfragen der letzten 7 Tage | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `task-row-actions--aus-aufgabe-anrufen-oder-kontakt-oeffnen` | Aus Aufgabe anrufen oder Kontakt öffnen | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--login-liste-aller-kunden-suche-nach-e-mail` | Login-Liste aller Kunden (Suche nach E-Mail) | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `route-get--suche-findet-interne-und-test-kunden-mit-badge` | Suche findet interne und Test-Kunden mit Badge | Heute | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |

### Vertrieb (77 Funktionen)

| Funktions-ID | Funktion | Bereich | Aufrufe 60 T | letzte Nutzung | Nutzer (Admin) | Vorschlag | Messbar über |
|---|---|---|---|---|---|---|---|
| `list-memory-backtolist--zurueck-link-merkt-gefilterte-liste-suche-filter` | Zurück-Link merkt gefilterte Liste (Suche, Filter, Seite) | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `buchung--push-an-admins-mit-sprungziel-kontaktakte` | Push an Admins mit Sprungziel Kontaktakte (Buchung, Termin, Zahlung, Budget, Fragebogen) | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `vertrieb-blick--vertrieb-auf-einen-blick-heute-faellig` | Vertrieb auf einen Blick: Heute fällig, Überfällig, Antworten, Mail nie angerufen | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `vertrieb-blick--vertrieb-auf-einen-blick-naechste-termine` | Vertrieb auf einen Blick: nächste Termine | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `vertrieb-blick--vertrieb-auf-einen-blick-kontakte-je-stufe` | Vertrieb auf einen Blick: Kontakte je Stufe | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--aufgabenliste-gruppiert-ueberfaellig-heute` | Aufgabenliste gruppiert: Überfällig, Heute, Morgen, 7 Tage, Später | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-view--ansicht-offen-oder-erledigt` | Ansicht Offen oder Erledigt | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-task-types--filter-nach-aufgabenart` | Filter nach Aufgabenart | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-createtask--aufgabe-anlegen-art-faellig-uhrzeit-auch-ohne` | Aufgabe anlegen (Art, fällig, Uhrzeit), auch ohne Kontakt | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-toggletask--aufgabe-erledigt-oder-wieder-oeffnen` | Aufgabe erledigt oder wieder öffnen | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-snoozetask--aufgabe-auf-morgen-oder-in-1-woche-schieben` | Aufgabe auf morgen oder in 1 Woche schieben | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-deletetask--aufgabe-loeschen` | Aufgabe löschen | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--kontaktliste-mit-zaehler` | Kontaktliste mit Zähler | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-q--suche-nach-agentur-name-e-mail-ort-telefon` | Suche nach Agentur, Name, E-Mail, Ort, Telefon | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-stage--filter-stufe` | Filter Stufe | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-mail-filters--filter-cold-mail-erhalten-keine-geoeffnet` | Filter Cold Mail (erhalten, keine, geöffnet, geantwortet, bounced) | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-li--filter-linkedin-status-und-plz-beginnt-mit` | Filter LinkedIn-Status und PLZ beginnt mit | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-deletecontacts--mehrere-kontakte-markieren-und-loeschen` | Mehrere Kontakte markieren und löschen | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-tel--direkt-anrufen-aus-der-liste-handy` | Direkt anrufen aus der Liste (Handy) | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-page--seiten-blaettern` | Seiten blättern | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-createleadmanually--kontakt-anlegen-quelle-name-firma-e-mail-telefon` | Kontakt anlegen (Quelle, Name, Firma, E-Mail, Telefon) | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--beim-anlegen-linkedin-profil-nachricht-und` | Beim Anlegen LinkedIn-Profil, Nachricht und Aufgabe für heute mitgeben | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-dragstage--akquise-pipeline-per-drag-drop` | Akquise-Pipeline per Drag & Drop | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `kanban--beim-verschieben-auf-verloren-grund-abfragen` | Beim Verschieben auf Verloren Grund abfragen | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--karten-zeigen-cold-mail-status` | Karten zeigen Cold-Mail-Status | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-setstage--stufe-aendern-auswahl` | Stufe ändern (Auswahl) | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `contact-controls-stagepicker--verloren-mit-grund-und-wettbewerber` | Verloren mit Grund und Wettbewerber | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-tel--anrufen-und-e-mail-schreiben-aus-dem-kopf` | Anrufen und E-Mail schreiben aus dem Kopf | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `buchung-decisionbookinglink--link-entscheidungs-call-kopieren` | Link Entscheidungs-Call kopieren | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--praesentation-oeffnen` | Präsentation öffnen | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `contact-controls-contactmore--menue-website-linkedin-profil-oeffnen` | Menü: Website, LinkedIn-Profil öffnen | Vertrieb | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `contact.delete` |
| `actions-deletecontact--kontakt-loeschen` | Kontakt löschen | Vertrieb | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `contact.delete` |
| `actions-mergecontactsaction--kontakte-zusammenfuehren-mit-suche-nach` | Kontakte zusammenführen mit Suche nach Kandidaten | Vertrieb | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `contact.merge` |
| `contact-merge-duplicatehint--hinweis-moegliche-dubletten` | Hinweis mögliche Dubletten | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-referral--hinweis-empfehlung-von-kunde-mit-setup-rabatt` | Hinweis Empfehlung von Kunde mit Setup-Rabatt | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-enrichaddressaction--website-und-google-neu-auswerten-adresse` | Website und Google neu auswerten (Adresse, Bewertung, Öffnungszeiten) | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-logactivity--aktivitaet-erfassen-anruf-e-mail-notiz-ergebnis` | Aktivität erfassen (Anruf, E-Mail, Notiz, Ergebnis, Grund) mit Folgeaufgabe | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-updateactivity--verlaufseintrag-bearbeiten-oder-loeschen` | Verlaufseintrag bearbeiten oder löschen | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-setreplysentiment--antworten-auf-cold-mails-ansehen-stimmung-setzen` | Antworten auf Cold Mails ansehen, Stimmung setzen | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-addreplymanually--antwort-auf-cold-mail-von-hand-einfuegen` | Antwort auf Cold Mail von Hand einfügen | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-fold-cold-mails--cold-mail-kampagnen-des-kontakts-geoeffnet` | Cold-Mail-Kampagnen des Kontakts (geöffnet, bounced, abgemeldet) | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-termine--termine-calendly-bzw-buchungsseite-mit-meeting` | Termine (Calendly bzw. Buchungsseite) mit Meeting-Link | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-aufgaben--offene-aufgaben-des-kontakts-und-neue-aufgabe` | Offene Aufgaben des Kontakts und neue Aufgabe | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-updatelinkedin--linkedin-status-und-profil-url-pflegen` | LinkedIn-Status und Profil-URL pflegen | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-updatecustomer--kundendaten-kunden-stufe-monatswert-produkte` | Kundendaten: Kunden-Stufe, Monatswert, Produkte, Vertragsstart, Herkunft | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-linkcontactcustomer--kontakt-mit-kundenakte-verknuepfen` | Kontakt mit Kundenakte verknüpfen | Vertrieb | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `vertrieb.verknuepft`, `vertrieb.verknuepfung_geloest` |
| `actions-updateprimaryemailaction--haupt-e-mail-korrigieren` | Haupt-E-Mail korrigieren | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-addcontactemailaction--weitere-e-mail-hinzufuegen-entfernen-zur-haupt-e` | Weitere E-Mail hinzufügen, entfernen, zur Haupt-E-Mail machen | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-updatecontactaddress--adresse-und-telefon-bearbeiten` | Adresse und Telefon bearbeiten | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-stammdaten--stammdaten-agenturtyp-versicherer-inhaber` | Stammdaten: Agenturtyp, Versicherer, Inhaber, Teamgröße, Potenzial, Social, Bewertung, Öffnungszeiten | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-updatecontact--kontakt-felder-allgemein-aendern-ohne` | Kontakt-Felder allgemein ändern (ohne Oberfläche) | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `onboarding-actions-startonboardingaction--onboarding-starten-neues-kundenkonto-oder` | Onboarding starten (neues Kundenkonto oder bestehendes) nach Annahme | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `followup-actions-approvefollowupaction--spaeter-follow-up-je-kontakt-freigeben-texte` | Später-Follow-up je Kontakt: freigeben, Texte Mail 1 und 2 bearbeiten | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `followup-actions-sendfollowupnowaction--spaeter-follow-up-mail-sofort-senden-texte-neu` | Später-Follow-up: Mail sofort senden, Texte neu schreiben | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `followup-actions-stopfollowupaction--spaeter-follow-up-stoppen-oder-planen` | Später-Follow-up stoppen oder planen | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `followup-actions-redraftfollowupaction--spaeter-follow-up-neu-schreiben-ohne-oberflaeche` | Später-Follow-up neu schreiben (ohne Oberfläche) | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `deal-offers-card--angebotskarte-angebot-ansehen-und-pdf` | Angebotskarte: Angebot ansehen und PDF | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `offer-actions-sendofferemailaction--angebot-per-e-mail-senden-mit-anrede-rechner` | Angebot per E-Mail senden mit Anrede, Rechner, Präsentation (PDF/Link), Zielgruppe | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `offer-actions-markoffersentaction--angebot-als-verschickt-markieren-ohne-mail` | Angebot als verschickt markieren (ohne Mail) | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `offer-actions-deleteofferaction--angebot-loeschen` | Angebot löschen | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `offer-actions-setpaymentreminderaction--zahlungserinnerung-spaeter-zahlen-erlauben` | Zahlungserinnerung: Später zahlen erlauben, Erinnerungsdatum | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `deal-offers-card-pay--zahlungsstatus-des-angebots-offen-bestaetigt` | Zahlungsstatus des Angebots (offen, bestätigt, bezahlt, fehlgeschlagen) | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `offer-actions-createofferaction--angebot-erstellen-produkte-werbebudget-laufzeit` | Angebot erstellen: Produkte, Werbebudget, Laufzeit, Start, Setup, Gültigkeit | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `offer-form-empfaenger--angebot-empfaenger-und-kunde-ist-vertreter-oder` | Angebot: Empfänger und Kunde ist Vertreter oder Makler (Garantieart) | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `offer-form-paket--angebot-paket-waehlen-z-b-nur-betreuung` | Angebot: Paket wählen (z. B. Nur Betreuung) | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `offer-form--angebot-testangebot-0-ohne-zahlung-spaeter` | Angebot: Testangebot 0 € ohne Zahlung, Später zahlen erlauben | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `offer-form-verkaeufer--angebot-verkaeufer-zahlweise-und-module` | Angebot: Verkäufer, Zahlweise und Module | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `offer-form-zusammenfassung--angebot-zusammenfassung` | Angebot: Zusammenfassung | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `folien-deck--verkaufspraesentation-mit-angebotspreisen` | Verkaufspräsentation mit Angebotspreisen, Pfeiltasten, Vollbild | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-fassung--fassung-vertreter-oder-makler-waehlen` | Fassung Vertreter oder Makler wählen | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-verkaufslinkaction--link-fuer-interessenten-erzeugen-kopieren` | Link für Interessenten erzeugen, kopieren, Aufrufe sehen | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-verkaufslinkbeendenaction--praesentationslink-beenden` | Präsentationslink beenden | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--angebotsliste-mit-versand-oeffnung-gueltigkeit` | Angebotsliste mit Versand, Öffnung, Gültigkeit, Stand | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-filter--filter-alle-verschickten-offen-angenommen` | Filter Alle verschickten, Offen, Angenommen, Abgelaufen/abgelehnt, Entwürfe | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-filter-zahlung--filter-zahlung-offen` | Filter Zahlung offen | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-disconnectsalescalendaraction--vertriebskalender-verbinden-bzw-trennen` | Vertriebskalender verbinden bzw. trennen | Vertrieb | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `calendar.disconnect` |
| `page--buchungslink-kopieren` | Buchungslink kopieren | Vertrieb | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |

### Kunden (107 Funktionen)

| Funktions-ID | Funktion | Bereich | Aufrufe 60 T | letzte Nutzung | Nutzer (Admin) | Vorschlag | Messbar über |
|---|---|---|---|---|---|---|---|
| `ruhend--push-an-admins-mit-sprungziel-kundenakte` | Push an Admins mit Sprungziel Kundenakte Abrechnung (Kündigung, Reaktivierung, Module, Verkäufer, Pakete) | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `self-connect--push-an-admins-mit-sprungziel-whatsapp` | Push an Admins mit Sprungziel WhatsApp (Verbindung prüfen, Kalender fehlt, Vorlage abgelehnt) | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `onboarding-actions-toggleonboardingstepaction--onboarding-schritte-abhaken` | Onboarding-Schritte abhaken | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `onboarding-actions-goliveaction--live-schalten-bzw-zuruecknehmen` | Live schalten bzw. zurücknehmen | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `onboarding-actions-resendwelcomeaction--willkommens-mail-erneut-senden` | Willkommens-Mail erneut senden | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `onboarding-card-impressum--pflichtangaben-aus-dem-impressum-erstinformation` | Pflichtangaben aus dem Impressum (Erstinformation) anzeigen | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-redirect--weiterleitung-auf-kunden-pipeline-keine-eigene` | Weiterleitung auf Kunden-Pipeline (keine eigene Funktion) | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--kundenliste-mit-status-test-zahlung-offen-pause` | Kundenliste mit Status, Test, Zahlung offen, Pause, Onboarding-Fortschritt, Nächster-Schritt-Quote | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-filters--filter-alle-zahlung-offen-onboarding-pausiert` | Filter Alle, Zahlung offen, Onboarding, Pausiert, Ruhend | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `kunden-tabs--unterreiter-uebersicht-pipeline-leads-pay-per` | Unterreiter Übersicht, Pipeline, Leads, Pay-per-Lead, Optimierung, Monatsberichte | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-dragcustomer--kunden-pipeline-vertrag-onboarding-test-aktiv` | Kunden-Pipeline (Vertrag, Onboarding, Test, Aktiv, Pausiert, Gekündigt) per Drag & Drop | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-movecustomer--kunde-eine-stufe-vor-oder-zurueck` | Kunde eine Stufe vor oder zurück | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `layout--kopf-mit-stufe-onboarding-whatsapp-an-aus` | Kopf mit Stufe, Onboarding, WhatsApp an/aus, Zahlung offen, ruht/gekündigt/gelöscht, pausiert | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `layout-referred--hinweis-hat-x-kunden-geworben-link-empfehlungen` | Hinweis hat X Kunden geworben (Link Empfehlungen) | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `layout-absentusers--abwesenheiten-der-berater-mit-vertretung` | Abwesenheiten der Berater mit Vertretung | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `test-actions-deletetestcustomeraction--testkunde-komplett-loeschen` | Testkunde komplett löschen | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `customer.test_delete` |
| `layout-subtabs--reiter-der-kundenakte` | Reiter der Kundenakte | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `module-actions-togglenewuiaction--neue-oberflaeche-fuer-kunden-an-aus` | Neue Oberfläche für Kunden an/aus | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `customer.new_ui` |
| `module-actions-setvermittlertypaction--vermittlertyp-setzen` | Vermittlertyp setzen | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `customer.provision` |
| `storno-quote-stornoquotekunde--stornoquote-der-vertraege-des-kunden` | Stornoquote der Verträge des Kunden | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `garantien-card--garantien-stand-und-faelle` | Garantien: Stand und Fälle | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-marktestcustomeraction--als-testkunde-markieren` | Als Testkunde markieren | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-seeddemoaction--testdaten-anlegen-bzw-entfernen` | Testdaten anlegen bzw. entfernen | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `onboarding-actions-opensetupaction--selbst-einrichtung-freischalten` | Selbst-Einrichtung freischalten | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `setup-card--einrichtungsschritte-ansehen-einwilligung` | Einrichtungsschritte ansehen (Einwilligung, Erstinformation, Meta-Zugriff) | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `onboarding-actions-sendsetupreminderaction--erinnerung-zur-einrichtung-senden` | Erinnerung zur Einrichtung senden | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `onboarding-actions-admincheckmetaaction--meta-zugriff-pruefen` | Meta-Zugriff prüfen | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `onboarding-actions-restartsetupaction--einrichtung-neu-starten` | Einrichtung neu starten | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `lead-qualitaet-card--lead-qualitaet-disqualifizierte-leads-nach-grund` | Lead-Qualität: disqualifizierte Leads nach Grund und Produkt | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `naechster-schritt-card--naechster-schritt-je-berater-quote-ohne-schritt` | Nächster Schritt je Berater (Quote, ohne Schritt, vorzeitig verloren) | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-contactpage-embedded--eingebettete-kontaktakte-verlauf-aufgaben` | Eingebettete Kontaktakte (Verlauf, Aufgaben, Angebote, Onboarding) | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-grunddaten--grunddaten-region-betreuungsgebuehr-meta` | Grunddaten: Region, Betreuungsgebühr, Meta-Werbekonto | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `meta-account-actions-setmetaadaccountaction--meta-werbekonto-id-setzen` | Meta-Werbekonto-ID setzen | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `customer.meta_account` |
| `capi-actions-setcapidatasetaction--capi-rueckmeldung-status-und-dataset-setzen` | CAPI-Rückmeldung: Status und Dataset setzen | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `customer.capi_dataset` |
| `actions-togglesourceaction--leadformulare-des-kunden-an-aus` | Leadformulare des Kunden an/aus | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `leadsource.toggle` |
| `page--letzte-leads-mit-abschluss-storno` | Letzte Leads mit Abschluss/Storno | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-startrunaction--ki-kampagne-starten-produkt-zusatzwunsch-seiten` | KI-Kampagne starten (Produkt, Zusatzwunsch, Seiten-ID, Datenschutz-URL) | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `kampagne.seite` |
| `actions-getrunaction--fortschritt-abrufen-plan-anzeigen-sofortformular` | Fortschritt abrufen, Plan, Anzeigen, Sofortformular ansehen | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-updatecopyaction--anzeigentext-bearbeiten` | Anzeigentext bearbeiten | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-regenerateimageaction--bild-neu-erzeugen` | Bild neu erzeugen | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-buildrunaction--kampagne-bei-meta-anlegen-pausiert` | Kampagne bei Meta anlegen (pausiert) | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `kampagne.angelegt` |
| `actions-cleanuprunaction--angelegte-kampagne-bei-meta-loeschen-formular` | Angelegte Kampagne bei Meta löschen, Formular archivieren | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `kampagne.aufgeraeumt` |
| `page--verlauf-der-laeufe` | Verlauf der Läufe | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `account-view-protocolcard--protokoll-der-massnahmen-des-kunden` | Protokoll der Maßnahmen des Kunden | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-addmanualaction--massnahme-von-hand-eintragen-datum-art-text` | Maßnahme von Hand eintragen (Datum, Art, Text) | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `optimierung.manuell` |
| `d360-actions-d360assignaction--360dialog-nummer-zuordnen` | 360dialog-Nummer zuordnen | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `d360-actions-d360resetaction--halb-fertige-whatsapp-verbindung-zuruecksetzen` | Halb fertige WhatsApp-Verbindung zurücksetzen | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `whatsapp.reset` |
| `calendar-actions-adminconnectallianzaction--allianz-online-kalender-verbinden-aendern` | Allianz-Online-Kalender verbinden, ändern, trennen | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `calendar.allianz_connect`, `calendar.allianz_disconnect`, `calendar.allianz_template` |
| `calendar-actions-adminsaveleadtimesaction--buchbare-zeiten-fuer-leads-speichern` | Buchbare Zeiten für Leads speichern | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `calendar-actions-adminaddblockaction--zeit-blockieren-und-blocker-loeschen` | Zeit blockieren und Blocker löschen | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `whatsapp-fees-card--meta-gebuehren-intern` | Meta-Gebühren (intern) | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-bestandmodulecard--bestandskunden-kampagnen-hinweis-link-abrechnung` | Bestandskunden-Kampagnen (Hinweis, Link Abrechnung) | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-addcustomeraction--kunde-fuer-den-assistenten-hinzufuegen` | Kunde für den Assistenten hinzufügen | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-connectwhatsappaction--whatsapp-nummer-von-hand-verbinden-nummer-api` | WhatsApp-Nummer von Hand verbinden (Nummer, API-Schlüssel) | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-setagentactiveaction--assistent-aktiv-an-aus` | Assistent aktiv an/aus | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `agent.active` |
| `actions-saveagentsettingsaction--neue-leads-automatisch-anschreiben-nach-x` | Neue Leads automatisch anschreiben nach X Minuten | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-setfollowupsequencesaction--automatisch-nachfassen-abfolgen-an-aus` | Automatisch nachfassen (Abfolgen) an/aus | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `agent.sequences` |
| `actions-saveagentsettingsaction--berater-e-mail-fuer-einladungen-videoraum` | Berater-E-Mail für Einladungen, Videoraum, belegte Zeiten aus ICS | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `calendar-card-calendarcard--buchungskalender-google-microsoft-verbinden` | Buchungskalender Google/Microsoft verbinden, Buchungslink für Leadformular | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `controls-templateautostatus--vorlagen-des-kunden-ansehen-status-bei-meta` | Vorlagen des Kunden ansehen, Status bei Meta | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-savetemplateresultaction--vorlage-anlegen-bearbeiten-mit-zweck` | Vorlage anlegen/bearbeiten mit Zweck, Platzhaltern, Handy-Vorschau | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-deletetemplateaction--vorlage-loeschen` | Vorlage löschen | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-submittemplatesaction--vorlagen-bei-meta-einreichen-bzw-einzeln-neu` | Vorlagen bei Meta einreichen bzw. einzeln neu einreichen | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-settemplateapprovedaction--vorlage-von-hand-als-freigegeben-markieren` | Vorlage von Hand als freigegeben markieren | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-saveoutreachsettingsaction--erstanschreiben-einstellungen-alt-ohne` | Erstanschreiben-Einstellungen (alt, ohne Oberfläche) | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--uebersicht-aller-kunden-mit-assistent-liste` | Übersicht aller Kunden mit Assistent (Liste, Sprung) | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--hinweis-zahlung-offen-seit` | Hinweis Zahlung offen seit | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `lebenszyklus-card--kuendigung-rueckkehr-ruht-seit-reaktiviert` | Kündigung & Rückkehr: ruht seit, reaktiviert | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `retainer-actions-saveretaineraction--betreuungsgebuehr-eintragen-aendern-entfernen` | Betreuungsgebühr eintragen, ändern, entfernen | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `billing.retainer` |
| `retainer-card--kuendigungsabsichten-und-angebotene` | Kündigungsabsichten und angebotene Halteangebote | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `budget-actions-decidebudgetaction--budgetaenderung-des-kunden-uebernehmen` | Budgetänderung des Kunden übernehmen | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `budget.decide` |
| `budget-actions-decidebudgetaction--budgetaenderung-ablehnen` | Budgetänderung ablehnen | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `budget.decide` |
| `produkt-actions-decideproductaction--produktbuchung-des-kunden-annehmen-oder-ablehnen` | Produktbuchung des Kunden annehmen oder ablehnen | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `produkt.decide`, `produkt.start` |
| `addon-actions-saveseatsaction--aktive-verkaeufer-speichern-und-mit-stripe` | Aktive Verkäufer speichern und mit Stripe abgleichen | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `billing.seats` |
| `addon-actions-bestandmoduleaction--bestandskunden-modul-freischalten-kostenlos` | Bestandskunden-Modul freischalten (kostenlos), sperren, sichtbar machen | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `bestand.sichtbar` |
| `addon-actions-savequotaaction--kontingent-bestandskunden-speichern-zusatzpakete` | Kontingent Bestandskunden speichern, Zusatzpakete sehen | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `bestand.quota` |
| `addon-actions-empfehlungmoduleaction--modul-empfehlungen-bewertungen-freischalten-oder` | Modul Empfehlungen & Bewertungen freischalten oder sperren | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `billing.empfehlung` |
| `addon-actions-billingintervalaction--zahlweise-monatlich-jaehrlich-umstellen` | Zahlweise monatlich/jährlich umstellen | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `billing.interval` |
| `onboarding-actions-adminplanpauseaction--pause-urlaub-eintragen-ab-neustart-grund` | Pause/Urlaub eintragen (ab, Neustart, Grund) | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `pause.plan` |
| `onboarding-actions-adminendpauseaction--pause-beenden` | Pause beenden | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `pause.end` |
| `erase-actions-erasecustomerdataaction--kundendaten-endgueltig-loeschen-mit-grund` | Kundendaten endgültig löschen mit Grund | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `customer.final_erase` |
| `page-invoices--rechnungen-mit-status-und-pdf` | Rechnungen mit Status und PDF | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--in-stripe-oeffnen` | In Stripe öffnen | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `login-list--logins-des-kunden-mit-einladung-offen-zuletzt` | Logins des Kunden mit Einladung offen, zuletzt aktiv | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-createbuyeraccount--neuen-login-anlegen-e-mail-passwort-kunde` | Neuen Login anlegen (E-Mail, Passwort, Kunde) | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `user.create` |
| `actions-resetbuyerpassword--passwort-setzen` | Passwort setzen | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `user.password_reset` |
| `actions-changebuyeremail--e-mail-adresse-aendern` | E-Mail-Adresse ändern | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `user.email_change` |
| `actions-deletebuyeraccount--login-loeschen` | Login löschen | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `user.delete` |
| `actions-sendbuyeraccesslink--einladung-erneut-senden-bzw-link-zum-passwort` | Einladung erneut senden bzw. Link zum Passwort ändern senden | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `user.invite`, `user.reset_link` |
| `actions-reassignbuyercustomer--login-einem-anderen-kunden-zuordnen` | Login einem anderen Kunden zuordnen | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `user.reassign` |
| `preview-actions-startpreviewaction--als-kunde-ansehen-nur-lesend` | Als Kunde ansehen (nur lesend) | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `preview.start` |
| `page--monatsuebersicht-aller-berichte-mit-monat-vor` | Monatsübersicht aller Berichte mit Monat vor/zurück | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-generatenowaction--berichte-jetzt-erzeugen` | Berichte jetzt erzeugen | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--bericht-ansehen-mit-vorschau-und-pruefbefunden` | Bericht ansehen mit Vorschau und Prüfbefunden | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-sendreportaction--bericht-senden` | Bericht senden | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `bericht.send` |
| `actions-sendreportaction--bericht-bearbeiten-betreff-einstieg-und-senden` | Bericht bearbeiten (Betreff, Einstieg) und senden | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `bericht.send` |
| `actions-callinsteadaction--anrufen-statt-mail` | Anrufen statt Mail | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `bericht.call` |
| `actions-skipreportaction--diesen-monat-aussetzen` | Diesen Monat aussetzen | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `bericht.skip` |
| `actions-togglecustomerreportsaction--monatsberichte-fuer-diesen-kunden-an-aus` | Monatsberichte für diesen Kunden an/aus | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `bericht.kunde` |
| `page-gcal--rueckmeldung-kalender-verbunden-abgelehnt` | Rückmeldung Kalender verbunden/abgelehnt | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--ruhende-konten-mit-loeschdatum-aufbewahrung` | Ruhende Konten mit Löschdatum, Aufbewahrung, Grund | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `testlead-actions-sendtestleadaction--testlead-schicken-echter-ablauf-zaehlt-nirgends` | Testlead schicken (echter Ablauf, zählt nirgends) und Testlead löschen | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `lead.test_create`, `lead.test_mark` |
| `actions-setnewcontactsbotaction--assistent-auch-fuer-neue-kontakte-sonst-nur` | Assistent auch für neue Kontakte (sonst nur Leads, Coexistence-Schutz) | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `agent.new_contacts` |
| `page-filters--filter-intern-test-interne-konten-und-testkunden` | Filter Intern/Test: interne Konten und Testkunden mit Badge | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `zahlweise-card--zahlweise-und-mahnungen-offene-posten-des-kunden` | Zahlweise und Mahnungen: offene Posten des Kunden | Kunden | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `zahlweise-actions--ueberweisung-erlauben-zahlungsziel` | Überweisung erlauben, Zahlungsziel (Audit) | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `billing.ueberweisung` |
| `zahlweise-actions--mahnungen-je-kunde-stoppen` | Mahnungen je Kunde stoppen (Audit) | Kunden | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `billing.mahnstopp` |

### Leads & Kampagnen (71 Funktionen)

| Funktions-ID | Funktion | Bereich | Aufrufe 60 T | letzte Nutzung | Nutzer (Admin) | Vorschlag | Messbar über |
|---|---|---|---|---|---|---|---|
| `admin-shell-count--zaehler-badge-an-chats-offene-whatsapp` | Zähler-Badge an Chats (offene WhatsApp-Gespräche) | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `orders--push-an-admins-mit-sprungziel-pay-per-lead` | Push an Admins mit Sprungziel Pay-per-Lead (Bestellung, Lieferung, Storno, nicht verlängert) | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--posteingang-leads-ohne-zuordnung` | Posteingang Leads ohne Zuordnung | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-assignformaction--formular-zuordnen-seite-formular-kunde-produkt` | Formular zuordnen (Seite, Formular, Kunde, Produkt) | Leads & Kampagnen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `leadsource.assign` |
| `actions-assignformaction--beim-zuordnen-lead-preis-ppl-und-airtable-bezug` | Beim Zuordnen Lead-Preis (PPL) und Airtable-Bezug | Leads & Kampagnen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `leadsource.assign` |
| `page-listpageforms--facebook-seite-waehlen-und-formulare-laden` | Facebook-Seite wählen und Formulare laden | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-dismissunassignedaction--wartende-leads-ohne-zuordnung-verwerfen` | Wartende Leads ohne Zuordnung verwerfen | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-togglesourceaction--zuordnung-an-aus-schalten` | Zuordnung an/aus schalten | Leads & Kampagnen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `leadsource.toggle` |
| `page--zuordnungen-tabelle-mit-preis-letztem-lead` | Zuordnungen-Tabelle mit Preis, letztem Lead, Einwilligungs-Warnung | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--alle-leads-aller-kunden-mit-status-und-preis` | Alle Leads aller Kunden mit Status und Preis | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-morefilters--filter-kunde-produkt-status-zeitraum-monat-oder` | Filter Kunde, Produkt, Status, Zeitraum (Monat oder von/bis) | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `route-get--csv-export-der-gefilterten-leads-mit-protokoll` | CSV-Export der gefilterten Leads (mit Protokoll) | Leads & Kampagnen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `lead.export` |
| `page-tel--lead-anrufen` | Lead anrufen | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-bezuege--bezuege-je-produkt-mit-kontingent-geliefert` | Bezüge je Produkt mit Kontingent, geliefert, Preis, Filter, Lieferung | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `ppl-auswertung--uebersicht-je-kunde-woche-monat-liegt-zurueck` | Übersicht je Kunde (Woche, Monat, liegt zurück) | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `ppl-auswertung--auswertung-mit-zeitraum-und-produktfilter` | Auswertung mit Zeitraum und Produktfilter (Diagramm, Tabelle) | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-assignparkedaction--geparkte-leads-einem-bezug-zuordnen` | Geparkte Leads einem Bezug zuordnen | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-discardparkedaction--geparkten-lead-verwerfen` | Geparkten Lead verwerfen | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-decidestornoaction--storno-pruefen-annehmen-oder-ablehnen` | Storno prüfen: annehmen oder ablehnen | Leads & Kampagnen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `storno.approve`, `storno.reject` |
| `page-geliefert--gelieferte-leads-suchen-name-telefon-e-mail-id` | Gelieferte Leads suchen (Name, Telefon, E-Mail, ID, Bezug) | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-adminstornoaction--storno-von-hand-eintragen-grund-notiz` | Storno von Hand eintragen (Grund, Notiz) | Leads & Kampagnen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `storno.admin` |
| `actions-undostornoaction--storno-zuruecknehmen` | Storno zurücknehmen | Leads & Kampagnen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `storno.undo` |
| `page-eingang--eingang-aller-ppl-leads-ausgeliefert-geparkt` | Eingang aller PPL-Leads (ausgeliefert, geparkt, Dublette, ungültig) | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-airtable-sync-off--anzeige-airtable-abgleich-an-aus` | Anzeige Airtable-Abgleich an/aus | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-savesubscriptionaction--bezug-anlegen-bearbeiten-kunde-produkt-menge` | Bezug anlegen/bearbeiten (Kunde, Produkt, Menge, Preis, Start) | Leads & Kampagnen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `ppl.subscription` |
| `bezug-form--bezug-modus-woche-monat-einmalig-live-test` | Bezug: Modus Woche/Monat/einmalig, Live/Test, Lieferweg App/E-Mail/Webhook mit Format | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-saveareaaction--gebiet-mit-vorrang-anlegen-aendern-plz-menge` | Gebiet mit Vorrang anlegen/ändern (PLZ, Menge, Zeitraum) | Leads & Kampagnen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `ppl.area` |
| `actions-deleteareaaction--gebiet-loeschen` | Gebiet löschen | Leads & Kampagnen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `ppl.area_delete` |
| `actions-manualorderaction--bestellung-von-hand-bezahlt-ohne-stripe` | Bestellung von Hand (bezahlt, ohne Stripe) | Leads & Kampagnen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `ppl.order` |
| `actions-runimportaction--bezuege-aus-airtable-uebernehmen` | Bezüge aus Airtable übernehmen | Leads & Kampagnen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `ppl.subscription` |
| `media-buyer-admin--pool-liste-mit-ist-ziel-prognose-status-auf-kurs` | Pool-Liste mit Ist/Ziel, Prognose, Status (auf Kurs, knapp, Unterdeckung) | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-savepoolsettings--autopilot-je-pool-an-aus` | Autopilot je Pool an/aus | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-savepoolsettings--max-tagesbudget-je-kanal-meta-outbrain-tiktok` | Max. Tagesbudget je Kanal (Meta, Outbrain, TikTok, Google) | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-savepoolsettings--kampagnen-stichwort-je-kanal` | Kampagnen-Stichwort je Kanal | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-rundryrun--trockenlauf-media-buyer` | Trockenlauf Media Buyer | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-runapplynow--jetzt-anwenden-budgets-setzen` | Jetzt anwenden (Budgets setzen) | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `media-buyer-admin--empfehlung-verlauf-der-aktionen-performance-pro` | Empfehlung, Verlauf der Aktionen, Performance pro Kanal, Adspend-Zuordnung | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--werbekonten-liste-mit-modus-letzter-massnahme` | Werbekonten-Liste mit Modus, letzter Maßnahme (rot wenn alt), offen, letzter Lauf | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-saveaccountaction--konto-modus-ziel-leadpreis-tagesbudget-kampagnen` | Konto: Modus, Ziel-Leadpreis, Tagesbudget, Kampagnen-Stichwort | Leads & Kampagnen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `optimierung.konto` |
| `actions-approveallaction--alle-massnahmen-freigeben` | Alle Maßnahmen freigeben | Leads & Kampagnen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `optimierung.freigabe` |
| `actions-approveoneaction--einzelne-massnahme-freigeben` | Einzelne Maßnahme freigeben | Leads & Kampagnen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `optimierung.freigabe` |
| `actions-rejectaction--massnahme-ablehnen-mit-notiz` | Maßnahme ablehnen mit Notiz | Leads & Kampagnen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `optimierung.abgelehnt` |
| `actions-doneaction--vorschlag-als-erledigt-markieren-mit-notiz` | Vorschlag als erledigt markieren mit Notiz | Leads & Kampagnen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `optimierung.erledigt` |
| `actions-dryrunaction--trockenlauf-je-konto` | Trockenlauf je Konto | Leads & Kampagnen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `optimierung.lauf` |
| `actions-runnowaction--lauf-jetzt-starten` | Lauf jetzt starten | Leads & Kampagnen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `optimierung.lauf` |
| `actions-syncactivitiesaction--meta-aenderungsprotokoll-abrufen-30-tage` | Meta-Änderungsprotokoll abrufen (30 Tage) | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `account-view-protocolcard--protokoll-je-konto-quelle-monatsbericht` | Protokoll je Konto (Quelle Monatsbericht) | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-status-tabs--status-reiter-offen-zurueckgestellt-erledigt` | Status-Reiter Offen, Zurückgestellt, Erledigt | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-art-filters--filter-alle-leads-der-kunden-support-nummer` | Filter Alle, Leads der Kunden, Support-Nummer, Kunde, Interessent, unbekannt | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-q--chats-durchsuchen-nach-name-oder-nummer` | Chats durchsuchen nach Name oder Nummer | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-togglebotaction--bot-pausieren-bzw-wieder-einschalten` | Bot pausieren bzw. wieder einschalten | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-takeoveraction--gespraech-uebernehmen` | Gespräch übernehmen | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-sendreplyaction--antwort-senden-enter-sendet-am-rechner-emoji` | Antwort senden (Enter sendet am Rechner, Emoji, Textbausteine) | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-sendtemplateaction--freigegebene-vorlage-senden-ausserhalb-24` | Freigegebene Vorlage senden (außerhalb 24 Stunden) | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `appointment-actions-loadrescheduledialogadmin--termin-des-leads-verschieben-dialog-mit-freien` | Termin des Leads verschieben (Dialog mit freien Zeiten) | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `appointment-actions-cancelappointmentadminaction--termin-des-leads-absagen` | Termin des Leads absagen | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--seitenleiste-lead-kontaktdaten-formularangaben` | Seitenleiste Lead: Kontaktdaten, Formularangaben, Bot-Zusammenfassung, Termine, Ereignisse | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-crmhref--anrufen-e-mail-zum-crm-kunden-aus-dem-chat` | Anrufen, E-Mail, Zum CRM/Kunden aus dem Chat | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--hinweis-bot-kann-keine-termine-buchen-kalender` | Hinweis Bot kann keine Termine buchen, Kalender verbinden | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-assignsupportcontactaction--support-chat-absender-einem-vertriebskontakt` | Support-Chat: Absender einem Vertriebskontakt zuordnen | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--braucht-aufmerksamkeit-grund-und-nicht` | Braucht Aufmerksamkeit (Grund) und nicht zugestellt markiert | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `test-lead-badge-testleadbadge--testleads-in-lead-listen-mit-kennzeichen-test` | Testleads in Lead-Listen mit Kennzeichen „Test“ | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `hvk-abrechnungen-hvkabrechnungen--hvk-abrechnungen-gutschrift-pdf-je-woche` | HvK-Abrechnungen: Gutschrift-PDF je Woche abgleichen, Postfach verbinden, rückwirkend übernehmen | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `hvk-abrechnungen-hvkreklamationenreview--hvk-reklamationen-ohne-eindeutigen-lead-zuordnen` | HvK-Reklamationen ohne eindeutigen Lead zuordnen oder verwerfen | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `ppl-versand-pplversandpostfach--versand-postfach-fuer-pivacom-verbinden` | Versand-Postfach für Pivacom verbinden (Microsoft 365), Status, Testmail in ISO-8859-1 | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `hvk-client-hvkreabgleich--hvk-abrechnungen-neu-abgleichen-vorschau-je` | HvK-Abrechnungen neu abgleichen: Vorschau je Woche (geliefert, Differenz, Stornos), dann übernehmen | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `live-refresh-liverefresh--chats-aktualisieren-sich-live-hinweis-neue` | Chats aktualisieren sich live, Hinweis „Neue Nachricht“ aus anderen Chats | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `slack-test-slacktest--slack-testen-testnachricht-an-den-ppl-kanal` | Slack testen (Testnachricht an den PPL-Kanal) | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `test-lead-button-testleadbutton--lieferung-testen-testdatensatz-an-die` | Lieferung testen: Testdatensatz an die Lieferadressen des Bezugs | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `nachholen-airtablenachholen--lead-aus-airtable-nachholen-lead-nr-laeuft-durch` | Lead aus Airtable nachholen (Lead-Nr., läuft durch den normalen Eingang) | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `erneut-zustellen-erneutzustellen--gelieferten-lead-nochmal-zustellen` | Gelieferten Lead nochmal zustellen (gleicher Weg wie der Bezug, ohne neue Berechnung) | Leads & Kampagnen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |

### Marketing (23 Funktionen)

| Funktions-ID | Funktion | Bereich | Aufrufe 60 T | letzte Nutzung | Nutzer (Admin) | Vorschlag | Messbar über |
|---|---|---|---|---|---|---|---|
| `cron--push-an-admins-linkedin-bank-neu-verbinden` | Push an Admins: LinkedIn, Bank neu verbinden, Monatsberichte, Status/Variable fehlt, Empfehlungsprämie | Marketing | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-savedraftaction--entwuerfe-zur-freigabe-text-bearbeiten-bild` | Entwürfe zur Freigabe: Text bearbeiten, Bild wählen (Foto, Grafik, ohne), Hypothese sehen | Marketing | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-approveaction--entwurf-freigeben-planen` | Entwurf freigeben (planen) | Marketing | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-approveaction-sofort--sofort-veroeffentlichen` | Sofort veröffentlichen | Marketing | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-discardaction--entwurf-verwerfen` | Entwurf verwerfen | Marketing | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-unapproveaction--geplante-posts-und-freigabe-zuruecknehmen` | Geplante Posts und Freigabe zurücknehmen | Marketing | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-generatenowaction--entwuerfe-jetzt-generieren-fuer-x-tage` | Entwürfe jetzt generieren für X Tage | Marketing | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-ergebnisse--ergebnisse-je-post-impressionen-zielgruppe` | Ergebnisse je Post (Impressionen, Zielgruppe, Reichweite) | Marketing | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-setmetricsaction--zahlen-je-post-nachtragen-importierten-text` | Zahlen je Post nachtragen, importierten Text setzen | Marketing | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-importaction--linkedin-statistik-excel-hochladen` | LinkedIn-Statistik (Excel) hochladen | Marketing | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-uploadphotosaction--fotos-hochladen-beschreiben-loeschen` | Fotos hochladen, beschreiben, löschen | Marketing | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-savesettingsaction--einstellungen-zielgruppe-produkte-ueber-mich` | Einstellungen: Zielgruppe, Produkte, Über mich, Trust-Material, Posts pro Tag, Uhrzeiten | Marketing | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--kennzahlen-und-alle-empfehlungen-mit-stand-und` | Kennzahlen und alle Empfehlungen mit Stand und Prämie | Marketing | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-markrewarddoneaction--praemie-als-gutgeschrieben-markieren` | Prämie als gutgeschrieben markieren | Marketing | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `referral.reward` |
| `actions-applyreferraldiscountsaction--empfehlungsrabatt-auf-offene-angebote-anwenden` | Empfehlungsrabatt auf offene Angebote anwenden | Marketing | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `offer.referral_discount` |
| `page-top-empfehler--top-empfehler-mit-geworbenen-kunden-umsatz` | Top-Empfehler mit geworbenen Kunden, Umsatz, Prämien | Marketing | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--web-praesentation-je-zielgruppe-oeffnen-und-als` | Web-Präsentation je Zielgruppe öffnen und als PDF | Marketing | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `route-get--datei-pptx-pdf-herunterladen` | Datei (PPTX/PDF) herunterladen | Marketing | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `route-post--datei-hochladen-bzw-ersetzen` | Datei hochladen bzw. ersetzen | Marketing | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `route-delete--datei-entfernen` | Datei entfernen | Marketing | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `unterlagen-grid--live-demo-der-beratungspraesentation` | Live-Demo der Beratungspräsentation | Marketing | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `nav--oeffentlichen-rechner-oeffnen` | Öffentlichen Rechner öffnen | Marketing | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-saverechneraction--rechner-produkte-quoten-kosten-garantien-texte` | Rechner: Produkte, Quoten, Kosten, Garantien, Texte, Kontakt-Link | Marketing | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `rechner.config` |

### Zahlen (49 Funktionen)

| Funktions-ID | Funktion | Bereich | Aufrufe 60 T | letzte Nutzung | Nutzer (Admin) | Vorschlag | Messbar über |
|---|---|---|---|---|---|---|---|
| `page--kunden-nach-kanal-ohne-gekuendigt` | Kunden nach Kanal (ohne Gekündigt) | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `zahlen-view--kennzahlen-kacheln-mrr-kunden-churn-cac` | Kennzahlen-Kacheln (MRR, Kunden, Churn, CAC ...) | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `zahlen-view-sicht--sicht-kerngeschaeft-oder-gesamt-mit-pay-per-lead` | Sicht Kerngeschäft oder Gesamt mit Pay-per-Lead | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `zahlen-view-setdrill--kachel-aufklappen-drill-down-kunden-je-kennzahl` | Kachel aufklappen (Drill-down Kunden je Kennzahl) | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `zahlen-view-toggleinvestor--investoren-ansicht-interne-reiter-ausblenden` | Investoren-Ansicht (interne Reiter ausblenden) | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-saveupdatetextsaction--investoren-update-highlights-texte-speichern` | Investoren-Update: Highlights, Texte speichern, drucken | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `zahlen-view--reiter-wachstum-umsatz-je-strom-umsatzmix` | Reiter Wachstum: Umsatz je Strom, Umsatzmix | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `zahlen-view--reiter-kunden-kohorten-kundenbasis-abhaengigkeit` | Reiter Kunden: Kohorten, Kundenbasis, Abhängigkeit | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `zahlen-view--reiter-wirtschaftlichkeit-kundengewinnung` | Reiter Wirtschaftlichkeit: Kundengewinnung, Bruttomarge je Strom | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `zahlen-view--reiter-wirkung-beim-vertreter-pro-1-lead-bis` | Reiter Wirkung beim Vertreter: Pro 1 €, Lead bis Abschluss, Tempo | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `zahlen-view--reiter-produkte-ueber-alle-vertreter-und-je` | Reiter Produkte: über alle Vertreter und je Vertreter, Zeitraum | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `zahlen-view--reiter-vertrieb-pipeline-woher-kunden-kommen` | Reiter Vertrieb: Pipeline, Woher Kunden kommen | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `zahlen-view--reiter-pay-per-lead-verkaufte-leads-je-monat` | Reiter Pay-per-Lead: verkaufte Leads je Monat | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `zahlen-view-bwa--reiter-bwa-mit-drill-down-je-zeile-und-hinweis` | Reiter BWA mit Drill-down je Zeile und Hinweis offene Zuordnungen | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-savemanualrevenueaction--einrichtungsgebuehren-je-monat-umsatz-von-hand` | Einrichtungsgebühren je Monat, Umsatz von Hand nachtragen | Zahlen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `kpi.nachtrag` |
| `actions-deletemanualrevenueaction--manuellen-umsatz-loeschen` | Manuellen Umsatz löschen | Zahlen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `kpi.nachtrag` |
| `zahlen-view--kunden-ohne-hinterlegte-betreuungsgebuehr` | Kunden ohne hinterlegte Betreuungsgebühr | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `zahlen-tabs--link-leads-werbung-dashboard` | Link Leads & Werbung (Dashboard /) | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `buchungen-liste--buchungsliste-aller-kunden-angebote-produkte` | Buchungsliste aller Kunden (Angebote, Produkte, Module, Budget, Pausen, Kündigungen) | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--filter-kunde-art-status-zeitraum-offen` | Filter Kunde, Art, Status, Zeitraum, Offen | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-q--suche-in-buchungen` | Suche in Buchungen | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `route-get--csv-export-buchungen` | CSV-Export Buchungen | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--kunden-je-monat-neu-reaktiviert-gekuendigt-netto` | Kunden je Monat (neu, reaktiviert, gekündigt, netto) | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--mrr-bewegung-je-monat` | MRR-Bewegung je Monat | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--reaktivierungsquote-je-kuendigungsmonat` | Reaktivierungsquote je Kündigungsmonat | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--kuendigungsgruende-die-zurueckkommen` | Kündigungsgründe, die zurückkommen | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--halteangebote-angenommen-mrr-gerettet-spaeter` | Halteangebote: angenommen, MRR gerettet, später gekündigt | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `storno-quote-stornoquoteuebersicht--stornoquote-der-vertraege-je-kunde-und-sparte` | Stornoquote der Verträge je Kunde und Sparte | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `whatsapp-zustellung--leads-ohne-whatsapp-je-kunde-30-tage-gesamt` | Leads ohne WhatsApp je Kunde (30 Tage, gesamt) | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `whatsapp-zustellung--zustellfehler-der-letzten-14-tage-je-kunde-und` | Zustellfehler der letzten 14 Tage je Kunde und Code | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--hilfe-anfragen-an-das-team` | Hilfe-Anfragen an das Team | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--ki-hilfe-fragen-der-vertreter-mit-bewertung` | KI-Hilfe: Fragen der Vertreter mit Bewertung | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--nutzung-je-kunde-liegt-herum-genutzte-aktionen` | Nutzung je Kunde: liegt herum, genutzte Aktionen, Seitenaufrufe, Fehler, Feedback | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `nps-card--weiterempfehlung-nps` | Weiterempfehlung (NPS) | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `module-card--zusatzmodul-empfehlungen-kandidaten-fuers` | Zusatzmodul Empfehlungen: Kandidaten fürs Gespräch | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-saverecurringcostaction--laufende-kosten-anlegen-aendern-zweck-zeitraum` | Laufende Kosten anlegen, ändern (Zweck, Zeitraum) | Zahlen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `kpi.kosten` |
| `actions-deleterecurringcostaction--laufende-kosten-loeschen` | Laufende Kosten löschen | Zahlen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `kpi.kosten` |
| `actions-savekpisettingsaction--annahmen-fuer-kennzahlen-stunden-stundensatz` | Annahmen für Kennzahlen: Stunden, Stundensatz, eigene Kampagnen, PPL-Pilot-Ende | Zahlen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `kpi.einstellungen` |
| `actions-connectbankaction--bank-verbinden` | Bank verbinden | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-syncbankaction--umsaetze-jetzt-abrufen` | Umsätze jetzt abrufen | Zahlen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `bank.sync` |
| `actions-disconnectbankaction--bank-trennen` | Bank trennen | Zahlen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `bank.disconnect` |
| `actions-uploadcsvaction--csv-hochladen-commerzbank-amex-automatisch` | CSV hochladen (Commerzbank, Amex, automatisch) | Zahlen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `bank.sync` |
| `actions-saveruleaction--regel-speichern` | Regel speichern | Zahlen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `cost.rule` |
| `actions-deleteruleaction--regel-loeschen` | Regel löschen | Zahlen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `cost.rule` |
| `actions-assignaction--ausgabe-zuordnen-zweck-inkl-ust-immer-so-bei` | Ausgabe zuordnen (Zweck, inkl. USt, immer so bei Muster) | Zahlen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `cost.assign` |
| `page--zugeordnete-ausgaben-ansehen` | Zugeordnete Ausgaben ansehen | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `offene-posten--zahlungseingang-bestaetigen-oder-verwerfen` | Zahlungseingang auf dem Geschäftskonto bestätigen oder verwerfen | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `offene-posten--offene-rechnungen-mit-mahnstufe` | Offene Rechnungen mit Mahnstufe | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `offene-posten--ablauf-und-vorbereitete-schalter` | Ablauf und vorbereitete Schalter (Verzugspauschale, Leads-Pause) | Zahlen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |

### Einstellungen (64 Funktionen)

| Funktions-ID | Funktion | Bereich | Aufrufe 60 T | letzte Nutzung | Nutzer (Admin) | Vorschlag | Messbar über |
|---|---|---|---|---|---|---|---|
| `followup-actions-approvefollowupaction--liste-wartet-auf-freigabe-einzeln-oder-alle` | Liste wartet auf Freigabe, einzeln oder alle freigeben | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-group--listen-geplant-laufend-zuletzt-beendet-mit` | Listen Geplant, Laufend, Zuletzt beendet mit Vorschau und Fehler | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `followup-actions-savefollowupsettingsaction--einstellungen-automatik-an-hoechstzahl-je-tag` | Einstellungen: Automatik an, Höchstzahl je Tag und Postfach, Buchungslink, Signatur, Angebotstext | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `followup-actions-planexistingaction--bestand-jetzt-pruefen-bestehende-spaeter` | Bestand jetzt prüfen (bestehende Später-Antworten einplanen) | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-savebookingtypeaction--termintypen-bearbeiten-dauer-puffer-vorlauf` | Termintypen bearbeiten (Dauer, Puffer, Vorlauf) | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `vertrieb.buchungsseite` |
| `actions-savesalestimesaction--buchbare-zeiten-je-wochentag` | Buchbare Zeiten je Wochentag | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-embedsnippet--einbettungscode-fuer-die-webseite-kopieren` | Einbettungscode für die Webseite kopieren | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--status-je-quelle-instantly-calendly-formulare` | Status je Quelle (Instantly, Calendly, Formulare, LinkedIn) grün bei Eingang in 7 Tagen | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-copyfield--webhook-adressen-kopieren-und-anleitung` | Webhook-Adressen kopieren und Anleitung | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-syncinstantlyaction--jetzt-mit-instantly-abgleichen` | Jetzt mit Instantly abgleichen | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-importinstantlyaction--instantly-csv-importieren` | Instantly-CSV importieren | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-connectcalendlyaction--calendly-verbinden-und-termine-abgleichen` | Calendly verbinden und Termine abgleichen | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-importcontactsaction--agenturliste-csv-importieren` | Agenturliste (CSV) importieren | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-importcoldcrmaction--daten-aus-altem-cold-crm-uebernehmen` | Daten aus altem Cold CRM übernehmen | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-replacecoldcrmaction--vertrieb-neu-importieren-ersetzt-alles` | Vertrieb neu importieren (ersetzt alles, Bestätigung ERSETZEN) | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `vertrieb.neuimport` |
| `actions-importwaalaxyaction--waalaxy-import-ohne-oberflaeche` | Waalaxy-Import (ohne Oberfläche) | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-convertinboundlead--linkedin-nachrichten-ohne-zuordnung-als-lead` | LinkedIn-Nachrichten ohne Zuordnung als Lead übernehmen | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-placesused--kontakte-anreichern-google-kontingent-heute` | Kontakte anreichern: Google-Kontingent heute | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-team-kalender--team-kalender-fuer-hilfetermine-der-kunden` | Team-Kalender für Hilfetermine der Kunden (Status) | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `route-get--support-whatsapp-verbinden-360dialog` | Support-WhatsApp verbinden (360dialog) | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `ab-test-card--a-b-tests-der-vorlagen-mit-antwort-und` | A/B-Tests der Vorlagen mit Antwort- und Terminquote | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page-diag--meta-verbindung-pruefen-token-rechte-webhook-url` | Meta-Verbindung prüfen (Token, Rechte, Webhook-URL) | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--uebergang-webhook-fuer-zapier` | Übergang: Webhook für Zapier | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-saveglobalaction--global-woechentlicher-optimierungslauf-an-aus` | Global: wöchentlicher Optimierungslauf an/aus | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `optimierung.einstellungen` |
| `actions-saveglobalaction--global-autopilot-fuer-alle-konten` | Global: Autopilot für alle Konten | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `optimierung.einstellungen` |
| `actions-disconnectaction--linkedin-verbinden-bzw-trennen-hinweis-zugang` | LinkedIn verbinden bzw. trennen, Hinweis Zugang abgelaufen | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `linkedin.disconnect` |
| `module-actions-sendannouncementaction--ankuendigung-des-zusatzmoduls-an-kunden-senden` | Ankündigung des Zusatzmoduls an Kunden senden (Mail und In-App) | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `empfehlung.announce` |
| `page--uebersicht-aller-einstellungen-in-gruppen` | Übersicht aller Einstellungen in Gruppen | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--warnhinweise-zwei-faktor-aus-steuernummer-fehlt` | Warnhinweise: Zwei-Faktor aus, Steuernummer fehlt, Statusmeldung aktiv | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-savecatalogitemaction--produkt-buchbar-an-aus` | Produkt buchbar an/aus | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `produkt.catalog` |
| `actions-savecatalogitemaction--produkt-als-bewaehrt-markieren-und-nutzen-text` | Produkt als bewährt markieren und Nutzen-Text | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `produkt.catalog` |
| `actions-preispilotumschaltenaction--beitraege-rechnen-pilot-rechner-je-gesellschaft` | Beiträge rechnen (Pilot): Rechner je Gesellschaft und Sparte freischalten | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `preise.pilot` |
| `actions-saveautomationaction--budgetaenderungen-automatisch-bei-meta-umsetzen` | Budgetänderungen automatisch bei Meta umsetzen | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `kampagne.automatik` |
| `actions-saveautomationaction--gebuchte-produkte-starten-das-agenten-team` | Gebuchte Produkte starten das Agenten-Team | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `kampagne.automatik` |
| `actions-saveautomationaction--muede-anzeigen-erkennen-mit-schwellen-frequenz` | Müde Anzeigen erkennen mit Schwellen (Frequenz, CTR, Leadpreis, Mindestausgabe) | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `kampagne.automatik` |
| `actions-savehalteaction--halteangebote-je-kuendigungsgrund-an-aus-mit` | Halteangebote je Kündigungsgrund an/aus mit Werten (10 Angebote inkl. Rückkehrangebot) | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `halteangebote.einstellungen` |
| `form--regeln-fuer-rabatte-anzeige` | Regeln für Rabatte (Anzeige) | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-saveupdateaction--neuigkeiten-liste-neu-anlegen` | Neuigkeiten-Liste, neu anlegen | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `neuigkeit.publish`, `neuigkeit.save` |
| `actions-saveupdateaction--eintrag-bearbeiten-art-zielgruppe-push-an-kunden` | Eintrag bearbeiten: Art, Zielgruppe, Push an Kunden, veröffentlichen oder Entwurf | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `neuigkeit.publish`, `neuigkeit.save` |
| `actions-draftupdateaction--ki-entwurf-aus-notizen` | KI-Entwurf aus Notizen | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-deleteupdateaction--eintrag-loeschen` | Eintrag löschen | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `neuigkeit.delete` |
| `form--vorschau-im-kundenbereich` | Vorschau im Kundenbereich | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-savereportsettingsaction--gute-berichte-automatisch-senden` | Gute Berichte automatisch senden | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `bericht.settings` |
| `actions-savereportsettingsaction--einstufung-gut-schwach-ziel-leadpreis-absender` | Einstufung gut/schwach, Ziel-Leadpreis, Absender/Signatur | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `bericht.settings` |
| `actions-savelogincardaction--infokarten-liste-neue-karte` | Infokarten-Liste, neue Karte | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `login_card.create`, `login_card.update` |
| `actions-savelogincardaction--karte-bearbeiten-badge-titel-text-link-bild` | Karte bearbeiten (Badge, Titel, Text, Link, Bild) | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `login_card.create`, `login_card.update` |
| `actions-togglelogincardaction--karte-an-aus` | Karte an/aus | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `login_card.toggle` |
| `actions-movelogincardaction--reihenfolge-der-karten-aendern` | Reihenfolge der Karten ändern | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `login_card.move` |
| `actions-deletelogincardaction--karte-loeschen` | Karte löschen | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `login_card.delete` |
| `actions-createincidentaction--statusmeldung-veroeffentlichen-text-stufe` | Statusmeldung veröffentlichen (Text, Stufe, Bereich) | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `status.incident` |
| `actions-resolveincidentaction--meldung-als-behoben-markieren` | Meldung als behoben markieren | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `status.incident` |
| `actions-deleteincidentaction--meldung-loeschen` | Meldung löschen | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `status.incident` |
| `page--zustand-jetzt-und-support-kontakt-anzeige` | Zustand jetzt und Support-Kontakt (Anzeige), Statusseite öffnen | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-savereferralsettingsaction--programm-aktiv-hinweise-an-kunden-praemie-fest` | Programm aktiv, Hinweise an Kunden, Prämie (fest, Monate Bestand, Monatspreis), Vorteil für Neukunden | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `referral.settings` |
| `actions-savesetupsettingsaction--meta-business-id-und-erklaervideos-je-schritt` | Meta-Business-ID und Erklärvideos je Schritt | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-savetaxnumberaction--steuernummer-fuer-rechnungen` | Steuernummer für Rechnungen | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `rechnung.kunden`, `rechnung.steuernummer` |
| `page--stripe-konto-pruefen-pflichtangaben-testmodus` | Stripe-Konto prüfen (Pflichtangaben, Testmodus) | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-customerfootersaction--fusszeile-bei-bestehenden-kunden-setzen` | Fußzeile bei bestehenden Kunden setzen (Probelauf, Anwenden) | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit: `rechnung.kunden` |
| `actions-countinvoicesaction--finalisierte-rechnungen-zaehlen` | Finalisierte Rechnungen zählen | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `actions-starttotpsetupaction--zwei-faktor-einrichten-bestaetigen-abschalten` | Zwei-Faktor einrichten, bestätigen, abschalten | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `2fa.disable`, `2fa.enable` |
| `actions-signouteverywhereaction--ueberall-abmelden` | Überall abmelden | Einstellungen | erfasst, nicht abrufbar | erfasst, nicht abrufbar | erfasst, nicht abrufbar | offen (keine Daten) | Audit (über Hilfsfunktion, prüfen): `session.revoke_all` |
| `page--aenderungsprotokoll-ansehen` | Änderungsprotokoll ansehen | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `page--protokoll-filtern-nach-kunde-und-art` | Protokoll filtern nach Kunde und Art | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `import-forms-instantlynachholen--fehlende-instantly-antworten-der-letzten-90-tage` | Fehlende Instantly-Antworten der letzten 90 Tage nachholen (Vorschau, dann nachholen) | Einstellungen | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |

### Was ist wo (3 Funktionen)

| Funktions-ID | Funktion | Bereich | Aufrufe 60 T | letzte Nutzung | Nutzer (Admin) | Vorschlag | Messbar über |
|---|---|---|---|---|---|---|---|
| `route-get--diagnose-openai-erreichbarkeit-nur-technik-keine` | Diagnose OpenAI-Erreichbarkeit (nur Technik, keine Oberfläche) | Was ist wo | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `route-get--diagnose-airtable-felder-nur-technik-keine` | Diagnose Airtable-Felder (nur Technik, keine Oberfläche) | Was ist wo | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
| `chat-actions-takeasleadbuyeraction--neuer-kontakt-im-chat-als-lead-uebernehmen` | Neuer Kontakt im Chat: „Als Lead übernehmen“ (Vermittler entscheidet, Assistent übernimmt) | Was ist wo | nicht erfasst | nicht erfasst | nicht erfasst | offen (keine Daten) | nicht erfasst |
