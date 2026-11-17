# Policen vor dem Termin per WhatsApp: Datenschutz

Stand: 18.11.2026 (Ole, nach der Rechtsprüfung `docs/recht/policen-whatsapp-gesundheitsdaten.md`, Ampel GELB).
Ersetzt die Fassung vom 17.11.2026 (KI-Zuordnung, Auslesen, 30 Tage). Die ältere Bewertung in
`docs/recht-gesundheitsunterlagen.md` und `docs/dsfa-policen-gesundheit.md` gilt nur noch, soweit sie hier nicht
geändert ist (siehe dort den Hinweis oben).

## 1. Ablauf

1. **Bitte (Text von Ole), eigene Nachricht ohne Knöpfe** (`lib/policen/bitte.ts policenBitte`), einmal je Chat nach der
   Vertragsfrage: „Damit Herr Kannapinn Ihren Termin gut vorbereiten kann: Schicken Sie bitte vorab Fotos oder PDFs Ihrer
   aktuellen Policen hier in den Chat, egal ob Haftpflicht, Hausrat oder Kfz. …“ (mit Freigabe Kranken/BU/Leben: „…
   Kfz, Kranken-, BU- oder Lebensversicherung“). Kein Upload-Link.
2. **Einwilligung als eigene interaktive Nachricht** (Auflage A1, Oles Wortlaut vom 18.11.2026):
   > Kurz zum Datenschutz: Ich bin einverstanden, dass {Vorname Nachname} ({Firma}) meine hier gesendeten Policen zur
   > Vorbereitung des Termins speichert und die Vertragsdaten automatisch auslesen lässt (KI-Dienst in der EU), auch wenn
   > sie Gesundheitsangaben enthalten, z. B. bei Kranken-, BU- oder Lebensversicherung. Beteiligt sind WhatsApp (Meta,
   > Zugriff auch aus den USA möglich) und der Dienstleister performancegrowth. Widerruf jederzeit mit „Widerruf“.
   > Infos: {Link Datenschutzhinweise}

   Fußzeile „Ihr Termin findet auch ohne Unterlagen statt.“, Knöpfe [Einverstanden] [Lieber nicht]. Ohne Freigabe
   Kranken/BU/Leben entfällt der Teil „auch wenn sie Gesundheitsangaben enthalten, z. B. …“ (Textversion `2026-11-18.s1`,
   mit Teil `2026-11-18.g1`). Grenzen von WhatsApp geprüft (Test): Text höchstens 1.024, Fußzeile 60, Knopf 20 Zeichen.
3. **Einverstanden** = ausdrückliche Einwilligung (Art. 9 Abs. 2 lit. a DSGVO), `ki = true`. Folgenachricht mit
   Schwärzungshinweis. **Lieber nicht**: „Kein Problem, Ihr Termin findet trotzdem statt. Bringen Sie Ihre Unterlagen dann
   einfach zum Termin mit.“, keine Erinnerungen mehr.
4. **Tor (A2):** Ohne gültige Einwilligung wird nichts bei 360dialog/Meta abgerufen. Kommt eine Datei vorher, bleibt nur
   die Media-ID (höchstens 24 Stunden), es kommt einmal je Lead die Nachfrage („Danke! Bevor ich Ihre Unterlagen ablege,
   brauche ich kurz Ihre Zustimmung:“ und derselbe Einwilligungstext). Erst nach „Einverstanden“ wird abgerufen; ohne Ja
   verworfen (Cron), bei „Lieber nicht“ sofort. Assistent aus (Vermittler hat übernommen): keine Nachfrage, verworfen.
5. **Eingang mit Einwilligung:** Typ am Inhalt geprüft (PDF, JPG, PNG, WebP, bis 10 MB, höchstens 30 je Lead), verschlüsselt
   abgelegt, Medium bei Meta gelöscht (soweit die Schnittstelle es zulässt), einmal je Lead „Danke, ist angekommen. Haben
   Sie noch weitere?“, Push an den Vermittler „Neue Unterlagen von {Lead}“. Chatverlauf (auch Admin-Chat): nur
   „Dokument für den Vermittler“, kein Dateiname, keine Vorschau.
