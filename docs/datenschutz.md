# Datenschutz-Dokumentation

Stand: 10.11.2026 · Verantwortlich: Ole Kannapinn UG (haftungsbeschränkt),
Lorenzstraße 58, 12209 Berlin, ole.kannapinn@performancegrowth.de

Diese Datei ist die interne Dokumentation nach Art. 5 Abs. 2, 30, 32 und 33 DSGVO.
Sie ersetzt keine Rechtsberatung. Punkte mit **Prüfen** bitte mit dem Anwalt klären.
Bei jeder Änderung an Diensten, Datenarten oder Fristen diese Datei mitpflegen.

Die Texte für Kunden liegen im Code: AGB, AVV, TOMs (Anlage 1) und
Unterauftragsverarbeiter (Anlage 2) in `src/lib/legal-texts.ts`, öffentlich unter
`/rechtliches/agb` und `/rechtliches/avv`.

## 1. Rollen

| Bereich | Rolle der UG | Verantwortlicher |
|---|---|---|
| Leads, Chats, Termine der Kunden (Versicherungsvermittler) | Auftragsverarbeiter (AVV) | der jeweilige Kunde |
| Eigener Vertrieb (Vertriebskontakte, Kaltakquise, Angebote) | Verantwortlicher | UG |
| Kundenverwaltung, Verträge, Abrechnung | Verantwortlicher | UG |
| Logins, Sicherheit, Änderungsprotokoll, Nutzungsmessung | Verantwortlicher | UG |
| Pay-per-Lead (Leads aus eigenen Funnels, an Käufer geliefert) | **Prüfen**: vermutlich Verantwortlicher bei Erhebung und Übermittlung an den Käufer (eigener Verantwortlicher) | UG / Käufer |

## 2. Verzeichnis als Verantwortlicher (Art. 30 Abs. 1)

| Tätigkeit | Zweck | Betroffene / Daten | Rechtsgrundlage | Empfänger | Löschung |
|---|---|---|---|---|---|
| Vertrieb an Versicherungsvermittler | Neukunden gewinnen | Vermittler (B2B): Name, Firma, Kontaktdaten, Verlauf, E-Mails, Termine | Art. 6 Abs. 1 f; Kalt-E-Mails **Prüfen** (§ 7 UWG, mutmaßliche Einwilligung B2B) | Instantly, Calendly, Resend, Railway | Widerspruch: sofort (Kontakt löschen). Sonst siehe Löschkonzept |
| Angebote und Verträge | Vertragsschluss | Kunde: Name, Firma, Anschrift, Annahme-Protokoll (Name, IP, Browser, Zeit) | Art. 6 Abs. 1 b, c | Stripe, Resend, Railway | 10 Jahre (§ 147 AO, § 257 HGB) |
| Abrechnung, Mahnwesen | Zahlungen | Kunde: Rechnungsdaten, Zahlungsstatus (Bankdaten nur bei Stripe) | Art. 6 Abs. 1 b, c | Stripe | 10 Jahre |
| Onboarding, Feedback | Einrichtung, Qualität | Kunde: Fragebogen, Impressumsangaben der Website, Bewertungen | Art. 6 Abs. 1 b, f | Anthropic (Impressum auslesen), Resend | mit dem Kundenkonto |
| KI-Hilfe im Kundenbereich | Fragen zur Bedienung beantworten, App verbessern | Nutzer: gestellte Frage, Antwort, Bewertung, Seite (keine Lead-Daten; Hinweis „keine Kundendaten eingeben“) | Art. 6 Abs. 1 b, f | Anthropic (Antwort erzeugen), Railway | 180 Tage (mit den Nutzungsdaten) |
| Logins und Sicherheit | Zugang, Missbrauch verhindern | Nutzer: E-Mail, Passwort-Hash, 2FA-Geheimnis (verschlüsselt), Anmeldungen, Fehlversuche | Art. 6 Abs. 1 b, f; Art. 32 | Railway | Konto: bis Löschung; Fehlversuche 30 Tage |
| Änderungsprotokoll | Nachweis, Sicherheit | Nutzer: Person, Zeitpunkt, Aktion (keine Lead-Inhalte) | Art. 6 Abs. 1 c, f | Railway | 1 Jahr (automatisch) |
| Nutzungsmessung | Bedienung verbessern | Nutzer pseudonym: Seitenaufrufe, Aktionen, Fehler | Art. 6 Abs. 1 f | Railway | 180 Tage (automatisch) |
| Fehlerüberwachung | Betrieb | technische Fehler; Texte im Replay maskiert, keine Nutzerkennung, keine URL-Parameter | Art. 6 Abs. 1 f | Sentry (EU) | laut Sentry-Einstellung (90 Tage Standard, **Prüfen**) |
| Werbeanzeigen-Steuerung | Kampagnen der Kunden | nur Kennzahlen (Kosten, Klicks), keine Personen | – | Meta, Google, Outbrain, TikTok | – |
| Werbemittel erstellen | Bilder, Videos, Untertitel | keine personenbezogenen Daten | – | OpenAI, Google (Gemini/Veo), Unsplash, Pexels, Telegram | – |

