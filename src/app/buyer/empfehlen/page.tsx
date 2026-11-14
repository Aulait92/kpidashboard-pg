import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { Gift, QrCode, Users } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { ReferralShare } from "@/components/kollegen";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { ensureReferralCode, loadReferralSettings, referralsForCustomer, referralUrl, referrerByCode } from "@/lib/kollegen";
import { STAGE_LABEL, benefitSentence, defaultShareText, rewardSentence, type ReferralStage } from "@/lib/kollegen-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kollegen empfehlen | performancegrowth" };

const TZ = "Europe/Berlin";
const date = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

const STAGE_TONE: Record<ReferralStage, "neutral" | "brand" | "success" | "warning" | "info"> = {
  eingegangen: "neutral",
  termin: "info",
  kunde: "brand",
  praemie: "success",
  abgelehnt: "neutral",
};

// „Kollegen empfehlen“ (nur Inhaber): persönlicher Link, Teilen, Stand der Empfehlungen.
export default async function KollegenEmpfehlenPage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  if (ctx.teamRole === "advisor") redirect("/buyer");
  const [settings, customer] = await Promise.all([
    loadReferralSettings(),
    prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { plan: true, retainerMonthly: true } }),
  ]);
  if (!customer || customer.plan === "internal") redirect("/buyer");
  const monthly = customer.retainerMonthly != null ? Number(customer.retainerMonthly) : null;

  // In der Admin-Vorschau keinen Code anlegen (schreibgeschützt)
  const existing = await prisma.referralCode.findUnique({ where: { customerId: ctx.customerId }, select: { code: true } });
  const code = existing?.code ?? (ctx.preview ? null : await ensureReferralCode(ctx.customerId));
  const url = code ? referralUrl(code) : null;
  const ref = code ? await referrerByCode(code) : null;
  const qr = url ? await QRCode.toDataURL(url, { margin: 1, width: 360 }) : null;
  const rows = await referralsForCustomer(ctx.customerId);
  const benefit = benefitSentence(settings);
  const won = rows.filter((r) => r.stage === "kunde" || r.stage === "praemie").length;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="Kollegen empfehlen" subtitle="Kennen Sie Vermittler, denen neue Kunden helfen würden?" />
      <div className="space-y-5">
        <Card>
          <CardHeader title="Ihr Dankeschön" icon={Gift} />
          <div className="space-y-2 p-5 text-[15px]" data-kollegen-praemie>
            <p className="font-medium">{rewardSentence(settings, monthly)}</p>
            {benefit ? <p className="text-[color:var(--muted)]">Ihr Kollege bekommt ebenfalls einen Vorteil: {benefit}</p> : null}
            <p className="text-sm text-[color:var(--muted)]">
              So geht&apos;s: Link teilen → Ihr Kollege fragt ein Erstgespräch an → wird er Kunde und ist seine erste Zahlung da, schreiben wir Ihnen die Prämie automatisch gut.
            </p>
            {!settings.enabled ? <p className="text-sm font-medium text-amber-700">Das Empfehlungsprogramm ist gerade pausiert.</p> : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Link teilen" icon={Users} />
          <div className="p-5">
            {url ? (
              <ReferralShare url={url} defaultText={defaultShareText(ref?.person ?? "", url)} readOnly={ctx.preview} />
            ) : (
              <p className="text-sm text-[color:var(--muted)]">In der Vorschau wird kein Empfehlungslink angelegt.</p>
            )}
          </div>
        </Card>

        {qr ? (
          <Card>
            <CardHeader title="QR-Code" icon={QrCode} hint="z. B. für Veranstaltungen oder die Visitenkarte" />
            <div className="flex flex-col items-center gap-3 p-5 sm:flex-row sm:items-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- Data-URL, kein Bild-Optimierer nötig */}
              <img src={qr} alt="QR-Code zum Empfehlungslink" width={180} height={180} className="rounded-[var(--radius-sm)] border border-[color:var(--border)]" />
              <div className="text-sm text-[color:var(--muted)]">
                Kollegen scannen den Code mit der Handykamera und landen direkt auf Ihrer Empfehlungsseite.
                <div className="mt-2">
                  <a href={qr} download="performancegrowth-empfehlung.png" className="font-medium text-[color:var(--brand)] underline">
                    QR-Code herunterladen
                  </a>
                </div>
              </div>
            </div>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Ihre Empfehlungen" count={rows.length || undefined} hint={won ? `${won} Kunde${won === 1 ? "" : "n"} geworben` : undefined} />
          {rows.length === 0 ? (
            <EmptyState icon={Users} title="Noch keine Empfehlungen" text="Sobald sich ein Kollege über Ihren Link meldet, sehen Sie hier den Stand." />
          ) : (
            <ul className="divide-y divide-[color:var(--border)]" data-kollegen-liste>
              {rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-[15px]">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{r.name}</span>
                    {r.company ? <span className="text-[color:var(--muted)]"> · {r.company}</span> : null}
                    <span className="block text-sm text-[color:var(--muted)]">seit {date(r.createdAt)}</span>
                  </span>
                  <Badge tone={STAGE_TONE[r.stage]}>{STAGE_LABEL[r.stage]}</Badge>
                  {r.stage === "praemie" && r.rewardAmount != null ? <span className="text-sm font-medium text-emerald-700">+{eur(r.rewardAmount)}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </main>
  );
}
