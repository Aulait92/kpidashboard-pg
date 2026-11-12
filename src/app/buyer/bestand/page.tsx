import Link from "next/link";
import { ReferralLinkButton } from "@/components/empfehlung/client";
import { redirect } from "next/navigation";
import { Lightbulb, Megaphone, Upload, Users } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { Badge, ButtonLink, Card, CardHeader, EmptyState } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { OCCASIONS, opportunities, type Occasion } from "@/lib/bestand/campaigns";
import { toggleCampaignAction } from "./actions";
import { bestandQuota, QUOTA_REACHED } from "@/lib/bestand/quota";
import { PRICE_LIST, eur } from "@/lib/offer-pricing";
import { ModuleBookButton } from "@/components/bestand/module-book";
import { canSelfBookBestand } from "@/lib/bestand/self-service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bestand | performancegrowth" };

const STATUS: Record<string, { label: string; tone: "success" | "warning" | "neutral" }> = {
  running: { label: "läuft", tone: "success" },
  paused: { label: "pausiert", tone: "warning" },
  done: { label: "fertig", tone: "neutral" },
  draft: { label: "Entwurf", tone: "neutral" },
};

export default async function BestandPage({ searchParams }: { searchParams: Promise<{ q?: string; gestartet?: string; kontingent?: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  if (ctx.teamRole !== "owner") redirect("/buyer");
  const c = await prisma.customer.findUnique({
    where: { id: ctx.customerId },
    select: { existingCustomersEnabled: true, bestandRequestedAt: true, bestandCancelAt: true, billingInterval: true, empfehlungEnabled: true },
  });
  if (!c) redirect("/buyer");
  // Ohne gebuchtes Modul: freundlicher Hinweis statt Sperre ohne Erklärung
  if (!c.existingCustomersEnabled) {
    const check = await canSelfBookBestand(ctx.customerId);
    return (
      <LockedBestand
        requestedAt={c.bestandRequestedAt?.toISOString() ?? null}
        readOnly={ctx.preview}
        canBook={check.ok}
        reason={check.ok ? null : check.reason}
        annual={c.billingInterval === "year"}
      />
    );
  }
  const { q = "", gestartet, kontingent } = await searchParams;
  const customerId = ctx.customerId;
  const quota = await bestandQuota(customerId);

  const [total, withPhone, optOut, campaigns] = await Promise.all([
    prisma.existingCustomer.count({ where: { customerId } }),
    prisma.existingCustomer.count({ where: { customerId, phone: { not: null }, optOutAt: null } }),
    prisma.existingCustomer.count({ where: { customerId, optOutAt: { not: null } } }),
    prisma.customerCampaign.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const stats = await Promise.all(
    campaigns.map(async (k) => {
      const g = await prisma.campaignRecipient.groupBy({ by: ["status"], where: { campaignId: k.id }, _count: { _all: true } });
      const n = (s: string) => g.find((x) => x.status === s)?._count._all ?? 0;
      return { k, queued: n("queued"), sent: n("sent") + n("replied"), replied: n("replied") };
    }),
  );
  const opps = total ? await opportunities(customerId) : [];
  const qDigits = q.replace(/\D/g, "");
  const list = total
    ? await prisma.existingCustomer.findMany({
        where: {
          customerId,
          ...(q
            ? {
                OR: [
                  { lastName: { contains: q, mode: "insensitive" } },
                  { firstName: { contains: q, mode: "insensitive" } },
                  { email: { contains: q, mode: "insensitive" } },
                  ...(qDigits.length >= 3 ? [{ phone: { contains: qDigits } }, { externalNo: { contains: q } }] : []),
                ],
              }
            : {}),
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        take: 50,
      })
    : [];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Bestand"
        subtitle={total ? `${total.toLocaleString("de-DE")} Kunden · ${withPhone.toLocaleString("de-DE")} per WhatsApp erreichbar${optOut ? ` · ${optOut} gesperrt` : ""}` : "Ihre Bestandskunden gezielt ansprechen"}
        actions={
          <ButtonLink href="/buyer/bestand/import" variant={total ? "secondary" : "primary"} icon={Upload}>
            {total ? "Liste aktualisieren" : "Kunden importieren"}
          </ButtonLink>
        }
      />
      {kontingent || quota.remaining <= 0 ? (
        <div className="mb-5 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-quota-reached>
          {QUOTA_REACHED} Diesen Monat sind {quota.used.toLocaleString("de-DE")} von {quota.limit.toLocaleString("de-DE")} Kampagnen-Nachrichten verschickt.
          Laufende Kampagnen machen im nächsten Monat weiter.
        </div>
      ) : (
        <p className="mb-5 text-sm text-[color:var(--muted)]" data-quota>
          Kontingent diesen Monat: {quota.used.toLocaleString("de-DE")} von {quota.limit.toLocaleString("de-DE")} Kampagnen-Nachrichten (WhatsApp-Gebühren inklusive).
        </p>
      )}
      {c.bestandCancelAt ? (
        <div className="mb-5 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-bestand-cancel-notice>
          Das Modul ist zum {c.bestandCancelAt.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })} gekündigt. Bis dahin können Sie es wie gewohnt
          nutzen.{" "}
          <Link href="/buyer/konto" className="font-medium underline">
            Kündigung zurücknehmen
          </Link>
        </div>
      ) : null}
      {gestartet ? (
        <div className="mb-5 rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Kampagne gestartet. Nachrichten gehen Mo–Sa zwischen 9 und 19 Uhr schrittweise raus. Antworten landen als Lead in der Pipeline.
        </div>
      ) : null}

      {!total ? (
        <Card>
          <EmptyState
            icon={Users}
            title="Noch keine Bestandskunden"
            text="Exportieren Sie Ihre Kundenliste als Excel oder CSV aus dem Bestandssystem und laden Sie sie hier hoch. Danach zeigen wir Ihnen, wo die größten Chancen liegen."
            action={<ButtonLink href="/buyer/bestand/import" variant="primary" icon={Upload}>Kunden importieren</ButtonLink>}
          />
        </Card>
      ) : (
        <div className="space-y-5">
          <Card>
            <CardHeader title="Chancen" icon={Lightbulb} />
            <ul className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
              {opps.map((o) => {
                const params = new URLSearchParams({ anlass: o.occasion, segment: JSON.stringify(o.segment), ...(o.topic ? { thema: o.topic } : {}) });
                return (
                  <li key={o.title} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] p-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-2xl font-semibold tabular-nums">{o.count.toLocaleString("de-DE")}</div>
                      <div className="text-sm text-[color:var(--muted)]">{o.title}</div>
                    </div>
                    <ButtonLink href={`/buyer/bestand/kampagne?${params.toString()}`} variant="primary">
                      Ansprechen
                    </ButtonLink>
                  </li>
                );
              })}
              {!opps.length ? <li className="text-sm text-[color:var(--muted)]">Gerade keine erreichbaren Kunden (alle kürzlich angeschrieben oder ohne Mobilnummer).</li> : null}
              {!c.empfehlungEnabled ? (
                <li className="flex items-center gap-3 rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-strong)] p-4 sm:col-span-2" data-bestand-empfehlung-locked>
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-semibold">Jährliche Empfehlungsbitte</div>
                    <div className="text-[color:var(--muted)]">Zufriedene Bestandskunden mit persönlichem Link um eine Empfehlung bitten – mit dem Modul „Empfehlungen &amp; Bewertungen“.</div>
                  </div>
                  <ButtonLink href="/buyer/konto?modul=empfehlung#zusatzmodule">Modul ansehen</ButtonLink>
                </li>
              ) : null}
            </ul>
          </Card>

          {stats.length ? (
            <Card>
              <CardHeader title="Kampagnen" icon={Megaphone} count={stats.length} />
              <ul className="divide-y divide-[color:var(--border)]">
                {stats.map(({ k, queued, sent, replied }) => (
                  <li key={k.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        {OCCASIONS[k.occasion as Occasion]?.label ?? k.occasion}: {k.name}
                      </div>
                      <div className="text-xs text-[color:var(--muted)]">
                        {sent} verschickt · {replied} Antworten{queued ? ` · ${queued} warten` : ""} · max. {k.dailyLimit}/Tag
                      </div>
                    </div>
                    <Badge tone={STATUS[k.status]?.tone ?? "neutral"}>{STATUS[k.status]?.label ?? k.status}</Badge>
                    {k.status === "running" || k.status === "paused" ? (
                      <form action={toggleCampaignAction}>
                        <input type="hidden" name="id" value={k.id} />
                        <button className="text-xs font-medium text-[color:var(--brand)] hover:underline">{k.status === "running" ? "Pausieren" : "Fortsetzen"}</button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Kunden" icon={Users} count={total} />
            <form className="px-5 pb-3">
              <input name="q" defaultValue={q} placeholder="Name, Telefon, E-Mail oder Kundennummer" className="h-10 w-full rounded-full border border-[color:var(--border)] bg-white px-4 text-sm outline-none focus:border-[color:var(--brand)]" />
            </form>
            <ul className="divide-y divide-[color:var(--border)]">
              {list.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 font-medium">
                    {[e.firstName, e.lastName].filter(Boolean).join(" ")}
                    {e.optOutAt ? <span className="ml-2 text-xs font-normal text-rose-700">gesperrt</span> : null}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {e.lines.map((l) => (
                      <span key={l} className="rounded-full bg-[color:var(--surface-sunken,#f1f5f9)] px-2 py-0.5 text-xs">
                        {l}
                      </span>
                    ))}
                  </span>
                  <span className="w-28 text-right text-xs text-[color:var(--muted)]">{e.phone ? `+${e.phone}` : "ohne Mobil"}</span>
                  {c.empfehlungEnabled && !e.optOutAt ? (
                    <span className="w-full sm:w-auto">
                      <ReferralLinkButton existingCustomerId={e.id} readOnly={ctx.preview} />
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            {total > list.length ? <p className="px-5 py-3 text-xs text-[color:var(--muted)]">Erste {list.length} von {total.toLocaleString("de-DE")}, Suche nutzen.</p> : null}
          </Card>
          <p className="text-xs text-[color:var(--muted)]">
            <Link href="/buyer/bestand/import" className="underline">
              Liste erneut hochladen
            </Link>{" "}
            aktualisiert vorhandene Kunden (Abgleich über Kundennummer, sonst Telefon/E-Mail).
          </p>
        </div>
      )}
    </main>
  );
}

function LockedBestand({ requestedAt, readOnly, canBook, reason, annual }: { requestedAt: string | null; readOnly: boolean; canBook: boolean; reason: string | null; annual: boolean }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8" data-bestand-locked>
      <PageHeader title="Bestand" subtitle="Ihre Bestandskunden gezielt ansprechen" />
      <Card>
        <CardHeader title="Bestandskunden-Modul" icon={Users} />
        <div className="space-y-4 px-5 pb-5 pt-4 text-[15px]">
          <p>
            Laden Sie Ihre Kundenliste hoch, und die App zeigt Ihnen, wo Geschäft liegt: Lücken (z. B. KFZ ohne Hausrat), Jahresgespräche,
            Geburtstage und auslaufende Verträge. Mit einem Klick schreiben Sie die passenden Kunden per WhatsApp an, Antworten landen als Lead
            in Ihrer Pipeline.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-[color:var(--muted)]">
            <li>
              {eur(PRICE_LIST.bestandModuleMonthly)} netto im Monat,{" "}
              {annual ? "bei Ihrer jährlichen Vorauszahlung kündbar zum Ende des bezahlten Jahres" : "monatlich kündbar"}
            </li>
            <li>WhatsApp-Gebühren für bis zu {PRICE_LIST.bestandIncludedMessages} Kampagnen-Nachrichten im Monat inklusive</li>
            <li>Gesundheitsdaten werden nie übernommen</li>
          </ul>
          {canBook ? (
            <p className="text-sm text-[color:var(--muted)]">Sofort nutzbar – Sie buchen es hier selbst, anteilig ab heute.</p>
          ) : null}
          <ModuleBookButton
            monthlyNet={PRICE_LIST.bestandModuleMonthly}
            includedMessages={PRICE_LIST.bestandIncludedMessages}
            canBook={canBook}
            reason={reason}
            requestedAt={requestedAt}
            readOnly={readOnly}
            annual={annual}
            freeMonths={PRICE_LIST.annualFreeMonths}
          />
        </div>
      </Card>
    </main>
  );
}
