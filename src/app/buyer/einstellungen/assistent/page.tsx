import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, MessageSquareText } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { ABLAUF_VORLAGEN, leseMailAblauf } from "@/lib/mail/ablauf";
import { MAIL_ARTEN } from "@/lib/mail/kontakt-mail";
import { leadVersandKontext } from "@/lib/mail/lead-versand";
import { fehlendeAngaben, serviceMailVorschau, signaturAngaben } from "@/lib/mail/service-mails";
import { ServiceMails } from "./service-mails";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assistent | performancegrowth" };

// Einstellungen → Assistent (Ole, 17.11.2026, Paket M9): was in Ihrem Namen an Ihre Kunden rausgeht. Oben die E-Mails
// (Erklärschritt „Service-Mails in Ihrem Namen“, danach Stufe je Mail und Kopie), darunter die WhatsApp-Vorlagen.
// Später kommt hier der Ablauf dazu (P6/P8, Einstellungen → Assistent → Ablauf).
export default async function AssistentPage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const [c, angaben, vorschau, k] = await Promise.all([
    prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { mailAblauf: true, mailFeaturesOff: true, plan: true } }),
    signaturAngaben(ctx.customerId),
    serviceMailVorschau(ctx.customerId, { userId: ctx.userId }),
    // Antwortadresse der automatischen Mails = „eigene Adresse“ für die Kopie
    leadVersandKontext(ctx.customerId, { nurLesen: true }),
  ]);
  const ablauf = leseMailAblauf(c?.mailAblauf);
  const namen = Object.fromEntries(ABLAUF_VORLAGEN.map((key) => [key, MAIL_ARTEN[key]])) as Record<(typeof ABLAUF_VORLAGEN)[number], string>;
  const canEdit = !ctx.preview && !!ctx.userId && ctx.teamRole === "owner";

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
      <PageHeader back="/buyer/einstellungen" title="Assistent" />
      <div className="space-y-6" data-assistent-einstellungen>
        <section id="mails">
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">E-Mails in Ihrem Namen</h2>
          <ServiceMails
            mailOff={!!c?.mailFeaturesOff}
            bestaetigt={!!ablauf.bestaetigtAt}
            canEdit={canEdit}
            vorschau={vorschau}
            angaben={angaben}
            fehlend={fehlendeAngaben(angaben)}
            stufen={ablauf.stufen}
            namen={namen}
            kopie={{ an: ablauf.bcc.an, adresse: ablauf.bcc.adresse, eigene: k.replyTo ?? ctx.email ?? null }}
          />
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
