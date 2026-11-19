import { CalendarDays, ExternalLink, Pencil, RefreshCw, Trash2, Video } from "lucide-react";
import { Badge, Card, CardHeader, buttonClass } from "@/components/ui";
import { CloseDetailsForm } from "@/components/ui/close-details-on-submit";
import { ConfirmButton } from "@/components/vertrieb/confirm-button";
import { ContactEmails, ContactPhones } from "@/components/vertrieb/contact-merge";
import { WhatsappErlaubt } from "@/components/vertrieb/whatsapp-erlaubt";
import { NieKontaktieren } from "@/components/vertrieb/nie-kontaktieren";
import { KATEGORIE_RECHT, RECHTS_ART_LABEL, istRechtsArt } from "@/lib/vertrieb/datenschutz-recht";
import { AdminRescheduleButton, AdminTerminButton, type TerminTypeOption } from "@/components/termin/admin-termin";
import { adminBookTerminAction, adminRescheduleTerminAction } from "@/app/admin/vertrieb/buchungsseite/actions";
import {
  addReplyManually,
  deleteActivity,
  enrichAddressAction,
  linkContactCustomer,
  setReplySentiment,
  updateActivity,
  updateContactAddress,
  updateCustomer,
  updateLinkedIn,
} from "@/app/admin/vertrieb/actions";
import { ACTIVITY_LABEL, CUSTOMER_LABEL, CUSTOMER_STAGES, SOURCES, isTerminReview, shortName } from "@/lib/vertrieb/crm";
import { dayKey, fmtDate, fmtDateTime, timeKey, todayKey } from "@/lib/vertrieb/dates";
import { stripQuoted } from "@/lib/vertrieb/instantly";
import { LI_LABEL, LI_STATUSES } from "@/lib/vertrieb/linkedin";
import { enrichedLine, waConfirmLabel, type Kontakt, type ladeKontaktakte } from "@/lib/vertrieb/kontaktakte";
import { cn } from "@/lib/utils";
import { TaskRow } from "@/components/vertrieb/ui";
import { Klappe } from "./klappe";

// Karten der Kontaktakte im neuen Admin (src/app/admin/neu/vertrieb/kontakte/[id]/page.tsx). Daten aus
// lib/vertrieb/kontaktakte.ts, Server Actions und Bausteine aus der alten Kontaktakte (app/admin/vertrieb, components/vertrieb).

type Akte = Awaited<ReturnType<typeof ladeKontaktakte>>;

const SENTIMENT: Record<string, { label: string; tone: "success" | "danger" | "info" | "neutral" }> = {
  POSITIV: { label: "positiv", tone: "success" },
  NEGATIV: { label: "negativ", tone: "danger" },
  SPAETER: { label: "später", tone: "info" },
  NEUTRAL: { label: "neutral", tone: "neutral" },
};
const EINORDNUNG: Record<string, string> = { POSITIV: "positiv", SPAETER: "später (Follow-up)", NEUTRAL: "neutral", NEGATIV: "negativ", AUTO: "automatische Antwort" };

const DT = "text-[color:var(--muted)]";
const KLEINER_LINK = "inline-flex min-h-10 items-center gap-1 text-xs font-medium text-[color:var(--brand)] hover:underline sm:min-h-0";

/** Offene Nachfrage „Wie lief der Termin?“: steht oben im Nächsten Schritt statt unter Aufgaben. */
export const offeneNachfrage = (a: Pick<Akte, "open">) => a.open.find((t) => isTerminReview(t.title)) ?? null;

/**
 * Nächster Schritt: kommender Termin mit Meeting-Link und Verschieben, „Termin buchen“ (mit Link zum Entscheidungs-Call).
 * Termine Stufe 2 (Ole, 18.11.2026): offene Nachfrage „Wie lief der Termin?“ ganz oben mit den Ergebnis-Knöpfen (#ergebnis,
 * Ziel des Pushs nach dem Termin, von Mein Tag und von Verkaufen → Termine).
 */
