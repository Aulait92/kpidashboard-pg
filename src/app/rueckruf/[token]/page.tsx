import type { Metadata } from "next";
import { CheckCircle2, Phone } from "lucide-react";
import { notFound } from "next/navigation";
import { AdvisorHeader } from "@/components/empfehlung/advisor-header";
import { LeadLegalFooter } from "@/components/lead-legal-footer";
import { buttonClass } from "@/components/ui";
import { ladeRueckruf } from "@/lib/angebot-senden-server";
import { rueckrufSeite } from "@/lib/angebot-senden";
import { rueckrufAction } from "./actions";

// „Rückruf wünschen“ aus der Nachfass-Mail zum Angebot (Paket P3, Ole 17.11.2026). Bewusst minimal und ausbaufähig: Der
// Wunsch geht erst per Knopf raus (POST, Mailprogramme öffnen Links vorab), dann Aufgabe und Push an den Vermittler.
// Zeitfenster und Bestätigungstext kommen mit P5.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Rückruf wünschen", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function RueckrufPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ danke?: string }> }) {
  const { token } = await params;
  const { danke } = await searchParams;
  const r = await ladeRueckruf(token);
  if (!r) notFound();
  const t = rueckrufSeite(r.an, r.person);
  return (
    <>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6 sm:py-10">
        <AdvisorHeader name={r.person.nom} />
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-md)] sm:p-7">
          {danke ? (
            <div data-rueckruf-danke>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h1 className="mt-4 text-2xl font-bold tracking-tight">{t.danke}</h1>
            </div>
          ) : (
            <div data-rueckruf>
              <h1 className="text-2xl font-bold tracking-tight">{t.titel}</h1>
              <p className="mt-2 text-[15px] text-[color:var(--muted)]">{t.text}</p>
              <form action={rueckrufAction.bind(null, token)} className="mt-5">
                <button type="submit" className={buttonClass("primary", "md", "h-11 w-full")} data-rueckruf-knopf>
                  <Phone className="h-4 w-4" /> {t.knopf}
                </button>
              </form>
            </div>
          )}
        </div>
      </main>
      <LeadLegalFooter customerId={r.customerId} />
    </>
  );
}
