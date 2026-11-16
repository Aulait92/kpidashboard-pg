// Bereich zahlen: noch nicht im neuen Admin gebaut. Gebaut → id hier streichen (README: docs/ux/admin-neu).
export const OFFEN_ZAHLEN: readonly string[] = [
  "page--kunden-nach-kanal-ohne-gekuendigt", // Kunden nach Kanal (ohne Gekündigt)
  "zahlen-view--kennzahlen-kacheln-mrr-kunden-churn-cac", // Kennzahlen-Kacheln (MRR, Kunden, Churn, CAC ...)
  "zahlen-view-sicht--sicht-kerngeschaeft-oder-gesamt-mit-pay-per-lead", // Sicht Kerngeschäft oder Gesamt mit Pay-per-Lead
  "zahlen-view-setdrill--kachel-aufklappen-drill-down-kunden-je-kennzahl", // Kachel aufklappen (Drill-down Kunden je Kennzahl)
  "zahlen-view-toggleinvestor--investoren-ansicht-interne-reiter-ausblenden", // Investoren-Ansicht (interne Reiter ausblenden)
  "actions-saveupdatetextsaction--investoren-update-highlights-texte-speichern", // Investoren-Update: Highlights, Texte speichern, drucken
  "zahlen-view--reiter-wachstum-umsatz-je-strom-umsatzmix", // Reiter Wachstum: Umsatz je Strom, Umsatzmix
  "zahlen-view--reiter-kunden-kohorten-kundenbasis-abhaengigkeit", // Reiter Kunden: Kohorten, Kundenbasis, Abhängigkeit
  "zahlen-view--reiter-wirtschaftlichkeit-kundengewinnung", // Reiter Wirtschaftlichkeit: Kundengewinnung, Bruttomarge je Strom
  "zahlen-view--reiter-wirkung-beim-vertreter-pro-1-lead-bis", // Reiter Wirkung beim Vertreter: Pro 1 €, Lead bis Abschluss, Tempo
  "zahlen-view--reiter-produkte-ueber-alle-vertreter-und-je", // Reiter Produkte: über alle Vertreter und je Vertreter, Zeitraum
  "zahlen-view--reiter-vertrieb-pipeline-woher-kunden-kommen", // Reiter Vertrieb: Pipeline, Woher Kunden kommen
  "zahlen-view--reiter-pay-per-lead-verkaufte-leads-je-monat", // Reiter Pay-per-Lead: verkaufte Leads je Monat
  "zahlen-view-bwa--reiter-bwa-mit-drill-down-je-zeile-und-hinweis", // Reiter BWA mit Drill-down je Zeile und Hinweis offene Zuordnungen
  "actions-savemanualrevenueaction--einrichtungsgebuehren-je-monat-umsatz-von-hand", // Einrichtungsgebühren je Monat, Umsatz von Hand nachtragen
  "actions-deletemanualrevenueaction--manuellen-umsatz-loeschen", // Manuellen Umsatz löschen
  "zahlen-view--kunden-ohne-hinterlegte-betreuungsgebuehr", // Kunden ohne hinterlegte Betreuungsgebühr
  "zahlen-tabs--link-leads-werbung-dashboard", // Link Leads & Werbung (Dashboard /)
  "buchungen-liste--buchungsliste-aller-kunden-angebote-produkte", // Buchungsliste aller Kunden (Angebote, Produkte, Module, Budget, Pausen, Kündigungen)
  "page--filter-kunde-art-status-zeitraum-offen", // Filter Kunde, Art, Status, Zeitraum, Offen
  "page-q--suche-in-buchungen", // Suche in Buchungen
  "route-get--csv-export-buchungen", // CSV-Export Buchungen
  "page--kunden-je-monat-neu-reaktiviert-gekuendigt-netto", // Kunden je Monat (neu, reaktiviert, gekündigt, netto)
  "page--mrr-bewegung-je-monat", // MRR-Bewegung je Monat
  "page--reaktivierungsquote-je-kuendigungsmonat", // Reaktivierungsquote je Kündigungsmonat
  "page--kuendigungsgruende-die-zurueckkommen", // Kündigungsgründe, die zurückkommen
  "page--halteangebote-angenommen-mrr-gerettet-spaeter", // Halteangebote: angenommen, MRR gerettet, später gekündigt
  "storno-quote-stornoquoteuebersicht--stornoquote-der-vertraege-je-kunde-und-sparte", // Stornoquote der Verträge je Kunde und Sparte
  "whatsapp-zustellung--leads-ohne-whatsapp-je-kunde-30-tage-gesamt", // Leads ohne WhatsApp je Kunde (30 Tage, gesamt)
  "whatsapp-zustellung--zustellfehler-der-letzten-14-tage-je-kunde-und", // Zustellfehler der letzten 14 Tage je Kunde und Code
  "page--hilfe-anfragen-an-das-team", // Hilfe-Anfragen an das Team
  "page--ki-hilfe-fragen-der-vertreter-mit-bewertung", // KI-Hilfe: Fragen der Vertreter mit Bewertung
  "page--nutzung-je-kunde-liegt-herum-genutzte-aktionen", // Nutzung je Kunde: liegt herum, genutzte Aktionen, Seitenaufrufe, Fehler, Feedback
  "nps-card--weiterempfehlung-nps", // Weiterempfehlung (NPS)
  "module-card--zusatzmodul-empfehlungen-kandidaten-fuers", // Zusatzmodul Empfehlungen: Kandidaten fürs Gespräch
  "actions-saverecurringcostaction--laufende-kosten-anlegen-aendern-zweck-zeitraum", // Laufende Kosten anlegen, ändern (Zweck, Zeitraum)
  "actions-deleterecurringcostaction--laufende-kosten-loeschen", // Laufende Kosten löschen
  "actions-savekpisettingsaction--annahmen-fuer-kennzahlen-stunden-stundensatz", // Annahmen für Kennzahlen: Stunden, Stundensatz, eigene Kampagnen, PPL-Pilot-Ende
  "actions-connectbankaction--bank-verbinden", // Bank verbinden
  "actions-syncbankaction--umsaetze-jetzt-abrufen", // Umsätze jetzt abrufen
  "actions-disconnectbankaction--bank-trennen", // Bank trennen
  "actions-uploadcsvaction--csv-hochladen-commerzbank-amex-automatisch", // CSV hochladen (Commerzbank, Amex, automatisch)
  "actions-saveruleaction--regel-speichern", // Regel speichern
  "actions-deleteruleaction--regel-loeschen", // Regel löschen
  "actions-assignaction--ausgabe-zuordnen-zweck-inkl-ust-immer-so-bei", // Ausgabe zuordnen (Zweck, inkl. USt, immer so bei Muster)
  "page--zugeordnete-ausgaben-ansehen", // Zugeordnete Ausgaben ansehen
];
