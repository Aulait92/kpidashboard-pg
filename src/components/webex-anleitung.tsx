// „Wo finde ich meinen Webex-Link?“ (Ole, 21.11.2026: Vertreter müssen den persönlichen Raum selbst finden).
// Aufklappbar unter jedem Feld für den Video-Link. Keine Gedankenstriche.

export function WebexAnleitung() {
  return (
    <details className="text-sm" data-webex-anleitung>
      <summary className="cursor-pointer font-medium text-[color:var(--brand)]">Wo finde ich meinen Webex-Link?</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-[color:var(--muted)]">
        <li>Webex öffnen (App oder im Browser, z. B. allianz-agn.webex.com) und anmelden.</li>
        <li>
          Bei <b>Meetings</b> bzw. auf der Startseite steht <b>„Mein persönlicher Raum“</b> (Personal Room) mit Ihrem Link.
        </li>
        <li>Link kopieren und hier einfügen. Er endet auf <b>/meet/vorname.nachname</b> und bleibt immer gleich.</li>
      </ol>
      <p className="mt-2 text-[color:var(--muted)]">Bitte keinen Link aus einer Einladung zu einem einzelnen Meeting nehmen, der verfällt danach.</p>
    </details>
  );
}
