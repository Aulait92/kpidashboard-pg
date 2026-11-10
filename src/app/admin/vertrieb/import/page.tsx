import Link from "next/link";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { CalendlyForms, ColdCrmImport, ColdCrmReplace, ContactsImport, CopyField, InstantlyCsvImport, InstantlySync } from "@/components/vertrieb/import-forms";
import { coldCrmReplaceAllowed, coldCrmSourceConfigured } from "@/lib/vertrieb/cold-crm-import";
import { teamCalendarStatus } from "@/lib/help-call";
import { fmtDateTime, isWithinDays } from "@/lib/vertrieb/dates";
import { convertInboundLead } from "@/app/admin/vertrieb/actions";

export const metadata = { title: "Anbindungen | KPI-Dashboard" };

// Anbindungen des Vertriebs: woher Daten kommen (Instantly, Calendly,
// Formulare, LinkedIn), je mit Status „zuletzt empfangen“ und Adresse zum Kopieren.
export default async function AnbindungenPage() {
  const h = await headers();
  const origin = process.env.APP_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const token = process.env.VERTRIEB_WEBHOOK_TOKEN;
  const hook = (path: string, extra = "") => (token ? `${origin}${path}?token=${token}${extra}` : null);

  const [contacts, lastMail, lastMeeting, lastForm, lastLinkedIn, openLinkedIn, team] = await Promise.all([
    prisma.salesContact.count(),
    prisma.salesEmail.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.salesMeeting.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.salesInboundLead.findFirst({ where: { source: { not: "LINKEDIN" } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.salesInboundLead.findFirst({ where: { source: "LINKEDIN" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.salesInboundLead.findMany({ where: { source: "LINKEDIN", contactId: null }, orderBy: { createdAt: "desc" }, take: 10 }),
    teamCalendarStatus(),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <a href="/admin/einstellungen" className="text-xs text-[color:var(--brand)] hover:underline">← Einstellungen</a>
        <h1 className="mt-1 text-xl font-semibold">Anbindungen</h1>
        <p className="text-sm text-slate-500">Woher der Vertrieb seine Daten bekommt. Grün = in den letzten 7 Tagen etwas empfangen.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Connection
          name="Instantly"
          what="Cold Mails: gesendet, geöffnet, Antworten"
          last={lastMail?.createdAt}
          url={hook("/api/vertrieb/instantly/webhook")}
          steps={["Instantly → Settings → Integrations → Webhooks", "Bestehenden Webhook bearbeiten, URL ersetzen, „All Events“"]}
        >
          <InstantlySync hasKey={!!process.env.INSTANTLY_API_KEY} />
        </Connection>

        <Connection
          name="Calendly"
          what="Gebuchte, verschobene und abgesagte Termine"
          last={lastMeeting?.createdAt}
          steps={["„Calendly verbinden“ legt den Webhook selbst an", "Danach einmal „Bestehende Termine abgleichen“"]}
        >
          <CalendlyForms hasToken={!!process.env.CALENDLY_TOKEN} />
        </Connection>

        <Connection
          name="Lead-Formulare"
          what="Meta-Formulare und Landingpages (über Zapier)"
          last={lastForm?.createdAt}
          url={hook("/api/vertrieb/leads/webhook")}
          steps={[
            "Zapier → Zap History: Lauf mit „Webhooks by Zapier“ öffnen, so findest du den Zap",
            "Im Schritt „POST“ die URL ersetzen, testen, veröffentlichen",
            "Landingpage ohne Meta: am Ende &source=INBOUND anhängen",
          ]}
        />

        <Connection
          name="LinkedIn-Nachrichten"
          what="Neue Nachrichten aus der LinkedIn-Mail (über Zapier)"
          last={lastLinkedIn?.createdAt}
          url={hook("/api/vertrieb/linkedin/message")}
          steps={["Zapier → Zap „Gmail → Webhooks by Zapier“ öffnen", "Im Schritt „POST“ die URL ersetzen, testen, veröffentlichen"]}
        />

        <section className="card space-y-3 p-5">
          <Head name="Team-Kalender" what="Für 15-Minuten-Hilfetermine der Kunden" ok={team.connected} label={team.connected ? (team.accountEmail ?? "Verbunden") : "Nicht verbunden"} />
          <a href={`/api/google/connect?customerId=${team.teamId}`} className="btn-ghost inline-flex">
            {team.connected ? "Neu verbinden" : "Google-Kalender verbinden"}
          </a>
        </section>
      </div>

      {openLinkedIn.length > 0 && (
        <section className="card p-5 text-sm">
          <h2 className="mb-2 font-medium">LinkedIn-Nachrichten ohne Zuordnung</h2>
          <ul className="divide-y divide-slate-100">
            {openLinkedIn.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="text-xs text-slate-400">{fmtDateTime(l.createdAt)}</span>
                <span className="font-medium">{l.name ?? "?"}</span>
                {l.answers && <span className="line-clamp-1 min-w-0 flex-1 text-xs text-slate-500">{l.answers}</span>}
                <form action={convertInboundLead} className="ml-auto">
                  <input type="hidden" name="id" value={l.id} />
                  <button className="btn-ghost px-2 py-0.5 text-xs">Als Lead übernehmen</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card space-y-4 p-5">
        <div>
          <h2 className="font-medium">Import</h2>
          <p className="text-sm text-slate-500">{contacts.toLocaleString("de-DE")} Kontakte im Vertrieb. Erneuter Import ist sicher, Kontakte werden über die E-Mail erkannt.</p>
        </div>
        <Item title="Agenturliste (CSV)" hint="Numbers: Ablage → Exportieren → CSV">
          <ContactsImport />
        </Item>
        <Item title="Instantly-Export (CSV)" hint="Nur nötig, wenn der Abgleich oben nicht reicht">
          <InstantlyCsvImport />
        </Item>
        {coldCrmSourceConfigured() && (
          <Item title="Altes Cold CRM" hint="Übernimmt nur, was hier noch fehlt">
            <ColdCrmImport configured />
            {coldCrmReplaceAllowed() ? <div className="mt-3"><ColdCrmReplace /></div> : null}
          </Item>
        )}
      </section>

      <p className="text-xs text-slate-400">
        Kontakte von Hand anlegen: <Link href="/admin/vertrieb/kontakte/neu" className="text-sky-700 hover:underline">+ Neuer Lead</Link>
      </p>
    </div>
  );
}

function Head({ name, what, ok, label }: { name: string; what: string; ok: boolean; label: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-medium">{name}</h2>
        <p className="text-sm text-slate-500">{what}</p>
      </div>
      <span className={`badge shrink-0 ${ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{label}</span>
    </div>
  );
}

function Connection({ name, what, last, url, steps, children }: { name: string; what: string; last?: Date | null; url?: string | null; steps: string[]; children?: React.ReactNode }) {
  const fresh = isWithinDays(last, 7);
  return (
    <section className="card flex flex-col gap-3 p-5">
      <Head name={name} what={what} ok={fresh} label={last ? `Zuletzt ${fmtDateTime(last)}` : "Noch nichts empfangen"} />
      {url !== undefined ? url ? <CopyField value={url} /> : <p className="text-sm text-amber-700">VERTRIEB_WEBHOOK_TOKEN fehlt in Railway.</p> : null}
      {children}
      <details className="text-sm text-slate-600">
        <summary className="cursor-pointer text-slate-500">So geht&apos;s</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          {steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </details>
    </section>
  );
}

function Item({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-slate-100 pt-4">
      <div className="mb-2 text-sm">
        <span className="font-medium">{title}</span> <span className="text-slate-500">· {hint}</span>
      </div>
      {children}
    </div>
  );
}
