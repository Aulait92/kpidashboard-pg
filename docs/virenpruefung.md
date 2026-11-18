# Virenprüfung eingehender Dateien (ClamAV)

Stand: 18.11.2026 (Ole: „wichtig, direkt mitbauen“, Rechtsprüfung `docs/recht/policen-whatsapp-gesundheitsdaten.md`,
Punkt „Malware-Prüfung“, AVV-Ergänzung § 5 „Schadsoftwareprüfung eingehender Dateien“).

## Was geprüft wird

| Quelle | Wann | Befund (Virus) | Prüfung nicht möglich (Standard) |
|---|---|---|---|
| Policen per WhatsApp (`lib/policen/server.ts`) | nach dem Abruf, vor der Ablage im Bucket | nicht gespeichert, Medium bei Meta gelöscht, Lead bekommt neutral „Diese Datei konnte ich leider nicht annehmen …“, Push an den Vermittler „Datei von {Lead} nicht angenommen“, Verlauf, Änderungsprotokoll `viren.befund` | gespeichert als `ungeprueft`, **nicht** zum Öffnen angeboten („wird geprüft“), Hinweis an die Admins |
| Upload am Kontakt (`lib/lead-files.ts`) | beim Hochladen | abgelehnt („Die Virenprüfung hat diese Datei abgelehnt …“), Änderungsprotokoll | gespeichert als `ungeprueft`; eine **Police** wird erst nach der Prüfung angeboten, andere Dateien wie bisher |
| Anhänge von Antworten per E-Mail (Paket M2, `lib/mail/eingang.ts`) | vor der Weiterleitung und bei jedem Download in der App | nicht weitergeleitet, nie zum Download, Hinweis in der Weiterleitung, Änderungsprotokoll. Keine Antwort an den Absender (Schadmails haben oft gefälschte Absender) | nicht angehängt, Hinweis in der Weiterleitung; Download in der App erst, wenn die Prüfung beim Abruf klappt |

Ungeprüfte Dateien werden nachgeprüft: beim Öffnen (sofort) und im WhatsApp-Cron (alle 5 Minuten, höchstens 20 je
Art). Mit Befund beim Nachprüfen: gelöscht (Löschprotokoll), Lead neutral informiert (sofern das WhatsApp-Fenster offen
ist), Vermittler-Hinweis.

Es wird nur die Signatur geprüft (clamd `INSTREAM`), nichts ausgelesen oder gespeichert. Logs enthalten nur das
Ergebnis, keine Dateinamen und Inhalte (A7).

## Variablen (Dienst `kpidashboard-pg`)

| Variable | Wert |
|---|---|
| `CLAMAV_HOST` | `${{clamav.RAILWAY_PRIVATE_DOMAIN}}` (ergibt `clamav.railway.internal`). Leer = Prüfung nicht eingerichtet |
| `CLAMAV_PORT` | `3310` (Standard, kann fehlen) |
| `CLAMAV_TIMEOUT_MS` | optional, Standard `30000` |
| `VIRENPRUEFUNG_PFLICHT` | optional `1`: Ohne erreichbare Prüfung wird **jede Datei abgelehnt** (Lead: „Ich kann die Datei gerade nicht annehmen …“, Upload: „Die Virenprüfung ist gerade nicht erreichbar …“). Ohne Schalter (Standard): annehmen, als ungeprüft markieren, erst nach der Prüfung anbieten, Hinweis an die Admins (Push „Virenprüfung fehlt“ höchstens einmal am Tag, Änderungsprotokoll `viren.ungeprueft_hinweis`). Empfehlung: einschalten, sobald der Dienst ein paar Tage stabil läuft |

**Wichtig bis zur Einrichtung:** Ohne `CLAMAV_HOST` lassen sich neue Policen vom Kunden nicht öffnen (sie stehen auf
„wird geprüft“) und E-Mail-Anhänge werden nicht mehr mitgeschickt. Deshalb den Dienst vor bzw. mit diesem Stand anlegen.

## Anleitung für Ole: ClamAV-Dienst in Railway anlegen (ca. 10 Minuten)

1. Railway → Projekt „PG Dashboard“ → **Create** → **Docker Image** → `clamav/clamav:stable` eingeben.
2. Den neuen Dienst umbenennen in **`clamav`** (Settings → Service Name). Region wie die App (EU, Amsterdam).
3. **Kein öffentlicher Zugang:** Settings → Networking: **keine** Domain erzeugen, **kein** TCP-Proxy. Der Dienst ist
   dann nur im privaten Netzwerk erreichbar (`clamav.railway.internal`).
4. **Volume** anlegen (Rechtsklick auf den Dienst → Attach Volume), Mount-Pfad `/var/lib/clamav`, 2 GB. Dort liegen die
   Signaturen; ohne Volume lädt der Dienst sie bei jedem Neustart neu (ca. 300 MB, Start dauert dann länger).
5. **Speicher:** Settings → Resources mindestens **3 GB RAM** (ClamAV hält die Signaturen im Speicher und lädt sie beim
   Aktualisieren kurz doppelt). Variablen braucht der Dienst keine; die Signaturen aktualisiert er selbst (freshclam).
6. Deploy. Im Log des Dienstes warten, bis freshclam die Signaturen geladen hat und clamd auf Port 3310 lauscht (Zeile
   mit „3310“; beim ersten Start 2 bis 5 Minuten).
7. Dienst **`kpidashboard-pg`** → Variables → `CLAMAV_HOST` = `${{clamav.RAILWAY_PRIVATE_DOMAIN}}`, `CLAMAV_PORT` = `3310`.
   Railway startet die App neu.
8. **Prüfen:** `GET /api/ops/diagnose?q=sicherheit` (mit `OPS_READ_TOKEN`) zeigt `virenpruefung.erreichbar: true` und
   die Zahl ungeprüfter Dateien (wird über den Cron in ein paar Minuten 0). Alternativ in der App eine Police am Kontakt
   hochladen: sie trägt nicht „wird auf Viren geprüft“.
9. Optional nach ein paar stabilen Tagen: `VIRENPRUEFUNG_PFLICHT=1`.

Hinweise:
- Ältere Railway-Umgebungen (vor dem 16.10.2025 angelegt) haben ein privates Netz nur mit IPv6. clamd sollte auf allen
  Adressen lauschen (nicht geprüft); ist `erreichbar` trotzdem `false`, im Log von `clamav` die Zeilen mit „3310“ ansehen
  und Claude den Ausschnitt schicken.
- Größere Dateien als die Grenze von clamd für einen Datenstrom (`StreamMaxLength`) gelten als „ungeprüft“. Policen
  haben höchstens 10 MB, Uploads 15 MB; E-Mail-Anhänge bis 28 MB. Liegt die Grenze im Image darunter, Claude Bescheid
  geben.
- Kosten: ein kleiner Dienst mit ca. 1,5 bis 3 GB RAM Dauerbetrieb.

## Tests

`tests/unit/virenpruefung.test.ts` (clamd-Attrappe `tests/fixtures/clamd.ts` mit EICAR-Teststring, große Dateien in
Stücken, ohne Konfiguration, nicht erreichbar, Pflicht), `tests/integration/policen-sicherheit.test.ts` (WhatsApp,
Upload, Nachprüfung, Pflicht), `tests/integration/mail-eingang.test.ts` (Anhänge).
