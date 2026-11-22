# Adressbuch „Vertrieb performancegrowth“ fürs iPhone (CardDAV)

Stand 22.11.2026 (Ole). Ruft ein Interessent zurück, zeigt das iPhone seinen Namen. Dafür stellt die App ein
**nur lesbares** CardDAV-Adressbuch bereit, das in der Kontakte-App als Account eingerichtet wird.
Einrichtung: Admin › Einstellungen › Anbindungen & Import › Kontakte aufs iPhone.

## Was ist erreichbar

- Adresse: `https://<app>/api/carddav` (Einstieg auch über `/.well-known/carddav`).
- Inhalt: nur Vertriebskontakte (`SalesContact`) mit mindestens einer Telefonnummer. Je Karte: Name der Person,
  Firma, alle Nummern (E.164, aus `phone` und `SalesContactPhone`), eine kurze Notiz („performancegrowth Vertrieb ·
  Stufe“) und der Link zur Kontaktakte im Admin (nur mit Admin-Login nutzbar).
- **Nicht** enthalten: E-Mail, Adresse, Notizen, Verlauf, Angebote, Leads der Kunden (Vermittler) und deren Endkunden,
  auf Verlangen gelöschte Kontakte (Art. 17).
- Nur lesen: PUT, DELETE, PROPPATCH, MKCOL usw. werden mit 403 abgelehnt, Änderungen am iPhone kommen nie an.

## Schutz

- HTTP Basic, Benutzer `vertrieb` (änderbar mit `CARDDAV_USER`), Passwort `CARDDAV_PASSWORD` in Railway, mindestens
  24 Zeichen, Vergleich in konstanter Zeit. Ohne (oder mit zu kurzem) Passwort ist das Adressbuch aus: 404.
- In Produktion nur über HTTPS (sonst 403), Antworten mit `Cache-Control: no-store` und `noindex`.
- Fehlversuche je IP: nach 10 in 15 Minuten ist die IP 15 Minuten gesperrt (429, `LIMITS.carddavLogin`).
- Kein Login-Cookie nötig und keins gesetzt; der Zugang gibt nur dieses Adressbuch frei, sonst nichts in der App.

## Risiken

- Wer das Passwort kennt, kann die Namen und Nummern aller Vertriebskontakte lesen. Das Passwort liegt auf jedem
  eingerichteten iPhone (Schlüsselbund) und in Railway.
- Auf dem iPhone liegen die Kontakte als Kopie. Geht das Gerät verloren: Passwort wechseln (unten), die Kopie
  verschwindet, sobald der Account entfernt wird oder sich nicht mehr anmelden kann.
- iCloud: CardDAV-Accounts werden nicht in iCloud-Kontakte kopiert, Apps mit Kontaktzugriff können sie aber lesen.

## Widerrufen oder Passwort wechseln

1. Railway › Variablen: `CARDDAV_PASSWORD` löschen (Adressbuch sofort aus, 404) oder neu setzen
   (z. B. `openssl rand -base64 32`). Nach dem Neustart gilt nur noch das neue Passwort.
2. Auf den eigenen iPhones das neue Passwort eintragen (Einstellungen › Apps › Kontakte › Kontakte-Accounts) oder
   den Account löschen.

Technik: `src/lib/carddav/` (dav.ts: Anfragen, vcard.ts: Karten, server.ts: Daten mit 60 s Zwischenspeicher),
Endpunkt `src/app/api/carddav/[[...pfad]]/route.ts`. Route Handler nehmen kein PROPFIND/REPORT an, deshalb reicht
`src/middleware.ts` diese Methoden als POST mit Kopf `x-carddav-methode` an den eigenen Server (127.0.0.1:PORT) weiter
(`src/lib/carddav/tunnel.ts`, dort auch, warum kein Pages Router). Umleitung `/.well-known/carddav` ebenfalls dort.
