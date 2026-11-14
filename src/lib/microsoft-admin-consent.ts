// Microsoft-Admin-Freigabe (Ole, 14.11.2026): Viele Firmen-Tenants erlauben das Verbinden von Kalender
// bzw. Postfach erst, wenn die IT die App einmal für alle freigibt. Diesen Link geben Kunden an ihre IT;
// nach der Freigabe landet die IT auf /microsoft-freigabe.

import { appUrl } from "@/lib/whatsapp/event-text";

/** Alle Rechte, die die App bei Microsoft nutzt (Kalender, Postfach, Login-Profil) */
export const MICROSOFT_ADMIN_SCOPES = [
  "https://graph.microsoft.com/Calendars.ReadWrite",
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/User.Read",
  "offline_access",
];

export const ADMIN_CONSENT_PATH = "/microsoft-freigabe";

export function microsoftAdminConsentRedirect(origin = appUrl()): string | null {
  return origin ? `${origin.replace(/\/$/, "")}${ADMIN_CONSENT_PATH}` : null;
}

export function microsoftAdminConsentUrl(origin = appUrl()): string | null {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const redirect = microsoftAdminConsentRedirect(origin);
  if (!clientId || !redirect) return null;
  const p = new URLSearchParams({ client_id: clientId, scope: MICROSOFT_ADMIN_SCOPES.join(" "), redirect_uri: redirect, state: "it" });
  return `https://login.microsoftonline.com/organizations/v2.0/adminconsent?${p.toString()}`;
}
