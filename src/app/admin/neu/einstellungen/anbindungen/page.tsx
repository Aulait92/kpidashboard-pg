import { headers } from "next/headers";
import { connection } from "next/server";
import { CheckCircle2, ChevronDown, XCircle } from "lucide-react";
import { DisconnectButton } from "@/app/admin/marketing/linkedin/forms";
import { convertInboundLead } from "@/app/admin/vertrieb/actions";
import { EinstellungSeite, LISTE } from "@/components/admin-neu/einstellungen/rahmen";
import { Button, Card, CardHeader, buttonClass } from "@/components/ui";
import { ContactDataBackfill, ContactsImport, CopyField, InstantlyNachholen, InstantlyPortion, SperrenNachholen } from "@/components/vertrieb/import-forms";
import { domainTageslimit } from "@/lib/vertrieb/mischen";
import { getAppUrl } from "@/lib/email";
import { linkedInAvailable } from "@/lib/linkedin/api";
import { metaDiagnostics } from "@/lib/meta-leads";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { auslesenStatus, einstellung as auslesenEinstellung } from "@/lib/policen/auslesen/server";
import { pauseAufhebenAction, zdrNachweisAction } from "./policen-actions";
import { placesDailyLimit, placesKey, placesUsedToday } from "@/lib/vertrieb/contact-enrich";
import { fmtDateTime, isWithinDays } from "@/lib/vertrieb/dates";
import { zugang as carddavZugang } from "@/lib/carddav/dav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Anbindungen & Import | performancegrowth Admin" };

// Anbindungen & Import (Demo „e-anbindungen“): woher Daten kommen. Je Dienst EINE Zeile mit Status (Punkt und ein
// Satz, auch am Handy sichtbar) und einer Aktion: Aufklappen. Adresse, Anleitung und seltene Reparaturen (Nachholen)
// liegen im aufgeklappten Teil. Zusammengelegt aus /admin/vertrieb/import, /admin/lead-eingang (Meta-Verbindung,
// Webhook für Kundenformulare) und /admin/marketing/linkedin (Verbindung). Bausteine und Server Actions wie dort.
// UX-Umbau 20.11.2026: Zapier- und Airtable-Texte raus (Webhooks heißen nach dem, was ankommt), „KI für Unterlagen“
// als Zeile in derselben Liste statt eigener Karte; der Team-Kalender liegt unter Einrichtung neuer Kunden.