6. **Kranken/BU/Leben je Vermittler (A5):** aus, bis der Inhaber unter Einstellungen bzw. auf der Karte („Policen aus
   Kranken, BU und Leben freischalten“, auf Heute und in der Terminvorbereitung bis zugestimmt oder 3-mal „Später“) der
   AVV-Ergänzung (b) zugestimmt hat; die Adresse seiner Datenschutzhinweise wird dabei hinterlegt. Intern/Test
   (`Customer.policenIntern`, `isTest`): sofort an; `policenIntern` setzt die Migration für Konten, deren Name
   „Kannapinn“ enthält. Ohne Freigabe werden Dateien, die laut Dateiname bzw. Begleittext Kranken/BU/Leben sind, nicht
   abgerufen (Hinweis an den Lead). Restrisiko: Ein Foto „IMG_1234.jpg“ einer Krankenpolice wird nicht erkannt.
7. **Widerruf (A4):** nur nach Regeln (`regeln.ts istWiderruf`: „Widerruf“, „widerrufen“, „löschen“, „bitte alles
   löschen“, „Unterlagen löschen“, „Einwilligung zurück“, „nicht mehr einverstanden“ …), sofort alles gelöscht (Bucket,
   Media-IDs), Bestätigung, Push an den Vermittler, keine Erinnerungen mehr. Im Kontakt: „Einwilligung widerrufen /
   Unterlagen löschen“.
8. **Erinnerungen (A8):** baut die Termin-Strecke; sie fragt `darfPolicenErinnern(leadId)` (`lib/policen/server.ts`):
   nur mit protokolliertem Opt-in aus der Buchung (Häkchen auf `/book`, nicht vorausgewählt: „Ich möchte per WhatsApp an
   die Vorbereitung meines Termins erinnert werden (z. B. an meine Unterlagen). Abmelden jederzeit mit STOP.“), gebuchter
   Termin in der Zukunft, kein Dokument, kein „Lieber nicht“, kein Widerruf, kein STOPP. Bucht der Lead per WhatsApp-Knopf
   statt über `/book`, gibt es dieses Opt-in noch nicht, also keine Erinnerung.

## 2. Keine KI in diesem Paket

Für Policen gibt es in diesem Stand **keine** KI-Verarbeitung: keine Texterkennung, keine Zuordnung, kein Auslesen, kein
Widerruf per KI, für alle Sparten. Die Einwilligung erlaubt ein späteres Auslesen durch einen KI-Dienst in der EU (baut
ein anderer Agent nach K1 bis K8 der Rechtsprüfung); solange er nicht eingerichtet ist, wertet keine KI die Unterlagen
aus. Codestellen siehe Abschnitt 7.

## 3. Ablage (A6)

- Eigener privater Bucket nur für Policen, S3-kompatibel, **nur EU-Endpunkte** (`lib/policen/ablage.ts euEndpunkt`):
  Cloudflare R2 mit EU-Jurisdiktion (`https://<account>.eu.r2.cloudflarestorage.com`) oder Amazon S3 in einer eu-Region.
  Andere Endpunkte werden abgelehnt (dann ist die Funktion aus). `lib/r2.ts` (Werbebilder, öffentliche URL) wird nicht
  genutzt.
- Verschlüsselung je Mandant: AES-256-GCM je Datei, Schlüssel je Kunde per HKDF-SHA256 aus `POLICEN_SCHLUESSEL` und der
  Kunden-ID, Objektname als zusätzliche Authentifizierung; zusätzlich verschlüsselt der Anbieter ruhende Daten.
  Objektnamen ohne Dateinamen (`policen/<Kunde>/<Lead>/<Zufall>`).
- Abruf nur nach dem Login über einen signierten Link (HMAC, 2 Minuten, an den Login gebunden), danach erneute Prüfung
  der Sichtbarkeit (`leadScope`: Inhaber und zuständiger Berater, kein anderer Berater, nie die Admin-Vorschau). Jeder
  Abruf im Änderungsprotokoll (`policen.abruf`, Öffnen bzw. Herunterladen, Login, Zeitpunkt).
- Alte Unterlagen (vor dem 18.11.2026, verschlüsselt in der Datenbank, `LeadDocument.data`) bleiben lesbar und werden
  nach der Frist gelöscht.