## 3. Verzeichnis als Auftragsverarbeiter (Art. 30 Abs. 2)

Für jeden Kunden mit AVV (Annahme des Angebots, `Offer.dpaUrl` speichert die geltende Fassung):

- **Kategorien der Verarbeitung:** Lead-Eingang (Meta-Lead-Formulare, bis Dezember auch
  Zapier/Airtable), Verwaltung und Verteilung im Team, WhatsApp-Kontakt durch den
  KI-Assistenten und die Berater, Terminbuchung und -erinnerung, Zustellung per E-Mail
  (Nur-Betreuung), Auswertungen.
- **Automatisches Nachfassen (Abfolgen, je Kunde einschaltbar):** nutzt dieselbe
  WhatsApp-Verarbeitung (gleiche Einwilligung, gleiche Dienste, keine neuen Datenarten).
  Gespeichert wird nur der Ablauf je Lead (`LeadSequence`: Art, Schritt, Zeitpunkte,
  Ergebnis – keine Nachrichteninhalte); wird mit dem Lead gelöscht. „Stopp“ oder eine
  Antwort beendet das Nachfassen sofort.
- **Datenarten und Betroffene:** wie AVV § „Art, Zweck und Umfang“. Keine Daten nach Art. 9.
- **Unterauftragsverarbeiter:** AVV Anlage 2 (`SUBPROCESSORS`).
- **Drittland:** USA bei Anthropic, Resend, Airtable, Zapier, Railway (Unternehmen), Meta,
  Google, Microsoft. Grundlage: EU-US Data Privacy Framework bzw. Standardvertragsklauseln.
  **Prüfen**: DPF-Zertifizierung je Anbieter vor Vertragsschluss nachsehen und ablegen.
- **TOMs:** AVV Anlage 1 (`TOMS`), Nachweise siehe Abschnitt 6.

### Nachweis Auftragsverarbeitungsverträge mit Dienstleistern

| Dienst | Zweck | AVV/DPA abgeschlossen am | Ablage |
|---|---|---|---|
| Railway | Hosting, Datenbank (EU, Amsterdam) | | |
| Anthropic | KI-Assistent, Impressum auslesen | | |
| 360dialog | WhatsApp Business API | | |
| Meta | WhatsApp, Lead-Formulare | | |
| Resend | E-Mail-Versand | | |
| Airtable | Lead-Daten (bis Dezember 2026) | | |
| Zapier | Lead-Übertragung (bis Dezember 2026) | | |
| Sentry | Fehlerüberwachung (EU) | | |
| Google, Microsoft | Kalender (wenn vom Kunden verbunden) | | |
| Stripe | Zahlungen (eigene Verantwortung, kein AVV nötig, **Prüfen**) | | |
| Instantly, Calendly | eigener Vertrieb | | |

