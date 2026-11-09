import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { CalendlyForms, ContactsImport, InstantlyCsvImport, InstantlySync, WaalaxyCsvImport } from "@/components/vertrieb/import-forms";
import { fmtDateTime } from "@/lib/vertrieb/dates";
import { convertInboundLead } from "@/app/admin/vertrieb/actions";
import { LI_LABEL } from "@/lib/vertrieb/linkedin";
import Link from "next/link";

export default async function ImportPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const [contacts, campaigns, liEvents, liCount, meetingCount, leads, liMessages] = await Promise.all([
    prisma.salesContact.count(),
    prisma.salesCampaign.findMany({ include: { _count: { select: { leads: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.salesLinkedInEvent.findMany({ orderBy: { createdAt: "desc" }, take: 15, include: { contact: { select: { id: true, name: true } } } }),
    prisma.salesContact.count({ where: { linkedinStatus: { not: null } } }),
    prisma.salesMeeting.count(),
    prisma.salesInboundLead.findMany({ where: { source: { not: "LINKEDIN" } }, orderBy: { createdAt: "desc" }, take: 15, include: { contact: { select: { id: true } } } }),
    prisma.salesInboundLead.findMany({ where: { source: "LINKEDIN" }, orderBy: { createdAt: "desc" }, take: 15, include: { contact: { select: { id: true } } } }),
  ]);

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-xl font-semibold">Import & Instantly</h1>

      <section className="card space-y-3 p-5">
        <h2 className="font-medium">1. Agenturliste importieren</h2>
        <p className="text-sm text-slate-600">
          Funktioniert mit der Cold-Calling-Liste (Numbers) und mit der Mailing-Liste aus Instantly
          (inkl. Ansprechpartner, Teamgröße, Potenzial-Score). Neue Agenturen werden angelegt, bestehende ergänzt –
          Pipeline, Aufgaben und Verlauf bleiben erhalten.
        </p>
        <p className="text-sm text-slate-600">
          In Numbers: <b>Ablage → Exportieren → CSV</b>. Spalten werden über die Kopfzeile erkannt (name, email, phone, …).
          Die Spalte ohne Überschrift nach „description“ wird als Anruf-Status gelesen und automatisch in Pipeline-Stufe,
          Verlustgrund und Folgeaufgabe übersetzt. Erneuter Import ist sicher: Kontakte werden über die E-Mail erkannt.
        </p>
        <p className="text-sm text-slate-500">Aktuell {contacts.toLocaleString("de-DE")} Kontakte in der Datenbank.</p>
        <ContactsImport />
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-medium">2. Cold Mails aus Instantly abgleichen</h2>
        <p className="text-sm text-slate-600">
          Holt alle Kampagnen und Leads über die Instantly API v2 und ordnet sie per E-Mail den Kontakten zu
          (gesendet, geöffnet, geantwortet, bounced). Neue Antworten erzeugen automatisch eine Aufgabe.
        </p>
        <InstantlySync hasKey={!!process.env.INSTANTLY_API_KEY} />
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-500">Alternative: CSV-Export aus Instantly hochladen</summary>
          <div className="mt-3"><InstantlyCsvImport /></div>
        </details>
      </section>

      <section className="card space-y-2 p-5 text-sm">
        <h2 className="font-medium">3. Live-Updates per Webhook (optional)</h2>
        <p className="text-slate-600">
          In Instantly unter <b>Settings → Integrations → Webhooks</b> diese URL für alle Events eintragen
          (benötigt den Hyper-Growth-Plan). Dann landen gesendete Mails und Antworten sofort im CRM.
        </p>
        <code className="block overflow-x-auto rounded-lg bg-slate-100 p-2 text-xs">
          {proto}://{host}/api/vertrieb/instantly/webhook?token={process.env.VERTRIEB_WEBHOOK_TOKEN ? "<WEBHOOK_TOKEN>" : "(WEBHOOK_TOKEN setzen)"}
        </code>
      </section>

      <section className="card space-y-3 p-5 text-sm">
        <h2 className="font-medium">4. LinkedIn (Waalaxy)</h2>
        <p className="text-slate-600">
          Waalaxy hat keine API, liefert aber Daten per Webhook und CSV. Zuordnung zu den Kontakten über LinkedIn-Profil-URL,
          E-Mail oder Vor- und Nachname (bei gleichen Namen zusätzlich über den Ort). Der LinkedIn-Status geht nur vorwärts:
          Anfrage gesendet → Vernetzt → Nachricht gesendet → Geantwortet. Antworten erzeugen eine Aufgabe.
          Aktuell {liCount.toLocaleString("de-DE")} Kontakte mit LinkedIn-Status.
        </p>
        <div>
          <h3 className="mb-1 font-medium text-slate-700">a) Webhook (automatisch)</h3>
          <p className="text-slate-600">
            In Waalaxy in der Kampagne einen Schritt <b>„CRM Sync“</b> hinzufügen (bzw. die Synchronisation bei Antwort aktivieren)
            und als Ziel „Webhook / Zapier“ mit dieser URL eintragen:
          </p>
          <code className="mt-1 block overflow-x-auto rounded-lg bg-slate-100 p-2 text-xs">
            {proto}://{host}/api/waalaxy/webhook?token={process.env.VERTRIEB_WEBHOOK_TOKEN ? "<WEBHOOK_TOKEN>" : "(WEBHOOK_TOKEN setzen)"}
          </code>
        </div>
        <div>
          <h3 className="mb-1 font-medium text-slate-700">b) CSV-Export (manuell, alle Waalaxy-Pläne)</h3>
          <p className="mb-2 text-slate-600">In Waalaxy die Prospect-Liste oder Kampagne als CSV exportieren und hier hochladen.</p>
          <WaalaxyCsvImport />
        </div>
        {liEvents.length > 0 && (
          <div>
            <h3 className="mb-1 font-medium text-slate-700">Letzte Webhook-Ereignisse</h3>
            <ul className="divide-y divide-slate-100">
              {liEvents.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2 py-1.5">
                  <span className="text-xs text-slate-400">{fmtDateTime(e.createdAt)}</span>
                  <span>{e.name ?? "?"}{e.company ? ` · ${e.company}` : ""}</span>
                  {e.status && <span className="badge bg-slate-100 text-slate-600">{LI_LABEL[e.status] ?? e.status}</span>}
                  {e.contact ? (
                    <Link href={`/admin/vertrieb/kontakte/${e.contact.id}`} className="ml-auto text-xs text-sky-700 hover:underline">→ zugeordnet</Link>
                  ) : (
                    <span className="ml-auto text-xs text-amber-700">nicht zugeordnet</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="card space-y-3 p-5 text-sm">
        <h2 className="font-medium">5. Termine aus Calendly</h2>
        <p className="text-slate-600">
          Jede Buchung über Calendly landet am Kontakt: Termin mit Datum, Ort/Link und Antworten aus dem Buchungsformular,
          Aufgabe zum Termin, Stufe „Termin“ in der Pipeline. Absagen und Verschiebungen werden ebenfalls übernommen.
          Zuordnung über E-Mail oder Name – unbekannte Bucher werden als neuer Kontakt angelegt.
          Aktuell {meetingCount.toLocaleString("de-DE")} Termine im CRM.
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-slate-600">
          <li>In Calendly unter <b>Integrationen → API &amp; Webhooks</b> einen <b>Personal Access Token</b> erzeugen.</li>
          <li>In Railway beim Service <code>cold-crm</code> die Variable <code>CALENDLY_TOKEN</code> mit diesem Token anlegen.</li>
          <li>Hier „Calendly verbinden“ klicken (legt den Webhook automatisch an, benötigt Calendly Standard oder höher), danach einmal „Bestehende Termine abgleichen“.</li>
        </ol>
        <CalendlyForms hasToken={!!process.env.CALENDLY_TOKEN} />
      </section>

      <section className="card space-y-3 p-5 text-sm">
        <h2 className="font-medium">6. Leads aus Meta Ads (und Website-Formularen)</h2>
        <p className="text-slate-600">
          Jeder Lead wird einem bestehenden Kontakt zugeordnet (E-Mail oder Name) oder neu angelegt – mit Stufe „Interesse“,
          Kanal „Meta Ads“, allen Formularantworten im Verlauf und der Aufgabe „Neuen Lead anrufen“.
        </p>
        <div>
          <h3 className="mb-1 font-medium text-slate-700">Webhook-URL</h3>
          <code className="block overflow-x-auto rounded-lg bg-slate-100 p-2 text-xs">
            {proto}://{host}/api/vertrieb/leads/webhook?token={process.env.VERTRIEB_WEBHOOK_TOKEN ? "<WEBHOOK_TOKEN>" : "(WEBHOOK_TOKEN setzen)"}
          </code>
          <p className="mt-1 text-xs text-slate-500">Für Website-/Landingpage-Formulare ohne Meta-Bezug <code>&amp;source=INBOUND</code> anhängen.</p>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-slate-600">
          <li><b>Meta Lead-Formular (Instant Form):</b> In Zapier „Facebook Lead Ads → New Lead“ als Auslöser, als Aktion „Webhooks by Zapier → POST“ mit obiger URL (Payload: JSON, alle Felder). In Make analog mit „Facebook Lead Ads → Watch Leads“ + „HTTP → Make a request“.</li>
          <li><b>Landingpage (z.B. Perspective, Typeform, Webflow):</b> In den Formular-Einstellungen einen Webhook mit obiger URL eintragen.</li>
        </ul>
        {leads.length > 0 && (
          <div>
            <h3 className="mb-1 font-medium text-slate-700">Zuletzt eingegangen</h3>
            <ul className="divide-y divide-slate-100">
              {leads.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-2 py-1.5">
                  <span className="text-xs text-slate-400">{fmtDateTime(l.createdAt)}</span>
                  <span>{l.name ?? l.email ?? "?"}</span>
                  {l.campaign && <span className="text-xs text-slate-500">{l.campaign}</span>}
                  <span className={`badge ${l.created ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>{l.created ? "neuer Kontakt" : "bestehender Kontakt"}</span>
                  {l.contact && <Link href={`/admin/vertrieb/kontakte/${l.contact.id}`} className="ml-auto text-xs text-sky-700 hover:underline">→ Kontakt</Link>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="card space-y-3 p-5 text-sm">
        <h2 className="font-medium">7. LinkedIn-Nachrichten (Interesse an Video / Dienstleistung)</h2>
        <p className="text-slate-600">
          LinkedIn hat keine API für Direktnachrichten. Lösung: LinkedIn schickt bei jeder neuen Nachricht eine E-Mail –
          Zapier leitet diese an das CRM weiter. Das CRM liest Absender, Profil-Link und Nachricht aus und erkennt Interesse
          (z.B. „Video“, „Dienstleistung“, „mehr erfahren“, „Termin“). Bei Interesse: Lead anlegen bzw. Kontakt ergänzen,
          Stufe „Interesse“, Kanal LinkedIn, Aufgabe „Auf LinkedIn-Anfrage reagieren“. Ohne erkanntes Interesse wird die
          Nachricht nur protokolliert und kann unten per Klick übernommen werden.
        </p>
        <code className="block overflow-x-auto rounded-lg bg-slate-100 p-2 text-xs">
          {proto}://{host}/api/vertrieb/linkedin/message?token={process.env.VERTRIEB_WEBHOOK_TOKEN ? "<WEBHOOK_TOKEN>" : "(WEBHOOK_TOKEN setzen)"}
        </code>
        <ol className="list-decimal space-y-1 pl-5 text-slate-600">
          <li>In LinkedIn unter Einstellungen → Benachrichtigungen → Nachrichten die E-Mail-Benachrichtigung aktivieren.</li>
          <li>Zapier: Auslöser <b>Gmail → New Email Matching Search</b> mit Suche <code>from:messages-noreply@linkedin.com</code>.</li>
          <li>Aktion <b>Webhooks by Zapier → POST</b> an obige URL, Payload JSON, Data: <code>subject</code> = Subject, <code>from_name</code> = From Name, <code>body_plain</code> = Body Plain.</li>
        </ol>
        <p className="text-slate-600">Oder per Hand: <Link href="/admin/vertrieb/kontakte/neu" className="text-sky-700 hover:underline">+ Neuer Lead</Link>.</p>
        {liMessages.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {liMessages.map((l) => (
              <li key={l.id} className="py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-400">{fmtDateTime(l.createdAt)}</span>
                  <span className="font-medium">{l.name ?? "?"}</span>
                  <span className="text-xs text-slate-500">{l.campaign}</span>
                  {l.contact ? (
                    <Link href={`/admin/vertrieb/kontakte/${l.contact.id}`} className="ml-auto text-xs text-sky-700 hover:underline">→ Kontakt</Link>
                  ) : (
                    <form action={convertInboundLead} className="ml-auto">
                      <input type="hidden" name="id" value={l.id} />
                      <button className="btn-ghost px-2 py-0.5 text-xs">Als Lead übernehmen</button>
                    </form>
                  )}
                </div>
                {l.answers && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{l.answers}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {campaigns.length > 0 && (
        <section className="card p-5 text-sm">
          <h2 className="mb-2 font-medium">Kampagnen</h2>
          <ul className="divide-y divide-slate-100">
            {campaigns.map((c) => (
              <li key={c.id} className="flex justify-between py-1.5">
                <span>{c.name}</span>
                <span className="tabular-nums text-slate-500">{c._count.leads} Kontakte</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
