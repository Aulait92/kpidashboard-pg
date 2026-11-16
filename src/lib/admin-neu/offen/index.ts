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

/** Funktionen ohne Oberfläche, vom Neudesign nicht betroffen (bleiben, wie sie sind). */
export const BLEIBT: string[] = [
  "route-get--diagnose-openai-erreichbarkeit-nur-technik-keine",
  "route-get--diagnose-airtable-felder-nur-technik-keine",
];