**Wenn Airtable und Zapier abgeschaltet sind:** Einträge aus `SUBPROCESSORS` entfernen,
`LEGAL_VERSION` erhöhen und die Kunden in Textform informieren (AVV: 14 Tage Widerspruchsfrist
gilt nur für neue Dienste, eine Streichung ist unkritisch, wird aber trotzdem mitgeteilt).

### Bestandskunden-Kampagnen (Zusatzmodul)

- **Daten:** Bestandskunden des Vertreters (Name, Kontakt, Geburtsdatum, Adresse, Kundennummer,
  Sparten mit Beginn/Ablauf). **Keine Gesundheitsangaben** (Spalten werden beim Import
  verworfen), keine Beiträge.
- **Einwilligung:** liegt laut Versicherer vor; je Kunde dokumentiert („Einwilligung laut
  Versicherer, Import TT.MM.JJJJ“). „Stopp“ sperrt den Kunden dauerhaft für Kampagnen.
- **AVV:** Datenarten um „Vertragsdaten von Bestandskunden“ ergänzen (**Prüfen** Anwalt).
- **Löschung:** mit dem Kundenkonto bzw. auf Wunsch des Vertreters (Liste neu hochladen
  aktualisiert, löscht aber nicht – Löschen einzelner Bestandskunden: **noch offen**).

## 4. Löschkonzept

| Daten | Frist | Wie |
|---|---|---|
| Nutzungsmessung (`UsageEvent`) | 180 Tage | automatisch, Cron 03:00 UTC (`pruneUsage`) |
| Änderungsprotokoll (`AuditLog`) | 1 Jahr | automatisch (`pruneAudit`) |
| Login-Fehlversuche | 30 Tage | automatisch (`pruneAudit`) |
| Nicht zugeordnete Leads (Rohdaten aus Meta) | 30 Tage nach Zuordnung, sonst 90 Tage | automatisch (`pruneTransient`) |
| Passwort-Links | 7 Tage nach Ablauf | automatisch (`pruneTransient`) |
| Sitzung (Cookie) | 30 Tage | läuft ab; 2FA-Zwischenschritt 10 Minuten |
| Lead auf Wunsch der betroffenen Person | sofort | Lead öffnen → Mehr → „Daten löschen (Datenschutz)“ (Inhaber oder Admin). Anonymisiert den Lead, löscht Chats, Termine, Einwilligung. Umsatz und Status bleiben ohne Personenbezug |
| Alle Lead-Daten eines Kunden bei Vertragsende | spätestens 30 Tage nach Ende (AVV) | Admin → Kunden → Kunde → Abrechnung → „Vertragsende: Daten löschen“. Vorher auf Wunsch Leads exportieren. Logins im Reiter „Logins“ löschen |
| Leads, Chats, Termine während der Laufzeit | nach Weisung des Kunden | keine automatische Frist (Kunde entscheidet; Vermittler haben eigene Dokumentationspflichten) |
| Vertriebskontakte ohne Vertrag | **Vorschlag**: 2 Jahre nach letzter Aktivität | noch von Hand (Kontakt → Löschen). Bei Widerspruch sofort |
| Angebote, Verträge, Rechnungen | 10 Jahre | nicht löschen; Stripe bewahrt Rechnungen auf |
| Datensicherungen | Rotation | PITR ca. 4 Wochen; tägliche/wöchentliche Sicherungen laut Railway → Postgres → Backups (**Aufbewahrung dort ablesen und hier eintragen**). Gelöschte Daten verschwinden mit der Rotation |

