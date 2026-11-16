import { headers } from "next/headers";
import { connection } from "next/server";
import { CheckCircle2, ChevronDown, XCircle } from "lucide-react";
import { DisconnectButton } from "@/app/admin/marketing/linkedin/forms";
import { convertInboundLead } from "@/app/admin/vertrieb/actions";
import { EinstellungSeite, LISTE } from "@/components/admin-neu/einstellungen/rahmen";
import { WaalaxyImport } from "@/components/admin-neu/einstellungen/waalaxy-import";
import { Button, Card, CardHeader, buttonClass } from "@/components/ui";
import { CalendlyForms, ColdCrmImport, ColdCrmReplace, ContactDataBackfill, ContactsImport, CopyField, InstantlyCsvImport, InstantlyNachholen, InstantlySync } from "@/components/vertrieb/import-forms";
import { getAppUrl } from "@/lib/email";
import { linkedInAvailable } from "@/lib/linkedin/api";
import { metaDiagnostics } from "@/lib/meta-leads";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { coldCrmReplaceAllowed, coldCrmSourceConfigured, stagingSourceConfigured } from "@/lib/vertrieb/cold-crm-import";
import { placesDailyLimit, placesKey, placesUsedToday } from "@/lib/vertrieb/contact-enrich";
import { fmtDateTime, isWithinDays } from "@/lib/vertrieb/dates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Anbindungen & Import | performancegrowth Admin" };

// Anbindungen & Import (Demo „e-anbindungen“): woher Daten kommen. Eine Liste der Quellen mit Status (grün = in 7 Tagen
// etwas empfangen); Adresse, Anleitung und Knöpfe je Quelle zum Aufklappen. Zusammengelegt aus /admin/vertrieb/import
// (Instantly, Calendly, Formulare, LinkedIn-Nachrichten, Anreicherung, Import), /admin/lead-eingang (Meta-Verbindung,
// Zapier-Übergang) und /admin/marketing/linkedin (Verbindung). Bausteine und Server Actions wie dort; der Team-Kalender
// liegt jetzt unter Einrichtung neuer Kunden.

function Quelle({
  name,
  was,
  ok,
  status,
  children,
  funktion,
}: {
  name: string;
  was: string;
  /** Ampel (ohne Angabe: keine, z. B. beim Import) */
  ok?: boolean;
  status?: string;
  children: React.ReactNode;
  funktion?: string;
}) {
  return (
    <li data-funktion={funktion}>
      <details className="group">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 [&::-webkit-details-marker]:hidden">
          {ok === undefined ? null : <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-400"}`} aria-hidden="true" />}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{name}</span>
            <span className="block truncate text-sm text-[color:var(--muted)]">{was}</span>
          </span>
          <span className="hidden text-xs text-[color:var(--muted)] sm:inline">{status}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[color:var(--muted)] transition group-open:rotate-180" />
        </summary>
        <div className="space-y-3 px-5 pb-5 text-sm">
          {status ? <p className="text-[color:var(--muted)] sm:hidden">{status}</p> : null}
          {children}
        </div>
      </details>
    </li>
  );
}

function Schritte({ steps }: { steps: string[] }) {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-[color:var(--muted)]">
      {steps.map((s) => (
        <li key={s}>{s}</li>
      ))}
    </ol>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="h-4 w-4 shrink-0 text-rose-500" />}
      {label}
    </li>
  );
}

const zuletzt = (d?: Date | null) => (d ? `Zuletzt ${fmtDateTime(d)}` : "Noch nichts empfangen");

