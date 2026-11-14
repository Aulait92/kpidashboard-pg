import { notFound } from "next/navigation";
import { AdvisorHeader } from "@/components/empfehlung/advisor-header";
import { HeartHandshake } from "lucide-react";
import { loadReferralPage, contactLinkFor } from "@/lib/empfehlung/requests";
import { shareText } from "@/lib/empfehlung/shared";
import { ShareReferral } from "@/components/empfehlung/client";
import { PhoneField } from "@/components/phone-field";
import { SubmitButton } from "@/components/submit-button";
import { buttonClass } from "@/components/ui";
import { claimPersonalLinkAction } from "./kontakt/actions";

// Seite für den Empfehlenden (Kunde des Vertreters): Danke + Empfehlung teilen.
// Die empfohlene Person trägt sich auf /empfehlung/[token]/kontakt selbst ein.
export const dynamic = "force-dynamic";
export const metadata = { title: "Empfehlen", robots: { index: false, follow: false } };

export default async function ReferralSharePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ p?: string }> }) {
  const { token } = await params;
  const claim = (await searchParams).p;
  if (!/^[\w-]{10,64}$/.test(token)) notFound();
  const page = await loadReferralPage(token, { countView: true });
  if (!page) {
    return (
      <Shell>
        <h1 className="text-xl font-bold">Link nicht mehr gültig</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">Dieser Empfehlungslink ist nicht (mehr) aktiv.</p>
      </Shell>
    );
  }
  const text = shareText(page.vertreter, contactLinkFor(token), page.offer);
  return (
    <Shell advisor={page.vertreter} label="Ihr Berater">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
        <HeartHandshake className="h-6 w-6" />
      </div>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">{page.recommender ? `Danke, ${page.recommender}!` : "Vielen Dank!"}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-[color:var(--muted)]">
        Schön, dass Sie {page.vertreter} weiterempfehlen möchten. Leiten Sie diese Nachricht einfach an Freunde, Familie oder Kollegen weiter. Die Person
        entscheidet selbst, ob sie sich meldet – Sie müssen keine Daten von anderen weitergeben.
      </p>
      {page.offer ? (
        <div className="mt-4 rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50/60 p-4" data-referral-offer>
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Das bekommen Ihre Bekannten</div>
          <div className="mt-1 text-base font-semibold">{page.offer.headline}</div>
          <p className="mt-1 text-sm leading-relaxed text-[color:var(--muted)]">{page.offer.text}</p>
        </div>
      ) : null}
      {page.rewardText ? (
        <p className="mt-3 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-4 py-3 text-sm" data-referral-reward>
          <b>Mein Dankeschön an Sie:</b> {page.rewardText}
        </p>
      ) : null}
      <div className="mt-5">
        <ShareReferral text={text} />
      </div>
      {page.general ? (
        <form action={claimPersonalLinkAction.bind(null, token)} className="mt-6 space-y-2 border-t border-[color:var(--border)] pt-5" data-referral-claim>
          <p className="text-sm font-semibold">Sie sind schon Kunde?</p>
          <p className="text-xs leading-relaxed text-[color:var(--muted)]">
            Mit Ihrer Handynummer bekommen Sie Ihren persönlichen Link. Dann weiß {page.vertreter}, dass die Empfehlung von Ihnen kommt, und kann sich bei Ihnen bedanken.
          </p>
          <PhoneField name="phone" label="Ihre Handynummer" />
          {claim === "unknown" ? <p className="text-xs font-medium text-amber-700">Unter dieser Nummer haben wir Sie nicht gefunden. Sie können die Nachricht oben trotzdem einfach teilen.</p> : null}
          {claim === "invalid" ? <p className="text-xs font-medium text-rose-700">Bitte prüfen Sie die Handynummer.</p> : null}
          {claim === "busy" ? <p className="text-xs font-medium text-rose-700">Bitte versuchen Sie es später noch einmal.</p> : null}
          <SubmitButton pendingLabel="Einen Moment …" className={buttonClass("secondary", "md", "h-11 w-full")}>
            Meinen persönlichen Link holen
          </SubmitButton>
        </form>
      ) : null}
    </Shell>
  );
}

function Shell({ children, advisor, label }: { children: React.ReactNode; advisor?: string; label?: string }) {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6 sm:py-10">
      {advisor ? <AdvisorHeader name={advisor} label={label} /> : null}
      <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-md)] sm:p-7">{children}</div>
    </main>
  );
}
