import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { ChevronDown, Mail, MessageCircle, UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { Badge, ButtonLink, Card, EmptyState } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import {
  bookingSlugFor,
  campaignMailFor,
  channelAvailability,
  datumText,
  effectiveMode,
  LINE_LABEL,
  NEEDS_EMPFEHLUNG,
  OCCASIONS,
  offeredFor,
  planAudience,
  TOPIC_LABEL,
  vorlagenThema,
  WEITERES_PRODUKT_NAME,
  type Occasion,
  type Segment,
} from "@/lib/bestand/campaigns";
import { crossSellOffenWhere } from "@/lib/cross-sell-offen";
import { rankTemplates, renderTemplate, templateTextFor, fillNames, type NoticePurpose } from "@/lib/whatsapp/templates";
import { templateNamesOf } from "@/lib/whatsapp/template-plan";
import { startCampaignAction } from "../actions";
import { bestandMailQuota, bestandQuota } from "@/lib/bestand/quota";
import { packPurchaseBlocker } from "@/lib/bestand/packs";
import { PRICE_LIST } from "@/lib/offer-pricing";
import { QuotaLowNotice } from "@/components/bestand/quota-bar";
import { asChannelMode, CHANNEL_MODES, isSameNeedOccasion, NEEDS_CONSENT_REASON } from "@/lib/bestand/einwilligung";
import { loadConsentSettings } from "@/lib/bestand/einwilligung-server";
import { defaultCampaignMail, imprintFromWebsiteInfo, PLATZHALTER_LABEL, platzhalterFuer, platzhalterZuAnzeige } from "@/lib/bestand/kampagnen-mail";
import { CONNECT_HREF, needsSubmit, templateNotice } from "@/lib/whatsapp/vorlagen-hinweis";
import { advisorPerson } from "@/lib/lead-anrede";
import { publicUrlOr } from "@/lib/public-url";
import { agentConfirmText, isAgencyBound, mayOffer, needsAgentConfirm } from "@/lib/bestand/befugnis";
import { EMPFEHLUNG_MODULE_AVAILABLE } from "@/lib/empfehlung/shared";
import { loadCustomerProvision } from "@/lib/provision-server";
import { erwarteteProvision, provisionForLine, quotenFor, spanneText } from "@/lib/bestand/potenzial";
import { terminlinkFuer } from "@/lib/bestand/terminlink";
import { KampagneStart, type StartBlocker } from "@/components/bestand/kampagne-start";
import { MailEditor } from "@/components/bestand/mail-editor";
import { nowMs } from "@/lib/now";

export const dynamic = "force-dynamic";

// Kampagne in einem Bildschirm (Paket 2, 20.11.2026, docs/ux/2026-11-19-bestand-champions.md): drei Blöcke (Wer,
// Nachricht, Knopf). Kanal, Ausschlüsse, Bearbeiten und Einstellungen liegen in Aufklappern. Der Startknopf klebt am
// Handy unten und nennt, was fehlt. Bei 0 Empfängern statt Editor ein leerer Zustand mit nächster Handlung.

const de = (n: number) => n.toLocaleString("de-DE");
const FORM_ID = "kampagne";
const box = "rounded-[var(--radius-md)] border px-4 py-3 text-sm";
const warnBox = `${box} border-amber-200 bg-amber-50 text-amber-900`;
const summary = "flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 text-sm font-medium text-[color:var(--brand)] [&::-webkit-details-marker]:hidden";

type Sp = { anlass?: string; segment?: string; thema?: string; kanal?: string; fehler?: string; vorschau?: string };

export default async function CampaignSetup({ searchParams }: { searchParams: Promise<Sp> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const c = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { existingCustomersEnabled: true, empfehlungEnabled: true, name: true, bestandAgentConfirmedAt: true, bestandAgentConfirmedVersion: true, vermittlerTyp: true, bestandSparten: true, mailFeaturesOff: true } });
  if (ctx.teamRole !== "owner") redirect("/buyer");
  if (!c?.existingCustomersEnabled) redirect("/buyer/bestand");
  const sp = await searchParams;
  const occasion = (sp.anlass && sp.anlass in OCCASIONS ? sp.anlass : "review") as Occasion;
  // E-Mail-Funktionen aus („Meine Gesellschaft erlaubt das nicht“): Kampagnen nur per WhatsApp
  const mode = c.mailFeaturesOff ? "whatsapp" : asChannelMode(sp.kanal);
  // Empfehlungsbitte nur mit Modul „Empfehlungen & Bewertungen“
  const locked = NEEDS_EMPFEHLUNG.includes(occasion) && !c.empfehlungEnabled;
  let segment: Segment = {};
  try {
    segment = JSON.parse(sp.segment ?? "{}") as Segment;
  } catch {
    /* leer */
  }
  // „Weiteres Produkt anbieten“ aus den Kontakten (lib/cross-sell-verkauf.ts): Thema je Kunde automatisch
  const weiteres = occasion === "cross_sell" && !!segment.ohneWeiteresProdukt;
  const topic = sp.thema ?? (segment.lacks?.[0] ? (TOPIC_LABEL[segment.lacks[0]] ?? segment.lacks[0]) : null);
  const purpose = OCCASIONS[occasion].purpose as NoticePurpose;
  const [avail, templates, allTemplates, quota, mailQuota, packBlocker, settings, sender, offered, provision, slug] = await Promise.all([
    channelAvailability(ctx.customerId, occasion, ctx.userId),
    prisma.messageTemplate.findMany({ where: { customerId: ctx.customerId, purpose, status: "approved" }, orderBy: { updatedAt: "desc" } }),
    prisma.messageTemplate.findMany({ where: { customerId: ctx.customerId, purpose: { startsWith: "campaign_" } }, select: { purpose: true, status: true } }),
    bestandQuota(ctx.customerId),
    bestandMailQuota(ctx.customerId),
    packPurchaseBlocker(ctx.customerId),
    loadConsentSettings(ctx.customerId),
    ctx.userId ? prisma.user.findUnique({ where: { id: ctx.userId }, select: { displayName: true } }) : null,
    offeredFor(ctx.customerId),
    loadCustomerProvision(ctx.customerId),
    bookingSlugFor(ctx.customerId),
  ]);
  // Ausschließlichkeitsvertreter: Cross-Selling in eine Sparte, die er nicht anbietet → deutlicher Hinweis
  const foreignLines = occasion === "cross_sell" ? (segment.lacks ?? []).filter((l) => !mayOffer(offered, l)) : [];
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

  // Euro-Spanne (Schätzung, nur intern): wie im Cockpit, Provision der angebotenen Sparte aus „Meine Provisionen“
  const line = occasion === "cross_sell" ? (segment.lacks?.[0] ?? null) : null;
  const euro = spanneText(erwarteteProvision(ids.length, quotenFor(occasion), provisionForLine(line, provision.rates)));

  // Kontakte ohne Eintrag im Bestand (Abschluss ohne eingetragenen Vertrag) können nicht dabei sein: ehrlich mitzählen
  const nichtImBestand = weiteres
    ? await prisma.lead.count({ where: { customerId: ctx.customerId, ...crossSellOffenWhere(new Date()), bestandKunde: { is: null } } })
    : 0;
  const excluded = [
    ...Object.entries(counts.excluded),
    ...(nichtImBestand ? [["Ohne eingetragenen Vertrag (nicht im Bestand)", nichtImBestand] as [string, number]] : []),
  ].sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  const excludedTotal = counts.excludedTotal + nichtImBestand;

  const title = weiteres
    ? WEITERES_PRODUKT_NAME
    : occasion === "cross_sell" && segment.has?.length && segment.lacks?.length
      ? `${segment.has.map(LINE_LABEL).join(", ")}-Kunden ohne ${segment.lacks.map((l) => TOPIC_LABEL[l] ?? l).join(", ")}`
      : OCCASIONS[occasion].label;

  // ─── 0 Empfänger: leerer Zustand mit nächster Handlung statt Editor ───
  if (!locked && ids.length === 0) {
    const top = excluded[0]?.[0];
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <Link href="/buyer/bestand" className="text-sm text-[color:var(--brand)] hover:underline">
          ← Bestand
        </Link>
        <PageHeader title={title} />
        <Card>
          <div data-campaign-empty>
            <EmptyState
              icon={Users}
              title="Noch niemand erreichbar"
              text={top ? `Häufigster Grund: ${top}. Mit Einwilligung dürfen Sie zu jedem Anlass schreiben.` : "Tragen Sie Verträge ein oder holen Sie Einwilligungen ein."}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <ButtonLink href="/buyer/bestand/einwilligungen" variant="primary" size="md" icon={UserPlus}>
                    Einwilligung anfragen
                  </ButtonLink>
                  <ButtonLink href="/buyer/bestand/import" variant="secondary" size="md">
                    Vertrag eintragen
                  </ButtonLink>
                </div>
              }
            />
          </div>
        </Card>
      </main>
    );
  }

  // ─── Vorschau: eine Nachricht mit Beispielkunde ───
  const needWa = counts.whatsapp > 0;
  const needMail = counts.email > 0;
  const showMail = !needWa || used === "email" || (sp.vorschau === "email" && needMail);
  const bothChannels = needWa && needMail;
  const beispielThema = occasion === "renewal" ? (TOPIC_LABEL.KFZ ?? "Kfz-Versicherung") : weiteres ? (TOPIC_LABEL.Hausrat ?? "Hausrat") : "";
  const linkExample = publicUrlOr("/empfehlung/…");
  const rest = [occasion === "empfehlung" ? linkExample : vorlagenThema(occasion, topic ?? (beispielThema || null))];
  const pick = rankTemplates(templates, purpose, "sie", { firstName: "Erika", lastName: "Muster", salutation: "Frau" });
  const waPreview = pick
    ? renderTemplate(pick.tpl.body, pick.params(rest))
    : renderTemplate(fillNames(templateTextFor(purpose, "sie"), templateNamesOf(c.name)), ["Frau Muster", ...rest]);
  const imprint = settings.imprint ?? imprintFromWebsiteInfo(settings.websiteInfo);
  const meinname = advisorPerson(c.name, sender?.displayName ?? null);
  const def = defaultCampaignMail(occasion, settings.ansprache);
  const mailPreview = await campaignMailFor(
    { customerId: ctx.customerId, occasion, topic: topic ?? (weiteres || occasion === "renewal" ? beispielThema : null), mailSubject: null, mailBody: null },
    { id: "vorschau", firstName: "Erika", lastName: "Muster", salutation: "Frau" },
    {
      recipientId: "vorschau0",
      customerName: c.name,
      imprint,
      meinname,
      empfehlungslink: occasion === "empfehlung" ? linkExample : null,
      ansprache: settings.ansprache,
      extras: {
        terminlink: occasion === "birthday" || occasion === "empfehlung" ? null : terminlinkFuer(slug),
        datum: occasion === "renewal" ? datumText(new Date(nowMs() + 45 * 86_400_000)) : null,
        anzahl: occasion === "review" ? 3 : null,
      },
    },
  );
  // Text und Fuß der Vorschau getrennt (Fuß im Aufklapper, steht in jeder Mail)
  const [mailBodyPreview, ...footerParts] = mailPreview.text.split("\n\n\n");
  const mailFooterPreview = footerParts.join("\n\n\n");

  // ─── Startbereit? Fehlt etwas, nennt der Knopf genau das (nie grau ohne Grund) ───
  const modeHref = (k: string, extra: Record<string, string> = {}) =>
    `/buyer/bestand/kampagne?${new URLSearchParams({ anlass: occasion, segment: JSON.stringify(segment), ...(topic ? { thema: topic } : {}), kanal: k, ...extra })}`;
  let blocker: StartBlocker | null = null;
  let blockKind: "wa" | "mail" | "other" = "other";
  if (locked) {
    blocker = EMPFEHLUNG_MODULE_AVAILABLE ? { label: "Erst Modul Empfehlungen testen", href: "/buyer/konto?modul=empfehlung#zusatzmodule" } : { label: "Modul gerade nicht buchbar", href: "/buyer/bestand" };
  } else if (needWa && (!avail.waAvailable || notice?.kind === "connect")) {
    blocker = { label: "Erst WhatsApp verbinden", href: notice?.kind === "connect" ? notice.href : CONNECT_HREF };
    blockKind = "wa";
  } else if (needWa && quota.remaining <= 0) {
    blocker = { label: "Erst Nachrichten nachbuchen", href: "/buyer/bestand?kontingent=1" };
    blockKind = "wa";
  } else if (needMail && !avail.mailbox) {
    blocker = { label: "Erst Postfach verbinden", href: "/buyer/postfach" };
    blockKind = "mail";
  } else if (needMail && !imprint) {
    blocker = { label: "Erst Impressum eintragen", href: "/buyer/bestand/einwilligungen" };
    blockKind = "mail";
  } else if (needMail && mailQuota.remaining <= 0) {
    blocker = { label: "E-Mails ab dem 1. wieder frei", href: "/buyer/bestand" };
    blockKind = "mail";
  }
  // Ausweg: nur der andere Kanal
  const alt: StartBlocker | null =
    blockKind === "mail" && avail.waAvailable && mode !== "whatsapp"
      ? { label: "Nur WhatsApp", href: modeHref("whatsapp") }
      : blockKind === "wa" && !c.mailFeaturesOff && mode !== "email"
        ? { label: "Nur E-Mail", href: modeHref("email") }
        : null;

  const label = weiteres ? `${de(ids.length)} Kunden ein weiteres Produkt anbieten` : `${de(ids.length)} Kunden anschreiben`;
  const hint = blocker
    ? blockKind === "mail"
      ? `${de(counts.email)} Kunden bekommen eine E-Mail. ${alt ? "Oder Sie schreiben nur per WhatsApp." : ""}`.trim()
      : blockKind === "wa"
        ? `${de(counts.whatsapp)} Kunden bekommen eine WhatsApp-Nachricht. ${alt ? "Oder Sie schreiben nur per E-Mail." : ""}`.trim()
        : null
    : notice?.kind === "pending" && needWa
      ? "WhatsApp startet, sobald Meta die Vorlage freigegeben hat."
      : occasion === "birthday"
        ? "Jeder Glückwunsch geht am Geburtstag selbst raus."
        : `Geht schrittweise raus, ${needWa ? "WhatsApp Mo bis Sa 9 bis 19 Uhr" : "werktags 8 bis 18 Uhr"}. Antworten landen als Lead in Ihrer Pipeline.`;
  const confirm = needsAgentConfirm(c)
    ? {
        text: agentConfirmText(c.vermittlerTyp),
        intro: isAgencyBound(c.vermittlerTyp)
          ? "Als Vertreter mit Agenturvertrag gehören die Kundendaten oft dem Versicherer. Nutzen Sie sie nur im Rahmen Ihres Agenturvertrags bzw. mit der Einwilligung „laut Versicherer“. Die rechtliche Bewertung liegt bei Ihnen."
          : null,
      }
    : null;
  const modeLabel = { whatsapp_first: "WhatsApp bevorzugt", whatsapp: "Nur WhatsApp", email: "Nur E-Mail" }[mode];
  const chips = platzhalterFuer(occasion).map((k) => ({ key: k, label: PLATZHALTER_LABEL[k] }));
  const tab = (active: boolean) => `rounded-full px-3 py-1 ${active ? "bg-[color:var(--brand-soft)] text-[color:var(--foreground)]" : "text-[color:var(--muted)]"}`;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/buyer/bestand" className="text-sm text-[color:var(--brand)] hover:underline">
        ← Bestand
      </Link>
      <PageHeader title={title} />
      {foreignLines.length ? (
        <p className={`mb-4 ${warnBox}`} data-campaign-foreign-line>
          {foreignLines.join(", ")} steht nicht bei Ihren Sparten. Als Ausschließlichkeitsvertreter vermitteln Sie in der Regel nur Produkte Ihres Versicherers.{" "}
          <Link href="/buyer/bestand/einwilligungen#sparten" className="font-semibold underline">
            Meine Sparten
          </Link>
        </p>
      ) : null}
      {sp.fehler ? (
        <p className={`mb-4 ${box} border-rose-200 bg-rose-50 text-rose-900`} data-campaign-error>
          {sp.fehler}
        </p>
      ) : null}
      {/* Außerhalb des Kampagnen-Formulars: Das Paket-Fenster hat ein eigenes Formular */}
      {needWa && quota.low ? (
        <div className="mb-4">
          <QuotaLowNotice
            quota={quota}
            waiting={counts.whatsapp}
            booking={{ packs: PRICE_LIST.bestandPacks, months: PRICE_LIST.bestandPackMonths, individualFrom: PRICE_LIST.bestandPackIndividualFrom, readOnly: ctx.preview, blocker: packBlocker }}
          />
        </div>
      ) : null}
      <form id={FORM_ID} action={startCampaignAction} className="space-y-4">
        <input type="hidden" name="occasion" value={occasion} />
        <input type="hidden" name="segment" value={JSON.stringify(segment)} />
        <input type="hidden" name="channelMode" value={mode} />

        {/* ─── Wer ─── */}
        <Card>
          <div className="px-5 pb-3 pt-4" data-campaign-who>
            <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--muted)]">Wer</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums" data-campaign-count>
              {de(ids.length)} Kunden
            </p>
            {euro ? (
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm" data-campaign-euro>
                <span>
                  <b className="tabular-nums">{euro}</b> Provision möglich
                </span>
                <Badge>Schätzung</Badge>
              </p>
            ) : null}
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[color:var(--muted)]" data-campaign-counts>
              {needWa ? (
                <span className="inline-flex items-center gap-1" data-count-whatsapp>
                  <MessageCircle className="h-4 w-4" /> {de(counts.whatsapp)} per WhatsApp
                </span>
              ) : null}
              {needMail ? (
                <span className="inline-flex items-center gap-1" data-count-email>
                  <Mail className="h-4 w-4" /> {de(counts.email)} per E-Mail
                </span>
              ) : null}
            </p>
            {counts.whatsapp > quota.remaining && !quota.low ? (
              <p className="mt-1 text-xs text-[color:var(--muted)]" data-campaign-quota-hint>
                {de(quota.remaining)} WhatsApp-Nachrichten frei, danach pausiert die Kampagne bis zum Nachbuchen oder nächsten Monat.
              </p>
            ) : null}
          </div>
          <div className="divide-y divide-[color:var(--border)] border-t border-[color:var(--border)] px-5">
            {!c.mailFeaturesOff ? (
              <details className="group" data-campaign-modes>
                <summary className={summary}>
                  <span className="min-w-0 flex-1 truncate text-[color:var(--foreground)]">
                    Kanal: <span className="font-normal">{modeLabel}</span>
                  </span>
                  <span>Ändern</span>
                  <ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" />
                </summary>
                <div className="grid gap-2 pb-3 sm:grid-cols-3">
                  {CHANNEL_MODES.map((m) => (
                    <Link
                      key={m.key}
                      href={modeHref(m.key)}
                      aria-current={m.key === mode ? "true" : undefined}
                      className={`rounded-[var(--radius-md)] border px-3 py-2.5 text-sm ${m.key === mode ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)] font-semibold" : "border-[color:var(--border)] hover:border-[color:var(--border-strong)]"}`}
                      data-campaign-mode={m.key}
                    >
                      {m.label}
                    </Link>
                  ))}
                  {mode === "whatsapp_first" && used === "email" ? <p className="text-xs text-[color:var(--muted)] sm:col-span-3">WhatsApp ist nicht verbunden: Alle bekommen eine E-Mail.</p> : null}
                </div>
              </details>
            ) : null}
            {excludedTotal > 0 || counts.noProof > 0 ? (
              <details className="group" data-campaign-excluded>
                <summary className={summary}>
                  <span className="flex-1 text-[color:var(--foreground)]">{de(excludedTotal)} nicht dabei</span>
                  <span>Warum?</span>
                  <ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" />
                </summary>
                <div className="space-y-2 pb-3 text-sm">
                  <ul className="space-y-0.5 text-[color:var(--muted)]">
                    {excluded.map(([reason, n]) => (
                      <li key={reason} className="flex justify-between gap-3">
                        <span>{reason}</span>
                        <span className="tabular-nums">{de(n ?? 0)}</span>
                      </li>
                    ))}
                  </ul>
                  {counts.noProof > 0 ? (
                    <p className="text-[color:var(--muted)]" data-campaign-noproof>
                      {de(counts.noProof)} ohne Nachweis zum Widerspruchshinweis bekommen ohne Einwilligung keine E-Mail.
                    </p>
                  ) : null}
                  <p className="text-xs text-[color:var(--muted)]">
                    Nie dabei: wer in den letzten 30 Tagen angeschrieben wurde.{" "}
                    {isSameNeedOccasion(occasion)
                      ? "Zu bestehenden Verträgen geht die E-Mail auch ohne Einwilligung, wenn Ihre Bestätigung zu § 7 Abs. 3 UWG und der Nachweis zum Widerspruchshinweis vorliegen."
                      : `${NEEDS_CONSENT_REASON[occasion]}.`}{" "}
                    Die rechtliche Bewertung im Einzelfall liegt bei Ihnen.
                  </p>
                  <ButtonLink href="/buyer/bestand/einwilligungen" variant="secondary" size="sm" icon={UserPlus}>
                    Einwilligung anfragen
                  </ButtonLink>
                </div>
              </details>
            ) : null}
            <details className="group" data-campaign-settings>
              <summary className={summary}>
                <span className="flex-1 text-[color:var(--foreground)]">Einstellungen</span>
                <ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" />
              </summary>
              <label className="block pb-3 text-xs font-medium text-[color:var(--muted)]">
                Höchstens pro Tag
                <input name="dailyLimit" type="number" min={10} max={1000} defaultValue={150} className="mt-1 block h-10 w-32 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 text-sm text-[color:var(--foreground)]" />
                <span className="mt-1 block font-normal">Kunden mit höherem Jahresbeitrag zuerst. E-Mails werktags 8 bis 18 Uhr mit Pausen, langsam starten schützt Nummer und Postfach.</span>
              </label>
            </details>
          </div>
        </Card>

        {/* ─── Nachricht ─── */}
        <Card>
          <div className="px-5 pb-3 pt-4" data-campaign-message>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--muted)]">Nachricht</p>
              {bothChannels && used !== "email" ? (
                <div className="flex rounded-full border border-[color:var(--border)] p-0.5 text-xs font-medium" data-campaign-preview-tabs>
                  <Link href={modeHref(mode)} scroll={false} className={tab(!showMail)}>
                    WhatsApp
                  </Link>
                  <Link href={modeHref(mode, { vorschau: "email" })} scroll={false} className={tab(showMail)}>
                    E-Mail
                  </Link>
                </div>
              ) : null}
            </div>
            {showMail ? (
              <div className="mt-3 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-4 py-3 text-sm" data-campaign-mail data-campaign-preview>
                <p className="font-semibold [overflow-wrap:anywhere]">{mailPreview.subject}</p>
                <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed [overflow-wrap:anywhere]">{mailBodyPreview}</pre>
                {mailFooterPreview ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer list-none text-xs text-[color:var(--muted)] [&::-webkit-details-marker]:hidden">Darunter immer: Abmeldelink und Impressum ▾</summary>
                    <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-[color:var(--muted)] [overflow-wrap:anywhere]">{mailFooterPreview}</pre>
                  </details>
                ) : null}
              </div>
            ) : (
              <div className="mt-3" data-campaign-preview>
                <div className="max-w-sm rounded-2xl rounded-tl-sm bg-[#dcf8c6] px-4 py-3 text-[15px] leading-snug text-zinc-900 shadow-sm">{waPreview}</div>
              </div>
            )}
            <p className="mt-2 text-xs text-[color:var(--muted)]">
              Beispiel mit Erika Muster. {showMail ? "Persönlich von Ihrer Adresse, ohne Tracking." : "Antworten übernimmt Ihr Assistent, „Stopp“ sperrt sofort."}
            </p>
            {needMail || occasion === "cross_sell" || occasion === "renewal" ? (
              <details className="group mt-2 border-t border-[color:var(--border)]" data-campaign-edit>
                <summary className={summary}>
                  <span className="flex-1">{needMail ? "Text bearbeiten" : "Thema ändern"}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" />
                </summary>
                <div className="space-y-3 pb-2">
                  {occasion === "cross_sell" || occasion === "renewal" ? (
                    <label className="block text-xs font-medium text-[color:var(--muted)]">
                      Thema
                      <input name="topic" defaultValue={topic ?? ""} className="mt-1 h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 text-sm text-[color:var(--foreground)]" />
                      {occasion === "renewal" || weiteres ? (
                        <span className="mt-1 block font-normal">{occasion === "renewal" ? "Sonst die Sparte des Vertrags, der abläuft." : "Leer lassen: die naheliegende Ergänzung je Kunde."}</span>
                      ) : null}
                    </label>
                  ) : null}
                  {needMail ? <MailEditor subject={platzhalterZuAnzeige(def.subject)} body={platzhalterZuAnzeige(def.body)} chips={chips} /> : null}
                  {needMail && counts.emailUwg > 0 ? (
                    <p className="text-xs text-[color:var(--muted)]" data-campaign-uwg>
                      {de(counts.emailUwg)} E-Mails gehen ohne Einwilligung raus (§ 7 Abs. 3 UWG): Schreiben Sie darin nur zum bestehenden Vertrag.
                    </p>
                  ) : null}
                  {needWa && needMail ? <p className="text-xs text-[color:var(--muted)]">Gilt für die E-Mail. Die WhatsApp-Nachricht ist eine von Meta freigegebene Vorlage.</p> : null}
                </div>
              </details>
            ) : null}
          </div>
        </Card>

        <KampagneStart formId={FORM_ID} label={label} blocker={blocker} alt={alt} confirm={confirm} hint={hint} readOnly={ctx.preview} />
      </form>
    </main>
  );
}
