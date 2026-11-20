import Link from "next/link";
import { HilfeChatButton } from "@/components/hilfe-chat";
import { redirect } from "next/navigation";
import { ChevronDown, Download, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { OCCASIONS, reachByOccasion } from "@/lib/bestand/campaigns";
import { consentRequestText, loadConsentSettings, loadOfferReach } from "@/lib/bestand/einwilligung-server";
import { OFFER_REACH_GOAL } from "@/lib/bestand/einwilligung";
import { imprintFromWebsiteInfo } from "@/lib/bestand/kampagnen-mail";
import { effectiveDailyLimit, providerDailyLimit } from "@/lib/bestand/mail-drossel";
import { bestandMailQuota } from "@/lib/bestand/quota";
import { AnspracheForm, BulkForm, HinweisBulkForm, LegacyForm, RechtForm, SpartenForm } from "@/components/bestand/recht-forms";
import { ConsentBulkButton } from "@/components/bestand/consent-bulk";
import { isExclusiveAgent } from "@/lib/bestand/befugnis";
import { LINE_NAMES } from "@/lib/bestand/rows";
import { a, anredeZeile } from "@/lib/ansprache";

// Einwilligungen (Plan docs/ux/2026-11-19-bestand-champions.md, Paket 3, 20.11.2026): oben die Kennzahl „Für Angebote
// erreichbar“ mit Ziel 40 % und genau eine Hauptaktion (Sammelanfrage per E-Mail, sonst „Nachweis ergänzen“).
// Rechtliches, Nachweise, Regeln je Anlass, Versand, Ansprache, Sparten, Protokoll und Seltenes (CSV, „Alle haben
// eingewilligt“) liegen vollständig hinter je einem Klick. Die Empfehlung „E-Mail-Signatur“ ist gestrichen.

export const dynamic = "force-dynamic";
export const metadata = { title: "Einwilligungen | performancegrowth" };

const de = (n: number) => n.toLocaleString("de-DE");
const pct = (x: number) => `${Math.round(x * 100).toLocaleString("de-DE")} %`;
const day = (d: Date) => d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
const ACTION: Record<string, string> = { angefragt: "angefragt", erteilt: "erteilt", bestaetigt: "bestätigt", widerrufen: "widerrufen", abgemeldet: "abgemeldet", gesetzt: "gesetzt" };

export default async function EinwilligungenPage({ searchParams }: { searchParams: Promise<{ offen?: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  if (ctx.teamRole !== "owner") redirect("/buyer");
  const customerId = ctx.customerId;
  const { offen } = await searchParams;
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { existingCustomersEnabled: true, vermittlerTyp: true, bestandSparten: true } });
  if (!c?.existingCustomersEnabled) redirect("/buyer/bestand");
  const [settings, reach, offer, legacy, legacyFirst, unknownEmail, unknownWa, optOuts, emailOptOuts, logs, mailbox, mailQuota, hinweisMissing, hinweisJa] = await Promise.all([
    loadConsentSettings(customerId),
    reachByOccasion(customerId),
    loadOfferReach(customerId),
    prisma.existingCustomer.count({ where: { customerId, OR: [{ whatsappConsentSource: "versicherer_pauschal" }, { emailConsentSource: "versicherer_pauschal" }] } }),
    prisma.existingCustomer.findFirst({ where: { customerId, whatsappConsentSource: "versicherer_pauschal" }, orderBy: { whatsappConsentAt: "asc" }, select: { whatsappConsentAt: true } }),
    prisma.existingCustomer.count({ where: { customerId, emailConsent: null, email: { not: null } } }),
    prisma.existingCustomer.count({ where: { customerId, whatsappConsent: null, phone: { not: null } } }),
    prisma.existingCustomer.count({ where: { customerId, optOutAt: { not: null } } }),
    prisma.existingCustomer.count({ where: { customerId, optOutAt: null, emailOptOutAt: { not: null } } }),
    // Protokoll ohne die Warteschlange der Sammelanfrage (sammel_*: nur Zustand, kein Nachweis)
    prisma.bestandConsentLog.findMany({
      where: { customerId, OR: [{ source: null }, { NOT: { source: { startsWith: "sammel_" } } }] },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { existingCustomer: { select: { firstName: true, lastName: true, company: true, email: true } } },
    }),
    ctx.userId ? prisma.mailConnection.findUnique({ where: { userId: ctx.userId } }) : null,
    bestandMailQuota(customerId),
    prisma.existingCustomer.count({ where: { customerId, email: { not: null }, widerspruchHinweis: null } }),
    prisma.existingCustomer.count({ where: { customerId, email: { not: null }, widerspruchHinweis: "ja" } }),
  ]);
  const imprint = settings.imprint ?? imprintFromWebsiteInfo(settings.websiteInfo) ?? "";
  const ao = isExclusiveAgent(c.vermittlerTyp);
  const bestandLines = ao
    ? (await prisma.existingContract.findMany({ where: { existingCustomer: { customerId } }, distinct: ["line"], select: { line: true } })).map((x) => x.line).filter((l) => l !== "Sonstiges")
    : [];
  const an = settings.ansprache;
  const preview = {
    subject: a(an, "Darf ich dich auf dem Laufenden halten?", "Darf ich Sie auf dem Laufenden halten?"),
    body: `${anredeZeile(an, { firstName: "Erika", lastName: "Muster", salutation: "Frau" })}\n\n${consentRequestText(an)}\n[Persönlicher Link]`,
  };
  // Rechtliches braucht eine Angabe: Bestätigung § 7 Abs. 3, Impressum, Nachweise oder alte Pauschal-Einwilligungen
  const rechtOffen = !settings.uwgConfirmed || !imprint.trim() || hinweisMissing > 0 || (legacy > 0 && !settings.legacyReviewedAt);
  const share = offer.share;
  const goal = OFFER_REACH_GOAL;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/buyer/bestand" className="text-sm text-[color:var(--brand)] hover:underline">
        ← Bestand
      </Link>
      <PageHeader title="Einwilligungen" subtitle="Mehr Kunden für Angebote erreichen" />
      <div className="space-y-4">
        {/* Status und die eine Hauptaktion */}
        <Card className="border-[color:var(--brand)]/40">
          <div className="px-5 py-5" data-consent-hero>
            <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand)]">Für Angebote erreichbar</p>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="text-3xl font-semibold tabular-nums" data-consent-share>
                {pct(share)}
              </span>
              <span className="text-sm text-[color:var(--muted)]">{share >= goal ? `Ziel ${pct(goal)} erreicht` : `Ziel ${pct(goal)}`}</span>
            </div>
            <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-[color:var(--surface-sunken)]" aria-hidden>
              <div className="h-full rounded-full bg-[color:var(--brand)]" style={{ width: `${Math.min(100, Math.round(share * 100))}%` }} />
              <div className="absolute inset-y-0 w-0.5 bg-[color:var(--foreground)]/40" style={{ left: `${goal * 100}%` }} />
            </div>
            <p className="mt-2 text-sm text-[color:var(--muted)] tabular-nums">
              {de(offer.reachable)} von {de(offer.total)} Kunden
              {offer.confirmed30 ? ` · ${de(offer.confirmed30)} Zusagen in 30 Tagen` : ""}
            </p>
            <div className="mt-4 space-y-2">
              {offer.askable > 0 ? (
                <>
                  <ConsentBulkButton count={offer.askable} preview={preview} readOnly={ctx.preview} />
                  <p className="text-sm text-[color:var(--muted)]">Mit Einwilligung dürfen Sie ihnen auch weitere Produkte anbieten.</p>
                </>
              ) : rechtOffen && offer.withoutConsent > 0 ? (
                <>
                  <ButtonLink href="/buyer/bestand/einwilligungen?offen=recht#recht" variant="primary" size="md" icon={ShieldCheck} className="w-full sm:w-auto">
                    Nachweis ergänzen
                  </ButtonLink>
                  <p className="text-sm text-[color:var(--muted)]">Per E-Mail fragen dürfen Sie nur Kunden mit Nachweis zum Widerspruchshinweis.</p>
                </>
              ) : offer.withoutConsent > 0 ? (
                <>
                  <ButtonLink href="/buyer/bestand?filter=ohne#kunden" size="md" icon={Users} className="w-full sm:w-auto">
                    Link im Gespräch teilen
                  </ButtonLink>
                  <p className="text-sm text-[color:var(--muted)]">Den persönlichen Link geben Sie im Termin oder im Chat weiter.</p>
                </>
              ) : (
                <p className="text-sm font-medium text-emerald-700">Alle Kunden mit Kontaktweg haben eingewilligt.</p>
              )}
              {offer.planned > 0 ? (
                <p className="text-sm text-[color:var(--muted)]" data-consent-planned>
                  {de(offer.planned)} Anfragen gehen werktags nach und nach raus.
                </p>
              ) : null}
            </div>
          </div>
        </Card>

        {/* Alles Weitere hinter je einem Klick */}
        <Card menus>
          <ul className="divide-y divide-[color:var(--border)]">
            <Aufklapper id="recht" title="Rechtliches und Nachweise" badge={rechtOffen ? "Angabe fehlt" : null} open={offen === "recht"}>
              <div className="space-y-6">
                {legacy > 0 ? (
                  <section>
                    <h3 className="mb-2 font-semibold">Einwilligungen aus dem Import prüfen</h3>
                    {settings.legacyReviewedAt ? <p className="mb-2 text-xs text-[color:var(--muted)]">Zuletzt geprüft am {day(settings.legacyReviewedAt)}.</p> : null}
                    <LegacyForm count={legacy} date={legacyFirst?.whatsappConsentAt ? day(legacyFirst.whatsappConsentAt) : null} readOnly={ctx.preview} />
                  </section>
                ) : null}
                <section>
                  <h3 className="mb-2 font-semibold">E-Mail ohne Einwilligung und Pflichtangaben</h3>
                  <RechtForm uwg={settings.uwgConfirmed} uwgAt={settings.uwgConfirmedAt ? day(settings.uwgConfirmedAt) : null} imprint={imprint} readOnly={ctx.preview} />
                </section>
                <section data-hinweis-card>
                  <h3 className="mb-1 font-semibold">Hinweis auf das Widerspruchsrecht</h3>
                  <p className="mb-2 text-xs text-[color:var(--muted)]">Nachweis vorhanden für {de(hinweisJa)} Kunden mit E-Mail-Adresse. Auch beim Import oder je Kunde möglich.</p>
                  {hinweisMissing > 0 ? <HinweisBulkForm missing={hinweisMissing} readOnly={ctx.preview} /> : <p>Für alle Kunden mit E-Mail-Adresse ist eine Angabe hinterlegt.</p>}
                </section>
              </div>
            </Aufklapper>

            <Aufklapper id="regeln" title="Wer darf wie angeschrieben werden">
              <ul className="divide-y divide-[color:var(--border)]" data-reach-table>
                {reach.map((r) => {
                  const top = Object.entries(r.counts.excluded).sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0))[0];
                  return (
                    <li key={r.occasion} className="py-2.5" data-reach-row={r.occasion}>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="font-medium">{OCCASIONS[r.occasion].label}</span>
                        <span className="tabular-nums text-[color:var(--muted)]">
                          WhatsApp {de(r.counts.whatsapp)} · E-Mail {de(r.counts.email)}
                        </span>
                      </div>
                      {r.counts.emailUwg ? <p className="text-xs text-[color:var(--muted)]">davon {de(r.counts.emailUwg)} per E-Mail nach § 7 Abs. 3</p> : null}
                      {r.counts.noProof ? (
                        <p className="text-xs text-amber-800" data-reach-noproof>
                          {de(r.counts.noProof)} ohne Nachweis, nur mit Einwilligung
                        </p>
                      ) : null}
                      {top ? <p className="text-xs text-[color:var(--muted)]">Nicht erreichbar: {de(r.counts.excludedTotal)}, meist {top[0]}</p> : null}
                    </li>
                  );
                })}
              </ul>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-[color:var(--muted)]">
                <li>Mit Einwilligung für den Kanal: alle Anlässe.</li>
                <li>
                  E-Mail ohne Einwilligung (nur mit Ihrer Bestätigung zu § 7 Abs. 3 UWG und dem Nachweis je Kunde, dass er bei der Erhebung der Adresse auf sein
                  Widerspruchsrecht hingewiesen wurde): nur zum selben Bedarf bzw. Vertrag, also Ablauf oder Wechsel und Vertragscheck im Jahresgespräch. Nicht:
                  Cross-Selling in andere Sparten (auch nicht zwischen Sachsparten), Geburtstag mit Angebot, Empfehlungs- oder Bewertungsbitte.
                </li>
                <li>WhatsApp nur mit Einwilligung (auch Meta verlangt ein Opt-in vor geschäftlichen Nachrichten).</li>
                <li>Abmeldungen („Stopp“, Abmeldelink) wirken sofort und dauerhaft, auch nach einem erneuten Import.</li>
                <li>
                  Als Ausschließlichkeitsvertreter gehören Kundendaten oft dem Versicherer: Nutzen Sie sie nur im Rahmen Ihres Vertretervertrags. Bei
                  Personenversicherungen (Kranken, Leben, BU, Unfall, Pflege) ist schon die Tatsache des Vertrags besonders geschützt.
                </li>
              </ul>
              <p className="mt-3 text-xs text-[color:var(--muted)]" data-recht-hinweis>
                Die App prüft vor jedem Versand Einwilligung, Anlass und Abmeldungen. Das ist eine Hilfe und keine Rechtsberatung, die Bewertung im Einzelfall liegt
                bei Ihnen. Fragen? <HilfeChatButton className="underline">KI-Hilfe</HilfeChatButton>
              </p>
            </Aufklapper>

            <Aufklapper id="versand" title="Versand per E-Mail" badge={mailbox ? null : "Postfach fehlt"}>
              <div className="space-y-2" data-mail-status>
                {mailbox ? (
                  <>
                    <p>
                      Kampagnen-Mails gehen als persönliche Einzelmails über <b>{mailbox.email}</b> raus, werktags 8 bis 18 Uhr, höchstens{" "}
                      {de(effectiveDailyLimit(providerDailyLimit(mailbox.provider, mailbox.email), mailbox.campaignBackoff))} am Tag.
                    </p>
                    {mailbox.campaignPausedUntil && mailbox.campaignPausedUntil > new Date() ? (
                      <p className="text-amber-800">Gedrosselt bis {mailbox.campaignPausedUntil.toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" })} Uhr.</p>
                    ) : null}
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="min-w-0 flex-1">Kampagnen-Mails gehen persönlich von Ihrer eigenen Adresse raus.</p>
                    <ButtonLink href="/buyer/postfach">Postfach verbinden</ButtonLink>
                  </div>
                )}
                <p className="text-[color:var(--muted)]">
                  Diesen Monat {de(mailQuota.used)} von {de(mailQuota.limit)} Kampagnen-E-Mails. Abgemeldet: {de(optOuts)} für alle Kanäle, {de(emailOptOuts)} nur für E-Mail.
                </p>
              </div>
            </Aufklapper>

            <Aufklapper id="ansprache" title="Ansprache Ihrer Kunden" hint={settings.ansprache === "du" ? "Du" : "Sie"}>
              <AnspracheForm value={settings.ansprache} readOnly={ctx.preview} />
            </Aufklapper>

            {ao ? (
              <Aufklapper id="sparten" title="Meine Sparten" open={offen === "sparten"}>
                <SpartenForm all={LINE_NAMES.filter((l) => l !== "Sonstiges")} selected={c.bestandSparten} fromBestand={bestandLines} readOnly={ctx.preview} />
              </Aufklapper>
            ) : null}

            <Aufklapper id="protokoll" title="Protokoll">
              {logs.length ? (
                <ul className="divide-y divide-[color:var(--border)]" data-consent-log>
                  {logs.map((l) => (
                    <li key={l.id} className="py-2">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="font-medium">
                          {l.existingCustomer ? [l.existingCustomer.firstName, l.existingCustomer.lastName].filter(Boolean).join(" ") || l.existingCustomer.company || l.existingCustomer.email : "Alle Kunden"}
                          : {l.channel === "email" ? "E-Mail" : "WhatsApp"} {ACTION[l.action] ?? l.action}
                        </span>
                        <span className="text-xs text-[color:var(--muted)]">
                          {l.createdAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" })}
                          {l.ip ? ` · IP ${l.ip}` : ""}
                        </span>
                      </div>
                      {l.text ? <p className="text-xs text-[color:var(--muted)]">{l.text}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[color:var(--muted)]">Noch keine Einträge.</p>
              )}
            </Aufklapper>

            <Aufklapper id="mehr" title="Mehr" hint="Liste mit Links, alle eingewilligt">
              <div className="space-y-6">
                <section className="space-y-2" data-consent-links>
                  <p>
                    Persönliche Einwilligungslinks für {de(Math.max(unknownEmail, unknownWa))} Kunden ohne Angabe, mit Name, Anschrift und Kontakt, z. B. für einen
                    Serienbrief.
                  </p>
                  <a href="/buyer/bestand/einwilligungslinks" className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-4 font-medium" data-consent-links-download>
                    <Download className="h-4 w-4" /> Liste herunterladen (CSV)
                  </a>
                </section>
                <section>
                  <h3 className="mb-2 font-semibold">Alle haben eingewilligt</h3>
                  <BulkForm unknownEmail={unknownEmail} unknownWhatsapp={unknownWa} readOnly={ctx.preview} />
                </section>
              </div>
            </Aufklapper>
          </ul>
        </Card>
      </div>
    </main>
  );
}

/** Aufklapper wie im Cockpit: Titel, optional Badge („Angabe fehlt“) bzw. Wert rechts, Inhalt erst nach Klick. */
function Aufklapper({ id, title, badge = null, hint, open = false, children }: { id: string; title: string; badge?: string | null; hint?: string; open?: boolean; children: React.ReactNode }) {
  return (
    <li id={id} className="scroll-mt-20">
      <details className="group [&>summary::-webkit-details-marker]:hidden" open={open} data-aufklapper={id}>
        <summary className="flex min-h-12 cursor-pointer items-center gap-3 px-5 py-3">
          <span className="min-w-0 flex-1 text-[15px] font-medium">{title}</span>
          {badge ? <Badge tone="warning">{badge}</Badge> : hint ? <span className="truncate text-sm text-[color:var(--muted)]">{hint}</span> : null}
          <ChevronDown className="h-4 w-4 shrink-0 text-[color:var(--muted)] transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-[color:var(--border)] px-5 py-4 text-sm">{children}</div>
      </details>
    </li>
  );
}
