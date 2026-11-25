# SMS statt WhatsApp bei nicht zustellbarer Terminerinnerung (25.11.2026)

Anlass: Auswertung Kunde Lohmann (Ole, 25.11.2026). Kommt eine WhatsApp-Terminerinnerung an einen Lead laut Meta nicht an
(131026/1013 Nummer ohne WhatsApp bzw. veraltet, 131049 Meta-Drosselung, 130472, „undeliverable“), geht einmal je
Erinnerung eine kurze SMS (seven.io) mit Datum, Uhrzeit, Art und Link auf die Verwalten-Seite des Termins.
Umsetzung: `src/lib/sms/termin-erinnerung.ts`, `src/lib/sms/termin-erinnerung-server.ts`. Interne Prüfung, keine
Anwaltsfreigabe (AGENTS.md 18.11.2026); baut auf `2026-11-22-sms-ohne-whatsapp.md` auf.

## Ergebnis: Ampel Grün (gering)

- UWG: Keine Werbung. Reine Service-Nachricht zu einem Termin, den der Lead selbst gebucht hat, ohne Angebot oder andere
  Sparten. § 7 Abs. 2 Nr. 2 UWG greift nicht; die SMS ersetzt nur den Kanal, der technisch nicht ankam.
- DSGVO: Art. 6 Abs. 1 lit. b (Durchführung der vom Lead gewünschten Beratung). seven.io ist als Unterauftragsverarbeiter
  genannt. Inhalt minimal: Name, Vermittler, Datum, Uhrzeit, Art, Link; Ort nur bei Terminen vor Ort und nur, wenn kurz.
- KI-VO: feste Nachricht ohne Gespräch, kein KI-Hinweis (Ole; wie die Nur-SMS, siehe `2026-11-24-ki-hinweis-erste-nachricht.md`).

## Auflagen (umgesetzt)
1. Nur Handynummern, nur Leads mit gebuchtem, bevorstehendem Termin, höchstens eine SMS je Erinnerung (`Message.smsAt`).
2. Nicht bei Abmeldung von WhatsApp („STOPP“, 131050), Sperrliste der Nummer, Daten-Sperre (Betroffenenrechte), gelöschtem
   Lead, ruhendem bzw. gelöschtem Kunden und nicht für reine Pay-per-Lead-Kunden.
3. Link nur auf die Verwalten-Seite (verschieben, absagen) bzw. bei Video ohne diese auf den Videoraum.
4. Keine Gedankenstriche; Versand im Verlauf des Leads ohne Link vermerkt.
