# Merkliste (Ole)

Dinge, die Ole später angehen will. Neue Sitzungen bitte hier nachsehen und Ole daran erinnern.

- 14.11.2026: **Calendly ablösen.** Die Später-Follow-ups im Vertrieb schicken vorerst Oles Calendly-Link
  (Vertrieb → Follow-ups → Einstellungen → Buchungslink). Später durch unser eigenes Buchungstool ersetzen
  (eigene Buchungsseite für Oles Vertriebstermine wie /book für Kunden, inkl. Kalender-Sync), dann auch den
  Calendly-Abgleich (src/lib/vertrieb/calendly.ts) ablösen.
- 14.11.2026: **Microsoft-Herausgeberverifizierung abschließen.** Ole hat sich im Microsoft AI Cloud Partner
  Program registriert und wartet auf die Partner-ID. Sobald sie da ist: Entra → App-Registrierung
  „performancegrowth“ (Client-ID 6c3f54ab…) → Branding und Eigenschaften → Herausgeberüberprüfung → Partner-ID
  eintragen. Herausgeberdomäne performancegrowth.de ist schon gesetzt, Kontotypen stimmen, Datenschutz 11b und
  .well-known-Datei sind live. Danach Freigabe-Link (/microsoft-freigabe) mit einem fremden Microsoft-365-Konto testen.
  Redirect-URIs …/microsoft-freigabe (app und staging) in Entra prüfen.
- 14.11.2026: **Support-WhatsApp +49 15679 811535 umziehen (Superchat → 360dialog).** Support-Postfach ist live
  (Admin → WhatsApp → Einstellungen → „Nummer über 360dialog verbinden“, interner Kunde cust_pg_support, ohne
  Assistent, Push an Admins). Migration hängt an der zweistufigen Verifizierung (Reiter fehlt bei Ole, Superchat
  hält die Rechte). Ole hat Superchat und 360dialog-Support angeschrieben. Danach: Umzug neu starten (PIN-Frage
  „Yes“), Testnachricht prüfen, SUPPORT_WHATSAPP_NUMBER=+4915679811535 in Produktion setzen, Superchat aus den
  Partnern entfernen, Anzeigename „performancegrowth“ über 360dialog eskalieren. Nicht „Re-onboard (Deletion)“ wählen.
