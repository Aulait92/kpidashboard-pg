import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, History, Mail, Scale, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { ButtonLink, Card, CardHeader } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { OCCASIONS, reachByOccasion } from "@/lib/bestand/campaigns";
import { loadConsentSettings } from "@/lib/bestand/einwilligung-server";
import { imprintFromWebsiteInfo } from "@/lib/bestand/kampagnen-mail";
import { effectiveDailyLimit, providerDailyLimit } from "@/lib/bestand/mail-drossel";
import { bestandMailQuota } from "@/lib/bestand/quota";
import { BulkForm, HinweisBulkForm, LegacyForm, RechtForm } from "@/components/bestand/recht-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Einwilligungen & Versand | performancegrowth" };

const de = (n: number) => n.toLocaleString("de-DE");
const day = (d: Date) => d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
const ACTION: Record<string, string> = { angefragt: "angefragt", erteilt: "erteilt", bestaetigt: "bestätigt", widerrufen: "widerrufen", abgemeldet: "abgemeldet", gesetzt: "gesetzt" };

export default async function EinwilligungenPage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  if (ctx.teamRole !== "owner") redirect("/buyer");
  const customerId = ctx.customerId;
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { existingCustomersEnabled: true } });
  if (!c?.existingCustomersEnabled) redirect("/buyer/bestand");
  const [settings, reach, legacy, legacyFirst, unknownEmail, unknownWa, optOuts, emailOptOuts, logs, mailbox, mailQuota, hinweisMissing, hinweisJa] = await Promise.all([
    loadConsentSettings(customerId),
    reachByOccasion(customerId),
    prisma.existingCustomer.count({ where: { customerId, OR: [{ whatsappConsentSource: "versicherer_pauschal" }, { emailConsentSource: "versicherer_pauschal" }] } }),
    prisma.existingCustomer.findFirst({ where: { customerId, whatsappConsentSource: "versicherer_pauschal" }, orderBy: { whatsappConsentAt: "asc" }, select: { whatsappConsentAt: true } }),
    prisma.existingCustomer.count({ where: { customerId, emailConsent: null, email: { not: null } } }),
    prisma.existingCustomer.count({ where: { customerId, whatsappConsent: null, phone: { not: null } } }),
    prisma.existingCustomer.count({ where: { customerId, optOutAt: { not: null } } }),
    prisma.existingCustomer.count({ where: { customerId, optOutAt: null, emailOptOutAt: { not: null } } }),
    prisma.bestandConsentLog.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take: 20, include: { existingCustomer: { select: { firstName: true, lastName: true, company: true, email: true } } } }),
    ctx.userId ? prisma.mailConnection.findUnique({ where: { userId: ctx.userId } }) : null,
    bestandMailQuota(customerId),
    prisma.existingCustomer.count({ where: { customerId, email: { not: null }, widerspruchHinweis: null } }),
    prisma.existingCustomer.count({ where: { customerId, email: { not: null }, widerspruchHinweis: "ja" } }),
  ]);
  const imprint = settings.imprint ?? imprintFromWebsiteInfo(settings.websiteInfo) ?? "";

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/buyer/bestand" className="text-sm text-[color:var(--brand)] hover:underline">
        ← Bestand
      </Link>
      <PageHeader title="Einwilligungen & Versand" subtitle="Wer per WhatsApp bzw. E-Mail angeschrieben werden darf" />
      <p className="mb-5 rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-4 py-3 text-sm text-[color:var(--muted)]" data-recht-hinweis>
        Die App prüft vor jedem Versand Einwilligung, Anlass und Abmeldungen nach den Regeln unten. Das ist eine Hilfe und keine Rechtsberatung: Die rechtliche
        Bewertung im Einzelfall liegt bei Ihnen. Mehr dazu in der{" "}
        <Link href="/buyer/hilfe" className="underline">
          Hilfe
        </Link>
        .
      </p>
      <div className="space-y-5">
        <Card>
          <CardHeader title="Rechtlich erreichbar je Anlass" icon={Users} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-reach-table>
              <thead className="border-b border-[color:var(--border)] text-left text-xs text-[color:var(--muted)]">
                <tr>
                  <th className="px-5 py-2 font-medium">Anlass</th>
                  <th className="px-3 py-2 text-right font-medium">WhatsApp</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">E-Mail</th>
                  <th className="hidden px-5 py-2 text-left font-medium sm:table-cell">Nicht erreichbar, häufigster Grund</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--border)] tabular-nums">
                {reach.map((r) => {
                  const top = Object.entries(r.counts.excluded).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
                  return (
                    <tr key={r.occasion} data-reach-row={r.occasion}>
                      <td className="px-5 py-2">
                        {OCCASIONS[r.occasion].label}
                        <span className="block text-[11px] text-[color:var(--muted)] sm:hidden">{top ? `nicht erreichbar: ${de(r.counts.excludedTotal)}, meist ${top[0]}` : null}</span>
                      </td>
                      <td className="px-3 py-2 text-right">{de(r.counts.whatsapp)}</td>
                      <td className="px-3 py-2 text-right">
                        {de(r.counts.email)}
                        {r.counts.emailUwg ? <span className="block text-[11px] text-[color:var(--muted)]">davon {de(r.counts.emailUwg)} nach § 7 Abs. 3</span> : null}
                        {r.counts.noProof ? (
                          <span className="block text-[11px] text-amber-800" data-reach-noproof>
                            {de(r.counts.noProof)} ohne Nachweis, nur mit Einwilligung
                          </span>
                        ) : null}
                      </td>
                      <td className="hidden px-5 py-2 text-xs text-[color:var(--muted)] sm:table-cell">{top ? `${de(r.counts.excludedTotal)}: ${top[0]}` : "keine"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="list-disc space-y-1 px-5 py-4 pl-9 text-xs text-[color:var(--muted)]">
            <li>Mit Einwilligung für den Kanal: alle Anlässe.</li>
            <li>
              E-Mail ohne Einwilligung (nur mit Ihrer Bestätigung zu § 7 Abs. 3 UWG und dem Nachweis je Kunde, dass er bei der Erhebung der Adresse auf sein
              Widerspruchsrecht hingewiesen wurde): nur zum selben Bedarf bzw. Vertrag, also Ablauf oder Wechsel des eigenen Vertrags und Vertragscheck im
              Jahresgespräch. Nicht: Cross-Selling in andere Sparten (auch nicht zwischen Sachsparten wie Hausrat und Wohngebäude), Geburtstag mit Angebot,
              Empfehlungs- oder Bewertungsbitte.
            </li>
            <li>WhatsApp nur mit Einwilligung (auch Meta verlangt ein Opt-in vor geschäftlichen Nachrichten).</li>
            <li>Abmeldungen („Stopp“, Abmeldelink) wirken sofort und dauerhaft, auch nach einem erneuten Import.</li>
          </ul>
        </Card>

        {legacy > 0 ? (
          <Card>
            <CardHeader title="Einwilligungen aus dem Import prüfen" icon={ShieldCheck} />
            <div className="px-5 pb-5">
              {settings.legacyReviewedAt ? <p className="mb-3 text-xs text-[color:var(--muted)]">Zuletzt geprüft am {day(settings.legacyReviewedAt)}.</p> : null}
              <LegacyForm count={legacy} date={legacyFirst?.whatsappConsentAt ? day(legacyFirst.whatsappConsentAt) : null} readOnly={ctx.preview} />
            </div>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="E-Mail ohne Einwilligung und Pflichtangaben" icon={Scale} />
          <div className="px-5 pb-5">
            <RechtForm uwg={settings.uwgConfirmed} uwgAt={settings.uwgConfirmedAt ? day(settings.uwgConfirmedAt) : null} imprint={imprint} readOnly={ctx.preview} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Hinweis auf das Widerspruchsrecht" icon={ShieldCheck} />
          <div className="space-y-3 px-5 pb-5 text-sm" data-hinweis-card>
            <p className="text-[color:var(--muted)]">
              Nachweis vorhanden für {de(hinweisJa)} Kunden mit E-Mail-Adresse. Sie können ihn beim Import (Spalte oder Bestätigung je Liste), hier für alle
              bisherigen Kunden oder je Kunde in der Liste (Schild-Symbol) eintragen.
            </p>
            {hinweisMissing > 0 ? <HinweisBulkForm missing={hinweisMissing} readOnly={ctx.preview} /> : <p>Für alle Kunden mit E-Mail-Adresse ist eine Angabe hinterlegt.</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Einwilligung einholen" icon={Download} />
          <div className="space-y-3 px-5 pb-5 text-sm" data-consent-links>
            <p>
              Mit Einwilligung dürfen Sie zu allen Anlässen schreiben. Jeder Kunde hat einen persönlichen Link, über den er selbst festlegt, ob Sie ihn per E-Mail
              bzw. WhatsApp informieren dürfen (E-Mail mit Bestätigungslink, jederzeit widerrufbar). Geben Sie den Link im Termin, im Jahresgespräch, in Ihrer
              E-Mail-Signatur oder per Serienbrief weiter.
            </p>
            <p className="text-[color:var(--muted)]">
              {de(Math.max(unknownEmail, unknownWa))} Kunden haben für mindestens einen Kanal noch keine Angabe. Die Liste enthält Name, Anschrift, Kontakt und den
              persönlichen Link für jeden dieser Kunden.
            </p>
            <a href="/buyer/bestand/einwilligungslinks" className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-4 font-medium" data-consent-links-download>
              <Download className="h-4 w-4" /> Einwilligungslinks als Liste (CSV)
            </a>
          </div>
        </Card>

        <Card>
          <CardHeader title="Versand per E-Mail" icon={Mail} />
          <div className="space-y-2 px-5 pb-5 text-sm" data-mail-status>
            {mailbox ? (
              <>
                <p>
                  Kampagnen-Mails gehen als persönliche Einzelmails über <b>{mailbox.email}</b> raus, werktags 8 bis 18 Uhr in zufälligen Abständen, höchstens{" "}
                  {de(effectiveDailyLimit(providerDailyLimit(mailbox.provider, mailbox.email), mailbox.campaignBackoff))} am Tag.
                </p>
                {mailbox.campaignPausedUntil && mailbox.campaignPausedUntil > new Date() ? (
                  <p className="text-amber-800">Gedrosselt bis {mailbox.campaignPausedUntil.toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" })} Uhr.</p>
                ) : null}
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <p className="min-w-0 flex-1">Noch kein Postfach verbunden. Kampagnen-Mails gehen persönlich von Ihrer eigenen Adresse raus.</p>
                <ButtonLink href="/buyer/postfach" variant="primary">
                  Postfach verbinden
                </ButtonLink>
              </div>
            )}
            <p className="text-[color:var(--muted)]">
              Diesen Monat {de(mailQuota.used)} von {de(mailQuota.limit)} Kampagnen-E-Mails verschickt (eigenes Kontingent, getrennt von WhatsApp). Abgemeldet:{" "}
              {de(optOuts)} für alle Kanäle, {de(emailOptOuts)} nur für E-Mail.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Alle haben eingewilligt" icon={ShieldCheck} />
          <div className="px-5 pb-5">
            <BulkForm unknownEmail={unknownEmail} unknownWhatsapp={unknownWa} readOnly={ctx.preview} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Protokoll" icon={History} />
          {logs.length ? (
            <ul className="divide-y divide-[color:var(--border)] text-sm" data-consent-log>
              {logs.map((l) => (
                <li key={l.id} className="px-5 py-2.5">
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
            <p className="px-5 pb-5 text-sm text-[color:var(--muted)]">Noch keine Einträge.</p>
          )}
        </Card>
        <p className="text-xs text-[color:var(--muted)]">
          Als Ausschließlichkeitsvertreter gehören Kundendaten oft dem Versicherer: Nutzen Sie sie nur im Rahmen Ihres Vertretervertrags. Bei Personenversicherungen
          (Kranken, Leben, BU, Unfall, Pflege) ist schon die Tatsache des Vertrags besonders geschützt.
        </p>
      </div>
    </main>
  );
}
