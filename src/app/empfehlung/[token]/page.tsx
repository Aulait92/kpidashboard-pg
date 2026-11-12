import { notFound } from "next/navigation";
import { HeartHandshake } from "lucide-react";
import { loadReferralPage, contactLinkFor } from "@/lib/empfehlung/requests";
import { shareText } from "@/lib/empfehlung/shared";
import { ShareReferral } from "@/components/empfehlung/client";

// Seite für den Empfehlenden (Kunde des Vertreters): Danke + Empfehlung teilen.
// Die empfohlene Person trägt sich auf /empfehlung/[token]/kontakt selbst ein.
export const dynamic = "force-dynamic";
export const metadata = { title: "Empfehlen", robots: { index: false, follow: false } };

export default async function ReferralSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
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
  const text = shareText(page.vertreter, contactLinkFor(token));
  return (
    <Shell>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
        <HeartHandshake className="h-6 w-6" />
      </div>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">{page.recommender ? `Danke, ${page.recommender}!` : "Vielen Dank!"}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-[color:var(--muted)]">
        Schön, dass Sie {page.vertreter} weiterempfehlen möchten. Leiten Sie diese Nachricht einfach an Freunde, Familie oder Kollegen weiter. Die Person
        entscheidet selbst, ob sie sich meldet – Sie müssen keine Daten von anderen weitergeben.
      </p>
      <div className="mt-5">
        <ShareReferral text={text} />
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6 sm:py-10">
      <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-md)] sm:p-7">{children}</div>
    </main>
  );
}