export function NaechsterSchritt({ c, a, termin }: { c: Kontakt; a: Akte; termin: string | null }) {
  const jetzt = new Date();
  const geplant = c.meetings.filter((m) => m.status === "GEPLANT" && m.startAt >= jetzt).reverse();
  const naechster = geplant[0] ?? null;
  const nachfrage = offeneNachfrage(a);
  const naechsteAufgabe = a.open.find((t) => t !== nachfrage) ?? null;
  const frueher = c.meetings.filter((m) => m !== naechster);
  return (
    <Card>
      <CardHeader
        title="Nächster Schritt"
        icon={CalendarDays}
        actions={
          <span data-funktion="buchung-decisionbookinglink--link-entscheidungs-call-kopieren">
            <AdminTerminButton
              action={adminBookTerminAction}
              contactId={c.id}
              contactName={shortName(c.name)}
              email={c.email || null}
              types={a.bookingTypes as TerminTypeOption[]}
              defaultType={a.defaultTermin}
              decisionLink={a.decisionLink}
              oeffnen={termin}
              label="Termin buchen"
              className={buttonClass("secondary", "sm")}
            />
          </span>
        }
      />
      {nachfrage ? (
        <ul id="ergebnis" className="scroll-mt-24 border-b border-[color:var(--border)] bg-[color:var(--brand-soft)]" data-termin-nachfrage>
          <TaskRow t={nachfrage} showContact={false} />
        </ul>
      ) : null}
      <div className="px-5 py-4 text-sm" data-funktion="page-termine--termine-calendly-bzw-buchungsseite-mit-meeting">
        {naechster ? (
          <div>
            <div className="font-semibold">
              {fmtDateTime(naechster.startAt)} {naechster.title}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--muted)]">
              {naechster.inviteeName ? <span>{naechster.inviteeName}</span> : null}
              {naechster.waConfirmStatus ? <span data-wa-confirm={naechster.waConfirmStatus}>WhatsApp-Bestätigung: {waConfirmLabel(naechster.waConfirmStatus)}</span> : null}
              {naechster.utmSource ? <span>Quelle: {naechster.utmSource}</span> : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {naechster.joinUrl ? (
                <a href={naechster.joinUrl} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
                  <Video className="h-3.5 w-3.5" /> Gespräch starten
                </a>
              ) : naechster.location ? (
                <span className="text-xs">{naechster.location}</span>
              ) : null}
              {naechster.bookingTypeId && naechster.manageToken ? (
                <AdminRescheduleButton action={adminRescheduleTerminAction} meetingId={naechster.id} title={`${naechster.title}, ${fmtDateTime(naechster.startAt)}`} startAt={naechster.startAt.toISOString()} />
              ) : null}
            </div>
            {naechster.answers ? <p className="mt-2 whitespace-pre-wrap text-xs text-[color:var(--muted)]">{naechster.answers}</p> : null}
          </div>
        ) : naechsteAufgabe ? (
          <div>
            <div className="font-semibold">{naechsteAufgabe.title}</div>
            <div className="text-xs text-[color:var(--muted)]">Kein Termin geplant · Aufgabe fällig {fmtDate(naechsteAufgabe.dueAt)}</div>
          </div>
        ) : (
          <p className="text-[color:var(--muted)]">{nachfrage ? "Kein Termin geplant." : "Kein Termin und keine offene Aufgabe."}</p>
        )}
      </div>
      {frueher.length ? (
        <details className="border-t border-[color:var(--border)]">
          <summary className="cursor-pointer px-5 py-2.5 text-sm text-[color:var(--muted)]">Alle Termine ({c.meetings.length})</summary>
          <ul className="divide-y divide-[color:var(--border)]">
            {c.meetings.map((m) => {
              const vorbei = m.startAt < jetzt;
              return (
                <li key={m.id} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={m.status === "GEPLANT" ? (vorbei ? "neutral" : "brand") : "danger"}>
                      {m.status === "GEPLANT" ? (vorbei ? "Vergangen" : "Geplant") : m.status === "VERSCHOBEN" ? "Verschoben" : "Abgesagt"}
                    </Badge>
                    <span className={cn("font-medium", m.status !== "GEPLANT" && "text-[color:var(--muted)] line-through")}>{fmtDateTime(m.startAt)}</span>
                    <span className="text-[color:var(--muted)]">{m.title}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-[color:var(--muted)]">
                    {m.inviteeName ? <span>{m.inviteeName} ({m.inviteeEmail})</span> : null}
                    {m.joinUrl ? (
                      <a href={m.joinUrl} target="_blank" rel="noreferrer" className="text-[color:var(--brand)] hover:underline">
                        Meeting-Link
                      </a>
                    ) : m.location ? (
                      <span>{m.location}</span>
                    ) : null}
                    {m.utmSource ? <span>Quelle: {m.utmSource}</span> : null}
                    {m.cancelReason ? <span>Grund: {m.cancelReason}</span> : null}
                    {m.waConfirmStatus ? <span>WhatsApp-Bestätigung: {waConfirmLabel(m.waConfirmStatus)}</span> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}

/** Verlauf: Einträge mit „Bearbeiten“ (Art, Ergebnis, Datum, Notiz) und „Löschen“; ältere eingeklappt. */
export function Verlauf({ c }: { c: Kontakt }) {
  const zeile = (x: Kontakt["activities"][number]) => (
    <li key={x.id} className="px-5 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{ACTIVITY_LABEL[x.type]}</Badge>
        {x.outcome ? <span className="font-medium">{x.outcome}</span> : null}
        <span className="ml-auto text-xs text-[color:var(--muted)]">{fmtDateTime(x.occurredAt)}</span>
      </div>
      {x.note ? <p className="mt-1 whitespace-pre-wrap text-[color:var(--muted)]">{x.note}</p> : null}
      <details className="mt-1">
        <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 text-xs text-[color:var(--muted)] hover:text-[color:var(--foreground)] [&::-webkit-details-marker]:hidden">
          <Pencil className="h-3 w-3" /> Bearbeiten
        </summary>
        <CloseDetailsForm
          key={`${x.outcome}-${x.note}-${x.occurredAt.getTime()}-${x.type}`}
          action={updateActivity}
          className="mt-2 grid grid-cols-1 gap-2 rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] p-3 sm:grid-cols-[130px_1fr_140px_100px]"
        >
          <input type="hidden" name="id" value={x.id} />
          <select name="type" defaultValue={x.type} className="input" aria-label="Art">
            {Object.entries(ACTIVITY_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <input name="outcome" defaultValue={x.outcome ?? ""} placeholder="Ergebnis" className="input" />
          <input name="date" type="date" defaultValue={dayKey(x.occurredAt)} className="input" required aria-label="Datum" />
          <input name="time" type="time" defaultValue={timeKey(x.occurredAt)} className="input" aria-label="Uhrzeit" />
          <textarea name="note" rows={3} defaultValue={x.note ?? ""} placeholder="Notiz" className="input sm:col-span-4" />
          <div className="flex justify-between gap-2 sm:col-span-4">
            <button className="btn-primary">Speichern</button>
            <ConfirmButton formAction={deleteActivity} message="Diesen Verlaufseintrag wirklich löschen?" className={buttonClass("danger", "md")}>
              <Trash2 className="h-4 w-4" /> Löschen
            </ConfirmButton>
          </div>
        </CloseDetailsForm>
      </details>
    </li>
  );
  const erste = c.activities.slice(0, 8);
  const rest = c.activities.slice(8);
  return (
    <Card>
      <CardHeader title="Verlauf" count={c.activities.length} />
      <div data-funktion="actions-updateactivity--verlaufseintrag-bearbeiten-oder-loeschen">
        {c.activities.length ? (
          <ol className="divide-y divide-[color:var(--border)]">{erste.map(zeile)}</ol>
        ) : (
          <p className="px-5 py-4 text-sm text-[color:var(--muted)]">Noch keine Aktivitäten. Oben erfassen.</p>
        )}
        {rest.length ? (
          <details className="border-t border-[color:var(--border)]">
            <summary className="cursor-pointer px-5 py-2.5 text-sm text-[color:var(--muted)]">Ältere Einträge ({rest.length})</summary>
            <ol className="divide-y divide-[color:var(--border)]">{rest.map(zeile)}</ol>
          </details>
        ) : null}
      </div>
    </Card>
  );
}

function AntwortEinfuegen({ contactId }: { contactId: string }) {
  return (
    <form action={addReplyManually} className="space-y-2" data-funktion="actions-addreplymanually--antwort-auf-cold-mail-von-hand-einfuegen">
      <input type="hidden" name="contactId" value={contactId} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_150px]">
        <input name="subject" placeholder="Betreff" className="input" />
        <input name="date" type="date" defaultValue={todayKey()} className="input" aria-label="Datum" />
      </div>
      <textarea name="text" rows={4} required placeholder="Antworttext hier einfügen" className="input" />
      <button className="btn-ghost">Antwort speichern</button>
    </form>
  );
}

/** Cold Mails: Kampagnen (geöffnet, bounced, abgemeldet), Antworten mit Einordnung, Antwort von Hand einfügen. */
export function ColdMails({ c }: { c: Kontakt }) {
  const antworten = c.campaigns.reduce((n, x) => n + x.replyCount, 0);
  const info = c.campaigns.length
    ? `${c.campaigns.length} Kampagne${c.campaigns.length === 1 ? "" : "n"} · ${antworten} Antwort${antworten === 1 ? "" : "en"}`
    : c.emails.length
      ? `${c.emails.length} Mails`
      : "keine";
  return (
    <Klappe titel="Cold Mails" info={info} offen={c.emails.some((e) => e.direction === "IN" && !e.isAutoReply)} id="antworten" data-funktion="page-fold-cold-mails--cold-mail-kampagnen-des-kontakts-geoeffnet">
      {c.campaigns.length ? (
        <ul className="space-y-2 px-5 py-4 text-sm">
          {c.campaigns.map((cl) => (
            <li key={cl.id} className="rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] p-3">
              <div className="font-medium">{cl.campaign.name}</div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[color:var(--muted)]">
                <span>{cl.sentAt ? `Gesendet ${fmtDate(cl.sentAt)}` : "Noch nicht gesendet"}</span>
                {cl.status ? <span>Status: {cl.status}</span> : null}
                <span>{cl.openCount}× geöffnet</span>
                <span className={cl.replyCount ? "font-medium text-emerald-700" : ""}>{cl.replyCount}× Antwort</span>
                {cl.clickCount > 0 ? <span>{cl.clickCount}× Klick</span> : null}
                {cl.bounced ? <span className="text-rose-600">Bounced</span> : null}
                {cl.unsubscribed ? <span className="text-rose-600">Abgemeldet</span> : null}
                {cl.interest ? <span>Interesse: {cl.interest}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {c.emails.length ? (
        <ol className="divide-y divide-[color:var(--border)] border-t border-[color:var(--border)]" data-funktion="actions-setreplysentiment--antworten-auf-cold-mails-ansehen-stimmung-setzen">
          {c.emails.map((e) => {
            const body = e.text ?? "";
            const main = stripQuoted(body);
            const quoted = body.length > main.length + 5 ? body.slice(main.length).trim() : "";
            return (
              <li key={e.id} className="px-5 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={e.direction === "OUT" ? "info" : e.isAutoReply ? "neutral" : "success"}>{e.direction === "OUT" ? "Gesendet" : e.isAutoReply ? "Auto-Reply" : "Antwort"}</Badge>
                  {e.direction === "IN" && e.rechtsArt ? (
                    <Badge tone="danger">
                      {KATEGORIE_RECHT}: {istRechtsArt(e.rechtsArt) ? RECHTS_ART_LABEL[e.rechtsArt] : e.rechtsArt}
                    </Badge>
                  ) : e.direction === "IN" && !e.isAutoReply && e.sentiment && SENTIMENT[e.sentiment] ? (
                    <Badge tone={SENTIMENT[e.sentiment].tone}>{SENTIMENT[e.sentiment].label}</Badge>
                  ) : null}
                  <span className="font-medium">{e.subject || "(ohne Betreff)"}</span>
                  <span className="ml-auto text-xs text-[color:var(--muted)]">{fmtDateTime(e.sentAt)}</span>
                </div>
                <div className="mt-0.5 text-xs text-[color:var(--muted)]">
                  {e.fromEmail}
                  {e.campaign ? ` · Kampagne: ${e.campaign}` : ""}
                </div>
                <p className="mt-2 whitespace-pre-wrap">{main || "(kein Text)"}</p>
                {/* Datenschutz/Recht bleibt so eingeordnet (nie „neutral“), Fall und Vorlagen oben in der Akte */}
                {e.direction === "IN" && !e.rechtsArt ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-[color:var(--muted)]">
                    Einordnung:
                    {(["POSITIV", "SPAETER", "NEUTRAL", "NEGATIV", "AUTO"] as const)
                      .filter((x) => (x === "AUTO" ? !e.isAutoReply : e.isAutoReply || x !== e.sentiment))
                      .map((x) => (
                        <form key={x} action={setReplySentiment}>
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="sentiment" value={x} />
                          <button className={buttonClass("secondary", "sm")}>{EINORDNUNG[x]}</button>
                        </form>
                      ))}
                  </div>
                ) : null}
                {quoted ? (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-[color:var(--muted)]">Zitierten Verlauf anzeigen</summary>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-[color:var(--muted)]">{quoted}</p>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
      <details className="border-t border-[color:var(--border)]">
        <summary className="cursor-pointer px-5 py-2.5 text-sm text-[color:var(--muted)]">Antwort von Hand einfügen</summary>
        <div className="px-5 pb-4">
          <AntwortEinfuegen contactId={c.id} />
        </div>
      </details>
    </Klappe>
  );
}

/** Stammdaten: Name, E-Mails und Telefonnummern (mit Quelle, Haupt-Adresse, weitere), Adresse und LinkedIn bearbeiten. */
export function Stammdaten({ c, a }: { c: Kontakt; a: Akte }) {
  const adresse = [c.street, [c.zip, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return (
    <Card>
      <CardHeader title="Stammdaten" hint={a.extrasSummary || undefined} />
      <dl
        className="grid grid-cols-[116px_minmax(0,1fr)] gap-x-3 gap-y-2 px-5 py-4 text-sm"
        data-funktion="page-stammdaten--stammdaten-agenturtyp-versicherer-inhaber actions-updatecontact--kontakt-felder-allgemein-aendern-ohne"
      >
        <dt className={DT}>Name</dt>
        <dd className="min-w-0 break-words">{c.name}</dd>
        {c.firstName || c.lastName ? (
          <>
            <dt className={DT}>Ansprechpartner</dt>
            <dd>{[c.salutation, c.firstName, c.lastName].filter(Boolean).join(" ")}</dd>
          </>
        ) : null}
        <dt className={DT}>E-Mail</dt>
        <dd className="min-w-0" data-funktion="actions-addcontactemailaction--weitere-e-mail-hinzufuegen-entfernen-zur-haupt-e actions-updateprimaryemailaction--haupt-e-mail-korrigieren">
          <ContactEmails contactId={c.id} email={c.email} altEmails={c.altEmails} sources={a.emailSources} />
          <NieKontaktieren contactId={c.id} seit={c.nieKontaktierenAt} grund={c.nieKontaktierenGrund} />
        </dd>
        <dt className={DT}>Telefon</dt>
        <dd className="min-w-0">
          <ContactPhones contactId={c.id} phone={c.phone} extras={a.extraPhones} />
          {c.phone ? <WhatsappErlaubt contactId={c.id} erlaubt={a.whatsappErlaubt.erlaubt} quelle={a.whatsappErlaubt.quelle} /> : null}
        </dd>
        <dt className={DT}>Adresse</dt>
        <dd className="min-w-0" data-funktion="actions-updatecontactaddress--adresse-und-telefon-bearbeiten">
          <span>{adresse || <span className={DT}>keine Adresse</span>}</span>
          <details className="mt-0.5">
            <summary className={cn(KLEINER_LINK, "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
              <Pencil className="h-3 w-3" /> Adresse und Telefon bearbeiten
            </summary>
            <CloseDetailsForm
              key={`${c.street}-${c.zip}-${c.city}-${c.phone}`}
              action={updateContactAddress}
              className="mt-2 grid grid-cols-1 gap-2 rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] p-3 sm:grid-cols-[90px_1fr]"
            >
              <input type="hidden" name="contactId" value={c.id} />
              <input name="street" defaultValue={c.street ?? ""} placeholder="Straße und Hausnummer" className="input sm:col-span-2" />
              <input name="zip" defaultValue={c.zip ?? ""} placeholder="PLZ" inputMode="numeric" className="input" />
              <input name="city" defaultValue={c.city ?? ""} placeholder="Ort" className="input" />
              <input name="phone" defaultValue={c.phone ?? ""} placeholder="Telefon" className="input sm:col-span-2" />
              <div className="sm:col-span-2">
                <button className="btn-primary">Speichern</button>
              </div>
            </CloseDetailsForm>
          </details>
        </dd>
        <dt className={DT}>LinkedIn</dt>
        <dd className="min-w-0" data-funktion="actions-updatelinkedin--linkedin-status-und-profil-url-pflegen">
          <span className="flex flex-wrap items-center gap-2">
            {c.linkedinStatus ? <Badge tone="brand">{LI_LABEL[c.linkedinStatus]}</Badge> : <span className={DT}>kein Status</span>}
            {c.linkedinUrl ? (
              <a href={c.linkedinUrl} target="_blank" rel="noreferrer" className={KLEINER_LINK}>
                Profil <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </span>
          <span className="mt-1 flex flex-wrap gap-x-3 text-xs text-[color:var(--muted)]">
            {c.linkedinRequestAt ? <span>Anfrage {fmtDate(c.linkedinRequestAt)}</span> : null}
            {c.linkedinConnectedAt ? <span>Vernetzt {fmtDate(c.linkedinConnectedAt)}</span> : null}
            {c.linkedinMessageAt ? <span>Nachricht {fmtDate(c.linkedinMessageAt)}</span> : null}
            {c.linkedinReplyAt ? <span className="font-medium text-emerald-700">Antwort {fmtDate(c.linkedinReplyAt)}</span> : null}
            {c.linkedinList ? <span>Liste: {c.linkedinList}</span> : null}
            {c.linkedinTags ? <span>Tags: {c.linkedinTags}</span> : null}
          </span>
          <details className="mt-0.5">
            <summary className={cn(KLEINER_LINK, "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
              <Pencil className="h-3 w-3" /> LinkedIn bearbeiten
            </summary>
            <CloseDetailsForm key={`${c.linkedinStatus}-${c.linkedinUrl}`} action={updateLinkedIn} className="mt-2 grid grid-cols-1 gap-2 rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] p-3">
              <input type="hidden" name="contactId" value={c.id} />
              <input name="linkedinUrl" defaultValue={c.linkedinUrl ?? ""} placeholder="https://www.linkedin.com/in/…" className="input" aria-label="LinkedIn-Profil" />
              <select name="linkedinStatus" defaultValue={c.linkedinStatus ?? ""} className="input" aria-label="LinkedIn-Status">
                <option value="">Kein Status</option>
                {LI_STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <div>
                <button className="btn-primary">Speichern</button>
              </div>
            </CloseDetailsForm>
          </details>
        </dd>
        {c.legacyStatus ? (
          <>
            <dt className={DT}>Alter Status</dt>
            <dd className="text-xs">{c.legacyStatus}</dd>
          </>
        ) : null}
      </dl>
    </Card>
  );
}

/** Agentur: Bewertung, Öffnungszeiten, Typ, Versicherer, Inhaber, Team, Potenzial, Social; „Neu auswerten“ (Website, Google). */
export function Agentur({ c }: { c: Kontakt }) {
  const ergaenzt = enrichedLine(c.enrichment, fmtDate);
  const social = (
    [
      ["Webseite", c.url],
      ["Google Maps", c.googleMapsUrl],
      ["LinkedIn", c.linkedinUrl],
      ["Facebook", c.facebookUrl],
      ["Instagram", c.instagramUrl],
      ["XING", c.xingUrl],
    ] as const
  ).filter(([, u]) => u);
  const zeilen: [string, React.ReactNode][] = [
    ...(c.agencyType ? [["Agenturtyp", c.agencyType === "GENERAL" ? "Generalvertretung" : c.agencyType === "HAUPT" ? "Hauptvertretung" : c.agencyType] as [string, React.ReactNode]] : []),
    ...(c.insurer ? [["Versicherer", c.insurer] as [string, React.ReactNode]] : []),
    ...(c.leaderNames ? [["Inhaber", c.leaderNames] as [string, React.ReactNode]] : []),
    ...(c.teamSize != null ? [["Teamgröße", String(c.teamSize)] as [string, React.ReactNode]] : []),
    ...(c.potentialScore != null ? [["Potenzial", String(c.potentialScore)] as [string, React.ReactNode]] : []),
    ...(c.fax ? [["Fax", c.fax] as [string, React.ReactNode]] : []),
  ];
  return (
    <Card>
      <CardHeader
        title="Agentur"
        actions={
          <form action={enrichAddressAction} data-funktion="actions-enrichaddressaction--website-und-google-neu-auswerten-adresse">
            <input type="hidden" name="id" value={c.id} />
            <button className={buttonClass("ghost", "sm")} title="Website und Google erneut auswerten: Adresse, Öffnungszeiten, Bewertung, Social-Links (nur leere Felder)">
              <RefreshCw className="h-3.5 w-3.5" /> Neu auswerten
            </button>
          </form>
        }
      />
      <div className="space-y-3 px-5 py-4 text-sm">
        {c.ratingValue != null ? (
          <div data-kontakt-rating>
            <span className="text-amber-600">
              {"★".repeat(Math.round(c.ratingValue))}
              {"☆".repeat(Math.max(0, 5 - Math.round(c.ratingValue)))}
            </span>{" "}
            {c.ratingValue.toLocaleString("de-DE")} <span className={DT}>({c.ratingCount ?? 0} Google-Bewertungen)</span>
          </div>
        ) : null}
        {c.businessStatus === "CLOSED_PERMANENTLY" ? <Badge tone="danger">laut Google dauerhaft geschlossen</Badge> : null}
        {c.openingHours ? (
          <details>
            <summary className="cursor-pointer text-[color:var(--muted)]">
              {c.openingHours.split("\n")[0]}
              {c.openingHours.includes("\n") ? " …" : ""}
            </summary>
            <p className="mt-1 whitespace-pre-line text-xs text-[color:var(--muted)]">{c.openingHours}</p>
          </details>
        ) : null}
        {zeilen.length ? (
          <dl className="grid grid-cols-[116px_minmax(0,1fr)] gap-x-3 gap-y-1.5">
            {zeilen.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className={DT}>{k}</dt>
                <dd className="min-w-0 break-words">{v}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {social.length ? (
          <div className="flex flex-wrap gap-1.5">
            {social.map(([l, u]) => (
              <a key={l} href={u!} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
                {l}
              </a>
            ))}
          </div>
        ) : null}
        {!c.ratingValue && !c.openingHours && !zeilen.length && !social.length ? <p className={DT}>Noch keine Angaben. „Neu auswerten“ liest Webseite und Google.</p> : null}
        {ergaenzt ? <p className="text-xs text-[color:var(--muted)]">{ergaenzt}</p> : null}
      </div>
    </Card>
  );
}

/** Kundendaten (selten): Kunden-Stufe, Monatswert, Produkte, Vertragsstart, Herkunft; Verknüpfung mit der Kundenakte. */
export function Kundendaten({ c, a }: { c: Kontakt; a: Akte }) {
  return (
    <Klappe
      titel="Kundendaten"
      info={c.customerStage ? `${CUSTOMER_LABEL[c.customerStage]}${c.monthlyValue ? ` · ${c.monthlyValue} €/Monat` : ""}` : "noch kein Kunde"}
      data-funktion="actions-updatecustomer--kundendaten-kunden-stufe-monatswert-produkte actions-linkcontactcustomer--kontakt-mit-kundenakte-verknuepfen"
    >
      <div className="px-5 py-4">
        <form key={`${c.customerStage}-${c.monthlyValue}-${c.products}-${c.customerSource}-${c.customerSourceNote}`} action={updateCustomer} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input type="hidden" name="contactId" value={c.id} />
          <div>
            <label className="label" htmlFor="kd-stufe">Kunden-Stufe</label>
            <select id="kd-stufe" name="customerStage" defaultValue={c.customerStage ?? ""} className="input">
              <option value="">{c.customerStage ? "keine" : "Noch kein Kunde"}</option>
              {CUSTOMER_STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="kd-wert">Monatswert (€)</label>
            <input id="kd-wert" name="monthlyValue" inputMode="numeric" defaultValue={c.monthlyValue ?? ""} placeholder="z. B. 1250" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="kd-produkte">Produkte</label>
            <input id="kd-produkte" name="products" defaultValue={c.products ?? ""} placeholder="PKV, TKV, Leben" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="kd-start">Vertragsstart</label>
            <input id="kd-start" name="contractStart" type="date" defaultValue={c.contractStart ? dayKey(c.contractStart) : ""} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="kd-quelle">Gewonnen über{a.suggested && !c.customerSource ? " (Vorschlag)" : ""}</label>
            <select id="kd-quelle" name="customerSource" defaultValue={c.customerSource ?? a.suggested?.source ?? ""} className="input">
              <option value="">bitte wählen</option>
              {SOURCES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="kd-notiz">Details zur Herkunft</label>
            <input id="kd-notiz" name="customerSourceNote" defaultValue={c.customerSourceNote ?? a.suggested?.note ?? ""} placeholder="z. B. Empfehlung von Hr. Müller" className="input" />
          </div>
          <button className="btn-ghost sm:col-span-2">{c.customerStage ? "Speichern" : "Als Kunde speichern"}</button>
        </form>
        {c.customerSince ? <p className="mt-2 text-xs text-[color:var(--muted)]">Aktiver Kunde seit {fmtDate(c.customerSince)}</p> : null}
        <form action={linkContactCustomer} className="mt-3 flex flex-wrap items-end gap-2 border-t border-[color:var(--border)] pt-3">
          <input type="hidden" name="contactId" value={c.id} />
          <label className="min-w-0 flex-1">
            <span className="label">Kundenakte</span>
            <select name="customerId" defaultValue={c.customerId ?? ""} className="input">
              <option value="">Nicht verknüpft</option>
              {a.linkable.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-ghost">{c.customerId ? "Verknüpfung ändern" : "Mit Kundenakte verknüpfen"}</button>
        </form>
      </div>
    </Klappe>
  );
}
