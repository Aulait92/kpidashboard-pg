// Postfach verbinden mit Google bzw. Microsoft (Einrichtung und /buyer/postfach, 26.11.2026). Wie im Kalender-Schritt
// auch in der Vorschau sichtbar, dort nur nicht klickbar: vorher fehlten die Knöpfe in der Admin-Vorschau ganz, nur SMTP
// war zu sehen.

import { buttonClass } from "@/components/ui";
import { MicrosoftAdminConsent } from "@/components/microsoft-admin-consent";

export function PostfachVerbindenKnoepfe({
  google,
  microsoft,
  readOnly,
  adminConsentUrl,
}: {
  google: boolean;
  microsoft: boolean;
  readOnly: boolean;
  /** Freigabe-Link für die IT (Microsoft 365), eingeklappt unter den Knöpfen */
  adminConsentUrl?: string | null;
}) {
  if (!google && !microsoft) return null;
  const aus = readOnly ? "pointer-events-none opacity-60" : "";
  return (
    <div className="space-y-2" data-postfach-oauth>
      <div className="flex flex-wrap gap-2">
        {google ? (
          <a href="/api/mail/connect?anbieter=google" aria-disabled={readOnly || undefined} tabIndex={readOnly ? -1 : undefined} className={buttonClass("secondary", "md", aus)} data-postfach-google>
            Mit Google (Gmail) verbinden
          </a>
        ) : null}
        {microsoft ? (
          <a href="/api/mail/connect?anbieter=microsoft" aria-disabled={readOnly || undefined} tabIndex={readOnly ? -1 : undefined} className={buttonClass("secondary", "md", aus)} data-postfach-microsoft>
            Mit Microsoft (Outlook/365) verbinden
          </a>
        ) : null}
      </div>
      {microsoft && adminConsentUrl ? (
        <details className="text-sm" data-postfach-firmenkonto>
          <summary className="cursor-pointer font-medium text-[color:var(--brand)]">Firmenkonto braucht eine Freigabe Ihrer IT?</summary>
          <div className="mt-2">
            <MicrosoftAdminConsent url={adminConsentUrl} was="das Postfach" />
          </div>
        </details>
      ) : null}
    </div>
  );
}
