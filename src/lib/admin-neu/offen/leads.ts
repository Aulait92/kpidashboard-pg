// Bereich leads: noch nicht im neuen Admin gebaut. Gebaut → id hier streichen (README: docs/ux/admin-neu).
export const OFFEN_LEADS: readonly string[] = [
  "orders--push-an-admins-mit-sprungziel-pay-per-lead", // Push an Admins mit Sprungziel Pay-per-Lead (Bestellung, Lieferung, Storno, nicht verlänger
  "page--posteingang-leads-ohne-zuordnung", // Posteingang Leads ohne Zuordnung
  "actions-assignformaction--formular-zuordnen-seite-formular-kunde-produkt", // Formular zuordnen (Seite, Formular, Kunde, Produkt)
  "actions-assignformaction--beim-zuordnen-lead-preis-ppl-und-airtable-bezug", // Beim Zuordnen Lead-Preis (PPL) und Airtable-Bezug
  "page-listpageforms--facebook-seite-waehlen-und-formulare-laden", // Facebook-Seite wählen und Formulare laden
  "actions-dismissunassignedaction--wartende-leads-ohne-zuordnung-verwerfen", // Wartende Leads ohne Zuordnung verwerfen
  "actions-togglesourceaction--zuordnung-an-aus-schalten", // Zuordnung an/aus schalten
  "page--zuordnungen-tabelle-mit-preis-letztem-lead", // Zuordnungen-Tabelle mit Preis, letztem Lead, Einwilligungs-Warnung
  "page--alle-leads-aller-kunden-mit-status-und-preis", // Alle Leads aller Kunden mit Status und Preis
  "page-morefilters--filter-kunde-produkt-status-zeitraum-monat-oder", // Filter Kunde, Produkt, Status, Zeitraum (Monat oder von/bis)
  "route-get--csv-export-der-gefilterten-leads-mit-protokoll", // CSV-Export der gefilterten Leads (mit Protokoll)
  "page-tel--lead-anrufen", // Lead anrufen
  "page-bezuege--bezuege-je-produkt-mit-kontingent-geliefert", // Bezüge je Produkt mit Kontingent, geliefert, Preis, Filter, Lieferung
  "ppl-auswertung--uebersicht-je-kunde-woche-monat-liegt-zurueck", // Übersicht je Kunde (Woche, Monat, liegt zurück)
  "ppl-auswertung--auswertung-mit-zeitraum-und-produktfilter", // Auswertung mit Zeitraum und Produktfilter (Diagramm, Tabelle)
  "actions-assignparkedaction--geparkte-leads-einem-bezug-zuordnen", // Geparkte Leads einem Bezug zuordnen
  "actions-discardparkedaction--geparkten-lead-verwerfen", // Geparkten Lead verwerfen
  "actions-decidestornoaction--storno-pruefen-annehmen-oder-ablehnen", // Storno prüfen: annehmen oder ablehnen
  "page-geliefert--gelieferte-leads-suchen-name-telefon-e-mail-id", // Gelieferte Leads suchen (Name, Telefon, E-Mail, ID, Bezug)
  "actions-adminstornoaction--storno-von-hand-eintragen-grund-notiz", // Storno von Hand eintragen (Grund, Notiz)
  "actions-undostornoaction--storno-zuruecknehmen", // Storno zurücknehmen
  "page-eingang--eingang-aller-ppl-leads-ausgeliefert-geparkt", // Eingang aller PPL-Leads (ausgeliefert, geparkt, Dublette, ungültig)
  "page-airtable-sync-off--anzeige-airtable-abgleich-an-aus", // Anzeige Airtable-Abgleich an/aus
  "actions-savesubscriptionaction--bezug-anlegen-bearbeiten-kunde-produkt-menge", // Bezug anlegen/bearbeiten (Kunde, Produkt, Menge, Preis, Start)
  "bezug-form--bezug-modus-woche-monat-einmalig-live-test", // Bezug: Modus Woche/Monat/einmalig, Live/Test, Lieferweg App/E-Mail/Webhook mit Format
  "actions-saveareaaction--gebiet-mit-vorrang-anlegen-aendern-plz-menge", // Gebiet mit Vorrang anlegen/ändern (PLZ, Menge, Zeitraum)
  "actions-deleteareaaction--gebiet-loeschen", // Gebiet löschen
  "actions-manualorderaction--bestellung-von-hand-bezahlt-ohne-stripe", // Bestellung von Hand (bezahlt, ohne Stripe)
  "actions-runimportaction--bezuege-aus-airtable-uebernehmen", // Bezüge aus Airtable übernehmen
  "media-buyer-admin--pool-liste-mit-ist-ziel-prognose-status-auf-kurs", // Pool-Liste mit Ist/Ziel, Prognose, Status (auf Kurs, knapp, Unterdeckung)
  "actions-savepoolsettings--autopilot-je-pool-an-aus", // Autopilot je Pool an/aus
  "actions-savepoolsettings--max-tagesbudget-je-kanal-meta-outbrain-tiktok", // Max. Tagesbudget je Kanal (Meta, Outbrain, TikTok, Google)
  "actions-savepoolsettings--kampagnen-stichwort-je-kanal", // Kampagnen-Stichwort je Kanal
  "actions-rundryrun--trockenlauf-media-buyer", // Trockenlauf Media Buyer
  "actions-runapplynow--jetzt-anwenden-budgets-setzen", // Jetzt anwenden (Budgets setzen)
  "media-buyer-admin--empfehlung-verlauf-der-aktionen-performance-pro", // Empfehlung, Verlauf der Aktionen, Performance pro Kanal, Adspend-Zuordnung
  "page--werbekonten-liste-mit-modus-letzter-massnahme", // Werbekonten-Liste mit Modus, letzter Maßnahme (rot wenn alt), offen, letzter Lauf
  "actions-saveaccountaction--konto-modus-ziel-leadpreis-tagesbudget-kampagnen", // Konto: Modus, Ziel-Leadpreis, Tagesbudget, Kampagnen-Stichwort
  "actions-approveallaction--alle-massnahmen-freigeben", // Alle Maßnahmen freigeben
  "actions-approveoneaction--einzelne-massnahme-freigeben", // Einzelne Maßnahme freigeben
  "actions-rejectaction--massnahme-ablehnen-mit-notiz", // Maßnahme ablehnen mit Notiz
  "actions-doneaction--vorschlag-als-erledigt-markieren-mit-notiz", // Vorschlag als erledigt markieren mit Notiz
  "actions-dryrunaction--trockenlauf-je-konto", // Trockenlauf je Konto
  "actions-runnowaction--lauf-jetzt-starten", // Lauf jetzt starten
  "actions-syncactivitiesaction--meta-aenderungsprotokoll-abrufen-30-tage", // Meta-Änderungsprotokoll abrufen (30 Tage)
  "account-view-protocolcard--protokoll-je-konto-quelle-monatsbericht", // Protokoll je Konto (Quelle Monatsbericht)
  "page-status-tabs--status-reiter-offen-zurueckgestellt-erledigt", // Status-Reiter Offen, Zurückgestellt, Erledigt
  "page-art-filters--filter-alle-leads-der-kunden-support-nummer", // Filter Alle, Leads der Kunden, Support-Nummer, Kunde, Interessent, unbekannt
  "page-q--chats-durchsuchen-nach-name-oder-nummer", // Chats durchsuchen nach Name oder Nummer
  "actions-togglebotaction--bot-pausieren-bzw-wieder-einschalten", // Bot pausieren bzw. wieder einschalten
  "actions-takeoveraction--gespraech-uebernehmen", // Gespräch übernehmen
  "actions-sendreplyaction--antwort-senden-enter-sendet-am-rechner-emoji", // Antwort senden (Enter sendet am Rechner, Emoji, Textbausteine)
  "actions-sendtemplateaction--freigegebene-vorlage-senden-ausserhalb-24", // Freigegebene Vorlage senden (außerhalb 24 Stunden)
  "appointment-actions-loadrescheduledialogadmin--termin-des-leads-verschieben-dialog-mit-freien", // Termin des Leads verschieben (Dialog mit freien Zeiten)
  "appointment-actions-cancelappointmentadminaction--termin-des-leads-absagen", // Termin des Leads absagen
  "page--seitenleiste-lead-kontaktdaten-formularangaben", // Seitenleiste Lead: Kontaktdaten, Formularangaben, Bot-Zusammenfassung, Termine, Ereignisse
  "page-crmhref--anrufen-e-mail-zum-crm-kunden-aus-dem-chat", // Anrufen, E-Mail, Zum CRM/Kunden aus dem Chat
  "page--hinweis-bot-kann-keine-termine-buchen-kalender", // Hinweis Bot kann keine Termine buchen, Kalender verbinden
  "actions-assignsupportcontactaction--support-chat-absender-einem-vertriebskontakt", // Support-Chat: Absender einem Vertriebskontakt zuordnen
  "page--braucht-aufmerksamkeit-grund-und-nicht", // Braucht Aufmerksamkeit (Grund) und nicht zugestellt markiert
];
