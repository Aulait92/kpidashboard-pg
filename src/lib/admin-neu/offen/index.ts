// Abnahme-Liste des neuen Admins: Funktionen aus docs/ux/admin-neu/funktionsinventar.json, die im neuen UI
// NOCH NICHT gebaut sind. Je Bereich eine Datei; die Bereichs-Agenten streichen ids, sobald die Funktion mit
// data-funktion="<id>" unter src/app/admin/neu bzw. src/components/admin-neu steht. Nur streichen, nie ergänzen
// (außer bei neuen Inventar-Einträgen). Test: tests/unit/admin-neu-inventar.test.ts. Regeln: docs/ux/admin-neu/README.md.

import { OFFEN_EINSTELLUNGEN } from "./einstellungen";
import { OFFEN_HEUTE } from "./heute";
import { OFFEN_KUNDEN } from "./kunden";
import { OFFEN_LEADS } from "./leads";
import { OFFEN_MARKETING } from "./marketing";
import { OFFEN_VERTRIEB } from "./vertrieb";
import { OFFEN_ZAHLEN } from "./zahlen";

export const OFFEN: Record<string, readonly string[]> = {
  heute: OFFEN_HEUTE,
  vertrieb: OFFEN_VERTRIEB,
  kunden: OFFEN_KUNDEN,
  leads: OFFEN_LEADS,
  marketing: OFFEN_MARKETING,
  zahlen: OFFEN_ZAHLEN,
  einstellungen: OFFEN_EINSTELLUNGEN,
};

/**
 * Im neuen Admin entfernt (Admin v2, Paket A4, „sofort“-Liste aus docs/ux/admin-v2-plan.md, Ole 17.11.2026). Die alten
 * Seiten und Server Actions bleiben, solange der alte Admin sie nutzt; im neuen Admin steht die id nirgends mehr
 * (Test: tests/unit/admin-neu-inventar.test.ts). Nummern wie in docs/ux/admin-v2/zuordnung.md.
 */
export const ENTFERNT: string[] = [
  "followup-actions-redraftfollowupaction--spaeter-follow-up-neu-schreiben-ohne-oberflaeche", // F100
  "actions-importcoldcrmaction--daten-aus-altem-cold-crm-uebernehmen", // F135
  "page-redirect--weiterleitung-auf-kunden-pipeline-keine-eigene", // F141
  "kunden-tabs--unterreiter-uebersicht-pipeline-leads-pay-per", // F144
  "actions-saveoutreachsettingsaction--erstanschreiben-einstellungen-alt-ohne", // F200
  "zahlen-tabs--link-leads-werbung-dashboard", // F340
  "actions-connectcalendlyaction--calendly-verbinden-und-termine-abgleichen", // F133, nur noch eigene Buchungsseite
  "actions-importwaalaxyaction--waalaxy-import-ohne-oberflaeche", // F137
  "actions-uploadcsvaction--csv-hochladen-commerzbank-amex-automatisch", // F399, Bankverbindung reicht
  "followup-actions-planexistingaction--bestand-jetzt-pruefen-bestehende-spaeter", // F123
  "actions-replacecoldcrmaction--vertrieb-neu-importieren-ersetzt-alles", // F136
  "actions-syncinstantlyaction--jetzt-mit-instantly-abgleichen", // F131
  "actions-importinstantlyaction--instantly-csv-importieren", // F132
  "actions-settemplateapprovedaction--vorlage-von-hand-als-freigegeben-markieren", // F199 (im neuen Admin per CSS ausgeblendet)
  "actions-customerfootersaction--fusszeile-bei-bestehenden-kunden-setzen", // F391
  "actions-countinvoicesaction--finalisierte-rechnungen-zaehlen", // F392
  // Airtable aus der Oberfläche (Ole, 19.11.2026: „alte dinge, wie airtable können rausgenommen werden“). Der Abgleich im
  // Hintergrund (lib/sync.ts, /api/sync) und das Schreiben nach Airtable bleiben, bis AIRTABLE_SYNC_OFF gesetzt ist.
  "page-airtable-sync-off--anzeige-airtable-abgleich-an-aus", // Kennzeichen ohne Handlung; Zustand gehört in den Systemzustand
  "actions-runimportaction--bezuege-aus-airtable-uebernehmen", // Bezüge werden in der App gepflegt; Logik bleibt in lib/ppl/import-airtable.ts
  "nachholen-airtablenachholen--lead-aus-airtable-nachholen-lead-nr-laeuft-durch", // Leads kommen direkt (Meta, Webhook); Logik bleibt in lib/ppl/airtable-nachholen.ts
  "route-get--diagnose-airtable-felder-nur-technik-keine", // Diagnose-Route /api/admin/airtable-fields gelöscht, ohne Oberfläche und ohne Nutzer
  // Geld (Umbau 19.11.2026): die Investoren-Ansicht blendete nur interne Abschnitte aus und zeigte Definitionen. Das leistet
  // jetzt die Detailseite „Für Investoren“ (Auswertung mit „So rechnen wir“, Export PDF/CSV), erreichbar aus der Übersicht.
  "zahlen-view-toggleinvestor--investoren-ansicht-interne-reiter-ausblenden",
];

/** Funktionen ohne Oberfläche, vom Neudesign nicht betroffen (bleiben, wie sie sind). */
export const BLEIBT: string[] = [
  "route-get--diagnose-openai-erreichbarkeit-nur-technik-keine",
  // Funktion des Kundenbereichs (Chats der Vermittler), im Admin nur der Schalter je Kunde (Kundenakte › WhatsApp)
  "chat-actions-takeasleadbuyeraction--neuer-kontakt-im-chat-als-lead-uebernehmen",
];
