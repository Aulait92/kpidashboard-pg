# Merkliste (Ole)

Dinge, die Ole später angehen will. Neue Sitzungen bitte hier nachsehen und Ole daran erinnern.

- 15.11.2026: **Bestandskunden-Modul vorerst für Kunden aus** (Ole testet es ausführlich). Schalter
  `BESTAND_MODULE_AVAILABLE` in src/lib/bestand/sichtbar.ts; je Kunde sichtbar über Admin → Kunde → Abrechnung
  („Für diesen Kunden einblenden“, Feld bestandSichtbar). Kunden mit aktivem Modul behalten es. Wieder an: true setzen,
  dann Webseite (docs/webseite-offen.md), PPTX/PDF-Folien und Kollegen-Prämie „Modul gratis“ prüfen.

- 16.11.2026: **End-to-End-Test WhatsApp mit Testlead** (Ole). Testkunde „Ole Agentur“ (Nummer +1 501 430 4325 ist
  verbunden): Assistent einschalten (Admin → WhatsApp → Einstellungen), Vorlagen-Freigabe prüfen, Testlead mit Oles
  Handynummer einspielen, Ole testet den Chat bis zur Terminbuchung (Erstnachricht mit Knöpfen, Erstinformation als PDF,
  Fragen, Termin, Bestätigung).

- 15.11.2026: **Modul „Empfehlungen & Bewertungen“ vorerst aus** (Ole). Schalter `EMPFEHLUNG_MODULE_AVAILABLE` in
  src/lib/empfehlung/shared.ts. Wieder an, wenn die kritischen Teile fertig sind (u. a. Bewertungs-Wächter:
  Google-Freigabe, docs/google-bewertungs-waechter.md). Präsentationsfolie „Empfehlungen & Bewertungen (59 €)“ prüfen.

- 15.11.2026: **Calendly später durch unser eigenes Buchungssystem ablösen** (Vertrieb). Bis dahin: Handynummer ist im
  Calendly-Formular Pflicht (für die WhatsApp-Terminbestätigung, lib/vertrieb/termin-whatsapp.ts).

- 15.11.2026: **Google-Prüfung bestanden** (Projekt performancegrowth-sheets): `calendar.events` und `gmail.send` sind
  freigegeben, `calendar.freebusy` ist laut Console nicht sensibel. `GOOGLE_MAIL_VERIFIED=1` ist in der Produktion gesetzt
  (Gmail-Knopf im Postfach und in der Einrichtung). Kunden sehen keine Warnung „nicht bestätigte App“ mehr.
  Achtung: Jede Änderung am OAuth-Zustimmungsbildschirm oder ein neuer Bereich (z. B. `business.manage` für den
  Google-Bewertungs-Wächter, docs/google-bewertungs-waechter.md) braucht eine neue Prüfung. Solche Änderungen
  bündeln und erst dann einreichen.

- 15.11.2026: **Rückmeldung an Meta (Conversions API für CRM) einrichten.** Die App sendet je Kunde automatisch
  (lib/capi, alle 15 Minuten) an das erste Dataset des Werbekontos. In Meta je Kunde: 1. Partnerzugriff auf das
  Dataset (Pixel) für unseren Business Manager und den Systemnutzer (sonst Fehler „kein Zugriff“, Admin → Kunde →
  Leads → Rückmeldung an Meta); 2. im Events Manager das CRM-Dataset mit der Facebook-Seite der Lead-Formulare
  verbinden; 3. CRM-Stufen zuordnen (Lead, Erreicht, Termin vereinbart, Abschluss); 4. sobald der Vorschlag
  „Kampagne auf Conversion Leads umstellen“ in der Optimierung kommt, Lead-Kampagne mit Leistungsziel
  „Conversion Leads“ und der vorgeschlagenen Stufe anlegen bzw. umstellen. Offen: automatische Umstellung im
  Autopilot (bewusst nicht gebaut, nur Vorschlag), Anwalt (docs/datenschutz.md, Offene Punkte), Datenschutzerklärung.

- 14.11.2026: **Calendly ablösen.** Die Später-Follow-ups im Vertrieb schicken vorerst Oles Calendly-Link
  (Vertrieb → Follow-ups → Einstellungen → Buchungslink). Später durch unser eigenes Buchungstool ersetzen
  (eigene Buchungsseite für Oles Vertriebstermine wie /book für Kunden, inkl. Kalender-Sync), dann auch den
  Calendly-Abgleich (src/lib/vertrieb/calendly.ts) ablösen.
- 14.11.2026: **Microsoft-Herausgeberverifizierung abschließen.** Partner-ID ist in Entra eingetragen (Ole, 14.11.),
  Microsoft prüft noch. Prüfen: Entra → App-Registrierung „performancegrowth“ (Client-ID 6c3f54ab…) → Branding
  und Eigenschaften → Herausgeberüberprüfung zeigt „Verifiziert“. Herausgeberdomäne performancegrowth.de ist schon gesetzt, Kontotypen stimmen, Datenschutz 11b und
  .well-known-Datei sind live. Danach Freigabe-Link (/microsoft-freigabe) mit einem fremden Microsoft-365-Konto testen.
  Redirect-URIs …/microsoft-freigabe (app und staging) in Entra prüfen.
- 14.11.2026: **Support-WhatsApp +49 15679 811535 umziehen (Superchat → 360dialog).** Support-Postfach ist live
  (Admin → WhatsApp → Einstellungen → „Nummer über 360dialog verbinden“, interner Kunde cust_pg_support, ohne
  Assistent, Push an Admins). Migration hängt an der zweistufigen Verifizierung (Reiter fehlt bei Ole, Superchat
  hält die Rechte). Ole hat Superchat und 360dialog-Support angeschrieben. Danach: Umzug neu starten (PIN-Frage
  „Yes“), Testnachricht prüfen, SUPPORT_WHATSAPP_NUMBER=+4915679811535 in Produktion setzen, Superchat aus den
  Partnern entfernen, Anzeigename „performancegrowth“ über 360dialog eskalieren. Nicht „Re-onboard (Deletion)“ wählen.
  15.11.2026 vorbereitet: Support-Chats sind als Kunde / Interessent / Unbekannt markiert (über die Telefonnummer
  des Vertriebskontakts, Filter in Admin → WhatsApp, „Zuordnen“ von Hand). Neue Calendly-Buchungen bekommen von der
  Support-Nummer eine WhatsApp-Bestätigung (Vorlage pg_vertrieb_termin_v1, Sie-Form, nur Bestätigung, Erinnerung
  macht Calendly). Die Vorlage reicht der Cron von selbst ein, sobald die Nummer verbunden ist; bis zur Freigabe
  steht am Termin „Vorlage noch nicht freigegeben“. Nummer kommt aus Calendly (SMS-Erinnerungsnummer oder Frage
  „Telefon/Handy/WhatsApp“), sonst vom Kontakt. Im Calendly-Formular eine Pflichtfrage nach der Handynummer mit
  Hinweis „Bestätigung per WhatsApp“ ergänzen.

- 16.11. abends (nach 20 Uhr): Erklärvideos gegen die Änderungen vom 15./16.11. prüfen und bei Bedarf neu aufnehmen
  (Neuigkeiten-Karte weg, Leitfaden und Diktieren weg, Bestandskunden-Modul aus, neue Terminvorbereitung, Kein-WhatsApp-Kennzeichen).
  `python3 tools/erklaervideos/betroffen.py` zeigt Kurz, Ausführlich und WhatsApp verbinden als betroffen.
