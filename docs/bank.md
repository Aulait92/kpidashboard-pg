# Bank & Karten: Kosten aus Commerzbank und Amex

Admin → Einstellungen → **Bank & Karten**. Ausgaben vom Geschäftskonto und der
Kreditkarte kommen in die App, werden einem Zweck zugeordnet (Pay-per-Lead,
Software, Kundengewinnung, Sonstiger Betrieb oder ignorieren) und fließen **netto**
in Marge und Kundengewinnungskosten der Zahlen-Seite.

## Wege

| Konto | Weg | Hinweis |
|---|---|---|
| Commerzbank | Direkt verbinden (Enable Banking, PSD2) | Zustimmung gilt höchstens 180 Tage; 7 Tage vorher Erinnerung (Aufgabe + Push) |
| Commerzbank | CSV-Upload | Online-Banking → Umsätze → Export „CSV“ (Rückfallebene) |
| American Express | CSV-Upload | Über Open Banking in Deutschland i. d. R. nicht verfügbar. amex.de → Umsätze → „Herunterladen“ → Format **CSV** (nicht Excel) |

Doppelt hochladen schadet nicht: Buchungen werden je Konto über Referenz bzw.
Datum/Betrag/Text erkannt und übersprungen.

## Einmalig einrichten (Enable Banking)

Kostenlos im „eingeschränkten Modus“ für eigene Konten (laut Enable Banking: nur
Konten, die mit der App verknüpft sind; für kommerzielle Nutzung mit fremden
Konten wäre ein Vertrag nötig – für uns nicht nötig).

1. https://enablebanking.com/sign-in/ → E-Mail eingeben, Link in der Mail öffnen.
2. Oben „API applications“ → „Add a new application“:
   - Environment: **Production**
   - Name: z. B. „performancegrowth Kosten“ (sieht man bei der Bank-Freigabe)
   - Allowed redirect URLs: `https://app.performancegrowth.de/api/bank/callback`
     (für Staging zusätzlich `https://staging.performancegrowth.de/api/bank/callback`)
   - Schlüssel: Standard („generate in browser“) → „Register“. Der Browser lädt
     eine Datei `<App-ID>.pem` herunter (privater Schlüssel, gut aufbewahren).
3. Die neue App steht auf „Inactive“ → **„Activate by linking accounts“** →
   Commerzbank wählen → mit Teilnehmernummer/PIN und photoTAN anmelden → Konto
   auswählen. Danach ist die App „Active“ (eingeschränkter Modus).
4. Railway → Service **kpidashboard-pg** (Live) → Variables:
   - `ENABLE_BANKING_APP_ID` = die App-ID (Dateiname der .pem ohne Endung)
   - `ENABLE_BANKING_PRIVATE_KEY` = kompletter Inhalt der .pem-Datei
     (inkl. `-----BEGIN PRIVATE KEY-----` … `-----END PRIVATE KEY-----`)
   - **Schlüssel nie in einen Chat oder eine Mail kopieren.**
5. Nach dem Deploy: Bank & Karten → Commerzbank → „Verbinden“ → Anmeldung bei
   der Commerzbank (photoTAN) → zurück in der App werden die Umsätze der letzten
   90 Tage geholt. Danach täglich automatisch.

Hinweis: Schritt 3 (Verknüpfen im Control Panel) und Schritt 5 (Freigabe über die
App) sind beide nötig – die Freigabe im Control Panel gilt nicht für die API.

## Zuordnen

- Neue Ausgaben: Admin „Heute“ zeigt „N Ausgaben zuordnen“, Seite
  „Kosten zuordnen“. Je Buchung Zweck wählen; „immer so bei …“ legt eine Regel an
  und ordnet offene gleiche Buchungen gleich mit zu.
- Standardregeln beim ersten Import: Anthropic/OpenAI/Railway/… → Software,
  Zapier/Airtable → Pay-per-Lead, Instantly/Waalaxy/LinkedIn → Kundengewinnung;
  **ignoriert**: Meta/Facebook (kommt per API), Amex-Abrechnung auf dem Girokonto
  (Kartenumsätze kommen einzeln), Stripe, Umbuchungen, Finanzamt, Privat, Gehalt,
  alle Einnahmen. Regeln lassen sich auf der Seite ändern oder löschen.
- „inkl. USt“: Betrag enthält 19 % deutsche Umsatzsteuer → netto rechnen.
  Ausländische Tools ohne deutsche USt (Reverse Charge): aus lassen.
- **Doppelzählung:** Steht ein Anbieter auch unter „Laufende Kosten“ (von Hand),
  zeigt die Seite eine Warnung – dort dann ein Enddatum setzen.

## Technik

- `lib/bank/enable-banking.ts` (JWT RS256, /auth, /sessions, Umsätze mit
  continuation_key), `lib/bank/csv.ts` (Commerzbank/Amex/allgemein, deutsche
  Zahlen- und Datumsformate, UTF-8/Windows-1252), `lib/bank/rules.ts`,
  `lib/bank/server.ts` (Import, Zuordnung, Abruf, Erinnerung, Kosten je Monat).
- Callback `/api/bank/callback` nur für angemeldete Admins, `state` nur gehasht
  gespeichert und einmal gültig (60 Minuten). Session-ID verschlüsselt
  (ENCRYPTION_KEY), IBAN gekürzt, keine Schlüssel in Logs.
- Abruf im WhatsApp-Cron (nach der Antwort), je Verbindung höchstens alle
  20 Stunden, ab letztem Abruf minus 5 Tage; nur gebuchte Umsätze. Abschalten:
  `BANK_SYNC=off`.
- Änderungsprotokoll: bank.connect, bank.disconnect, bank.sync, cost.assign, cost.rule.
