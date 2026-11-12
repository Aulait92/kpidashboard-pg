import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, BarChart3, ListChecks, Settings2, Star } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { Badge, Card, CardHeader } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { moduleInfo } from "@/lib/empfehlung/module";
import { loadEmpfehlungStats, loadSettings, recentRequests } from "@/lib/empfehlung/requests";
import { advisorDisplayName } from "@/lib/whatsapp/template-plan";
import { fmtDate } from "@/lib/empfehlung/shared";
import { PRICE_LIST } from "@/lib/offer-pricing";
import { EmpfehlungStatsGrid } from "@/components/empfehlung/server";
import { EmpfehlungBookButton, ResolveButton, SettingsForm, TestSendForm } from "@/components/empfehlung/client";

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

export default async function EmpfehlungenPage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  if (ctx.teamRole !== "owner") redirect("/buyer");
  const info = await moduleInfo(ctx.customerId);
  if (!info) redirect("/buyer");
  const customer = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { name: true, whatsAppAccount: { select: { status: true } } } });
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
  const approved = (p: string) => templates.some((t) => t.purpose === p && t.status === "approved");
  const warnings = [
    !settings.googleReviewUrl ? "Bitte Ihren Google-Bewertungslink hinterlegen – ohne ihn geht keine Nachfrage raus." : null,
    customer?.whatsAppAccount?.status !== "connected" ? "WhatsApp ist noch nicht verbunden. Die Nachrichten gehen über Ihre WhatsApp-Nummer raus." : null,
    customer?.whatsAppAccount?.status === "connected" && (!approved("review_request") || !approved("referral_request"))
      ? "Die WhatsApp-Vorlagen des Moduls sind bei Meta eingereicht und noch nicht freigegeben (meist wenige Stunden bis zwei Tage). Bis dahin warten die Nachfragen."
      : null,
    !settings.active ? "Automatisches Nachfragen ist pausiert." : null,
  ].filter((w): w is string => !!w);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Empfehlungen & Bewertungen"
        subtitle={info.state === "trial" && info.trialEndsAt ? `Testphase bis ${fmtDate(info.trialEndsAt)}` : "Nach jedem Abschluss: Nachfrage mit Google-Link, später Bitte um Empfehlung."}
      />
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

        <Card>
          <CardHeader title="Auswertung (letzte 90 Tage)" icon={BarChart3} />
          <div className="px-5 pb-5 pt-4">
            <EmpfehlungStatsGrid s={stats} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Einstellungen" icon={Settings2} />
          <div className="space-y-5 px-5 pb-5 pt-4">
            <SettingsForm
              initial={{
                active: settings.active,
                googleReviewUrl: settings.googleReviewUrl ?? "",
                reviewDelayDays: settings.reviewDelayDays,
                referralDelayDays: settings.referralDelayDays,
                custom: settings.custom,
              }}
              vertreter={vertreter}
              readOnly={ctx.preview}
            />
            <div className="border-t border-[color:var(--border)] pt-4">
              <TestSendForm readOnly={ctx.preview} />
            </div>
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

        <p className="text-xs text-[color:var(--muted)]">
          Alle angeschriebenen Kunden bekommen dieselbe Nachricht mit demselben Google-Link – unabhängig davon, wie zufrieden sie sind (Google-Richtlinien).
          Empfehlende bekommen keine Prämie (Provisionsabgabeverbot); der Dank geht automatisch raus, sobald aus einer Empfehlung ein Abschluss wird.
        </p>
      </div>
    </main>
  );
}