**Was Ole in Railway anlegen muss (sonst bleibt die Funktion aus):**

| Variable | Wert |
|---|---|
| `POLICEN_S3_ENDPOINT` | z. B. `https://<account-id>.eu.r2.cloudflarestorage.com` (Bucket in Cloudflare mit Jurisdiktion **EU** anlegen) |
| `POLICEN_S3_BUCKET` | z. B. `pg-policen-eu` (privat, kein öffentlicher Zugriff, keine eigene Domain) |
| `POLICEN_S3_ACCESS_KEY_ID`, `POLICEN_S3_SECRET_ACCESS_KEY` | API-Token nur für diesen Bucket, Objekt lesen und schreiben |
| `POLICEN_SCHLUESSEL` | `openssl rand -base64 32` (getrennt von `ENCRYPTION_KEY` aufbewahren) |
| optional `POLICEN_WHATSAPP_AUS=1` | Notschalter: Funktion aus |
| optional `POLICEN_GESUNDHEIT_AUS=1` | Notschalter: Kranken/BU/Leben für alle aus (z. B. wenn der DPF wegfällt) |

Bei R2: Cloudflare als Unterauftragsverarbeiter (US-Konzern) in `SUBPROCESSORS` aufnehmen (Mitteilung mit Widerspruchsfrist).

## 4. Nachweis (A3)

Tabelle `PolicenNachweis`, **nur anhängen** (Datenbank-Trigger verbietet UPDATE und DELETE; DELETE nur bei Art. 17 bzw.
Vertragsende mit `SET LOCAL app.policen_nachweis_loeschen = 'ja'` in `lib/erasure.ts`). Arten: `einwilligung`,
`abgelehnt`, `widerruf`, `erinnerung_optin`, `avv_zustimmung`. Felder: Zeitpunkt, Wortlaut wie gesendet (mit Fußzeile
und Knopftext), Textversion, Kunde, Lead, Telefonnummer, WhatsApp-ID der Knopfantwort und der beantworteten Nachricht,
zuständiger Vermittler (User-ID, Name), Datenschutzhinweis (Adresse, Version), `ki`. Bleibt nach dem Löschen der Policen
(Widerruf, 90 Tage) als Nachweis, ohne Inhalte.

## 5. Löschung

- 90 Tage nach dem letzten Termin (bei Absage oder Nichterscheinen nach dem geplanten Termin), ohne Termin 90 Tage nach dem
  Eingang; täglicher Cron (`prunePolicen`, `api/whatsapp/cron`). Bei Abschluss 14 Tage vorher Erinnerung an den
  Vermittler, die Löschung verschiebt sich nicht. „Als Beratungsdokumentation behalten“ (Kontakt, nur bei Abschluss):
  keine automatische Löschung.
- Media-IDs ohne Einwilligung: 24 Stunden. Widerruf: sofort. Art. 17 bzw. Vertragsende: mit dem Lead bzw. Kunden
  (`eraseLead`, `eraseCustomerData`), Dateien im Bucket zuerst. Verwaiste Dateien im Bucket (älter als ein Tag, ohne
  Eintrag) löscht der Cron mit.
- Meta/360dialog: nach dem Abruf `DELETE /{media_id}` (`lib/policen/media.ts loescheMedia`, bestmöglich). Ob Meta
  eingehende Medien darauf sofort löscht, ist nicht dokumentiert; sonst gilt Metas Frist (bis 30 Tage). Offen: „No
  Storage“ bzw. „Local Storage EU“ bei 360dialog anfragen (E2).

## 6. TOM und Verzeichnis (Ergänzung)

| Maßnahme | Umsetzung |
|---|---|
| Einwilligungstor | kein Abruf ohne Einwilligung (`server.ts handleInboundMedia`, `warteAufEinwilligung`) |
| Verschlüsselung | AES-256-GCM, Schlüssel je Mandant, privater EU-Bucket (`ablage.ts`) |
| Zugriff | `leadScope`, signierte Links 2 Minuten, Admin-Vorschau ohne Inhalte und Dateinamen |
| Protokoll | `policen.abruf`, `policen.einwilligung`, `policen.lieber_nicht`, `policen.widerruf`, `policen.verworfen`, `policen.geloescht`, `policen.avv_zustimmung` (ohne Inhalte); Nachweise in `PolicenNachweis` |
| Logs (A7) | keine Inhalte, Dateinamen, Medien-Adressen in Logs; Fehler nur mit Fehlertyp; Push neutral |
| Löschfristen | Abschnitt 5 |
| Keine KI | Abschnitt 2 und 7 |

