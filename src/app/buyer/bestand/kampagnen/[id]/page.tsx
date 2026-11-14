import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BarChart3, Euro, Inbox } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { Badge, Card, CardHeader } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { OCCASIONS, type Occasion } from "@/lib/bestand/campaigns";
import { loadCampaignStats } from "@/lib/bestand/statistik";
import { CHANNEL_MODES } from "@/lib/bestand/einwilligung";
import { FunnelTable } from "@/components/bestand/funnel-table";
import { ReplyForm } from "@/components/bestand/reply-form";
import { toggleCampaignAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kampagne | performancegrowth" };

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
  const { id } = await params;
  const { gestartet } = await searchParams;
  // Nur Kampagnen des eigenen Kunden
  const [s] = await loadCampaignStats(ctx.customerId, { ids: [id] });
  if (!s) notFound();
  const mailbox = await prisma.customerCampaign.findUnique({ where: { id: s.id }, select: { senderUserId: true } }).then((c) =>
    c?.senderUserId ? prisma.mailConnection.findUnique({ where: { userId: c.senderUserId }, select: { email: true, campaignPausedUntil: true, campaignBackoff: true } }) : null,
  );
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
        title={`${OCCASIONS[s.occasion as Occasion]?.label ?? s.occasion}: ${s.name}`}
        subtitle={`${CHANNEL_MODES.find((m) => m.key === s.channelMode)?.label ?? ""} · gestartet ${s.startedAt?.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" }) ?? ""} · max. ${s.dailyLimit}/Tag`}
        actions={
          <div className="flex items-center gap-3">
            <Badge tone={STATUS[s.status]?.tone ?? "neutral"}>{STATUS[s.status]?.label ?? s.status}</Badge>
            {s.status === "running" || s.status === "paused" ? (
              <form action={toggleCampaignAction}>
                <input type="hidden" name="id" value={s.id} />
                <button className="text-sm font-medium text-[color:var(--brand)] hover:underline" disabled={ctx.preview}>
                  {s.status === "running" ? "Pausieren" : "Fortsetzen"}
                </button>
              </form>
            ) : null}
          </div>
        }
      />
      {gestartet ? (
        <div className="mb-5 rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Kampagne gestartet. Nachrichten gehen schrittweise raus (WhatsApp Mo bis Sa 9 bis 19 Uhr, E-Mails werktags 8 bis 18 Uhr). Antworten landen als Lead in der
          Pipeline.
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
          <CardHeader title="Trichter" icon={BarChart3} />
          <FunnelTable funnel={f} />
          {sparten.length || gruende.length ? (
            <div className="grid gap-4 px-5 py-4 text-sm sm:grid-cols-2">
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
            </div>
          ) : null}
        </Card>
        <Card>
          <CardHeader title="Ertrag" icon={Euro} />
          <dl className="grid grid-cols-2 gap-4 px-5 pb-5 text-sm sm:grid-cols-4" data-campaign-ertrag>
            <div>
              <dt className="text-[color:var(--muted)]">Provision (1. Jahr)</dt>
              <dd className="text-xl font-semibold tabular-nums">{eur(s.ertrag.provision)}</dd>
              {s.ertrag.bestandProJahr > 0 ? <dd className="text-xs text-[color:var(--muted)]">+ {eur(s.ertrag.bestandProJahr)} Bestand pro Jahr</dd> : null}
            </div>
            <div>
              <dt className="text-[color:var(--muted)]" title="Meta-Gebühren der Kampagne, im Modul enthalten">
                WhatsApp-Gebühren
              </dt>
              <dd className="text-xl font-semibold tabular-nums">{eur(s.kosten)}</dd>
              <dd className="text-xs text-[color:var(--muted)]">im Modul enthalten</dd>
            </div>
            <div>
              <dt className="text-[color:var(--muted)]">Ergebnis</dt>
              <dd className="text-xl font-semibold tabular-nums">{eur(s.ertrag.ergebnis)}</dd>
            </div>
            <div>
              <dt className="text-[color:var(--muted)]">pro angeschriebenem Kunden</dt>
              <dd className="text-xl font-semibold tabular-nums">{s.ertrag.proAngeschrieben == null ? "keine Angabe" : eur(s.ertrag.proAngeschrieben)}</dd>
            </div>
          </dl>
          <p className="px-5 pb-5 text-xs text-[color:var(--muted)]">
            Provision geschätzt mit Ihren Sätzen aus{" "}
            <Link href="/buyer/provisionen" className="underline">
              Meine Provisionen
            </Link>{" "}
            für die verkaufte Sparte. Ein Abschluss zählt, wenn er innerhalb von 60 Tagen nach dem Anschreiben kommt; bei mehreren Kampagnen zählt die letzte.
            Empfehlungen zählen nicht doppelt.
          </p>
        </Card>
        {usesMail ? (
          <Card>
            <CardHeader title="Antwort zuordnen" icon={Inbox} />
            <ReplyForm readOnly={ctx.preview} />
          </Card>
        ) : null}
      </div>
    </main>
  );
}
