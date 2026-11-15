import type { Metadata } from "next";
import { headers } from "next/headers";
import { CheckCircle2 } from "lucide-react";
import { AdvisorHeader } from "@/components/empfehlung/advisor-header";
import { LeadLegalFooter } from "@/components/lead-legal-footer";
import { confirmDoi } from "@/lib/bestand/einwilligung-server";
import { requestIp } from "@/lib/rate-limit";

// Double-Opt-in: Bestätigungslink aus der E-Mail. Erst danach gilt die E-Mail-Einwilligung.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "E-Mail bestätigt", robots: { index: false, follow: false } };

export default async function ConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await headers();
  const r = await confirmDoi(token, { ip: await requestIp(), userAgent: h.get("user-agent") }).catch(() => ({ ok: false as const }));
  return (
    <>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6 sm:py-10">
        {r.ok ? <AdvisorHeader name={r.advisor} /> : null}
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-md)] sm:p-7">
          {r.ok ? (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h1 className="mt-4 text-2xl font-bold tracking-tight" data-doi-confirmed>
                Danke, Ihre E-Mail-Adresse ist bestätigt
              </h1>
              <p className="mt-2 text-[15px] text-[color:var(--muted)]">
                {r.advisor} darf Sie jetzt per E-Mail über passende Angebote informieren. Abmelden können Sie sich jederzeit mit einem Klick in jeder E-Mail.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold">Link nicht mehr gültig</h1>
              <p className="mt-2 text-sm text-[color:var(--muted)]">Dieser Bestätigungslink ist abgelaufen oder ungültig.</p>
            </>
          )}
        </div>
      </main>
      <LeadLegalFooter customerId={r.ok ? r.customerId : null} />
    </>
  );
}