export default async function Page() {
  await connection();
  await requireAuth();
  const h = await headers();
  const origin = process.env.APP_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const token = process.env.VERTRIEB_WEBHOOK_TOKEN;
  const hook = (path: string) => (token ? `${origin}${path}?token=${token}` : null);
  let base = "";
  try {
    base = getAppUrl();
  } catch {
    base = origin;
  }

  const [contacts, lastMail, lastMeeting, lastForm, lastLinkedIn, openLinkedIn, li, diag] = await Promise.all([
    prisma.salesContact.count(),
    prisma.salesEmail.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.salesMeeting.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.salesInboundLead.findFirst({ where: { source: { not: "LINKEDIN" } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.salesInboundLead.findFirst({ where: { source: "LINKEDIN" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.salesInboundLead.findMany({ where: { source: "LINKEDIN", contactId: null }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.linkedInConnection.findFirst({ orderBy: { updatedAt: "desc" }, select: { name: true, expiresAt: true, status: true, lastError: true } }),
    metaDiagnostics(),
  ]);
  const placesOk = !!placesKey();
  const [placesUsed, enrichedGoogle, enrichedWeb] = await Promise.all([
    placesUsedToday().catch(() => 0),
    prisma.salesContact.count({ where: { googlePlaceId: { not: null } } }),
    prisma.salesContact.count({ where: { webEnrichAt: { not: null } } }),
  ]);
  const now = new Date();
  const liOk = !!li && li.expiresAt > now && li.status === "ok";
  const metaOk = diag.tokenSet && diag.appSecretSet && diag.verifyTokenSet && !diag.missing.includes("leads_retrieval");
  const adresse = (url: string | null) => (url ? <CopyField value={url} /> : <p className="text-amber-700">VERTRIEB_WEBHOOK_TOKEN fehlt in Railway.</p>);

  return (
    <EinstellungSeite pfad="/admin/neu/einstellungen/anbindungen">
      <Card>
        <CardHeader title="Quellen" hint="grün: in den letzten 7 Tagen etwas empfangen" />
        <ul className={LISTE} data-funktion="page--status-je-quelle-instantly-calendly-formulare page-copyfield--webhook-adressen-kopieren-und-anleitung">
          <Quelle name="Instantly" was="Cold Mails: gesendet, geöffnet, Antworten" ok={isWithinDays(lastMail?.createdAt, 7)} status={zuletzt(lastMail?.createdAt)} funktion="actions-syncinstantlyaction--jetzt-mit-instantly-abgleichen">
            {adresse(hook("/api/vertrieb/instantly/webhook"))}
            <InstantlySync hasKey={!!process.env.INSTANTLY_API_KEY} />
            <div data-funktion="import-forms-instantlynachholen--fehlende-instantly-antworten-der-letzten-90-tage">
              <InstantlyNachholen hasKey={!!process.env.INSTANTLY_API_KEY} />
            </div>
            <Schritte steps={["Instantly → Settings → Integrations → Webhooks", "Bestehenden Webhook bearbeiten, URL ersetzen, „All Events“"]} />
          </Quelle>

          <Quelle name="Calendly" was="Gebuchte, verschobene und abgesagte Termine" ok={isWithinDays(lastMeeting?.createdAt, 7)} status={zuletzt(lastMeeting?.createdAt)} funktion="actions-connectcalendlyaction--calendly-verbinden-und-termine-abgleichen">
            <CalendlyForms hasToken={!!process.env.CALENDLY_TOKEN} />
            <Schritte steps={["„Calendly verbinden“ legt den Webhook selbst an", "Danach einmal „Bestehende Termine abgleichen“"]} />
          </Quelle>

          <Quelle name="Meta-Leadformulare" was="Leads der Kunden direkt von Meta" ok={metaOk} status={metaOk ? "bereit" : "unvollständig"} funktion="page-diag--meta-verbindung-pruefen-token-rechte-webhook-url">
            <ul className="space-y-1.5">
              <Check ok={diag.tokenSet} label="System-User-Token (META_ACCESS_TOKEN)" />
              <Check ok={diag.appSecretSet} label="App-Geheimschlüssel (META_APP_SECRET)" />
              <Check ok={diag.verifyTokenSet} label="Webhook-Bestätigungstoken (META_WEBHOOK_VERIFY_TOKEN)" />
              <Check ok={!diag.missing.includes("leads_retrieval")} label="Berechtigung leads_retrieval" />
              <Check ok={!diag.missing.includes("pages_manage_metadata")} label="Berechtigung pages_manage_metadata" />
              <Check ok={!diag.missing.includes("ads_management")} label="Berechtigung ads_management" />
            </ul>
            <p className="text-[color:var(--muted)]">
              App: {diag.appName ?? "unbekannt"}
              {diag.appId ? ` (${diag.appId})` : ""} · Seiten mit Zugriff: {diag.pages.length}
            </p>
            {diag.error ? <p className="text-rose-700">{diag.error}</p> : null}
            <p className="text-[color:var(--muted)]">Webhook-URL in der Meta-App (Webhooks → Page → Feld leadgen):</p>
            <CopyField value={`${base}/api/meta/leadgen`} />
          </Quelle>

          <Quelle name="Lead-Formulare (Zapier)" was="Meta-Formulare und Landingpages des Vertriebs" ok={isWithinDays(lastForm?.createdAt, 7)} status={zuletzt(lastForm?.createdAt)}>
            {adresse(hook("/api/vertrieb/leads/webhook"))}
            <Schritte
              steps={[
                "Zapier → Zap History: Lauf mit „Webhooks by Zapier“ öffnen, so findest du den Zap",
                "Im Schritt „POST“ die URL ersetzen, testen, veröffentlichen",
                "Landingpage ohne Meta: am Ende &source=INBOUND anhängen",
              ]}
            />
            <div className="border-t border-[color:var(--border)] pt-3" data-funktion="page--uebergang-webhook-fuer-zapier">
              <p className="font-medium">Übergang: Kunden-Leads über Zapier</p>
              <p className="text-[color:var(--muted)]">Solange ein Kundenformular noch über Zapier läuft: Airtable-Schritt durch „Webhooks by Zapier → POST“ ersetzen (JSON, alle Felder). Zuordnung über die form_id.</p>
              {process.env.LEAD_WEBHOOK_TOKEN ? <CopyField value={`${base}/api/leads/eingang?token=${process.env.LEAD_WEBHOOK_TOKEN}`} /> : <p className="text-amber-700">LEAD_WEBHOOK_TOKEN fehlt.</p>}
            </div>
          </Quelle>

          <Quelle
            name="LinkedIn"
            was="Nachrichten, Posts und Waalaxy"
            ok={liOk && isWithinDays(lastLinkedIn?.createdAt, 7)}
            status={li ? (liOk ? `verbunden bis ${fmtDateTime(li.expiresAt)}` : "Zugang abgelaufen") : "nicht verbunden"}
            funktion="actions-disconnectaction--linkedin-verbinden-bzw-trennen-hinweis-zugang actions-importwaalaxyaction--waalaxy-import-ohne-oberflaeche"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1">
                {li ? (liOk ? `${li.name ?? "Profil"} verbunden. LinkedIn verlangt alle 60 Tage eine neue Anmeldung.` : `Zugang ${li.expiresAt <= now ? "abgelaufen" : "gestört"}${li.lastError ? `: ${li.lastError}` : ""}.`) : linkedInAvailable() ? "Noch nicht verbunden." : "LinkedIn-App fehlt auf dem Server."}
              </span>
              <a href="/api/linkedin/connect" className={buttonClass(li ? "secondary" : "primary", "md")}>
                {li ? "Neu verbinden" : "LinkedIn verbinden"}
              </a>
              {li ? <DisconnectButton /> : null}
            </div>
            <div className="border-t border-[color:var(--border)] pt-3">
              <p className="font-medium">Nachrichten aus der LinkedIn-Mail (Zapier)</p>
              <p className="text-[color:var(--muted)]">{zuletzt(lastLinkedIn?.createdAt)}</p>
              {adresse(hook("/api/vertrieb/linkedin/message"))}
            </div>
            <div className="border-t border-[color:var(--border)] pt-3">
              <p className="mb-2 font-medium">Waalaxy-Export einlesen</p>
              <WaalaxyImport />
            </div>
          </Quelle>

          <Quelle
            name="Kontakte anreichern"
            was="Adresse, Social-Links, Inhaber und Google-Bewertung"
            ok={placesOk}
            status={placesOk ? `Google: ${placesUsed}/${placesDailyLimit()} heute` : "Google-Schlüssel fehlt"}
            funktion="page-placesused--kontakte-anreichern-google-kontingent-heute"
          >
            <p className="text-[color:var(--muted)]">
              Website ausgewertet: {enrichedWeb} von {contacts} Kontakten · mit Google-Eintrag: {enrichedGoogle}
            </p>
            {!placesOk ? <p className="text-amber-700">GOOGLE_PLACES_API_KEY fehlt, bis dahin wird nur die Website ausgewertet.</p> : null}
            <ContactDataBackfill />
          </Quelle>
        </ul>
      </Card>

      {openLinkedIn.length ? (
        <Card tone="attention">
          <CardHeader title="LinkedIn-Nachrichten ohne Zuordnung" count={openLinkedIn.length} />
          <ul className={LISTE} data-funktion="actions-convertinboundlead--linkedin-nachrichten-ohne-zuordnung-als-lead">
            {openLinkedIn.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-sm">
                <span className="font-medium">{l.name ?? "?"}</span>
                <span className="text-xs text-[color:var(--muted)]">{fmtDateTime(l.createdAt)}</span>
                {l.answers ? <span className="line-clamp-1 w-full text-xs text-[color:var(--muted)] sm:w-auto sm:flex-1">{l.answers}</span> : null}
                <form action={convertInboundLead} className="ml-auto">
                  <input type="hidden" name="id" value={l.id} />
                  <Button>Als Lead übernehmen</Button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Import" hint={`${contacts.toLocaleString("de-DE")} Kontakte, erkannt über die E-Mail`} />
        <ul className={LISTE}>
          <Quelle name="Agenturliste (CSV)" was="Numbers: Ablage → Exportieren → CSV" funktion="actions-importcontactsaction--agenturliste-csv-importieren">
            <ContactsImport />
          </Quelle>
          <Quelle name="Instantly-Export (CSV)" was="Nur nötig, wenn der Abgleich nicht reicht" funktion="actions-importinstantlyaction--instantly-csv-importieren">
            <InstantlyCsvImport />
          </Quelle>
          <Quelle
            name="Altes Cold CRM"
            was="Übernimmt nur, was hier noch fehlt"
            ok={coldCrmSourceConfigured()}
            status={coldCrmSourceConfigured() ? "eingerichtet" : "nicht eingerichtet"}
            funktion="actions-importcoldcrmaction--daten-aus-altem-cold-crm-uebernehmen actions-replacecoldcrmaction--vertrieb-neu-importieren-ersetzt-alles"
          >
            <ColdCrmImport configured={coldCrmSourceConfigured()} />
            {coldCrmSourceConfigured() && coldCrmReplaceAllowed() ? <ColdCrmReplace /> : null}
            {stagingSourceConfigured() && process.env.VERTRIEB_NEUIMPORT_ERLAUBT === "1" ? (
              <div className="border-t border-[color:var(--border)] pt-3">
                <p className="mb-2 font-medium">Vertrieb aus der Testumgebung (einmalig beim Livegang)</p>
                <ColdCrmReplace source="staging" />
              </div>
            ) : null}
          </Quelle>
        </ul>
      </Card>
    </EinstellungSeite>
  );
}
