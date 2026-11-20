import { notFound } from "next/navigation";
import { ChevronDown, HeartHandshake, LinkIcon } from "lucide-react";
import { ReferralInvalidLink, ReferralShell } from "@/components/empfehlung/public-shell";
import { loadInactiveReferralContact, loadReferralPage, contactLinkFor } from "@/lib/empfehlung/requests";
import { SHARE_AUDIENCES, contactLinkIn, shareIntro, shareText } from "@/lib/empfehlung/shared";
import { a } from "@/lib/ansprache";
import { ShareReferral } from "@/components/empfehlung/teilen";
import { PhoneField } from "@/components/phone-field";
import { SubmitButton } from "@/components/submit-button";
import { buttonClass } from "@/components/ui";
import { claimPersonalLinkAction } from "./kontakt/actions";

// Seite für den Empfehlenden (Kunde des Vertreters): Danke + Empfehlung teilen (Paket 3, 20.11.2026).
// Eine Hauptaktion „Per WhatsApp weiterleiten“, Auswahl „An wen?“ (du/Sie). Kein Feld für Daten Dritter:
// Die empfohlene Person trägt sich auf /empfehlung/[token]/kontakt selbst ein.
// Ansprache dieser Seite: wie in den Nachrichten an den Empfehlenden (Customer.leadAddress bzw. bestandAddress).
export const dynamic = "force-dynamic";
export const metadata = { title: "Empfehlen", robots: { index: false, follow: false } };

export default async function ReferralSharePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ p?: string }> }) {
  const { token } = await params;
  const claim = (await searchParams).p;
  if (!/^[\w-]{10,64}$/.test(token)) notFound();
  const page = await loadReferralPage(token, { countView: true });
  if (!page) return <ReferralInvalidLink kontakt={await loadInactiveReferralContact(token).catch(() => null)} />;
  const an = page.recommenderAn;
  const link = contactLinkFor(token);
  const texts = {
    du: shareText(page.vertreter, contactLinkIn(link, "du"), page.offerDu, "du"),
    sie: shareText(page.vertreter, contactLinkIn(link, "sie"), page.offer, "sie"),
  };
  const reward = an === "du" ? page.rewardTextDu : page.rewardText;
  return (
    <ReferralShell customerId={page.customerId} advisor={page.vertreter} label={a(an, "Dein Berater", "Ihr Berater")}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
          <HeartHandshake className="h-5 w-5" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight">{page.recommender ? `Danke, ${page.recommender}!` : "Vielen Dank!"}</h1>
      </div>
      <p className="mt-3 text-[15px] leading-relaxed text-[color:var(--muted)]" data-referral-intro>
        {shareIntro(an)}
      </p>
      {page.offer ? (
        <p className="mt-3 rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50/60 px-4 py-2.5 text-sm" data-referral-offer>
          <span className="text-emerald-800">{a(an, "Deine Bekannten bekommen:", "Ihre Bekannten bekommen:")}</span> <b>{page.offer.headline}</b>
        </p>
      ) : null}
      <h2 className="mt-5 text-sm font-semibold">An wen?</h2>
      <div className="mt-2">
        <ShareReferral texts={texts} audiences={SHARE_AUDIENCES} />
      </div>
      {reward ? (
        <p className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-4 py-3 text-sm" data-referral-reward>
          <b>{a(an, "Mein Dankeschön an dich:", "Mein Dankeschön an Sie:")}</b> {reward}
        </p>
      ) : null}
      {page.general ? (
        <details className="group mt-5 border-t border-[color:var(--border)] pt-3" data-referral-claim open={!!claim}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-[color:var(--brand)] [&::-webkit-details-marker]:hidden">
            <LinkIcon className="h-4 w-4" /> Schon Kunde? Persönlichen Link holen
            <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
          </summary>
          <form action={claimPersonalLinkAction.bind(null, token)} className="mt-2 space-y-2">
            <p className="text-xs leading-relaxed text-[color:var(--muted)]">
              {a(an, `Dann weiß ${page.vertreter}, dass die Empfehlung von dir kommt.`, `Dann weiß ${page.vertreter}, dass die Empfehlung von Ihnen kommt.`)}
            </p>
            <PhoneField name="phone" label={a(an, "Deine Handynummer", "Ihre Handynummer")} />
            {claim === "unknown" ? (
              <p className="text-xs font-medium text-amber-700">
                {a(an, "Unter dieser Nummer haben wir dich nicht gefunden. Du kannst die Nachricht oben trotzdem teilen.", "Unter dieser Nummer haben wir Sie nicht gefunden. Sie können die Nachricht oben trotzdem teilen.")}
              </p>
            ) : null}
            {claim === "invalid" ? <p className="text-xs font-medium text-rose-700">{a(an, "Bitte prüf die Handynummer.", "Bitte prüfen Sie die Handynummer.")}</p> : null}
            {claim === "busy" ? <p className="text-xs font-medium text-rose-700">{a(an, "Bitte versuch es später noch einmal.", "Bitte versuchen Sie es später noch einmal.")}</p> : null}
            <SubmitButton pendingLabel="Einen Moment …" className={buttonClass("secondary", "md", "h-11 w-full")}>
              Link holen
            </SubmitButton>
          </form>
        </details>
      ) : null}
    </ReferralShell>
  );
}
