import type { Metadata } from "next";
import { LeadLegalFooter } from "@/components/lead-legal-footer";
import { headers } from "next/headers";
import { CheckCircle2 } from "lucide-react";
import { AdvisorHeader } from "@/components/empfehlung/advisor-header";
import { buttonClass } from "@/components/ui";
import { unsubscribe } from "@/lib/bestand/abmelden";
import { requestIp } from "@/lib/rate-limit";
import { unsubscribeAllAction } from "./actions";

// Abmeldelink aus Kampagnen-Mails: ein Klick, ohne Login. Der Aufruf meldet sofort von E-Mails ab.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Abmelden", robots: { index: false, follow: false } };

export default async function UnsubscribePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ alle?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const h = await headers();
  const t = await unsubscribe(token, "email", { ip: await requestIp(), userAgent: h.get("user-agent") }).catch(() => null);
  if (!t) {
    return (
      <Shell>
        <h1 className="text-xl font-bold">Link nicht gültig</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">Dieser Abmeldelink ist nicht (mehr) gültig. Antworten Sie einfach auf die E-Mail, dann tragen wir Sie von Hand aus.</p>
      </Shell>
    );
  }
  return (
    <Shell customerId={t.customerId} advisor={t.advisor}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
        <CheckCircle2 className="h-6 w-6" />
      </div>
      <h1 className="mt-4 text-2xl font-bold tracking-tight" data-unsubscribed>
        {t.du ? "Du bist abgemeldet" : "Sie sind abgemeldet"}
      </h1>
      <p className="mt-2 text-[15px] text-[color:var(--muted)]">
        {t.du ? "Du erhältst" : "Sie erhalten"} ab sofort keine E-Mails mehr {t.leadId ? "von" : "zu Angeboten von"} {t.advisor}. Das gilt dauerhaft.
      </p>
      {sp.alle || t.whatsappBlocked ? (
        <p className="mt-4 rounded-[var(--radius-sm)] bg-emerald-50 px-3 py-2 text-sm text-emerald-900" data-unsubscribed-all>
          {t.du ? "Auch per WhatsApp schreiben wir dir keine Angebote mehr." : "Auch per WhatsApp schreiben wir Ihnen keine Angebote mehr."}
        </p>
      ) : t.hasPhone ? (
        <form action={unsubscribeAllAction.bind(null, token)} className="mt-5">
          <button type="submit" className={buttonClass("secondary", "md", "h-11 w-full")} data-unsubscribe-all>
            Auch keine WhatsApp-Nachrichten mehr
          </button>
        </form>
      ) : null}
      <p className="mt-5 text-xs text-[color:var(--muted)]">{t.du ? "Versehentlich abgemeldet? Antworte einfach auf die E-Mail." : "Versehentlich abgemeldet? Antworten Sie einfach auf die E-Mail."}</p>
    </Shell>
  );
}

function Shell({ children, advisor, customerId }: { children: React.ReactNode; advisor?: string; customerId?: string | null }) {
  return (
    <>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6 sm:py-10">
        {advisor ? <AdvisorHeader name={advisor} /> : null}
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-md)] sm:p-7">{children}</div>
      </main>
      <LeadLegalFooter customerId={customerId} />
    </>
  );
}
