// Bereich vertrieb: noch nicht im neuen Admin gebaut. Gebaut → id hier streichen (README: docs/ux/admin-neu).
export const OFFEN_VERTRIEB: readonly string[] = [
  "list-memory-backtolist--zurueck-link-merkt-gefilterte-liste-suche-filter", // Zurück-Link merkt gefilterte Liste (Suche, Filter, Seite)
  "buchung--push-an-admins-mit-sprungziel-kontaktakte", // Push an Admins mit Sprungziel Kontaktakte (Buchung, Termin, Zahlung, Budget, Fragebogen)
  "page--kontaktliste-mit-zaehler", // Kontaktliste mit Zähler
  "page-q--suche-nach-agentur-name-e-mail-ort-telefon", // Suche nach Agentur, Name, E-Mail, Ort, Telefon
  "page-stage--filter-stufe", // Filter Stufe
  "page-mail-filters--filter-cold-mail-erhalten-keine-geoeffnet", // Filter Cold Mail (erhalten, keine, geöffnet, geantwortet, bounced)
  "page-li--filter-linkedin-status-und-plz-beginnt-mit", // Filter LinkedIn-Status und PLZ beginnt mit
  "actions-deletecontacts--mehrere-kontakte-markieren-und-loeschen", // Mehrere Kontakte markieren und löschen
  "page-tel--direkt-anrufen-aus-der-liste-handy", // Direkt anrufen aus der Liste (Handy)
  "page-page--seiten-blaettern", // Seiten blättern
  "actions-createleadmanually--kontakt-anlegen-quelle-name-firma-e-mail-telefon", // Kontakt anlegen (Quelle, Name, Firma, E-Mail, Telefon)
  "page--beim-anlegen-linkedin-profil-nachricht-und", // Beim Anlegen LinkedIn-Profil, Nachricht und Aufgabe für heute mitgeben
  "actions-dragstage--akquise-pipeline-per-drag-drop", // Akquise-Pipeline per Drag & Drop
  "kanban--beim-verschieben-auf-verloren-grund-abfragen", // Beim Verschieben auf Verloren Grund abfragen
  "page--karten-zeigen-cold-mail-status", // Karten zeigen Cold-Mail-Status
  "actions-setstage--stufe-aendern-auswahl", // Stufe ändern (Auswahl)
  "contact-controls-stagepicker--verloren-mit-grund-und-wettbewerber", // Verloren mit Grund und Wettbewerber
  "page-tel--anrufen-und-e-mail-schreiben-aus-dem-kopf", // Anrufen und E-Mail schreiben aus dem Kopf
  "buchung-decisionbookinglink--link-entscheidungs-call-kopieren", // Link Entscheidungs-Call kopieren
  "page--praesentation-oeffnen", // Präsentation öffnen
  "contact-controls-contactmore--menue-website-linkedin-profil-oeffnen", // Menü: Website, LinkedIn-Profil öffnen
  "actions-deletecontact--kontakt-loeschen", // Kontakt löschen
  "actions-mergecontactsaction--kontakte-zusammenfuehren-mit-suche-nach", // Kontakte zusammenführen mit Suche nach Kandidaten
  "contact-merge-duplicatehint--hinweis-moegliche-dubletten", // Hinweis mögliche Dubletten
  "page-referral--hinweis-empfehlung-von-kunde-mit-setup-rabatt", // Hinweis Empfehlung von Kunde mit Setup-Rabatt
  "actions-enrichaddressaction--website-und-google-neu-auswerten-adresse", // Website und Google neu auswerten (Adresse, Bewertung, Öffnungszeiten)
  "actions-logactivity--aktivitaet-erfassen-anruf-e-mail-notiz-ergebnis", // Aktivität erfassen (Anruf, E-Mail, Notiz, Ergebnis, Grund) mit Folgeaufgabe
  "actions-updateactivity--verlaufseintrag-bearbeiten-oder-loeschen", // Verlaufseintrag bearbeiten oder löschen
  "actions-setreplysentiment--antworten-auf-cold-mails-ansehen-stimmung-setzen", // Antworten auf Cold Mails ansehen, Stimmung setzen
  "actions-addreplymanually--antwort-auf-cold-mail-von-hand-einfuegen", // Antwort auf Cold Mail von Hand einfügen
  "page-fold-cold-mails--cold-mail-kampagnen-des-kontakts-geoeffnet", // Cold-Mail-Kampagnen des Kontakts (geöffnet, bounced, abgemeldet)
  "page-termine--termine-calendly-bzw-buchungsseite-mit-meeting", // Termine (Calendly bzw. Buchungsseite) mit Meeting-Link
  "page-aufgaben--offene-aufgaben-des-kontakts-und-neue-aufgabe", // Offene Aufgaben des Kontakts und neue Aufgabe
  "actions-updatelinkedin--linkedin-status-und-profil-url-pflegen", // LinkedIn-Status und Profil-URL pflegen
  "actions-updatecustomer--kundendaten-kunden-stufe-monatswert-produkte", // Kundendaten: Kunden-Stufe, Monatswert, Produkte, Vertragsstart, Herkunft
  "actions-linkcontactcustomer--kontakt-mit-kundenakte-verknuepfen", // Kontakt mit Kundenakte verknüpfen
  "actions-updateprimaryemailaction--haupt-e-mail-korrigieren", // Haupt-E-Mail korrigieren
  "actions-addcontactemailaction--weitere-e-mail-hinzufuegen-entfernen-zur-haupt-e", // Weitere E-Mail hinzufügen, entfernen, zur Haupt-E-Mail machen
  "actions-updatecontactaddress--adresse-und-telefon-bearbeiten", // Adresse und Telefon bearbeiten
  "page-stammdaten--stammdaten-agenturtyp-versicherer-inhaber", // Stammdaten: Agenturtyp, Versicherer, Inhaber, Teamgröße, Potenzial, Social, Bewertung, Öff
  "actions-updatecontact--kontakt-felder-allgemein-aendern-ohne", // Kontakt-Felder allgemein ändern (ohne Oberfläche)
  "onboarding-actions-startonboardingaction--onboarding-starten-neues-kundenkonto-oder", // Onboarding starten (neues Kundenkonto oder bestehendes) nach Annahme
  "followup-actions-approvefollowupaction--spaeter-follow-up-je-kontakt-freigeben-texte", // Später-Follow-up je Kontakt: freigeben, Texte Mail 1 und 2 bearbeiten
  "followup-actions-sendfollowupnowaction--spaeter-follow-up-mail-sofort-senden-texte-neu", // Später-Follow-up: Mail sofort senden, Texte neu schreiben
  "followup-actions-stopfollowupaction--spaeter-follow-up-stoppen-oder-planen", // Später-Follow-up stoppen oder planen
  "followup-actions-redraftfollowupaction--spaeter-follow-up-neu-schreiben-ohne-oberflaeche", // Später-Follow-up neu schreiben (ohne Oberfläche)
  "deal-offers-card--angebotskarte-angebot-ansehen-und-pdf", // Angebotskarte: Angebot ansehen und PDF
  "offer-actions-sendofferemailaction--angebot-per-e-mail-senden-mit-anrede-rechner", // Angebot per E-Mail senden mit Anrede, Rechner, Präsentation (PDF/Link), Zielgruppe
  "offer-actions-markoffersentaction--angebot-als-verschickt-markieren-ohne-mail", // Angebot als verschickt markieren (ohne Mail)
  "offer-actions-deleteofferaction--angebot-loeschen", // Angebot löschen
  "offer-actions-setpaymentreminderaction--zahlungserinnerung-spaeter-zahlen-erlauben", // Zahlungserinnerung: Später zahlen erlauben, Erinnerungsdatum
  "deal-offers-card-pay--zahlungsstatus-des-angebots-offen-bestaetigt", // Zahlungsstatus des Angebots (offen, bestätigt, bezahlt, fehlgeschlagen)
  "offer-actions-createofferaction--angebot-erstellen-produkte-werbebudget-laufzeit", // Angebot erstellen: Produkte, Werbebudget, Laufzeit, Start, Setup, Gültigkeit
  "offer-form-empfaenger--angebot-empfaenger-und-kunde-ist-vertreter-oder", // Angebot: Empfänger und Kunde ist Vertreter oder Makler (Garantieart)
  "offer-form-paket--angebot-paket-waehlen-z-b-nur-betreuung", // Angebot: Paket wählen (z. B. Nur Betreuung)
  "offer-form--angebot-testangebot-0-ohne-zahlung-spaeter", // Angebot: Testangebot 0 € ohne Zahlung, Später zahlen erlauben
  "offer-form-verkaeufer--angebot-verkaeufer-zahlweise-und-module", // Angebot: Verkäufer, Zahlweise und Module
  "offer-form-zusammenfassung--angebot-zusammenfassung", // Angebot: Zusammenfassung
  "folien-deck--verkaufspraesentation-mit-angebotspreisen", // Verkaufspräsentation mit Angebotspreisen, Pfeiltasten, Vollbild
  "page-fassung--fassung-vertreter-oder-makler-waehlen", // Fassung Vertreter oder Makler wählen
  "actions-verkaufslinkaction--link-fuer-interessenten-erzeugen-kopieren", // Link für Interessenten erzeugen, kopieren, Aufrufe sehen
  "actions-verkaufslinkbeendenaction--praesentationslink-beenden", // Präsentationslink beenden
  "page--angebotsliste-mit-versand-oeffnung-gueltigkeit", // Angebotsliste mit Versand, Öffnung, Gültigkeit, Stand
  "page-filter--filter-alle-verschickten-offen-angenommen", // Filter Alle verschickten, Offen, Angenommen, Abgelaufen/abgelehnt, Entwürfe
  "page-filter-zahlung--filter-zahlung-offen", // Filter Zahlung offen
  "actions-disconnectsalescalendaraction--vertriebskalender-verbinden-bzw-trennen", // Vertriebskalender verbinden bzw. trennen
  "page--buchungslink-kopieren", // Buchungslink kopieren
];
