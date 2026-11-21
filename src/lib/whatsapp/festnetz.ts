// Festnetznummern und WhatsApp.
//
// 20.11.2026: Festnetznummern wurden vor dem Versand gesperrt. 21.11.2026 (Ole): Manche Festnetznummern haben WhatsApp
// (z. B. Firmen über Superchat oder WhatsApp Business). Darum geht die WhatsApp wieder normal raus. Meta berechnet nur
// zugestellte Nachrichten. Kommt „kein WhatsApp“ (131026) zurück, markiert lib/whatsapp/kein-whatsapp.ts den Lead mit
// Grund „festnetz“: Verlauf, Anrufliste („Keine Handynummer: bitte anrufen“), Hinweis im Kontakt, Mail-Strecke mit
// Auslöser „festnetz“, Push an den Berater.

/** Grund auf Heute/Anrufliste für Leads mit Festnetznummer (statt „Kein WhatsApp: bitte direkt anrufen“). */
export const FESTNETZ_REASON = "Keine Handynummer: bitte anrufen";

/** Verlaufseintrag am Lead, wenn eine WhatsApp an eine Festnetznummer nicht ankam. */
export const FESTNETZ_VERLAUF = "Festnetznummer ohne WhatsApp: Die Nachricht kam nicht an, der Assistent schreibt nicht. Bitte anrufen.";
