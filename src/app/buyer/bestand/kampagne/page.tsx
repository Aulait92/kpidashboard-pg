import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { Download, Mail, Megaphone, MessageCircle, Scale, Send } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { Button, ButtonLink, Card, CardHeader } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { campaignMailFor, channelAvailability, effectiveMode, NEEDS_EMPFEHLUNG, OCCASIONS, planAudience, TOPIC_LABEL, type Occasion, type Segment } from "@/lib/bestand/campaigns";
import { rankTemplates, renderTemplate, templateTextFor, fillNames, type NoticePurpose } from "@/lib/whatsapp/templates";
import { templateNamesOf } from "@/lib/whatsapp/template-plan";
import { startCampaignAction } from "../actions";
import { bestandMailQuota, bestandQuota } from "@/lib/bestand/quota";
import { packPurchaseBlocker } from "@/lib/bestand/packs";
import { PRICE_LIST } from "@/lib/offer-pricing";
import { QuotaLowNotice } from "@/components/bestand/quota-bar";
import { displayName } from "@/lib/bestand/rows";
import { asChannelMode, CHANNEL_MODES, isSameNeedOccasion, NEEDS_CONSENT_REASON } from "@/lib/bestand/einwilligung";
import { loadConsentSettings } from "@/lib/bestand/einwilligung-server";
import { defaultCampaignMail, imprintFromWebsiteInfo } from "@/lib/bestand/kampagnen-mail";
import { needsSubmit, templateNotice, templateState, TEMPLATE_STATE_LABEL } from "@/lib/whatsapp/vorlagen-hinweis";
import { advisorPerson } from "@/lib/lead-anrede";

export const dynamic = "force-dynamic";

const de = (n: number) => n.toLocaleString("de-DE");
const box = "rounded-[var(--radius-md)] border px-4 py-3 text-sm";
const warnBox = `${box} border-amber-200 bg-amber-50 text-amber-900`;