Verzeichnis (`docs/datenschutz.md` Abschnitt 3 und 4): „Policen per WhatsApp (`LeadDocument`, `PolicenNachweis`) |
Vorbereitung des Termins | Interessenten, Mitversicherte | Versicherungsunterlagen, auch Gesundheitsdaten (Art. 9) |
360dialog, Meta, Railway, Speicher (R2 EU bzw. S3 eu) | 90 Tage nach dem Termin, Widerruf sofort, Nachweis bis Art. 17
bzw. Vertragsende“.

## 7. Für Oles Rechtsprüfung: Wo im Code „keine Dokumente an KI“ sichergestellt ist

- `src/lib/policen/server.ts:1-15` (Kopf) und die ganze Datei: importiert keinen KI-Client; Eingang
  `handleInboundMedia` (`server.ts:296`), Ablage `speichere` (`server.ts:423`, Datei geht nur an `legeAb` in den
  Bucket, `server.ts:428`), Abruf nach Einwilligung `beantworteEinwilligung` (`server.ts:513`).
- `src/lib/whatsapp/gateway.ts:416-422`: eingehende Medien gehen nur an `handleInboundMedia`; danach läuft der Assistent
  für diese Nachricht nicht (`if (media && botErlaubt) botErlaubt = false;`, Zeile 422). Der Assistent sieht nur den
  Hinweis „Dokument für den Vermittler“, nie Datei, Dateiname oder Begleittext.
- `src/lib/policen/ki.ts` ist gelöscht (vorher Zuordnung, Auslesen, Widerruf per KI).
- Tests: `tests/unit/policen.test.ts:226` (kein Modul in `src/lib/policen` importiert einen KI-Client oder ruft
  `messages.create` auf), `tests/integration/policen-whatsapp.test.ts` (KI-Client gezählt, beim Dokumenteingang 0 Aufrufe,
  z. B. Zeilen 179, 203, 222).

## 8. Offene Rechtspunkte

1. Einwilligung erlaubt KI-Auslesen, das es noch nicht gibt (Text „lässt auslesen“); laut Rechtsprüfung zulässig, weil er
   nur erlaubt. Sobald der KI-Dienst kommt: Anbieter in `SUBPROCESSORS`, AVV § 4 Nr. 4 anzeigen (30 Tage Widerspruch).
2. Ohne Freigabe Kranken/BU/Leben deckt die Sach-Fassung keine Gesundheitsangaben; eine Krankenpolice mit neutralem
   Dateinamen kann trotzdem gespeichert werden (Restrisiko, Anwältin).
3. AVV-Ergänzung (b): Platzhalter gefüllt (Speicher aus der Konfiguration, KI-Dienst „vor dem ersten Einsatz angezeigt“,
   Sicherungszyklus „des Hosting-Anbieters“ ohne Zahl). Prüfen lassen.
4. 2FA für Vermittler mit Zugriff auf Policen (AVV § 5) ist nicht erzwungen; Malware-Prüfung eingehender Dateien fehlt
   (nur Typprüfung am Inhalt). Beides vor breitem Rollout.
5. Erinnerungs-Opt-in gibt es nur auf `/book`; Buchungen per WhatsApp-Knopf haben keins (keine Erinnerung).
6. Löschung bei Meta: Wirkung von `DELETE /{media_id}` für eingehende Medien nicht zugesichert; No Storage anfragen.
7. Art. 17 löscht auch die Nachweise (wie bisher beim Einwilligungsprotokoll); ob sie nach Art. 17 Abs. 3 lit. e
   aufzubewahren sind, klärt die Anwältin.
8. Bestandsdaten vor dem 18.11.2026: ältere Unterlagen ohne diese Einwilligung (Sach, damals ohne Knopf) und KI-Auszüge
   (`LeadDocument.extracted`) bleiben bis zur Frist; sie werden nicht mehr angezeigt.
