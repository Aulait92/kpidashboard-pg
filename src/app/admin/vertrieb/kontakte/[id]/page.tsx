import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ACTIVITY_LABEL, CUSTOMER_COLOR, CUSTOMER_LABEL, CUSTOMER_STAGES, SOURCES, SOURCE_COLOR, SOURCE_LABEL, LOSS_LABEL, shortName } from "@/lib/vertrieb/crm";
import { dayKey, fmtDate, fmtDateTime, timeKey, todayKey } from "@/lib/vertrieb/dates";
import { stripQuoted } from "@/lib/vertrieb/instantly";
import { TaskRow } from "@/components/vertrieb/ui";
import { ContactMore, Fold, StagePicker } from "@/components/vertrieb/contact-controls";
import { Mail, Phone } from "lucide-react";
import { ActivityForm } from "@/components/vertrieb/activity-form";
import { Collapsible } from "@/components/vertrieb/collapsible";
import { TaskForm } from "@/components/vertrieb/task-form";
import { addReplyManually, deleteActivity, linkContactCustomer, updateActivity, setReplySentiment, updateCustomer, updateLinkedIn } from "@/app/admin/vertrieb/actions";
import { LI_LABEL, LI_STATUSES } from "@/lib/vertrieb/linkedin";
import { ConfirmButton } from "@/components/vertrieb/confirm-button";
import { taskInclude } from "@/lib/vertrieb/queries";
import { guessSource } from "@/lib/vertrieb/source";
import { DealOffersCard } from "@/components/deal-offers-card";
import { toOfferRow } from "@/lib/offer-links";
import { getAppUrl } from "@/lib/email";
import { loadOnboarding, onboardingChecklist } from "@/lib/onboarding";
import { OnboardingCard, StartOnboardingCard } from "@/components/vertrieb/onboarding-card";
import type { ImpressumInfo } from "@/lib/impressum";
import { BackToList } from "@/components/admin/list-memory";
import { isAdminNewUi } from "@/lib/admin-ui";
import { VERTRIEB_LISTS } from "@/lib/admin-lists";

