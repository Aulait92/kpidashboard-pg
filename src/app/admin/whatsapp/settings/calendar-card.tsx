import { getOrCreateBookingSlug, hasRequiredScopes, PROVIDER_LABELS } from "@/lib/calendar";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/whatsapp/event-text";

// Buchungskalender eines Kunden (Admin): Verbindung, Hinweis auf fehlende
// Berechtigung und Buchungslink für das Meta-Leadformular. Stand früher in der
// Seitenleiste jedes WhatsApp-Chats, gehört aber zu den Einstellungen des Kunden.
export async function CalendarCard({ customerId, anchor }: { customerId: string; anchor: string }) {
  const conn = await prisma.calendarConnection.findUnique({
    where: { customerId },
    select: { status: true, provider: true, accountEmail: true, calendarId: true, scope: true },
  });
  const connected = conn?.status === "connected";
  const bookingUrl = connected ? `${appUrl() ?? ""}/book/${await getOrCreateBookingSlug(customerId)}` : null;

  return (
    <div id={anchor} className="scroll-mt-20 rounded-xl border border-[color:var(--border)] bg-white p-4 text-sm">
      <div className="font-medium">Buchungskalender</div>
      {connected ? (
        <p className="mt-1 break-words text-sm text-emerald-700">
          ✓ {PROVIDER_LABELS[conn.provider] ?? "Kalender"} verbunden
          {conn.accountEmail ? ` mit ${conn.accountEmail}` : ""}
          {conn.calendarId !== "primary" ? " · eigener Unterkalender" : ""}. Der Bot bucht automatisch.
        </p>
      ) : (
        <p className="mt-1 text-sm text-[color:var(--muted)]">Noch nicht verbunden. Ohne Kalender kann der Bot keine Termine buchen.</p>
      )}
      {connected && !hasRequiredScopes(conn) ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          Kalender neu verbinden: Die Verfügbarkeitsprüfung fehlt, sonst gibt es keine Terminvorschläge.
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <a
          href={`/api/microsoft/connect?customerId=${customerId}`}
          className="rounded-lg border border-[color:var(--brand)] px-3 py-1.5 text-xs font-semibold text-[color:var(--brand)] hover:bg-[color:var(--brand-soft)]/40"
        >
          {conn?.provider === "microsoft" ? "Outlook neu verbinden" : "Outlook / Microsoft 365 verbinden"}
        </a>
        <a
          href={`/api/google/connect?customerId=${customerId}`}
          className="rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-xs font-semibold hover:border-[color:var(--brand)]"
        >
          {conn?.provider === "google" ? "Google neu verbinden" : "Google-Kalender verbinden"}
        </a>
      </div>
      {bookingUrl ? (
        <div className="mt-3">
          <div className="text-sm text-[color:var(--muted)]">Buchungslink für das Meta-Leadformular (Termin: „Custom“)</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={bookingUrl}
              aria-label="Buchungslink"
              className="min-w-0 flex-1 rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-2 py-1 font-mono text-xs"
            />
            <a href={bookingUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-[color:var(--brand)] hover:underline">
              Seite öffnen ↗
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