function Quelle({
  name,
  was,
  ok,
  status,
  children,
  funktion,
}: {
  name: string;
  /** Ein Satz: was über diese Anbindung kommt (im aufgeklappten Teil, ohne `status` als zweite Zeile) */
  was: string;
  /** Ampel (ohne Angabe: keine, z. B. beim Import) */
  ok?: boolean;
  /** Zustand in wenigen Wörtern, zweite Zeile, auch am Handy */
  status?: string;
  children: React.ReactNode;
  funktion?: string;
}) {
  return (
    <li data-funktion={funktion} data-quelle={name}>
      <details className="group">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
          {ok === undefined ? null : <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-400"}`} aria-label={ok ? "in Ordnung" : "prüfen"} />}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{name}</span>
            <span className={`block truncate text-sm ${ok === false ? "text-amber-800" : "text-[color:var(--muted)]"}`}>{status ?? was}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[color:var(--muted)] transition group-open:rotate-180" />
        </summary>
        <div className="space-y-3 px-4 pb-5 text-sm sm:px-5">
          {status ? <p className="text-[color:var(--muted)]">{was}</p> : null}
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

  const [contacts, lastMail, lastForm, lastLinkedIn, openLinkedIn, li, diag] = await Promise.all([
    prisma.salesContact.count(),
    prisma.salesEmail.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.salesInboundLead.findFirst({ where: { source: { not: "LINKEDIN" } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.salesInboundLead.findFirst({ where: { source: "LINKEDIN" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.salesInboundLead.findMany({ where: { source: "LINKEDIN", contactId: null }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.linkedInConnection.findFirst({ orderBy: { updatedAt: "desc" }, select: { name: true, expiresAt: true, status: true, lastError: true } }),
    metaDiagnostics(),
  ]);
  const [policen, policenEinst] = await Promise.all([auslesenStatus().catch(() => null), auslesenEinstellung().catch(() => null)]);
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
  const policenOk = !!policen && policen.an && !policen.pausiert;
  // Adressbuch fürs iPhone (lib/carddav/dav.ts): Anrufer aus dem Vertrieb erkennen. Passwort nie anzeigen.
  const carddav = carddavZugang(process.env);

  return (
    <EinstellungSeite pfad="/admin/neu/einstellungen/anbindungen">
      {openLinkedIn.length ? (
        <Card tone="attention">
          <CardHeader title="LinkedIn-Nachrichten ohne Zuordnung" count={openLinkedIn.length} />
          <ul className={LISTE} data-funktion="actions-convertinboundlead--linkedin-nachrichten-ohne-zuordnung-als-lead">
            {openLinkedIn.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm sm:px-5">
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
        <CardHeader title="Dienste" hint="grün: läuft" />
        <ul className={LISTE} data-funktion="page--status-je-quelle-instantly-calendly-formulare page-copyfield--webhook-adressen-kopieren-und-anleitung">
          <Quelle name="Instantly" was="Cold Mails: gesendet, geöffnet, Antworten. Grün, wenn in den letzten 7 Tagen etwas ankam." ok={isWithinDays(lastMail?.createdAt, 7)} status={zuletzt(lastMail?.createdAt)}>
            {adresse(hook("/api/vertrieb/instantly/webhook"))}
            <Schritte steps={["Instantly › Settings › Integrations › Webhooks", "Bestehenden Webhook bearbeiten, Adresse ersetzen, „All Events“"]} />
            <div className="space-y-2 border-t border-[color:var(--border)] pt-3">
              <div data-funktion="import-forms-instantlynachholen--fehlende-instantly-antworten-der-letzten-90-tage">
                <InstantlyNachholen hasKey={!!process.env.INSTANTLY_API_KEY} />
              </div>
              <div data-funktion="import-forms-sperrennachholen--austragungen-aus-bisherigen-antworten-sperren">
                <SperrenNachholen />
              </div>
            </div>
          </Quelle>

          <Quelle name="Meta-Leadformulare" was="Leads der Kunden direkt von Meta." ok={metaOk} status={metaOk ? "Bereit" : "Unvollständig, bitte prüfen"} funktion="page-diag--meta-verbindung-pruefen-token-rechte-webhook-url">
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
            <p className="text-[color:var(--muted)]">Webhook-Adresse in der Meta-App (Webhooks › Page › Feld leadgen):</p>
            <CopyField value={`${base}/api/meta/leadgen`} />
          </Quelle>

          <Quelle name="Formulare per Webhook" was="Formulare und Landingpages ohne Meta-Anbindung, für den Vertrieb und für Kunden." ok={isWithinDays(lastForm?.createdAt, 7)} status={zuletzt(lastForm?.createdAt)}>
            <p className="font-medium">Vertrieb</p>
            {adresse(hook("/api/vertrieb/leads/webhook"))}
            <Schritte steps={["Im Formular-Werkzeug als Webhook eintragen (POST, JSON)", "Landingpage ohne Meta: am Ende &source=INBOUND anhängen"]} />
            <div className="space-y-2 border-t border-[color:var(--border)] pt-3" data-funktion="page--uebergang-webhook-fuer-zapier">
              <p className="font-medium">Kundenformulare</p>
              <p className="text-[color:var(--muted)]">POST mit JSON und allen Feldern, Zuordnung zum Kunden über die form_id.</p>
              {process.env.LEAD_WEBHOOK_TOKEN ? <CopyField value={`${base}/api/leads/eingang?token=${process.env.LEAD_WEBHOOK_TOKEN}`} /> : <p className="text-amber-700">LEAD_WEBHOOK_TOKEN fehlt in Railway.</p>}
            </div>
          </Quelle>

          <Quelle
            name="LinkedIn"
            was="Posts und Nachrichten. LinkedIn verlangt alle 60 Tage eine neue Anmeldung."
            ok={liOk}
            status={li ? (liOk ? `Verbunden bis ${fmtDateTime(li.expiresAt)}` : "Zugang abgelaufen, neu verbinden") : "Nicht verbunden"}
            funktion="actions-disconnectaction--linkedin-verbinden-bzw-trennen-hinweis-zugang"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1">
                {li ? (liOk ? `${li.name ?? "Profil"} verbunden.` : `Zugang ${li.expiresAt <= now ? "abgelaufen" : "gestört"}${li.lastError ? `: ${li.lastError}` : ""}.`) : linkedInAvailable() ? "Noch nicht verbunden." : "LinkedIn-App fehlt auf dem Server."}
              </span>
              <a href="/api/linkedin/connect" className={buttonClass(li ? "secondary" : "primary", "md")}>
                {li ? "Neu verbinden" : "LinkedIn verbinden"}
              </a>
              {li ? <DisconnectButton /> : null}
            </div>
            <div className="space-y-2 border-t border-[color:var(--border)] pt-3">
              <p className="font-medium">Nachrichten aus der LinkedIn-Mail</p>
              <p className="text-[color:var(--muted)]">{zuletzt(lastLinkedIn?.createdAt)}</p>
              {adresse(hook("/api/vertrieb/linkedin/message"))}
            </div>
          </Quelle>

          <Quelle
            name="Google (Kontakte anreichern)"
            was="Adresse, Social-Links, Inhaber und Google-Bewertung zu Vertriebskontakten."
            ok={placesOk}
            status={placesOk ? `Heute ${placesUsed} von ${placesDailyLimit()} Abfragen` : "Schlüssel fehlt, nur Website"}
            funktion="page-placesused--kontakte-anreichern-google-kontingent-heute"
          >
            <p className="text-[color:var(--muted)]">
              Website ausgewertet: {enrichedWeb} von {contacts} Kontakten · mit Google-Eintrag: {enrichedGoogle}
            </p>
            {!placesOk ? <p className="text-amber-700">GOOGLE_PLACES_API_KEY fehlt in Railway.</p> : null}
            <ContactDataBackfill />
          </Quelle>

          {policen ? (
            <Quelle
              name="KI für Unterlagen"
              was="Liest Policen und Dokumente aus, getrennt vom Chat-Assistenten."
              ok={policenOk}
              status={policen.pausiert ? "Pausiert: Schlüssel abgelehnt" : policen.an ? `An · heute ${policen.heute.anzahl} von ${policen.maxProTag}` : "Aus"}
            >
              <div className="space-y-3" data-policen-auslesen="">
                <ul className="space-y-1.5">
                  <Check ok={policen.an} label={policen.an ? "An" : policen.notschalterAus ? "Aus (POLICEN_AUSLESEN_AN)" : "Aus: Schlüssel fehlt (POLICEN_OPENAI_API_KEY)"} />
                  <Check ok={!policen.pausiert} label={policen.pausiert ? "Pausiert: Schlüssel ungültig (401)" : "Schlüssel nicht abgelehnt"} />
                  <Check ok={policen.zdrNachweis} label={policen.zdrNachweis ? `Nachweis „keine Speicherung“ vom ${policen.zdrNachweisAm}: Kranken, BU, Leben an` : "Kein Nachweis „keine Speicherung“: nur Sachversicherungen"} />
                </ul>
                <p className="text-[color:var(--muted)]">
                  {policen.anbieter} · {String(policen.endpunkt ?? "")} · Modell {String(policen.modell ?? "")}
                  {"tageBisAblauf" in policen ? ` · Schlüssel bis ${policen.schluesselAblauf} (${policen.tageBisAblauf} Tage)` : ""}
                </p>
                {policen.pausiert ? (
                  <form action={pauseAufhebenAction}>
                    <Button type="submit">Pause aufheben (Schlüssel erneuert)</Button>
                  </form>
                ) : null}
                <form action={zdrNachweisAction} className="flex flex-wrap items-end gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[13px] text-[color:var(--muted)]">Nachweis vom</span>
                    <input name="am" type="date" defaultValue={policenEinst?.zdrNachweisAm?.toISOString().slice(0, 10) ?? ""} className="h-10 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3" />
                  </label>
                  <label className="block min-w-48 flex-1">
                    <span className="mb-1 block text-[13px] text-[color:var(--muted)]">Referenz (Ablage)</span>
                    <input name="referenz" defaultValue={policenEinst?.zdrReferenz ?? ""} placeholder="z. B. ZDR-Bestätigung, docs/recht/…" className="h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3" />
                  </label>
                  <Button type="submit">Nachweis speichern</Button>
                  {policen.zdrNachweis ? (
                    <Button type="submit" name="entfernen" value="1" variant="ghost">
                      Entfernen
                    </Button>
                  ) : null}
                </form>
              </div>
            </Quelle>
          ) : null}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Kontakte aufs iPhone" />
        <ul className={LISTE}>
          <Quelle
            name="Adressbuch Vertrieb"
            was="Alle Vertriebskontakte mit Nummer als Adressbuch auf dem iPhone: Ruft jemand zurück, steht sein Name da. Nur lesen."
            ok={!!carddav}
            status={carddav ? "Bereit zum Einrichten" : "Aus: CARDDAV_PASSWORD fehlt in Railway"}
            funktion="page-carddav--kontakte-aufs-iphone-adressbuch-vertrieb"
          >
            <p className="text-[color:var(--muted)]">Server</p>
            <CopyField value={`${base}/api/carddav`} />
            <p className="text-[color:var(--muted)]">Benutzername</p>
            <CopyField value={carddav?.benutzer ?? "vertrieb"} />
            <Schritte
              steps={[
                "iPhone: Einstellungen › Apps › Kontakte › Kontakte-Accounts › Account hinzufügen › Andere › CardDAV-Account hinzufügen",
                "Server und Benutzername von hier, Passwort aus Railway (Variable CARDDAV_PASSWORD)",
                "Beschreibung „Vertrieb performancegrowth“, Sichern",
                "Fertig: Anrufer aus dem Vertrieb werden erkannt, Änderungen kommen automatisch",
              ]}
            />
            <p className="text-[color:var(--muted)]">Liste ausblenden: in der Kontakte-App oben links auf Listen, dort „Vertrieb performancegrowth“ abwählen. Anrufer werden trotzdem erkannt.</p>
          </Quelle>
        </ul>
      </Card>

      <Card>
        <CardHeader title="Import" hint={`${contacts.toLocaleString("de-DE")} Kontakte, erkannt über die E-Mail`} />
        <ul className={LISTE}>
          <Quelle name="Agentur- oder Vermittlerliste (CSV)" was="Numbers-Export oder Vermittlerliste, mit Vorschau" funktion="actions-importcontactsaction--agenturliste-csv-importieren">
            <ContactsImport />
          </Quelle>
          <Quelle name="Tagesportion für Instantly (CSV)" was="Gemischte Liste für eine Kampagne">
            <InstantlyPortion proDomain={domainTageslimit()} />
          </Quelle>
        </ul>
      </Card>
    </EinstellungSeite>
  );
}
