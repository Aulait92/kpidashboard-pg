import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, MessageSquareText, Route } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { serviceMailsDaten } from "@/lib/mail/service-mails-daten";
import { ServiceMails } from "./service-mails";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assistent | performancegrowth" };

// Einstellungen → Assistent (Ole, 17.11.2026, Paket M9): was in Ihrem Namen an Ihre Kunden rausgeht. Oben die E-Mails
// (Erklärschritt „Service-Mails in Ihrem Namen“, danach Stufe je Mail und Kopie), darunter die WhatsApp-Vorlagen.
// Ganz oben der Ablauf (Paket P6, Einstellungen → Assistent → Ablauf: Zeitleiste der Standard-Abfolge; P8 „So arbeitet
// Ihr Assistent“ als Abschnitt dort). Die E-Mails (M7): Stufe je Vorlage, Kopie, Antwortweg (lib/mail/service-mails-daten.ts).
export default async function AssistentPage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const [c, mails] = await Promise.all([
    prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { plan: true } }),
    serviceMailsDaten(ctx.customerId, ctx.userId, ctx.email),
  ]);
  const canEdit = !ctx.preview && !!ctx.userId && ctx.teamRole === "owner";

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
      <PageHeader back="/buyer/einstellungen" title="Assistent" />
      <div className="space-y-6" data-assistent-einstellungen>
        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">Ablauf</h2>
          <Link
            href="/buyer/einstellungen/assistent/ablauf"
            className="flex min-h-[64px] items-center gap-4 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white px-5 py-3 shadow-[var(--shadow-sm)] transition hover:bg-[color:var(--surface-sunken)]"
            data-assistent-ablauf
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-sky-600 text-white">
              <Route className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">So arbeitet Ihr Assistent</span>
              <span className="line-clamp-2 block text-sm text-[color:var(--muted)]">Wann er was schickt und wann Sie gefragt sind, mit Beispielchat</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
          </Link>
        </section>
        <section id="mails">
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">E-Mails in Ihrem Namen</h2>
          <ServiceMails {...mails} canEdit={canEdit} />
          {!canEdit && !ctx.preview ? <p className="mt-2 px-1 text-xs text-[color:var(--muted)]">Nur der Inhaber kann das ändern.</p> : null}
        </section>
        {c?.plan !== "service" ? (
          <section>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">WhatsApp</h2>
            <Link
              href="/buyer/vorlagen"
              className="flex min-h-[64px] items-center gap-4 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white px-5 py-3 shadow-[var(--shadow-sm)] transition hover:bg-[color:var(--surface-sunken)]"
              data-assistent-whatsapp
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-emerald-500 text-white">
                <MessageSquareText className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">WhatsApp-Vorlagen</span>
                <span className="line-clamp-2 block text-sm text-[color:var(--muted)]">Nachrichten, die Ihr Assistent in Ihrem Namen schickt</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
            </Link>
          </section>
        ) : null}
      </div>
    </main>
  );
}
