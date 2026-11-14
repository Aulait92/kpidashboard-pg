// WhatsApp-Support-Postfach von performancegrowth (Ole, 14.11.2026): Die Support-Nummer läuft über
// 360dialog wie die Nummern unserer Kunden, gehört aber zum internen Kunden SUPPORT_CUSTOMER_ID.
// Nachrichten erscheinen unter Admin → WhatsApp, ohne KI-Assistent, ohne Lead-Logik, mit Push an Admins.
// Keine Lead-Vorlagen (Support antwortet nur im 24-Stunden-Fenster).

export const SUPPORT_CUSTOMER_ID = "cust_pg_support";

export const isSupportCustomer = (customerId: string | null | undefined) => customerId === SUPPORT_CUSTOMER_ID;
