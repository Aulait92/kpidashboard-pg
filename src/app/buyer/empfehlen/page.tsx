import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { ChevronDown, Gift, QrCode, Users } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { ReferralShare } from "@/components/kollegen";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { ensureReferralCode, loadReferralSettings, referralsForCustomer, referralUrl, referrerByCode } from "@/lib/kollegen";
import { STAGE_LABEL, benefitSentence, canOpenReferralPage, defaultShareText, referralLinkState, referralOfferLines, rewardSentence, type ReferralStage } from "@/lib/kollegen-shared";

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

// „Kollegen empfehlen“ (Inhaber, auch interne Testkunden und Admin-Vorschau): persönlicher Link, Teilen, Stand der Empfehlungen.
// Zugang wie die Kachel in den Einstellungen (canOpenReferralPage), sonst führt die Kachel ins Leere.
export default async function KollegenEmpfehlenPage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  if (!canOpenReferralPage(ctx)) redirect("/buyer");
  const [settings, customer] = await Promise.all([
    loadReferralSettings(),
    prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { plan: true, retainerMonthly: true } }),
  ]);
  if (!customer) redirect("/buyer");
  const monthly = customer.retainerMonthly != null ? Number(customer.retainerMonthly) : null;

  // Vorschau: keinen Code anlegen (schreibgeschützt); interne Testkunden: kein Link (Landingpage nimmt ihn nicht an)
  const existing = await prisma.referralCode.findUnique({ where: { customerId: ctx.customerId }, select: { code: true } });
  const link = referralLinkState({ preview: ctx.preview, internal: customer.plan === "internal", hasCode: !!existing });
  const code = !link.show ? null : (existing?.code ?? (link.create ? await ensureReferralCode(ctx.customerId) : null));
  const url = code ? referralUrl(code) : null;
  const ref = code ? await referrerByCode(code) : null;
  const qr = url ? await QRCode.toDataURL(url, { margin: 1, width: 360 }) : null;
  const rows = await referralsForCustomer(ctx.customerId);
  const benefit = benefitSentence(settings);
  const lines = referralOfferLines(settings);
  const won = rows.filter((r) => r.stage === "kunde" || r.stage === "praemie").length;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader back="/buyer/einstellungen" title="Kollegen empfehlen" subtitle="Kennen Sie Vermittler, denen neue Kunden helfen würden?" />
      <div className="space-y-5">
        {/* Ganz oben: was beide Seiten konkret bekommen (aus den Einstellungen) */}
        <div className={`grid gap-3 ${lines.kollege ? "grid-cols-2" : ""}`} data-kollegen-kacheln>
          {lines.kollege ? (
            <div className="rounded-[var(--radius-lg)] border border-emerald-200 bg-emerald-50 p-4" data-kollegen-kachel="kollege">
              <div className="text-sm font-medium text-emerald-800">Ihr Kollege bekommt</div>
              <div className="mt-1 text-lg font-semibold tracking-tight text-emerald-950 sm:text-xl">{lines.kollege}</div>
            </div>
          ) : null}
          <div className="rounded-[var(--radius-lg)] border border-[color:var(--brand)]/30 bg-[color:var(--brand-soft,#EFF6FF)] p-4" data-kollegen-kachel="sie">
            <div className="text-sm font-medium text-[color:var(--brand)]">Sie bekommen</div>
            <div className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">{lines.sie}</div>
            <div className="mt-0.5 text-xs text-[color:var(--muted)]">je Kollege, der Kunde wird, auf Ihrer nächsten Rechnung</div>
          </div>
        </div>

        {!settings.enabled ? <p className="text-sm font-medium text-amber-700">Das Empfehlungsprogramm ist gerade pausiert.</p> : null}

        {/* Eine Aufgabe: Link teilen. Text und QR-Code nur bei Bedarf (UX-Runde 19.11.2026) */}
        <Card>
          <CardHeader title="Link teilen" icon={Users} />
          <div className="p-5">
            {url ? (
              <ReferralShare url={url} defaultText={defaultShareText(ref?.person ?? "", url, settings)} readOnly={ctx.preview} />
            ) : (
              <p className="rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] px-3 py-2.5 text-sm text-[color:var(--muted)]" data-kollegen-link-hinweis>
                {link.hinweis ?? "Der Empfehlungslink ist gerade nicht verfügbar."}
              </p>
            )}
            {qr ? (
              <details className="mt-1" data-kollegen-qr>
                <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-[color:var(--brand)] [&::-webkit-details-marker]:hidden">
                  <QrCode className="h-4 w-4" /> QR-Code für Visitenkarte oder Veranstaltung
                </summary>
                <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row sm:items-center">
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
              </details>
            ) : null}
          </div>
        </Card>

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

        <details className="group rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]" data-kollegen-praemie>
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 px-5 py-3 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
            <Gift className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
            <span className="flex-1">So funktioniert die Prämie</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-[color:var(--muted)] transition group-open:rotate-180" />
          </summary>
          <div className="space-y-2 px-5 pb-4 text-[15px]">
            <p>{rewardSentence(settings, monthly)}</p>
            {benefit ? <p className="text-[color:var(--muted)]">Auf der Seite Ihres Kollegen steht: „{benefit}“</p> : null}
            <p className="text-sm text-[color:var(--muted)]">
              So geht&apos;s: Link teilen, Ihr Kollege fragt ein Erstgespräch an. Wird er Kunde und ist seine erste Zahlung da, schreiben wir Ihnen die Prämie automatisch gut.
            </p>
          </div>
        </details>
      </div>
    </main>
  );
}
