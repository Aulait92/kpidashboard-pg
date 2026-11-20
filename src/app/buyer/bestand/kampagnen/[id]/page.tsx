import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BarChart3, ChevronDown, Mail, MessageCircle, Users } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { Badge, Button, ButtonLink, Card, CardHeader } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { campaignRecipientList, type RecipientTone } from "@/lib/bestand/campaigns";
import { loadCampaignStats } from "@/lib/bestand/statistik";
import { loadBestandVisible } from "@/lib/bestand/sichtbar-server";
import { CHANNEL_MODES } from "@/lib/bestand/einwilligung";
import { FunnelBars } from "@/components/bestand/funnel-table";
import { ReplySheetButton } from "@/components/bestand/reply-form";
import { bestandQuota, QUOTA_PAUSE } from "@/lib/bestand/quota";
import { CampaignEndButton } from "@/components/bestand/campaign-end";
import { toggleCampaignAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kampagne | performancegrowth" };

const TONE: Record<RecipientTone, string> = {
  success: "text-emerald-700",
  warning: "text-amber-800",
  neutral: "text-[color:var(--muted)]",
  danger: "text-rose-700",
};

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const STATUS: Record<string, { label: string; tone: "success" | "warning" | "neutral" }> = {
  running: { label: "läuft", tone: "success" },
  paused: { label: "pausiert", tone: "warning" },
  done: { label: "fertig", tone: "neutral" },
  draft: { label: "Entwurf", tone: "neutral" },
};

export default async function CampaignDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ gestartet?: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  if (ctx.teamRole !== "owner") redirect("/buyer");
  // Modul vorerst ausgeblendet (lib/bestand/sichtbar.ts)
  if (!(await loadBestandVisible(ctx.customerId, { preview: ctx.preview }))) redirect("/buyer");
  const { id } = await params;
  const { gestartet } = await searchParams;
  // Nur Kampagnen des eigenen Kunden
  const [s] = await loadCampaignStats(ctx.customerId, { ids: [id] });
  if (!s) notFound();
  const mailbox = await prisma.customerCampaign.findUnique({ where: { id: s.id }, select: { senderUserId: true } }).then((c) =>
    c?.senderUserId ? prisma.mailConnection.findUnique({ where: { userId: c.senderUserId }, select: { email: true, campaignPausedUntil: true, campaignBackoff: true } }) : null,
  );
  const [recipients, quota] = await Promise.all([campaignRecipientList(ctx.customerId, s.id), s.status === "paused" ? bestandQuota(ctx.customerId) : null]);
  const f = s.funnel;
  const sparten = Object.entries(f.gesamt.sparten);
  const gruende = Object.entries(f.gesamt.gruende).sort((a, b) => b[1] - a[1]);
  const usesMail = f.email.angeschrieben + f.email.wartend > 0;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/buyer/bestand" className="text-sm text-[color:var(--brand)] hover:underline">
        ← Bestand
      </Link>
      <PageHeader
        title={s.name.replace(/\bKFZ\b/g, "Kfz")}
        subtitle={`${s.startedAt ? `Gestartet ${s.startedAt.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })} · ` : ""}${CHANNEL_MODES.find((m) => m.key === s.channelMode)?.label ?? ""}`}
        actions={
          <div className="flex items-center gap-3">
            <Badge tone={STATUS[s.status]?.tone ?? "neutral"}>{STATUS[s.status]?.label ?? s.status}</Badge>
            {s.status === "running" ? (
              <form action={toggleCampaignAction}>
                <input type="hidden" name="id" value={s.id} />
                <button className="text-sm font-medium text-[color:var(--brand)] hover:underline" disabled={ctx.preview}>
                  Pausieren
                </button>
              </form>
            ) : null}
            {s.status === "running" || s.status === "paused" ? <CampaignEndButton id={s.id} waiting={f.gesamt.wartend} readOnly={ctx.preview} /> : null}
          </div>
        }
      />
      {gestartet ? (
        <div className="mb-5 rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Gestartet. Die Nachrichten gehen schrittweise raus, Antworten landen als Lead in Ihrer Pipeline.
        </div>
      ) : null}
      {s.status === "paused" ? (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-campaign-paused>
          <span className="min-w-0 flex-1">
            {s.pausedReason === QUOTA_PAUSE && quota && quota.remaining <= 0
              ? "Pausiert: Die Nachrichten für diesen Monat sind aufgebraucht."
              : s.pausedReason === QUOTA_PAUSE
                ? "Pausiert, weil die Nachrichten aufgebraucht waren. Jetzt ist wieder etwas frei."
                : s.occasion === "empfehlung"
                  ? "Pausiert: Das Modul Empfehlungen ist nicht aktiv."
                  : "Von Ihnen pausiert."}
          </span>
          {s.pausedReason === QUOTA_PAUSE && quota && quota.remaining <= 0 ? (
            <ButtonLink href="/buyer/bestand?kontingent=1" variant="primary">
              Nachrichten nachbuchen
            </ButtonLink>
          ) : s.occasion === "empfehlung" && s.pausedReason !== QUOTA_PAUSE ? (
            <ButtonLink href="/buyer/konto?modul=empfehlung#zusatzmodule" variant="primary">
              Modul ansehen
            </ButtonLink>
          ) : (
            <form action={toggleCampaignAction}>
              <input type="hidden" name="id" value={s.id} />
              <Button type="submit" variant="primary" disabled={ctx.preview}>
                Fortsetzen
              </Button>
            </form>
          )}
        </div>
      ) : null}
      {mailbox?.campaignPausedUntil && mailbox.campaignPausedUntil > new Date() ? (
        <div className="mb-5 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-mail-throttled>
          Der E-Mail-Versand über {mailbox.email} pausiert bis {mailbox.campaignPausedUntil.toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" })}{" "}
          Uhr (Fehler oder viele unzustellbare Adressen). Danach geht es langsamer weiter.
        </div>
      ) : null}
      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Ergebnis"
            icon={BarChart3}
            actions={
              <span className="whitespace-nowrap text-sm tabular-nums" data-campaign-provision title="Provision im ersten Jahr, geschätzt mit Ihren Sätzen">
                <b>{eur(s.ertrag.provision)}</b> <span className="text-xs text-[color:var(--muted)]">Provision</span>
              </span>
            }
          />
          <FunnelBars funnel={f} />
          <details className="group border-t border-[color:var(--border)]" data-campaign-ertrag>
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-5 py-2 text-sm font-medium text-[color:var(--brand)] [&::-webkit-details-marker]:hidden">
              <span className="flex-1">Ertrag und Gründe</span>
              <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
            </summary>
            <div className="space-y-4 px-5 pb-4 text-sm">
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs text-[color:var(--muted)]">Provision (1. Jahr)</dt>
                  <dd className="font-semibold tabular-nums">{eur(s.ertrag.provision)}</dd>
                  {s.ertrag.bestandProJahr > 0 ? <dd className="text-xs text-[color:var(--muted)]">+ {eur(s.ertrag.bestandProJahr)} Bestand pro Jahr</dd> : null}
                </div>
                <div>
                  <dt className="text-xs text-[color:var(--muted)]">WhatsApp-Gebühren (im Modul enthalten)</dt>
                  <dd className="font-semibold tabular-nums">{eur(s.kosten)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[color:var(--muted)]">Ergebnis</dt>
                  <dd className="font-semibold tabular-nums">{eur(s.ertrag.ergebnis)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[color:var(--muted)]">pro angeschriebenem Kunden</dt>
                  <dd className="font-semibold tabular-nums">{s.ertrag.proAngeschrieben == null ? "keine Angabe" : eur(s.ertrag.proAngeschrieben)}</dd>
                </div>
              </dl>
              {sparten.length ? (
                <div data-campaign-sparten>
                  <p className="font-medium">Abschlüsse nach Sparte</p>
                  <ul className="mt-1 text-[color:var(--muted)]">
                    {sparten.map(([k, n]) => (
                      <li key={k}>
                        {k}: {n}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {gruende.length ? (
                <div data-campaign-gruende>
                  <p className="font-medium">Gründe für nicht verschickt</p>
                  <ul className="mt-1 text-[color:var(--muted)]">
                    {gruende.map(([k, n]) => (
                      <li key={k}>
                        {k}: {n}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="text-xs text-[color:var(--muted)]">
                Provision geschätzt mit Ihren Sätzen aus{" "}
                <Link href="/buyer/provisionen" className="underline">
                  Meine Provisionen
                </Link>
                . Ein Abschluss zählt, wenn er innerhalb von 60 Tagen nach dem Anschreiben kommt; bei mehreren Kampagnen zählt die letzte. Empfehlungen zählen nicht doppelt.
              </p>
            </div>
          </details>
        </Card>
        {recipients && recipients.total ? (
          <Card>
            <details className="group" data-campaign-recipients>
              <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">
                <Users className="h-4 w-4 text-[color:var(--muted)]" />
                <span className="flex-1">Empfänger ({recipients.total.toLocaleString("de-DE")})</span>
                <ChevronDown className="h-4 w-4 text-[color:var(--muted)] transition group-open:rotate-180" />
              </summary>
              <ul className="divide-y divide-[color:var(--border)] border-t border-[color:var(--border)]" data-campaign-recipient-list>
                {recipients.rows.map((r) => {
                  const Icon = r.channel === "email" ? Mail : MessageCircle;
                  return (
                    <li key={r.id} className="px-5 py-2 text-sm sm:flex sm:items-center sm:gap-3" data-recipient-status={r.status}>
                      <div className="flex min-w-0 items-center gap-2 sm:flex-1">
                        <Icon className="h-3.5 w-3.5 shrink-0 text-[color:var(--muted)]" aria-label={r.channel === "email" ? "E-Mail" : "WhatsApp"} />
                        <span className="truncate font-medium">{r.name}</span>
                      </div>
                      <div className={`pl-5 text-xs sm:pl-0 sm:text-right ${TONE[r.tone]}`}>{r.label}</div>
                    </li>
                  );
                })}
              </ul>
              {recipients.total > recipients.rows.length ? (
                <p className="px-5 py-3 text-xs text-[color:var(--muted)]">
                  Erste {recipients.rows.length.toLocaleString("de-DE")} von {recipients.total.toLocaleString("de-DE")}.
                </p>
              ) : null}
            </details>
          </Card>
        ) : null}
        {usesMail ? (
          <div data-campaign-reply>
            <ReplySheetButton readOnly={ctx.preview} />
          </div>
        ) : null}
      </div>
    </main>
  );
}
