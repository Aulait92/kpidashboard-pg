// Bereich kunden: noch nicht im neuen Admin gebaut. Gebaut → id hier streichen (README: docs/ux/admin-neu).
export const OFFEN_KUNDEN: readonly string[] = [
  "ruhend--push-an-admins-mit-sprungziel-kundenakte", // Push an Admins mit Sprungziel Kundenakte Abrechnung (Kündigung, Reaktivierung, Module, Ver
  "self-connect--push-an-admins-mit-sprungziel-whatsapp", // Push an Admins mit Sprungziel WhatsApp (Verbindung prüfen, Kalender fehlt, Vorlage abgeleh
  "onboarding-actions-toggleonboardingstepaction--onboarding-schritte-abhaken", // Onboarding-Schritte abhaken
  "onboarding-actions-goliveaction--live-schalten-bzw-zuruecknehmen", // Live schalten bzw. zurücknehmen
  "onboarding-actions-resendwelcomeaction--willkommens-mail-erneut-senden", // Willkommens-Mail erneut senden
  "onboarding-card-impressum--pflichtangaben-aus-dem-impressum-erstinformation", // Pflichtangaben aus dem Impressum (Erstinformation) anzeigen
  "page-redirect--weiterleitung-auf-kunden-pipeline-keine-eigene", // Weiterleitung auf Kunden-Pipeline (keine eigene Funktion)
  "page--kundenliste-mit-status-test-zahlung-offen-pause", // Kundenliste mit Status, Test, Zahlung offen, Pause, Onboarding-Fortschritt, Nächster-Schri
  "page-filters--filter-alle-zahlung-offen-onboarding-pausiert", // Filter Alle, Zahlung offen, Onboarding, Pausiert, Ruhend
  "kunden-tabs--unterreiter-uebersicht-pipeline-leads-pay-per", // Unterreiter Übersicht, Pipeline, Leads, Pay-per-Lead, Optimierung, Monatsberichte
  "actions-dragcustomer--kunden-pipeline-vertrag-onboarding-test-aktiv", // Kunden-Pipeline (Vertrag, Onboarding, Test, Aktiv, Pausiert, Gekündigt) per Drag & Drop
  "actions-movecustomer--kunde-eine-stufe-vor-oder-zurueck", // Kunde eine Stufe vor oder zurück
  "layout--kopf-mit-stufe-onboarding-whatsapp-an-aus", // Kopf mit Stufe, Onboarding, WhatsApp an/aus, Zahlung offen, ruht/gekündigt/gelöscht, pausi
  "layout-referred--hinweis-hat-x-kunden-geworben-link-empfehlungen", // Hinweis hat X Kunden geworben (Link Empfehlungen)
  "layout-absentusers--abwesenheiten-der-berater-mit-vertretung", // Abwesenheiten der Berater mit Vertretung
  "test-actions-deletetestcustomeraction--testkunde-komplett-loeschen", // Testkunde komplett löschen
  "layout-subtabs--reiter-der-kundenakte", // Reiter der Kundenakte
  "module-actions-togglenewuiaction--neue-oberflaeche-fuer-kunden-an-aus", // Neue Oberfläche für Kunden an/aus
  "module-actions-setvermittlertypaction--vermittlertyp-setzen", // Vermittlertyp setzen
  "storno-quote-stornoquotekunde--stornoquote-der-vertraege-des-kunden", // Stornoquote der Verträge des Kunden
  "garantien-card--garantien-stand-und-faelle", // Garantien: Stand und Fälle
  "actions-marktestcustomeraction--als-testkunde-markieren", // Als Testkunde markieren
  "actions-seeddemoaction--testdaten-anlegen-bzw-entfernen", // Testdaten anlegen bzw. entfernen
  "onboarding-actions-opensetupaction--selbst-einrichtung-freischalten", // Selbst-Einrichtung freischalten
  "setup-card--einrichtungsschritte-ansehen-einwilligung", // Einrichtungsschritte ansehen (Einwilligung, Erstinformation, Meta-Zugriff)
  "onboarding-actions-sendsetupreminderaction--erinnerung-zur-einrichtung-senden", // Erinnerung zur Einrichtung senden
  "onboarding-actions-admincheckmetaaction--meta-zugriff-pruefen", // Meta-Zugriff prüfen
  "onboarding-actions-restartsetupaction--einrichtung-neu-starten", // Einrichtung neu starten
  "lead-qualitaet-card--lead-qualitaet-disqualifizierte-leads-nach-grund", // Lead-Qualität: disqualifizierte Leads nach Grund und Produkt
  "naechster-schritt-card--naechster-schritt-je-berater-quote-ohne-schritt", // Nächster Schritt je Berater (Quote, ohne Schritt, vorzeitig verloren)
  "page-contactpage-embedded--eingebettete-kontaktakte-verlauf-aufgaben", // Eingebettete Kontaktakte (Verlauf, Aufgaben, Angebote, Onboarding)
  "page-grunddaten--grunddaten-region-betreuungsgebuehr-meta", // Grunddaten: Region, Betreuungsgebühr, Meta-Werbekonto
  "meta-account-actions-setmetaadaccountaction--meta-werbekonto-id-setzen", // Meta-Werbekonto-ID setzen
  "capi-actions-setcapidatasetaction--capi-rueckmeldung-status-und-dataset-setzen", // CAPI-Rückmeldung: Status und Dataset setzen
  "actions-togglesourceaction--leadformulare-des-kunden-an-aus", // Leadformulare des Kunden an/aus
  "page--letzte-leads-mit-abschluss-storno", // Letzte Leads mit Abschluss/Storno
  "actions-startrunaction--ki-kampagne-starten-produkt-zusatzwunsch-seiten", // KI-Kampagne starten (Produkt, Zusatzwunsch, Seiten-ID, Datenschutz-URL)
  "actions-getrunaction--fortschritt-abrufen-plan-anzeigen-sofortformular", // Fortschritt abrufen, Plan, Anzeigen, Sofortformular ansehen
  "actions-updatecopyaction--anzeigentext-bearbeiten", // Anzeigentext bearbeiten
  "actions-regenerateimageaction--bild-neu-erzeugen", // Bild neu erzeugen
  "actions-buildrunaction--kampagne-bei-meta-anlegen-pausiert", // Kampagne bei Meta anlegen (pausiert)
  "actions-cleanuprunaction--angelegte-kampagne-bei-meta-loeschen-formular", // Angelegte Kampagne bei Meta löschen, Formular archivieren
  "page--verlauf-der-laeufe", // Verlauf der Läufe
  "account-view-protocolcard--protokoll-der-massnahmen-des-kunden", // Protokoll der Maßnahmen des Kunden
  "actions-addmanualaction--massnahme-von-hand-eintragen-datum-art-text", // Maßnahme von Hand eintragen (Datum, Art, Text)
  "d360-actions-d360assignaction--360dialog-nummer-zuordnen", // 360dialog-Nummer zuordnen
  "d360-actions-d360resetaction--halb-fertige-whatsapp-verbindung-zuruecksetzen", // Halb fertige WhatsApp-Verbindung zurücksetzen
  "calendar-actions-adminconnectallianzaction--allianz-online-kalender-verbinden-aendern", // Allianz-Online-Kalender verbinden, ändern, trennen
  "calendar-actions-adminsaveleadtimesaction--buchbare-zeiten-fuer-leads-speichern", // Buchbare Zeiten für Leads speichern
  "calendar-actions-adminaddblockaction--zeit-blockieren-und-blocker-loeschen", // Zeit blockieren und Blocker löschen
  "whatsapp-fees-card--meta-gebuehren-intern", // Meta-Gebühren (intern)
  "page-bestandmodulecard--bestandskunden-kampagnen-hinweis-link-abrechnung", // Bestandskunden-Kampagnen (Hinweis, Link Abrechnung)
  "actions-addcustomeraction--kunde-fuer-den-assistenten-hinzufuegen", // Kunde für den Assistenten hinzufügen
  "actions-connectwhatsappaction--whatsapp-nummer-von-hand-verbinden-nummer-api", // WhatsApp-Nummer von Hand verbinden (Nummer, API-Schlüssel)
  "actions-setagentactiveaction--assistent-aktiv-an-aus", // Assistent aktiv an/aus
  "actions-saveagentsettingsaction--neue-leads-automatisch-anschreiben-nach-x", // Neue Leads automatisch anschreiben nach X Minuten
  "actions-setfollowupsequencesaction--automatisch-nachfassen-abfolgen-an-aus", // Automatisch nachfassen (Abfolgen) an/aus
  "actions-saveagentsettingsaction--berater-e-mail-fuer-einladungen-videoraum", // Berater-E-Mail für Einladungen, Videoraum, belegte Zeiten aus ICS
  "calendar-card-calendarcard--buchungskalender-google-microsoft-verbinden", // Buchungskalender Google/Microsoft verbinden, Buchungslink für Leadformular
  "controls-templateautostatus--vorlagen-des-kunden-ansehen-status-bei-meta", // Vorlagen des Kunden ansehen, Status bei Meta
  "actions-savetemplateresultaction--vorlage-anlegen-bearbeiten-mit-zweck", // Vorlage anlegen/bearbeiten mit Zweck, Platzhaltern, Handy-Vorschau
  "actions-deletetemplateaction--vorlage-loeschen", // Vorlage löschen
  "actions-submittemplatesaction--vorlagen-bei-meta-einreichen-bzw-einzeln-neu", // Vorlagen bei Meta einreichen bzw. einzeln neu einreichen
  "actions-settemplateapprovedaction--vorlage-von-hand-als-freigegeben-markieren", // Vorlage von Hand als freigegeben markieren
  "actions-saveoutreachsettingsaction--erstanschreiben-einstellungen-alt-ohne", // Erstanschreiben-Einstellungen (alt, ohne Oberfläche)
  "page--uebersicht-aller-kunden-mit-assistent-liste", // Übersicht aller Kunden mit Assistent (Liste, Sprung)
  "page--hinweis-zahlung-offen-seit", // Hinweis Zahlung offen seit
  "lebenszyklus-card--kuendigung-rueckkehr-ruht-seit-reaktiviert", // Kündigung & Rückkehr: ruht seit, reaktiviert
  "retainer-actions-saveretaineraction--betreuungsgebuehr-eintragen-aendern-entfernen", // Betreuungsgebühr eintragen, ändern, entfernen
  "retainer-card--kuendigungsabsichten-und-angebotene", // Kündigungsabsichten und angebotene Halteangebote
  "budget-actions-decidebudgetaction--budgetaenderung-des-kunden-uebernehmen", // Budgetänderung des Kunden übernehmen
  "budget-actions-decidebudgetaction--budgetaenderung-ablehnen", // Budgetänderung ablehnen
  "produkt-actions-decideproductaction--produktbuchung-des-kunden-annehmen-oder-ablehnen", // Produktbuchung des Kunden annehmen oder ablehnen
  "addon-actions-saveseatsaction--aktive-verkaeufer-speichern-und-mit-stripe", // Aktive Verkäufer speichern und mit Stripe abgleichen
  "addon-actions-bestandmoduleaction--bestandskunden-modul-freischalten-kostenlos", // Bestandskunden-Modul freischalten (kostenlos), sperren, sichtbar machen
  "addon-actions-savequotaaction--kontingent-bestandskunden-speichern-zusatzpakete", // Kontingent Bestandskunden speichern, Zusatzpakete sehen
  "addon-actions-empfehlungmoduleaction--modul-empfehlungen-bewertungen-freischalten-oder", // Modul Empfehlungen & Bewertungen freischalten oder sperren
  "addon-actions-billingintervalaction--zahlweise-monatlich-jaehrlich-umstellen", // Zahlweise monatlich/jährlich umstellen
  "onboarding-actions-adminplanpauseaction--pause-urlaub-eintragen-ab-neustart-grund", // Pause/Urlaub eintragen (ab, Neustart, Grund)
  "onboarding-actions-adminendpauseaction--pause-beenden", // Pause beenden
  "erase-actions-erasecustomerdataaction--kundendaten-endgueltig-loeschen-mit-grund", // Kundendaten endgültig löschen mit Grund
  "page-invoices--rechnungen-mit-status-und-pdf", // Rechnungen mit Status und PDF
  "page--in-stripe-oeffnen", // In Stripe öffnen
  "login-list--logins-des-kunden-mit-einladung-offen-zuletzt", // Logins des Kunden mit Einladung offen, zuletzt aktiv
  "actions-createbuyeraccount--neuen-login-anlegen-e-mail-passwort-kunde", // Neuen Login anlegen (E-Mail, Passwort, Kunde)
  "actions-resetbuyerpassword--passwort-setzen", // Passwort setzen
  "actions-changebuyeremail--e-mail-adresse-aendern", // E-Mail-Adresse ändern
  "actions-deletebuyeraccount--login-loeschen", // Login löschen
  "actions-sendbuyeraccesslink--einladung-erneut-senden-bzw-link-zum-passwort", // Einladung erneut senden bzw. Link zum Passwort ändern senden
  "actions-reassignbuyercustomer--login-einem-anderen-kunden-zuordnen", // Login einem anderen Kunden zuordnen
  "preview-actions-startpreviewaction--als-kunde-ansehen-nur-lesend", // Als Kunde ansehen (nur lesend)
  "page--monatsuebersicht-aller-berichte-mit-monat-vor", // Monatsübersicht aller Berichte mit Monat vor/zurück
  "actions-generatenowaction--berichte-jetzt-erzeugen", // Berichte jetzt erzeugen
  "page--bericht-ansehen-mit-vorschau-und-pruefbefunden", // Bericht ansehen mit Vorschau und Prüfbefunden
  "actions-sendreportaction--bericht-senden", // Bericht senden
  "actions-sendreportaction--bericht-bearbeiten-betreff-einstieg-und-senden", // Bericht bearbeiten (Betreff, Einstieg) und senden
  "actions-callinsteadaction--anrufen-statt-mail", // Anrufen statt Mail
  "actions-skipreportaction--diesen-monat-aussetzen", // Diesen Monat aussetzen
  "actions-togglecustomerreportsaction--monatsberichte-fuer-diesen-kunden-an-aus", // Monatsberichte für diesen Kunden an/aus
  "page-gcal--rueckmeldung-kalender-verbunden-abgelehnt", // Rückmeldung Kalender verbunden/abgelehnt
  "page--ruhende-konten-mit-loeschdatum-aufbewahrung", // Ruhende Konten mit Löschdatum, Aufbewahrung, Grund
];
