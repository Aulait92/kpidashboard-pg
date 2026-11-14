import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, BarChart3, Filter, Gift, ListChecks, QrCode, Star } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { Badge, Card, CardHeader } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { nowMs } from "@/lib/now";
import { moduleInfo } from "@/lib/empfehlung/module";
import { generalLinkOf, loadEmpfehlungStats, loadSettings, openRewards, recentRequests, referralLinkFor } from "@/lib/empfehlung/requests";
import { advisorDisplayName } from "@/lib/whatsapp/template-plan";
import { fmtDate, resolveOffer, signatureLine } from "@/lib/empfehlung/shared";
import { PRICE_LIST } from "@/lib/offer-pricing";
import { EmpfehlungFunnel, EmpfehlungStatsGrid } from "@/components/empfehlung/server";
import { WaechterSection } from "@/components/empfehlung/waechter";
import { CopyText, EmpfehlungBookButton, ResolveButton, RewardButtons, SettingsForm, TestSendForm } from "@/components/empfehlung/client";

// Modul „Empfehlungen & Bewertungen“: Einstellungen, Test, Auswertung, letzte Anfragen.
export const dynamic = "force-dynamic";
export const metadata = { title: "Empfehlungen & Bewertungen | performancegrowth" };

const STATUS: Record<string, string> = {
  scheduled: "geplant",
  sending: "wird gesendet",
  sent: "gesendet",
  answered: "beantwortet",
  skipped: "übersprungen",
  failed: "fehlgeschlagen",
  off: "nicht anfragen",
};