**Airtable (bis zur Abschaltung):** Die App-Löschung erreicht Airtable nicht. Bei Leads
aus Airtable den Datensatz zusätzlich dort löschen. Der Sync überschreibt einen in der App
gelöschten Lead nicht mehr (`Lead.erasedAt`). Wird der Datensatz in Airtable gelöscht,
entfernt der nächste Sync die anonyme Zeile samt Umsatz.

**Kalender:** Termine im Google-/Outlook-Kalender des Beraters liegen in dessen Konto.
Der Lösch-Dialog weist darauf hin.

## 5. Anfragen betroffener Personen

**Leads (wir sind Auftragsverarbeiter):** Anfragen gehören zum Kunden. Kommt eine Anfrage
bei uns an: innerhalb von 2 Werktagen an den Kunden weiterleiten, nicht selbst beantworten.
Der Kunde kann

- **Auskunft/Kopie (Art. 15, 20):** Lead-Detail (Angaben, Notizen), Chat-Verlauf unter Chats,
  CSV-Export unter Leads. Bei Bedarf hilft der Admin (Admin → Leads → Export).
- **Berichtigung (Art. 16):** Angaben im Lead bzw. in Airtable ändern.
- **Löschung (Art. 17):** wie oben, „Daten löschen (Datenschutz)“.
- **Widerspruch WhatsApp:** Schreibt ein Lead „Stopp“ o. Ä., übernimmt der Berater; den
  Assistenten für den Chat ausschalten. Für endgültige Ruhe Lead löschen.

**Eigene Daten (wir sind Verantwortlicher):** Antwort innerhalb eines Monats (Art. 12 Abs. 3).
Vertriebskontakt: Kontakt öffnen → Daten einsehen bzw. löschen. Anfrage und Antwort im
Mail-Postfach aufbewahren (Nachweis).

## 6. Technische und organisatorische Maßnahmen (Nachweise)

| Maßnahme (AVV Anlage 1) | Umsetzung |
|---|---|
| EU-Hosting | Railway, Region Amsterdam (App und Datenbank) |
| TLS | Railway-Domains nur HTTPS; Datenbank intern |
| Passwörter gehasht | `src/lib/auth.ts` (`hashPassword`, scrypt) |
| Zwei-Faktor für Admins | `src/lib/totp.ts`, Einstellungen → Sicherheit; Hinweis-Banner, solange nicht aktiv |
| Begrenzung von Anmeldeversuchen | 10 Fehlversuche je E-Mail in 15 Minuten, 2FA-Code max. 5 Versuche |
| Mandantentrennung, Rollen | `leadScope`/`conversationScope`/`appointmentScope` in `src/lib/team.ts`, `writableCustomerId` |
| Verschlüsselte Zugangsdaten | `ENCRYPTION_KEY` (AES-256-GCM) für Kalender-Tokens, 2FA-Geheimnisse, ICS-Links |
| Änderungsprotokoll | `src/lib/audit.ts`, Einstellungen → Änderungsprotokoll |
| Sicherungen, Wiederherstellung | PITR seit 09.11.2026; Test 10.11.2026 erfolgreich (`docs/notfall-wiederherstellung.md`) |
| Geprüfte Änderungen | GitHub Actions „Prüfung“ (Typen, Lint, Tests, Migration); versionierte Migrationen |
| Überwachung | `/api/status`, cron-job.org Überwachung, Sentry ohne Personendaten (`src/lib/monitoring.ts`, `src/instrumentation-client.ts`) |
| Löschfunktionen | `src/lib/erasure.ts` |

## 7. Datenpanne (Art. 33, 34)