export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ embedded?: string }> }) {
  const { id } = await params;
  // embedded = in der Kundenakte (/admin/kunden/[id]) eingebettet.
  const embedded = (await searchParams).embedded === "1";
  const c = await prisma.salesContact.findUnique({
    where: { id },
    include: {
      activities: { orderBy: { occurredAt: "desc" } },
      tasks: { include: taskInclude, orderBy: [{ doneAt: { sort: "desc", nulls: "first" } }, { dueAt: "asc" }] },
      campaigns: { include: { campaign: true }, orderBy: { sentAt: "desc" } },
      emails: { orderBy: { sentAt: "desc" } },
      meetings: { orderBy: { startAt: "desc" } },
      offers: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!c) notFound();
  // Kunden haben eine eigene Akte mit allen Reitern.
  if (c.customerId && !embedded) redirect(`/admin/kunden/${c.customerId}`);
  const open = c.tasks.filter((t) => !t.doneAt);
  const suggested = c.customerSource ? null : await guessSource(c.id);
  const done = c.tasks.filter((t) => t.doneAt).slice(0, 10);
  const onboarding = c.customerId ? await loadOnboarding({ customerId: c.customerId }) : null;
  const obOffer = onboarding?.offerId ? c.offers.find((o) => o.id === onboarding.offerId) ?? null : null;
  const acceptedOffer = c.offers.find((o) => o.status === "accepted") ?? null;
  const freeCustomers =
    !onboarding && acceptedOffer
      ? await prisma.customer.findMany({ where: { onboarding: null, plan: { not: "internal" }, archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : [];
  // Kundenakten für „Mit Kundenakte verknüpfen“: noch mit keinem Kontakt verknüpft (+ die eigene)
  const linkable = await prisma.customer.findMany({
    where: { archived: false, plan: { not: "internal" }, OR: [{ salesContact: null }, { id: c.customerId ?? "-" }] },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  let appUrl = "";
  try {
    appUrl = getAppUrl();
  } catch {
    appUrl = "";
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {embedded ? null : (
            <>
              {(await isAdminNewUi()) ? (
                <BackToList id="vertrieb" fallback="/admin/vertrieb/kontakte" allowed={VERTRIEB_LISTS} className="text-sm text-slate-500 hover:underline">
                  ← Zurück
                </BackToList>
              ) : (
                <Link href="/admin/vertrieb/kontakte" className="text-sm text-slate-500 hover:underline">← Kontakte</Link>
              )}
              <h1 className="mt-1 text-2xl font-semibold">{shortName(c.name)}</h1>
            </>
          )}
          {(c.firstName || c.leaderNames) && (
            <p className="text-sm text-slate-600">
              Ansprechpartner: {[c.salutation, c.firstName, c.lastName].filter(Boolean).join(" ")}
              {c.leaderNames && c.leaderNames !== [c.firstName, c.lastName].filter(Boolean).join(" ") && <span className="text-slate-400"> · Inhaber: {c.leaderNames}</span>}
            </p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            <StagePicker contactId={c.id} stage={c.stage} competitor={c.competitor} />
            {c.customerStage && <span className={`badge ${CUSTOMER_COLOR[c.customerStage]}`}>Kunde: {CUSTOMER_LABEL[c.customerStage]}</span>}
            {c.customerSource && <span className={`badge ${SOURCE_COLOR[c.customerSource]}`}>über {SOURCE_LABEL[c.customerSource]}</span>}
            {c.lossReason && <span className="badge bg-rose-50 text-rose-700">{LOSS_LABEL[c.lossReason]}</span>}
            {c.competitor && <span className="badge bg-slate-100 text-slate-600">{c.competitor}</span>}
            <span>{c.street}, {c.zip} {c.city}</span>
            <span>{c.callAttempts} Anrufversuch{c.callAttempts === 1 ? "" : "e"}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.phone && (
            <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="btn-primary">
              <Phone className="h-4 w-4" /> {c.phone}
            </a>
          )}
          <a href={`mailto:${c.email}`} className="btn-ghost">
            <Mail className="h-4 w-4" /> E-Mail
          </a>
          <ContactMore contactId={c.id} name={shortName(c.name)} url={c.url} linkedinUrl={c.linkedinUrl} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-5">
          <section className="card p-4">
            <h2 className="mb-3 font-medium">Aktivität erfassen</h2>
            <ActivityForm contactId={c.id} hasOpenTasks={open.length > 0} />
          </section>

          {c.emails.length === 0 ? (
            <Fold title="Antworten auf Cold Mails" summary="keine">
              <p className="mb-2 text-sm text-slate-500">Antwort manuell einfügen:</p>
              <form action={addReplyManually} className="space-y-2">
                <input type="hidden" name="contactId" value={c.id} />
                <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
                  <input name="subject" placeholder="Betreff" className="input" />
                  <input name="date" type="date" defaultValue={todayKey()} className="input" />
                </div>
                <textarea name="text" rows={4} required placeholder="Antworttext hier einfügen" className="input" />
                <button className="btn-ghost">Antwort speichern</button>
              </form>
            </Fold>
          ) : (
          <Collapsible
            id="antworten"
            title={<>Antworten auf Cold Mails <span className="font-normal text-slate-400">({c.emails.length})</span></>}
          >
            {c.emails.length > 0 && (
              <ol className="divide-y divide-slate-100">
                {c.emails.map((e) => {
                  const body = e.text ?? "";
                  const main = stripQuoted(body);
                  const quoted = body.length > main.length + 5 ? body.slice(main.length).trim() : "";
                  return (
                    <li key={e.id} className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`badge ${e.isAutoReply ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-800"}`}>
                          {e.isAutoReply ? "Auto-Reply" : "Antwort"}
                        </span>
                        {!e.isAutoReply && e.sentiment && (
                          <span className={`badge ${e.sentiment === "POSITIV" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : e.sentiment === "NEGATIV" ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200" : "bg-slate-50 text-slate-500 ring-1 ring-slate-200"}`}>
                            {e.sentiment === "POSITIV" ? "positiv" : e.sentiment === "NEGATIV" ? "negativ" : "neutral"}
                          </span>
                        )}
                        <span className="font-medium">{e.subject || "(ohne Betreff)"}</span>
                        <span className="ml-auto text-xs text-slate-400">{fmtDateTime(e.sentAt)}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400">
                        {e.fromEmail}{e.campaign ? ` · Kampagne: ${e.campaign}` : ""}
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-slate-700">{main || "(kein Text)"}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-slate-400">
                        Einordnung ändern:
                        {(["POSITIV", "NEUTRAL", "NEGATIV", "AUTO"] as const)
                          .filter((x) => (x === "AUTO" ? !e.isAutoReply : e.isAutoReply || x !== e.sentiment))
                          .map((x) => (
                            <form key={x} action={setReplySentiment}>
                              <input type="hidden" name="id" value={e.id} />
                              <input type="hidden" name="sentiment" value={x} />
                              <button className="btn-ghost px-2 py-0.5 text-xs">
                                {x === "POSITIV" ? "👍 positiv" : x === "NEGATIV" ? "👎 negativ" : x === "AUTO" ? "🤖 automatische Antwort" : "neutral"}
                              </button>
                            </form>
                          ))}
                      </div>
                      {quoted && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-slate-400">Zitierten Verlauf anzeigen</summary>
                          <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500">{quoted}</p>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
            <details className="border-t border-slate-100">
              <summary className="cursor-pointer px-4 py-2 text-sm text-slate-500">Antwort manuell einfügen</summary>
              <form action={addReplyManually} className="space-y-2 px-4 pb-4">
                <input type="hidden" name="contactId" value={c.id} />
                <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
                  <input name="subject" placeholder="Betreff" className="input" />
                  <input name="date" type="date" defaultValue={todayKey()} className="input" />
                </div>
                <textarea name="text" rows={4} required placeholder="Antworttext hier einfügen" className="input" />
                <button className="btn-ghost">Antwort speichern</button>
              </form>
            </details>
          </Collapsible>
          )}

          <Collapsible id="verlauf" title={<>Verlauf <span className="font-normal text-slate-400">({c.activities.length})</span></>}>
            <ol className="divide-y divide-slate-100">
              {c.activities.map((a) => (
                <li key={a.id} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge bg-slate-100 text-slate-700">{ACTIVITY_LABEL[a.type]}</span>
                    {a.outcome && <span className="font-medium">{a.outcome}</span>}
                    <span className="ml-auto text-xs text-slate-400">{fmtDateTime(a.occurredAt)}</span>
                  </div>
                  {a.note && <p className="mt-1 whitespace-pre-wrap text-slate-600">{a.note}</p>}
                  <details className="mt-1">
                    <summary className="cursor-pointer list-none text-xs text-slate-400 hover:text-slate-600 [&::-webkit-details-marker]:hidden">✎ Bearbeiten</summary>
                    <form key={`${a.outcome}-${a.note}-${a.occurredAt.getTime()}-${a.type}`} action={updateActivity} className="mt-2 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[130px_1fr_140px_100px]">
                      <input type="hidden" name="id" value={a.id} />
                      <select name="type" defaultValue={a.type} className="input">
                        {Object.entries(ACTIVITY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                      <input name="outcome" defaultValue={a.outcome ?? ""} placeholder="Ergebnis" className="input" />
                      <input name="date" type="date" defaultValue={dayKey(a.occurredAt)} className="input" required />
                      <input name="time" type="time" defaultValue={timeKey(a.occurredAt)} className="input" />
                      <textarea name="note" rows={3} defaultValue={a.note ?? ""} placeholder="Notiz" className="input sm:col-span-4" />
                      <div className="flex justify-between gap-2 sm:col-span-4">
                        <button className="btn-primary">Speichern</button>
                        <ConfirmButton formAction={deleteActivity} message="Diesen Verlaufseintrag wirklich löschen?" className="btn-ghost text-rose-600 hover:bg-rose-50">
                          🗑 Eintrag löschen
                        </ConfirmButton>
                      </div>
                    </form>
                  </details>
                </li>
              ))}
              {!c.activities.length && <li className="px-4 py-6 text-center text-sm text-slate-500">Noch keine Aktivitäten.</li>}
            </ol>
          </Collapsible>
        </div>

        <div className="space-y-5">
          {onboarding ? (
            <OnboardingCard
              onboarding={onboarding}
              items={onboardingChecklist(onboarding, obOffer)}
              customerName={onboarding.customer.name}
              loginEmail={onboarding.customer.users[0]?.email ?? null}
              feedback={await prisma.customerFeedback.findMany({ where: { customerId: onboarding.customerId }, orderBy: { sentAt: "asc" } })}
              websiteInfo={(onboarding.websiteInfo ?? null) as ImpressumInfo | null}
            />
          ) : acceptedOffer ? (
            <StartOnboardingCard offerId={acceptedOffer.id} offerNumber={acceptedOffer.number} customers={freeCustomers} />
          ) : null}


          <div id="angebot">
            <DealOffersCard
              newOfferHref={`/admin/vertrieb/kontakte/${c.id}/angebot`}
              appUrl={appUrl}
              offers={c.offers.map(toOfferRow)}
            />
          </div>

          {c.meetings.length > 0 && (
            <section className="card">
              <h2 className="border-b border-slate-100 px-4 py-3 font-medium">Termine (Calendly)</h2>
              <ul className="divide-y divide-slate-100">
                {c.meetings.map((m) => {
                  const past = m.startAt < new Date();
                  return (
                    <li key={m.id} className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`badge ${m.status === "GEPLANT" ? (past ? "bg-slate-100 text-slate-600" : "bg-indigo-100 text-indigo-800") : "bg-rose-50 text-rose-700"}`}>
                          {m.status === "GEPLANT" ? (past ? "Vergangen" : "Geplant") : m.status === "VERSCHOBEN" ? "Verschoben" : "Abgesagt"}
                        </span>
                        <span className={`font-medium ${m.status !== "GEPLANT" ? "text-slate-400 line-through" : ""}`}>{fmtDateTime(m.startAt)}</span>
                        <span className="text-slate-600">{m.title}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                        {m.inviteeName && <span>{m.inviteeName} ({m.inviteeEmail})</span>}
                        {m.joinUrl ? <a href={m.joinUrl} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">Meeting-Link ↗</a> : m.location && <span>{m.location}</span>}
                        {m.utmSource && <span>Quelle: {m.utmSource}</span>}
                        {m.cancelReason && <span>Grund: {m.cancelReason}</span>}
                      </div>
                      {m.answers && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500">{m.answers}</p>}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="card">
            <h2 className="border-b border-slate-100 px-4 py-3 font-medium">Aufgaben</h2>
            {open.length > 0 && <ul className="divide-y divide-slate-100">{open.map((t) => <TaskRow key={t.id} t={t} showContact={false} />)}</ul>}
            {!open.length ? <p className="px-4 py-4 text-sm text-slate-500">Keine offenen Aufgaben.</p> : null}
            <details className="group border-t border-slate-100">
              <summary className="cursor-pointer list-none px-4 py-2.5 text-sm font-medium text-[color:var(--brand)] [&::-webkit-details-marker]:hidden">+ Neue Aufgabe</summary>
              <div className="px-4 pb-4"><TaskForm contactId={c.id} compact /></div>
            </details>
            {done.length > 0 && (
              <details className="border-t border-slate-100">
                <summary className="cursor-pointer px-4 py-2 text-sm text-slate-500">Erledigt ({done.length})</summary>
                <ul className="divide-y divide-slate-100">{done.map((t) => <TaskRow key={t.id} t={t} showContact={false} />)}</ul>
              </details>
            )}
          </section>

          {c.campaigns.length ? (
            <Fold title="Cold Mails" summary={`${c.campaigns.length} Kampagne${c.campaigns.length === 1 ? "" : "n"} · ${c.campaigns.reduce((n, x) => n + x.replyCount, 0)} Antworten`}>
              <ul className="space-y-2 text-sm">
                {c.campaigns.map((cl) => (
                  <li key={cl.id} className="rounded-lg bg-slate-50 p-3">
                    <div className="font-medium">{cl.campaign.name}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                      <span>{cl.sentAt ? `Gesendet ${fmtDate(cl.sentAt)}` : "Noch nicht gesendet"}</span>
                      {cl.status && <span>Status: {cl.status}</span>}
                      <span>{cl.openCount}× geöffnet</span>
                      <span className={cl.replyCount ? "font-medium text-emerald-700" : ""}>{cl.replyCount}× Antwort</span>
                      {cl.clickCount > 0 && <span>{cl.clickCount}× Klick</span>}
                      {cl.bounced && <span className="text-rose-600">Bounced</span>}
                      {cl.unsubscribed && <span className="text-rose-600">Abgemeldet</span>}
                      {cl.interest && <span>Interesse: {cl.interest}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </Fold>
          ) : null}

          <Fold title="LinkedIn" summary={c.linkedinStatus ? LI_LABEL[c.linkedinStatus] : "kein Status"}>
            <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
              {c.linkedinRequestAt && <span>Anfrage {fmtDate(c.linkedinRequestAt)}</span>}
              {c.linkedinConnectedAt && <span>Vernetzt {fmtDate(c.linkedinConnectedAt)}</span>}
              {c.linkedinMessageAt && <span>Nachricht {fmtDate(c.linkedinMessageAt)}</span>}
              {c.linkedinReplyAt && <span className="font-medium text-emerald-700">Antwort {fmtDate(c.linkedinReplyAt)}</span>}
              {c.linkedinList && <span>Liste: {c.linkedinList}</span>}
              {c.linkedinTags && <span>Tags: {c.linkedinTags}</span>}
              {!c.linkedinStatus && <span className="text-slate-400">Noch keine LinkedIn-Aktivität.</span>}
            </div>
            <form key={`${c.linkedinStatus}-${c.linkedinUrl}`} action={updateLinkedIn} className="grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="contactId" value={c.id} />
              <input name="linkedinUrl" defaultValue={c.linkedinUrl ?? ""} placeholder="https://www.linkedin.com/in/…" className="input sm:col-span-2" />
              <select name="linkedinStatus" defaultValue={c.linkedinStatus ?? ""} className="input">
                <option value="">Kein Status</option>
                {LI_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <div className="flex gap-2">
                <button className="btn-ghost flex-1">Speichern</button>
                {c.linkedinUrl && <a href={c.linkedinUrl} target="_blank" rel="noreferrer" className="btn-ghost">Profil ↗</a>}
              </div>
            </form>
          </Fold>

          <Fold title="Kundendaten" summary={c.customerStage ? `${CUSTOMER_LABEL[c.customerStage]}${c.monthlyValue ? ` · ${c.monthlyValue} €/Monat` : ""}` : "noch kein Kunde"}>
            <form key={`${c.customerStage}-${c.monthlyValue}-${c.products}-${c.customerSource}-${c.customerSourceNote}`} action={updateCustomer} className="grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="contactId" value={c.id} />
              <div>
                <label className="label">Kunden-Stufe</label>
                <select name="customerStage" defaultValue={c.customerStage ?? ""} className="input">
                  <option value="">{c.customerStage ? "–" : "Noch kein Kunde"}</option>
                  {CUSTOMER_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Monatswert (€)</label>
                <input name="monthlyValue" inputMode="numeric" defaultValue={c.monthlyValue ?? ""} placeholder="z.B. 1250" className="input" />
              </div>
              <div>
                <label className="label">Produkte</label>
                <input name="products" defaultValue={c.products ?? ""} placeholder="PKV, TKV, Leben" className="input" />
              </div>
              <div>
                <label className="label">Vertragsstart</label>
                <input name="contractStart" type="date" defaultValue={c.contractStart ? dayKey(c.contractStart) : ""} className="input" />
              </div>
              <div>
                <label className="label">Gewonnen über{suggested && !c.customerSource ? " (Vorschlag)" : ""}</label>
                <select name="customerSource" defaultValue={c.customerSource ?? suggested?.source ?? ""} className="input">
                  <option value="">– bitte wählen –</option>
                  {SOURCES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Details zur Herkunft</label>
                <input name="customerSourceNote" defaultValue={c.customerSourceNote ?? suggested?.note ?? ""} placeholder="z.B. Empfehlung von Hr. Müller" className="input" />
              </div>
              <button className="btn-ghost sm:col-span-2">{c.customerStage ? "Speichern" : "Als Kunde speichern"}</button>
            </form>
            {c.customerSince && <p className="mt-2 text-xs text-slate-500">Aktiver Kunde seit {fmtDate(c.customerSince)}</p>}
            <form action={linkContactCustomer} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
              <input type="hidden" name="contactId" value={c.id} />
              <label className="min-w-0 flex-1">
                <span className="label">Kundenakte</span>
                <select name="customerId" defaultValue={c.customerId ?? ""} className="input">
                  <option value="">Nicht verknüpft</option>
                  {linkable.map((k) => (
                    <option key={k.id} value={k.id}>{k.name}</option>
                  ))}
                </select>
              </label>
              <button className="btn-ghost">{c.customerId ? "Verknüpfung ändern" : "Mit Kundenakte verknüpfen"}</button>
            </form>
          </Fold>

          <Fold title="Stammdaten">
            <div className="text-sm">
            <dl className="grid grid-cols-[110px_1fr] gap-y-1.5">
              <dt className="text-slate-500">Name</dt><dd>{c.name}</dd>
              {c.fax && (<><dt className="text-slate-500">Fax</dt><dd>{c.fax}</dd></>)}
              {c.agencyType && (<><dt className="text-slate-500">Agenturtyp</dt><dd>{c.agencyType === "GENERAL" ? "Generalvertretung" : c.agencyType === "HAUPT" ? "Hauptvertretung" : c.agencyType}</dd></>)}
              {c.teamSize != null && (<><dt className="text-slate-500">Teamgröße</dt><dd>{c.teamSize}</dd></>)}
              {c.potentialScore != null && (<><dt className="text-slate-500">Potenzial-Score</dt><dd>{c.potentialScore}</dd></>)}
              {(c.facebookUrl || c.instagramUrl || c.xingUrl) && (
                <>
                  <dt className="text-slate-500">Social</dt>
                  <dd className="flex flex-wrap gap-2">
                    {[["Facebook", c.facebookUrl], ["Instagram", c.instagramUrl], ["Xing", c.xingUrl]]
                      .filter(([, u]) => u)
                      .map(([l, u]) => <a key={l} href={u!} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">{l}</a>)}
                  </dd>
                </>
              )}
              {c.ratingValue != null && (<><dt className="text-slate-500">Bewertung</dt><dd>★ {c.ratingValue} ({c.ratingCount})</dd></>)}
              {c.openingHours && (<><dt className="text-slate-500">Öffnungszeiten</dt><dd className="text-xs">{c.openingHours.replaceAll("Mo ", "Mo ").replaceAll("Tu ", "Di ").replaceAll("We ", "Mi ").replaceAll("Th ", "Do ").replaceAll("Fr ", "Fr ")}</dd></>)}
              {c.legacyStatus && (<><dt className="text-slate-500">Alter Status</dt><dd className="text-xs">{c.legacyStatus}</dd></>)}
            </dl>
            </div>
          </Fold>
        </div>
      </div>
    </div>
  );
}