export default async function EmpfehlungenPage({ searchParams }: { searchParams: Promise<{ google?: string; tab?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab === "einstellungen" || sp.tab === "teilen" ? sp.tab : sp.google ? "teilen" : "uebersicht";
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  if (ctx.teamRole !== "owner") redirect("/buyer");
  const info = await moduleInfo(ctx.customerId);
  if (!info) redirect("/buyer");
  const customer = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { name: true, vermittlerTyp: true, whatsAppAccount: { select: { status: true } } } });
  const vertreter = advisorDisplayName(customer?.name ?? "");

  if (!info.active) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader title="Empfehlungen & Bewertungen" subtitle="Zusatzmodul" />
        <Card>
          <CardHeader title="Mehr Google-Bewertungen und Empfehlungen – automatisch" icon={Star} />
          <div className="space-y-4 px-5 pb-5 pt-4 text-sm">
            <ul className="list-disc space-y-1 pl-5">
              <li>Einige Tage nach jedem Abschluss fragt die App Ihren Kunden in Ihrem Namen, ob alles gepasst hat – mit direktem Draht zu Ihnen – und bittet um eine Google-Bewertung.</li>
              <li>Kritik landet sofort als Aufgabe bei Ihnen, damit Sie sie persönlich klären können.</li>
              <li>Einige Wochen später die Bitte um Empfehlung: Die empfohlene Person trägt sich selbst ein und landet als Lead bei Ihnen.</li>
              <li>Auswertung: Empfehlungs-Leads, Termine, Abschlüsse und geschätzte Provision.</li>
            </ul>
            <EmpfehlungBookButton
              trial={info.trialAvailable}
              annual={info.annual}
              monthly={PRICE_LIST.empfehlungModuleMonthly}
              readOnly={ctx.preview}
              reason={info.service ? "Das Modul gibt es nur im Paket mit Software." : null}
            />
          </div>
        </Card>
      </main>
    );
  }

  const [settings, stats, requests, templates] = await Promise.all([
    loadSettings(ctx.customerId),
    loadEmpfehlungStats(ctx.customerId, 90),
    recentRequests(ctx.customerId, 30),
    prisma.messageTemplate.findMany({ where: { customerId: ctx.customerId, purpose: { in: ["review_request", "referral_request", "referral_thanks"] } }, select: { purpose: true, status: true } }),
  ]);
  // Allgemeiner Link für die E-Mail-Signatur (in der Admin-Vorschau nichts anlegen)
  const general = ctx.preview ? await prisma.referralLink.findFirst({ where: { customerId: ctx.customerId, kind: "general" } }) : await generalLinkOf(ctx.customerId);
  const generalUrl = general ? referralLinkFor(general.token) : null;
  const offer = resolveOffer(settings, vertreter);
  const rewards = await openRewards(ctx.customerId);
  const approved = (p: string) => templates.some((t) => t.purpose === p && t.status === "approved");
  const warnings = [
    !settings.googleReviewUrl ? "Bitte Ihren Google-Bewertungslink hinterlegen – ohne ihn geht keine Nachfrage raus." : null,
    customer?.whatsAppAccount?.status !== "connected" ? "WhatsApp ist noch nicht verbunden. Die Nachrichten gehen über Ihre WhatsApp-Nummer raus." : null,
    customer?.whatsAppAccount?.status === "connected" && (!approved("review_request") || !approved("referral_request"))
      ? "Die WhatsApp-Vorlagen des Moduls sind bei Meta eingereicht und noch nicht freigegeben (meist wenige Stunden bis zwei Tage). Bis dahin warten die Nachfragen."
      : null,
    !settings.active ? "Automatisches Nachfragen ist pausiert." : null,
  ].filter((w): w is string => !!w);

  const tabs = [
    { id: "uebersicht", label: "Übersicht" },
    { id: "einstellungen", label: "Einstellungen" },
    { id: "teilen", label: "Teilen & Google" },
  ] as const;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Empfehlungen & Bewertungen"
        subtitle={info.state === "trial" && info.trialEndsAt ? `Testphase bis ${fmtDate(info.trialEndsAt)}` : "Nach jedem Abschluss: Nachfrage mit Google-Link, später Bitte um Empfehlung."}
      />
      {/* Reiter statt einer langen Seite (Ole, 14.11.2026) */}
      <nav className="mb-5 border-b border-[color:var(--border)]" aria-label="Bereiche" data-empfehlung-tabs>
        <ul className="-mb-px flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <li key={t.id}>
              <Link
                href={t.id === "uebersicht" ? "/buyer/empfehlungen" : `/buyer/empfehlungen?tab=${t.id}`}
                aria-current={tab === t.id ? "page" : undefined}
                className={`inline-flex items-center whitespace-nowrap border-b-2 px-4 py-2.5 text-[15px] font-semibold transition ${
                  tab === t.id ? "border-[color:var(--brand)] text-[color:var(--brand)]" : "border-transparent text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                }`}
              >
                {t.label}
                {t.id === "uebersicht" && rewards.length ? <span className="ml-1.5 rounded-full bg-rose-600 px-1.5 py-0.5 text-[11px] font-bold text-white">{rewards.length}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="space-y-5">
        {warnings.length ? (
          <div className="space-y-2" data-empfehlung-warnings>
            {warnings.map((w) => (
              <p key={w} className="flex items-start gap-2 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {w}
              </p>
            ))}
          </div>
        ) : null}


        {tab === "uebersicht" ? (
          <>
        {rewards.length ? (
          <Card>
            <CardHeader title="Offene Dankeschöns" icon={Gift} count={rewards.length} />
            <ul className="divide-y divide-[color:var(--border)] text-sm" data-empfehlung-rewards>
              {rewards.map((r) => (
                <li key={r.leadId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    <b>{r.label}</b> für{" "}
                    {r.recommenderLeadId ? (
                      <Link href={`/buyer/leads/${r.recommenderLeadId}`} className="font-medium hover:underline">
                        {r.recommender}
                      </Link>
                    ) : (
                      <span className="font-medium">{r.recommender}</span>
                    )}
                    <span className="block text-sm text-[color:var(--muted)]">
                      Empfehlung: {r.referred}
                      {r.dueAt && r.dueAt.getTime() > nowMs() ? ` · frühestens ab ${fmtDate(r.dueAt)} (Widerrufsfrist abwarten)` : ""}
                    </span>
                  </span>
                  <RewardButtons leadId={r.leadId} readOnly={ctx.preview} />
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Auswertung (letzte 90 Tage)" icon={BarChart3} />
          <div className="px-5 pb-5 pt-4">
            <EmpfehlungStatsGrid s={stats} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Wo gehen Empfehlungen verloren? (letzte 90 Tage)" icon={Filter} />
          <div className="px-5 pb-5 pt-4">
            <EmpfehlungFunnel s={stats} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Letzte Nachfragen" icon={ListChecks} count={requests.length || undefined} />
          {requests.length ? (
            <ul className="divide-y divide-[color:var(--border)] text-sm" data-empfehlung-list>
              {requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                  <Link href={`/buyer/leads/${r.lead.id}`} className="font-medium hover:underline">
                    {r.lead.name ?? "Kontakt"}
                  </Link>
                  <span className="text-[color:var(--muted)]">
                    {STATUS[r.status] ?? r.status}
                    {r.reviewSentAt ? ` am ${fmtDate(r.reviewSentAt)}` : r.status === "scheduled" ? ` für ${fmtDate(r.reviewDueAt)}` : ""}
                    {r.googleClicks ? " · Google-Link geöffnet" : ""}
                    {r.referralStatus === "sent" && r.referralSentAt ? ` · Empfehlung erbeten am ${fmtDate(r.referralSentAt)}` : ""}
                    {r.note && r.status !== "answered" ? ` · ${r.note}` : ""}
                  </span>
                  {r.sentiment ? (
                    <Badge tone={r.sentiment === "negative" ? "danger" : r.sentiment === "positive" ? "success" : "neutral"}>
                      {r.sentiment === "negative" ? "Kritik" : r.sentiment === "positive" ? "positiv" : "Rückfrage"}
                    </Badge>
                  ) : null}
                  {r.comment ? <p className="w-full text-[color:var(--muted)]">„{r.comment.length > 200 ? `${r.comment.slice(0, 197)}…` : r.comment}“</p> : null}
                  {r.sentiment === "negative" ? (
                    <span className="w-full">{r.resolvedAt ? <span className="text-xs font-medium text-emerald-700">Geklärt am {fmtDate(r.resolvedAt)}</span> : <ResolveButton requestId={r.id} readOnly={ctx.preview} />}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 pb-5 text-sm text-[color:var(--muted)]">
              Noch keine Nachfragen. Sobald Sie einen Abschluss erfassen, plant die App die Nachfrage automatisch ein ({settings.reviewDelayDays} Tage danach).
            </p>
          )}
        </Card>

        <p className="text-sm text-[color:var(--muted)]">
          Alle angeschriebenen Kunden bekommen dieselbe Nachricht mit demselben Google-Link – unabhängig davon, wie zufrieden sie sind (Google-Richtlinien).
          {settings.reward
            ? "Das Dankeschön geht nur an Empfehlende, nie an die empfohlene Person. Der Dank per WhatsApp geht automatisch raus, sobald aus einer Empfehlung ein Abschluss wird."
            : "Empfehlende bekommen ohne eingestelltes Dankeschön keine Prämie; der Dank geht automatisch raus, sobald aus einer Empfehlung ein Abschluss wird."}
          Rückmeldungen an Empfehlende gibt es nur, wenn die empfohlene Person zugestimmt hat.
        </p>
          </>
        ) : null}

        {tab === "einstellungen" ? (
          <>
        <Card>
          <div className="space-y-5 p-5">
            <SettingsForm
              initial={{
                active: settings.active,
                googleReviewUrl: settings.googleReviewUrl ?? "",
                reviewDelayDays: settings.reviewDelayDays,
                referralDelayDays: settings.referralDelayDays,
                custom: settings.custom,
                offerKind: settings.offerKind,
                offerHeadline: settings.offerHeadline ?? "",
                offerText: settings.offerText ?? "",
                referralOnPraise: settings.referralOnPraise,
                statusUpdates: settings.statusUpdates,
                followUpHours: settings.followUpHours,
                referralAfterAppointment: settings.referralAfterAppointment,
                reward: { kind: settings.rewardRaw.kind, amount: settings.rewardRaw.amount, note: settings.rewardRaw.note, trigger: settings.rewardRaw.trigger, confirmed: !!settings.rewardRaw.confirmedAt },
              }}
              vermittlerTyp={customer?.vermittlerTyp ?? null}
              vertreter={vertreter}
              readOnly={ctx.preview}
            />
            <div className="border-t border-[color:var(--border)] pt-4">
              <TestSendForm readOnly={ctx.preview} />
            </div>
          </div>
        </Card>

          </>
        ) : null}

        {tab === "teilen" ? (
          <>
        <Card>
          <CardHeader title="Im Gespräch und per E-Mail" icon={QrCode} />
          <div className="space-y-3 px-5 pb-5 pt-4 text-sm" data-empfehlung-gespraech>
            <p>
              <b>Im Termin:</b> Öffnen Sie den Kontakt und tippen Sie auf „Im Termin zeigen“. Ihr Kunde scannt seinen persönlichen QR-Code von Ihrem Bildschirm und
              teilt die Empfehlung gleich im Gespräch, auch in der Online-Beratung. So wissen Sie später, von wem eine Empfehlung kam.
            </p>
            {generalUrl ? (
              <div className="space-y-2">
                <p>
                  <b>E-Mail-Signatur:</b> Diese Zeile unter Ihre Mails setzen.
                </p>
                <p className="rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] p-3 text-xs">{signatureLine(generalUrl, offer)}</p>
                <CopyText text={signatureLine(generalUrl, offer)} label="Zeile kopieren" />
                <p className="text-sm text-[color:var(--muted)]">
                  Die Signatur nutzt einen allgemeinen Link. Ihr Kunde kann dort seine Handynummer angeben und bekommt seinen persönlichen Link; sonst kommt die
                  Empfehlung als Lead an, lässt sich aber keinem einzelnen Kunden zuordnen.
                </p>
              </div>
            ) : null}
          </div>
        </Card>

        <WaechterSection customerId={ctx.customerId} readOnly={ctx.preview} flash={sp.google ?? null} />

          </>
        ) : null}
      </div>
    </main>
  );
}
