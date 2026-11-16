// Bereich einstellungen: noch nicht im neuen Admin gebaut. Gebaut → id hier streichen (README: docs/ux/admin-neu).
export const OFFEN_EINSTELLUNGEN: readonly string[] = [
  "followup-actions-approvefollowupaction--liste-wartet-auf-freigabe-einzeln-oder-alle", // Liste wartet auf Freigabe, einzeln oder alle freigeben
  "page-group--listen-geplant-laufend-zuletzt-beendet-mit", // Listen Geplant, Laufend, Zuletzt beendet mit Vorschau und Fehler
  "followup-actions-savefollowupsettingsaction--einstellungen-automatik-an-hoechstzahl-je-tag", // Einstellungen: Automatik an, Höchstzahl je Tag und Postfach, Buchungslink, Signatur, Angeb
  "followup-actions-planexistingaction--bestand-jetzt-pruefen-bestehende-spaeter", // Bestand jetzt prüfen (bestehende Später-Antworten einplanen)
  "actions-savebookingtypeaction--termintypen-bearbeiten-dauer-puffer-vorlauf", // Termintypen bearbeiten (Dauer, Puffer, Vorlauf)
  "actions-savesalestimesaction--buchbare-zeiten-je-wochentag", // Buchbare Zeiten je Wochentag
  "page-embedsnippet--einbettungscode-fuer-die-webseite-kopieren", // Einbettungscode für die Webseite kopieren
  "page--status-je-quelle-instantly-calendly-formulare", // Status je Quelle (Instantly, Calendly, Formulare, LinkedIn) grün bei Eingang in 7 Tagen
  "page-copyfield--webhook-adressen-kopieren-und-anleitung", // Webhook-Adressen kopieren und Anleitung
  "actions-syncinstantlyaction--jetzt-mit-instantly-abgleichen", // Jetzt mit Instantly abgleichen
  "actions-importinstantlyaction--instantly-csv-importieren", // Instantly-CSV importieren
  "actions-connectcalendlyaction--calendly-verbinden-und-termine-abgleichen", // Calendly verbinden und Termine abgleichen
  "actions-importcontactsaction--agenturliste-csv-importieren", // Agenturliste (CSV) importieren
  "actions-importcoldcrmaction--daten-aus-altem-cold-crm-uebernehmen", // Daten aus altem Cold CRM übernehmen
  "actions-replacecoldcrmaction--vertrieb-neu-importieren-ersetzt-alles", // Vertrieb neu importieren (ersetzt alles, Bestätigung ERSETZEN)
  "actions-importwaalaxyaction--waalaxy-import-ohne-oberflaeche", // Waalaxy-Import (ohne Oberfläche)
  "actions-convertinboundlead--linkedin-nachrichten-ohne-zuordnung-als-lead", // LinkedIn-Nachrichten ohne Zuordnung als Lead übernehmen
  "page-placesused--kontakte-anreichern-google-kontingent-heute", // Kontakte anreichern: Google-Kontingent heute
  "page-team-kalender--team-kalender-fuer-hilfetermine-der-kunden", // Team-Kalender für Hilfetermine der Kunden (Status)
  "route-get--support-whatsapp-verbinden-360dialog", // Support-WhatsApp verbinden (360dialog)
  "ab-test-card--a-b-tests-der-vorlagen-mit-antwort-und", // A/B-Tests der Vorlagen mit Antwort- und Terminquote
  "page-diag--meta-verbindung-pruefen-token-rechte-webhook-url", // Meta-Verbindung prüfen (Token, Rechte, Webhook-URL)
  "page--uebergang-webhook-fuer-zapier", // Übergang: Webhook für Zapier
  "actions-saveglobalaction--global-woechentlicher-optimierungslauf-an-aus", // Global: wöchentlicher Optimierungslauf an/aus
  "actions-saveglobalaction--global-autopilot-fuer-alle-konten", // Global: Autopilot für alle Konten
  "actions-disconnectaction--linkedin-verbinden-bzw-trennen-hinweis-zugang", // LinkedIn verbinden bzw. trennen, Hinweis Zugang abgelaufen
  "module-actions-sendannouncementaction--ankuendigung-des-zusatzmoduls-an-kunden-senden", // Ankündigung des Zusatzmoduls an Kunden senden (Mail und In-App)
  "page--uebersicht-aller-einstellungen-in-gruppen", // Übersicht aller Einstellungen in Gruppen
  "page--warnhinweise-zwei-faktor-aus-steuernummer-fehlt", // Warnhinweise: Zwei-Faktor aus, Steuernummer fehlt, Statusmeldung aktiv
  "actions-savecatalogitemaction--produkt-buchbar-an-aus", // Produkt buchbar an/aus
  "actions-savecatalogitemaction--produkt-als-bewaehrt-markieren-und-nutzen-text", // Produkt als bewährt markieren und Nutzen-Text
  "actions-preispilotumschaltenaction--beitraege-rechnen-pilot-rechner-je-gesellschaft", // Beiträge rechnen (Pilot): Rechner je Gesellschaft und Sparte freischalten
  "actions-saveautomationaction--budgetaenderungen-automatisch-bei-meta-umsetzen", // Budgetänderungen automatisch bei Meta umsetzen
  "actions-saveautomationaction--gebuchte-produkte-starten-das-agenten-team", // Gebuchte Produkte starten das Agenten-Team
  "actions-saveautomationaction--muede-anzeigen-erkennen-mit-schwellen-frequenz", // Müde Anzeigen erkennen mit Schwellen (Frequenz, CTR, Leadpreis, Mindestausgabe)
  "actions-savehalteaction--halteangebote-je-kuendigungsgrund-an-aus-mit", // Halteangebote je Kündigungsgrund an/aus mit Werten (10 Angebote inkl. Rückkehrangebot)
  "form--regeln-fuer-rabatte-anzeige", // Regeln für Rabatte (Anzeige)
  "actions-saveupdateaction--neuigkeiten-liste-neu-anlegen", // Neuigkeiten-Liste, neu anlegen
  "actions-saveupdateaction--eintrag-bearbeiten-art-zielgruppe-push-an-kunden", // Eintrag bearbeiten: Art, Zielgruppe, Push an Kunden, veröffentlichen oder Entwurf
  "actions-draftupdateaction--ki-entwurf-aus-notizen", // KI-Entwurf aus Notizen
  "actions-deleteupdateaction--eintrag-loeschen", // Eintrag löschen
  "form--vorschau-im-kundenbereich", // Vorschau im Kundenbereich
  "actions-savereportsettingsaction--gute-berichte-automatisch-senden", // Gute Berichte automatisch senden
  "actions-savereportsettingsaction--einstufung-gut-schwach-ziel-leadpreis-absender", // Einstufung gut/schwach, Ziel-Leadpreis, Absender/Signatur
  "actions-savelogincardaction--infokarten-liste-neue-karte", // Infokarten-Liste, neue Karte
  "actions-savelogincardaction--karte-bearbeiten-badge-titel-text-link-bild", // Karte bearbeiten (Badge, Titel, Text, Link, Bild)
  "actions-togglelogincardaction--karte-an-aus", // Karte an/aus
  "actions-movelogincardaction--reihenfolge-der-karten-aendern", // Reihenfolge der Karten ändern
  "actions-deletelogincardaction--karte-loeschen", // Karte löschen
  "actions-createincidentaction--statusmeldung-veroeffentlichen-text-stufe", // Statusmeldung veröffentlichen (Text, Stufe, Bereich)
  "actions-resolveincidentaction--meldung-als-behoben-markieren", // Meldung als behoben markieren
  "actions-deleteincidentaction--meldung-loeschen", // Meldung löschen
  "page--zustand-jetzt-und-support-kontakt-anzeige", // Zustand jetzt und Support-Kontakt (Anzeige), Statusseite öffnen
  "actions-savereferralsettingsaction--programm-aktiv-hinweise-an-kunden-praemie-fest", // Programm aktiv, Hinweise an Kunden, Prämie (fest, Monate Bestand, Monatspreis), Vorteil fü
  "actions-savesetupsettingsaction--meta-business-id-und-erklaervideos-je-schritt", // Meta-Business-ID und Erklärvideos je Schritt
  "actions-savetaxnumberaction--steuernummer-fuer-rechnungen", // Steuernummer für Rechnungen
  "page--stripe-konto-pruefen-pflichtangaben-testmodus", // Stripe-Konto prüfen (Pflichtangaben, Testmodus)
  "actions-customerfootersaction--fusszeile-bei-bestehenden-kunden-setzen", // Fußzeile bei bestehenden Kunden setzen (Probelauf, Anwenden)
  "actions-countinvoicesaction--finalisierte-rechnungen-zaehlen", // Finalisierte Rechnungen zählen
  "actions-starttotpsetupaction--zwei-faktor-einrichten-bestaetigen-abschalten", // Zwei-Faktor einrichten, bestätigen, abschalten
  "actions-signouteverywhereaction--ueberall-abmelden", // Überall abmelden
  "page--aenderungsprotokoll-ansehen", // Änderungsprotokoll ansehen
  "page--protokoll-filtern-nach-kunde-und-art", // Protokoll filtern nach Kunde und Art
];