1. **Erkennen:** Meldung von Kunden, Sentry, Überwachung, Auffälligkeiten im Änderungsprotokoll.
2. **Eindämmen (sofort):**
   - betroffene Logins sperren bzw. löschen, Passwörter zurücksetzen
   - `AUTH_SECRET` in Railway neu setzen: beendet alle Sitzungen
   - Schlüssel bei Drittdiensten neu erzeugen (Anthropic, 360dialog, Meta, Stripe, Resend, Google/Microsoft)
   - `ENCRYPTION_KEY` nicht einfach ändern: gespeicherte Kalender-Tokens und 2FA-Geheimnisse
     wären dann unlesbar. Stattdessen Kalender neu verbinden lassen und 2FA neu einrichten
   - bei Datenverlust: Wiederherstellung nach `docs/notfall-wiederherstellung.md`
3. **Bewerten:** Welche Daten, wie viele Personen, welche Kunden, Risiko für die Betroffenen?
   Änderungsprotokoll und Railway-Logs sichern.
4. **Melden:**
   - **Lead-Daten** (Auftragsverarbeitung): betroffene Kunden unverzüglich, spätestens
     **48 Stunden** nach Kenntnis (AVV). Die Meldung an die Behörde macht der Kunde.
   - **Eigene Daten:** Berliner Beauftragte für Datenschutz und Informationsfreiheit innerhalb
     von **72 Stunden** (Online-Formular), es sei denn, voraussichtlich kein Risiko.
     Bei hohem Risiko zusätzlich die Betroffenen informieren.
5. **Dokumentieren** (auch wenn nicht gemeldet wird) in der Tabelle unten.

| Datum | Was ist passiert | Betroffene Daten/Personen | Maßnahmen | Gemeldet an / am |
|---|---|---|---|---|
| – | bisher keine | | | |

## 8. Datenschutz-Folgenabschätzung (Vorprüfung)

Geprüft wird der KI-gestützte WhatsApp-Assistent: Er schreibt Interessenten an, die
über ein Lead-Formular angefragt und dort in die Kontaktaufnahme per WhatsApp eingewilligt
haben.

- Keine besonderen Kategorien (Art. 9), keine Gesundheitsfragen (AVV, Gesprächsleitfaden).
- Keine automatisierte Entscheidung mit rechtlicher Wirkung (Art. 22). Der Assistent
  qualifiziert und bucht Termine, die Beratung macht ein Mensch, der jederzeit übernehmen kann.
- Keine systematische Überwachung, keine Zusammenführung über Kunden hinweg (Mandantentrennung).
- Transparenz: Der Assistent stellt sich als „digitaler Assistent“ des Beraters vor
  (Vorlagen und Start-Anweisung). Das entspricht auch der Hinweispflicht für KI-Systeme
  nach Art. 50 KI-Verordnung.

Ergebnis der Vorprüfung: Eine DSFA ist voraussichtlich nicht erforderlich. **Prüfen**
(Anwalt): Muss-Liste der Aufsichtsbehörden, insbesondere „Einsatz von KI zur Steuerung der
Interaktion mit Betroffenen“. Falls ja, DSFA je Kunde als Verantwortlicher (Vorlage durch uns).

## 9. Offene Punkte

- [ ] AVV/DPA mit jedem Dienst abschließen bzw. Nachweis ablegen (Tabelle Abschnitt 3)
- [ ] Aufbewahrung der Railway-Sicherungen ablesen und im Löschkonzept eintragen
- [ ] Sentry: Aufbewahrung prüfen, Datenregion EU bestätigen
- [ ] Anwalt: Rolle bei Pay-per-Lead; Kalt-E-Mails an Vermittler; DSFA-Muss-Liste; AGB/AVV-Fassung 10.11.2026
- [ ] Dezember: Airtable/Zapier aus Anlage 2 streichen, Kunden informieren
- [ ] Vertriebskontakte: Frist (Vorschlag 2 Jahre) festlegen, danach automatisch löschen
- [ ] Datenschutzerklärung je Kunde: Die Buchungsseite verlinkt die Datenschutzerklärung von
      der Website des Kunden (aus dem Onboarding), sonst performancegrowth.de/datenschutz.
      Diese muss dann WhatsApp-Assistent, Terminbuchung und die Dienste nennen