export default async function CampaignSetup({ searchParams }: { searchParams: Promise<{ anlass?: string; segment?: string; thema?: string; kanal?: string; fehler?: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const c = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { existingCustomersEnabled: true, empfehlungEnabled: true, name: true, bestandAgentConfirmedAt: true, mailFeaturesOff: true } });
  if (ctx.teamRole !== "owner") redirect("/buyer");
  if (!c?.existingCustomersEnabled) redirect("/buyer/bestand");
  const sp = await searchParams;
  const occasion = (sp.anlass && sp.anlass in OCCASIONS ? sp.anlass : "review") as Occasion;
  // E-Mail-Funktionen aus („Meine Gesellschaft erlaubt das nicht“): Kampagnen nur per WhatsApp
  const mode = c?.mailFeaturesOff ? "whatsapp" : asChannelMode(sp.kanal);
  // Empfehlungsbitte nur mit Modul „Empfehlungen & Bewertungen“ – sonst Hinweis zum Modul
  const locked = NEEDS_EMPFEHLUNG.includes(occasion) && !c.empfehlungEnabled;
  let segment: Segment = {};
  try {
    segment = JSON.parse(sp.segment ?? "{}") as Segment;
  } catch {
    /* leer */
  }
  const topic = sp.thema ?? (segment.lacks?.[0] ? (TOPIC_LABEL[segment.lacks[0]] ?? segment.lacks[0]) : null);
  const purpose = OCCASIONS[occasion].purpose as NoticePurpose;
  const [avail, templates, allTemplates, quota, mailQuota, packBlocker, settings, sender] = await Promise.all([
    channelAvailability(ctx.customerId, occasion, ctx.userId),
    prisma.messageTemplate.findMany({ where: { customerId: ctx.customerId, purpose, status: "approved" }, orderBy: { updatedAt: "desc" } }),
    prisma.messageTemplate.findMany({ where: { customerId: ctx.customerId, purpose: { startsWith: "campaign_" } }, select: { purpose: true, status: true } }),
    bestandQuota(ctx.customerId),
    bestandMailQuota(ctx.customerId),
    packPurchaseBlocker(ctx.customerId),
    loadConsentSettings(ctx.customerId),
    ctx.userId ? prisma.user.findUnique({ where: { id: ctx.userId }, select: { displayName: true } }) : null,
  ]);
  const used = effectiveMode(mode, avail.waAvailable);
  const plan = await planAudience(ctx.customerId, occasion, segment, { mode, waAvailable: avail.waAvailable });
  const ids = plan.recipients.map((r) => r.id);
  const counts = plan.counts;

  // Vorlage fehlt, obwohl die Nummer verbunden ist: gleich einreichen statt Hinweis (Ole, 14.11.2026)
  const tplRows = [...allTemplates, ...templates.map((t) => ({ purpose: t.purpose, status: t.status }))];
  if (needsSubmit(avail.waAvailable, tplRows, [purpose]) && !ctx.preview) {
    after(async () => {
      const { submitTemplatesAfterModule } = await import("@/lib/whatsapp/template-submit");
      await submitTemplatesAfterModule(ctx.customerId);
    });
  }
  const notice = used === "email" ? null : templateNotice(avail.waAvailable, tplRows, [purpose], "kampagne");

  // Zielgruppe nach Wert: Summe der Jahresbeiträge und die wertvollsten Empfänger (werden zuerst angeschrieben)
  const [value, top] = ids.length
    ? await Promise.all([
        prisma.existingCustomer.aggregate({ where: { id: { in: ids }, premiumTotal: { not: null } }, _sum: { premiumTotal: true } }),
        prisma.existingCustomer.findMany({
          where: { id: { in: ids }, premiumTotal: { not: null } },
          orderBy: { premiumTotal: "desc" },
          take: 5,
          select: { id: true, firstName: true, lastName: true, company: true, email: true, premiumTotal: true },
        }),
      ])
    : [null, []];
  const valueSum = Number(value?._sum.premiumTotal ?? 0);
  const eurRound = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  // Vorschau wie beim Versand: Bestandskunden werden gesiezt, „Guten Tag Frau Muster,“ (Anrede aus dem Bestand)
  const rest = [occasion === "empfehlung" ? "https://app.performancegrowth.de/empfehlung/…" : (topic ?? "")];
  const pick = rankTemplates(templates, purpose, "sie", { firstName: "Erika", lastName: "Muster", salutation: "Frau" });
  const preview = pick
    ? renderTemplate(pick.tpl.body, pick.params(rest))
    : renderTemplate(fillNames(templateTextFor(purpose, "sie"), templateNamesOf(c.name)), ["Frau Muster", ...rest]);
  const imprint = settings.imprint ?? imprintFromWebsiteInfo(settings.websiteInfo);
  const meinname = advisorPerson(c.name, sender?.displayName ?? null);
  const def = defaultCampaignMail(occasion, "sie");
  const mailPreview = await campaignMailFor(
    { customerId: ctx.customerId, occasion, topic, mailSubject: null, mailBody: null },
    { id: "vorschau", firstName: "Erika", lastName: "Muster", salutation: "Frau" },
    { recipientId: "vorschau0", customerName: c.name, imprint, meinname, empfehlungslink: occasion === "empfehlung" ? "https://app.performancegrowth.de/empfehlung/…" : null },
  );

  // Startbereit? Je Kanal nur prüfen, wenn er gebraucht wird. WhatsApp-Vorlage darf noch warten (startet nach Freigabe).
  const waBlock = counts.whatsapp > 0 && (!avail.waAvailable || quota.remaining <= 0 || notice?.kind === "connect");
  const mailBlock = counts.email > 0 && (!avail.mailbox || !imprint || mailQuota.remaining <= 0);
  const ready = !locked && ids.length > 0 && !waBlock && !mailBlock;
  const modeHref = (k: string) => `/buyer/bestand/kampagne?${new URLSearchParams({ anlass: occasion, segment: JSON.stringify(segment), ...(topic ? { thema: topic } : {}), kanal: k })}`;
  const excluded = Object.entries(counts.excluded).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/buyer/bestand" className="text-sm text-[color:var(--brand)] hover:underline">
        ← Bestand
      </Link>
      <PageHeader title={`Kampagne: ${OCCASIONS[occasion].label}`} subtitle={OCCASIONS[occasion].hint} />
      {sp.fehler ? (
        <p className={`mb-5 ${box} border-rose-200 bg-rose-50 text-rose-900`} data-campaign-error>
          {sp.fehler}
        </p>
      ) : null}
      {/* Außerhalb des Kampagnen-Formulars: Das Paket-Fenster hat ein eigenes Formular */}
      {counts.whatsapp > 0 && quota.low ? (
        <div className="mb-5">
          <QuotaLowNotice
            quota={quota}
            booking={{ packs: PRICE_LIST.bestandPacks, months: PRICE_LIST.bestandPackMonths, individualFrom: PRICE_LIST.bestandPackIndividualFrom, readOnly: ctx.preview, blocker: packBlocker }}
          />
        </div>
      ) : counts.whatsapp > quota.remaining ? (
        <p className="mb-5 rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-4 py-3 text-sm text-[color:var(--muted)]" data-campaign-quota-hint>
          Diesen Monat sind noch {de(quota.remaining)} WhatsApp-Nachrichten frei. Die übrigen Empfänger bekommen ihre Nachricht nach einem Zusatzpaket oder im
          nächsten Monat, bis dahin pausiert die Kampagne.
        </p>
      ) : null}
      <form action={startCampaignAction} className="space-y-5">
        <input type="hidden" name="occasion" value={occasion} />
        <input type="hidden" name="segment" value={JSON.stringify(segment)} />
        <input type="hidden" name="channelMode" value={mode} />
        <Card>
          <CardHeader title="Kanal" icon={Send} />
          <div className="space-y-2 px-5 pb-5 text-sm" data-campaign-modes>
            <div className="grid gap-2 sm:grid-cols-3">
              {CHANNEL_MODES.filter((m) => !c.mailFeaturesOff || m.key === "whatsapp").map((m) => (
                <Link
                  key={m.key}
                  href={modeHref(m.key)}
                  aria-current={m.key === mode ? "true" : undefined}
                  className={`rounded-[var(--radius-md)] border px-3 py-2.5 ${m.key === mode ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)] font-semibold" : "border-[color:var(--border)] hover:border-[color:var(--border-strong)]"}`}
                  data-campaign-mode={m.key}
                >
                  {m.label}
                  <span className="mt-0.5 block text-xs font-normal text-[color:var(--muted)]">{m.hint}</span>
                </Link>
              ))}
            </div>
            {mode === "whatsapp_first" && used === "email" ? (
              <p className="text-xs text-[color:var(--muted)]">Ihre WhatsApp-Nummer ist nicht verbunden: Alle erreichbaren Kunden bekommen eine E-Mail.</p>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title={`${de(ids.length)} Empfänger`} icon={Megaphone} />
          <div className="space-y-4 px-5 pb-5 text-sm">
            <div className="grid grid-cols-2 gap-3" data-campaign-counts>
              <div className="rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-4 py-3">
                <div className="flex items-center gap-1.5 text-[color:var(--muted)]">
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </div>
                <div className="text-2xl font-semibold tabular-nums" data-count-whatsapp>
                  {de(counts.whatsapp)}
                </div>
              </div>
              <div className="rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-4 py-3">
                <div className="flex items-center gap-1.5 text-[color:var(--muted)]">
                  <Mail className="h-4 w-4" /> E-Mail
                </div>
                <div className="text-2xl font-semibold tabular-nums" data-count-email>
                  {de(counts.email)}
                </div>
                {counts.emailUwg ? <div className="text-xs text-[color:var(--muted)]">davon {de(counts.emailUwg)} ohne Einwilligung (§ 7 Abs. 3 UWG)</div> : null}
              </div>
            </div>
            {counts.noProof > 0 ? (
              <p className={warnBox} data-campaign-noproof>
                <b>{de(counts.noProof)} ohne Nachweis, nur mit Einwilligung:</b> Für diese Kunden fehlt der Nachweis, dass sie bei der Erhebung der E-Mail-Adresse
                auf ihr Widerspruchsrecht hingewiesen wurden. Ohne Einwilligung bekommen sie deshalb keine E-Mail.{" "}
                <Link href="/buyer/bestand/einwilligungen" className="font-semibold underline">
                  Nachweis eintragen
                </Link>
              </p>
            ) : null}
            {excluded.length ? (
              <div data-campaign-excluded>
                <p className="font-medium">Nicht dabei ({de(counts.excludedTotal)}):</p>
                <ul className="mt-1 space-y-0.5 text-[color:var(--muted)]">
                  {excluded.map(([reason, n]) => (
                    <li key={reason} className="flex justify-between gap-3">
                      <span>{reason}</span>
                      <span className="tabular-nums">{de(n ?? 0)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="text-[color:var(--muted)]">
              {occasion === "cross_sell" ? `Kunden mit ${segment.has?.join(", ")} und ohne ${segment.lacks?.join(", ")}. ` : ""}
              Ebenfalls nicht dabei: alle, die in den letzten 30 Tagen schon angeschrieben wurden.{" "}
              {isSameNeedOccasion(occasion)
                ? "Dieser Anlass betrifft bestehende Verträge: Per E-Mail geht er auch ohne Einwilligung, wenn Sie die Bestätigung zu § 7 Abs. 3 UWG abgegeben haben und für den Kunden der Nachweis zum Widerspruchshinweis vorliegt."
                : `${NEEDS_CONSENT_REASON[occasion]}.`}{" "}
              <Link href="/buyer/bestand/einwilligungen" className="underline">
                Einwilligungen &amp; Versand
              </Link>
            </p>
            {counts.excludedTotal > 0 || counts.noProof > 0 ? (
              <div className="rounded-[var(--radius-md)] border border-[color:var(--brand)] bg-[color:var(--brand-soft)] px-4 py-3" data-campaign-consent-cta>
                <p className="font-semibold">Mehr Kunden erreichen: Einwilligung einholen</p>
                <p className="mt-1">
                  Mit Einwilligung dürfen Sie zu jedem Anlass schreiben, auch per WhatsApp. Jeder Kunde hat einen persönlichen Link, über den er selbst zustimmt.
                  Geben Sie ihn im Termin, im Jahresgespräch oder per Serienbrief weiter.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a href="/buyer/bestand/einwilligungslinks" className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-3 font-medium" data-campaign-consent-links>
                    <Download className="h-4 w-4" /> Einwilligungslinks (CSV)
                  </a>
                  <Link href="/buyer/bestand/einwilligungen" className="inline-flex h-9 items-center rounded-[var(--radius-md)] px-3 font-medium underline">
                    Einwilligungen &amp; Versand
                  </Link>
                </div>
              </div>
            ) : null}
            {valueSum > 0 ? (
              <div className="rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-4 py-3" data-campaign-value>
                <p>
                  <b>Beitragsvolumen der Empfänger: {eurRound(valueSum)} pro Jahr.</b> Die wertvollsten Kunden (höchster Jahresbeitrag) werden zuerst angeschrieben.
                </p>
                <ol className="mt-2 space-y-0.5 text-[color:var(--muted)]">
                  {top.map((t) => (
                    <li key={t.id} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{displayName(t)}</span>
                      <span className="tabular-nums">{eurRound(Number(t.premiumTotal))}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            {occasion === "cross_sell" || occasion === "renewal" ? (
              <label className="block text-xs font-medium text-[color:var(--muted)]">
                Thema in der Nachricht
                <input name="topic" defaultValue={topic ?? ""} className="mt-1 h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 text-sm text-[color:var(--foreground)]" />
                {occasion === "renewal" ? (
                  <span className="mt-1 block font-normal">Jede Nachricht nennt die Sparte des Vertrags, der bei diesem Kunden abläuft. Das Thema hier gilt nur, wenn sie fehlt.</span>
                ) : null}
              </label>
            ) : null}
            <label className="block text-xs font-medium text-[color:var(--muted)]">
              Höchstens pro Tag
              <input name="dailyLimit" type="number" min={10} max={1000} defaultValue={150} className="mt-1 h-10 w-32 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 text-sm text-[color:var(--foreground)]" />
              <span className="mt-1 block font-normal">
                WhatsApp Mo bis Sa 9 bis 19 Uhr. E-Mails werktags 8 bis 18 Uhr in zufälligen Abständen, mit Tageslimit Ihres Postfachs. Langsam starten schützt Nummer und
                Postfach.
              </span>
            </label>
          </div>
        </Card>

        {counts.whatsapp > 0 || used !== "email" ? (
          <Card>
            <CardHeader title="So sieht die WhatsApp-Nachricht aus" icon={MessageCircle} />
            <div className="px-5 pb-5">
              <div className="max-w-sm rounded-2xl rounded-tl-sm bg-[#dcf8c6] px-4 py-3 text-[15px] leading-snug text-zinc-900 shadow-sm">{preview}</div>
              <p className="mt-3 text-xs text-[color:var(--muted)]">
                Antwortet ein Kunde, übernimmt Ihr digitaler Assistent, klärt kurz den Bedarf und bietet einen Termin an. Das Gespräch erscheint als Lead in
                Ihrer Pipeline. „Stopp“ sperrt den Kunden automatisch.
              </p>
              {avail.waAvailable ? (
                <p className="mt-2 text-xs text-[color:var(--muted)]" data-template-state>
                  Vorlage für diesen Anlass: <b>{TEMPLATE_STATE_LABEL[templateState(tplRows, purpose)]}</b>
                </p>
              ) : null}
            </div>
          </Card>
        ) : null}

        {counts.email > 0 || used !== "whatsapp" ? (
          <Card>
            <CardHeader title="So sieht die E-Mail aus" icon={Mail} />
            <div className="space-y-3 px-5 pb-5 text-sm" data-campaign-mail>
              <label className="block text-xs font-medium text-[color:var(--muted)]">
                Betreff
                <input name="mailSubject" defaultValue={def.subject} maxLength={200} className="mt-1 h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 text-sm text-[color:var(--foreground)]" />
              </label>
              <label className="block text-xs font-medium text-[color:var(--muted)]">
                Text (Platzhalter: {"{anrede}"}, {"{thema}"}, {"{meinname}"}{occasion === "empfehlung" ? ", {empfehlungslink}" : ""})
                <textarea name="mailBody" defaultValue={def.body} rows={9} maxLength={5000} className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2 text-sm text-[color:var(--foreground)]" />
              </label>
              <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-4 py-3">
                <p className="text-xs text-[color:var(--muted)]">Vorschau mit Standardtext:</p>
                <p className="mt-1 font-semibold">{mailPreview.subject}</p>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-[13px] leading-relaxed">{mailPreview.text}</pre>
              </div>
              <p className="text-xs text-[color:var(--muted)]">
                {counts.emailUwg > 0 ? (
                  <>
                    <b>{de(counts.emailUwg)} E-Mails gehen ohne Einwilligung nach § 7 Abs. 3 UWG raus:</b> Schreiben Sie darin nur zum bestehenden Vertrag, nicht zu
                    anderen Produkten.{" "}
                  </>
                ) : null}
                Persönliche Einzelmail über Ihr Postfach{avail.mailbox ? ` (${avail.mailbox.email})` : ""}, Text und schlichtes HTML ohne Tracking. Abmeldelink und Ihre Pflichtangaben
                stehen immer unten. Antworten landen in Ihrem Postfach: Tragen Sie sie in der Kampagne unter „Antwort zuordnen“ ein, dann wird daraus ein Lead.
              </p>
            </div>
          </Card>
        ) : null}

        {locked ? (
          <p className={warnBox}>
            Die Empfehlungsbitte gehört zum Modul „Empfehlungen &amp; Bewertungen“: Jeder Kunde bekommt seinen persönlichen Empfehlungslink, die empfohlene
            Person trägt sich selbst ein und landet als Lead bei Ihnen.{" "}
            <Link href="/buyer/konto?modul=empfehlung#zusatzmodule" className="font-semibold underline">
              Modul 30 Tage kostenlos testen
            </Link>
          </p>
        ) : null}
        {!locked && notice ? (
          <div className={`flex flex-wrap items-center gap-3 ${notice.kind === "pending" ? `${box} border-sky-200 bg-sky-50 text-sky-900` : warnBox}`} data-template-notice={notice.kind}>
            <span className="min-w-0 flex-1">{notice.text}</span>
            {notice.kind === "connect" ? (
              <ButtonLink href={notice.href} variant="primary">
                WhatsApp verbinden
              </ButtonLink>
            ) : null}
          </div>
        ) : null}
        {counts.email > 0 && !avail.mailbox ? (
          <div className={`flex flex-wrap items-center gap-3 ${warnBox}`} data-mail-connect>
            <span className="min-w-0 flex-1">Für E-Mails verbinden Sie bitte Ihr Postfach. Die Mails gehen dann persönlich von Ihrer Adresse raus.</span>
            <ButtonLink href="/buyer/postfach" variant="primary">
              Postfach verbinden
            </ButtonLink>
          </div>
        ) : null}
        {counts.email > 0 && !imprint ? (
          <p className={warnBox} data-mail-imprint>
            Unter jeder E-Mail stehen Ihre Pflichtangaben (Impressum). Bitte tragen Sie sie unter{" "}
            <Link href="/buyer/bestand/einwilligungen" className="font-semibold underline">
              Einwilligungen &amp; Versand
            </Link>{" "}
            ein.
          </p>
        ) : null}
        {counts.email > 0 && mailQuota.remaining <= 0 ? <p className={warnBox}>Das E-Mail-Kontingent für diesen Monat ist aufgebraucht ({de(mailQuota.limit)} E-Mails). Ab dem 1. geht es weiter.</p> : null}

        {!c.bestandAgentConfirmedAt ? (
          <Card>
            <CardHeader title="Vor der ersten Kampagne" icon={Scale} />
            <div className="space-y-3 px-5 pb-5 text-sm">
              <p className="text-[color:var(--muted)]">
                Als Ausschließlichkeitsvertreter gehören die Kundendaten oft dem Versicherer. Nutzen Sie sie nur im Rahmen Ihres Vertretervertrags bzw. mit der
                Einwilligung „laut Versicherer“. Die rechtliche Bewertung liegt bei Ihnen.
              </p>
              <label className="flex items-start gap-2">
                <input type="checkbox" name="agentConfirm" className="mt-0.5 h-4 w-4" data-agent-confirm />
                <span>Ich darf diese Kundendaten für diese Ansprache nutzen (im Rahmen meines Vertretervertrags bzw. meiner Befugnisse).</span>
              </label>
            </div>
          </Card>
        ) : null}
        <p className="text-xs text-[color:var(--muted)]">
          Hinweis: Wir prüfen Einwilligung und Anlass nach den Regeln, die Sie unter Einwilligungen &amp; Versand finden. Die rechtliche Bewertung im Einzelfall liegt bei
          Ihnen.
        </p>
        <Button type="submit" variant="primary" size="md" icon={Send} disabled={!ready || ctx.preview} data-campaign-start>
          {notice?.kind === "pending" && counts.whatsapp > 0 ? "Kampagne vorbereiten" : "Kampagne starten"}
        </Button>
      </form>
    </main>
  );
}
