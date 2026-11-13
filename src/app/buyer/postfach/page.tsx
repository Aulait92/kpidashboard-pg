import { redirect } from "next/navigation";
import { CheckCircle2, Mail, PenLine, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { buttonClass, Card, CardHeader } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { googleMailAvailable, microsoftMailAvailable, postfachOf, PROVIDER_LABEL } from "@/lib/mail/postfach";
import { loadVorlagen, PLATZHALTER } from "@/lib/mail/vorlagen";
import { disconnectPostfachAction } from "./actions";
import { SignaturForm, SmtpForm, TestButton, VorlagenListe } from "./forms";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = { title: "E-Mail-Postfach | performancegrowth" };

const STATUS_TEXT: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Postfach verbunden." },
  denied: { ok: false, text: "Die Anmeldung wurde abgebrochen." },
  consent: { ok: false, text: "Ihr Firmenkonto erlaubt das Verbinden nicht ohne Freigabe Ihrer IT. Bitte dort nachfragen oder SMTP nutzen." },
  scope: { ok: false, text: "Bitte beim Anmelden das Senden von E-Mails erlauben." },
  error: { ok: false, text: "Das Verbinden hat nicht geklappt. Bitte noch einmal versuchen oder SMTP nutzen." },
};

// Eigenes Postfach verbinden (Ole, 13.11.2026): E-Mails an Leads gehen aus Ihrem Postfach,
// mit Vorlagen. Google, Microsoft oder SMTP (z. B. IONOS, Strato, T-Online).
export default async function PostfachPage({ searchParams }: { searchParams: Promise<{ postfach?: string; google?: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const sp = await searchParams;
  const [conn, vorlagen, me] = await Promise.all([
    postfachOf(ctx.userId),
    loadVorlagen(ctx.customerId),
    ctx.userId ? prisma.user.findUnique({ where: { id: ctx.userId }, select: { mailSignature: true } }) : null,
  ]);
  const status = sp.postfach ? STATUS_TEXT[sp.postfach] : null;
  const readOnly = ctx.preview;
  // Gmail erst anbieten, wenn Google die App geprüft hat (sonst Warnseite „nicht überprüft“).
  // Zum Testen vorher: /buyer/postfach?google=1
  const showGoogle = googleMailAvailable() && (process.env.GOOGLE_MAIL_VERIFIED === "1" || sp.google === "1");
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="E-Mail-Postfach" subtitle="E-Mails an Leads direkt aus der App senden – aus Ihrem eigenen Postfach, mit Vorlagen." />
      {status ? (
        <p className={`flex items-center gap-2 rounded-[var(--radius-md)] px-4 py-3 text-sm ${status.ok ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
          {status.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <TriangleAlert className="h-4 w-4 shrink-0" />} {status.text}
        </p>
      ) : null}

      <Card>
        <CardHeader title="Ihr Postfach" icon={Mail} />
        <div className="space-y-4 p-5">
          {conn ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <CheckCircle2 className={`h-5 w-5 ${conn.status === "ok" ? "text-emerald-600" : "text-amber-600"}`} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{conn.email}</div>
                  <div className="text-sm text-[color:var(--muted)]">
                    {PROVIDER_LABEL[conn.provider]}
                    {conn.fromName ? ` · Absendername „${conn.fromName}“` : ""}
                  </div>
                </div>
              </div>
              {conn.status !== "ok" && conn.lastError ? (
                <p className="rounded-[var(--radius-sm)] bg-amber-50 px-3 py-2 text-sm text-amber-900">Letzter Versand fehlgeschlagen: {conn.lastError}</p>
              ) : null}
              {!readOnly ? (
                <div className="flex flex-wrap items-center gap-2">
                  <TestButton />
                  <form action={disconnectPostfachAction}>
                    <button type="submit" className={buttonClass("ghost", "md")}>
                      Trennen
                    </button>
                  </form>
                </div>
              ) : null}
              <p className="text-sm text-[color:var(--muted)]">
                Gesendete E-Mails finden Sie auch im Gesendet-Ordner Ihres Postfachs{conn.provider === "smtp" ? " (je nach Anbieter)" : ""}. Beim Lead stehen sie im Verlauf.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-[color:var(--muted)]">Verbinden Sie Ihr Postfach – danach schreiben Sie Leads direkt aus der App an, auf Wunsch mit dem Angebot im Anhang.</p>
              {!readOnly ? (
                <div className="flex flex-wrap gap-2">
                  {showGoogle ? (
                    <a href="/api/mail/connect?anbieter=google" className={buttonClass("secondary", "md")}>
                      Mit Google (Gmail) verbinden
                    </a>
                  ) : null}
                  {microsoftMailAvailable() ? (
                    <a href="/api/mail/connect?anbieter=microsoft" className={buttonClass("secondary", "md")}>
                      Mit Microsoft (Outlook/365) verbinden
                    </a>
                  ) : null}
                </div>
              ) : null}
              <details className="rounded-[var(--radius-md)] border border-[color:var(--border)] px-4 py-3">
                <summary className="cursor-pointer text-[15px] font-medium">Anderer Anbieter (SMTP, z. B. IONOS, Strato, T-Online, GMX, Gmail mit App-Passwort)</summary>
                <div className="mt-3">
                  <SmtpForm readOnly={readOnly} />
                </div>
              </details>
              <p className="text-xs text-[color:var(--muted)]">
                Firmen-Postfächer mancher Versicherer (z. B. Allianz) lassen sich oft nicht verbinden. Dann bleibt „E-Mail schreiben“ über Ihr Mailprogramm.
              </p>
            </>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Signatur" icon={PenLine} />
        <div className="p-5">
          <p className="mb-3 text-sm text-[color:var(--muted)]">
            Steht automatisch unter jeder E-Mail an Leads (auch ohne Vorlage). In einer Vorlage können Sie die Stelle mit {"{signatur}"} selbst bestimmen.
          </p>
          <SignaturForm signatur={me?.mailSignature ?? ""} readOnly={readOnly} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Vorlagen" icon={Mail} />
        <div className="p-5">
          <p className="mb-3 text-sm text-[color:var(--muted)]">
            Platzhalter werden beim Schreiben ersetzt: {PLATZHALTER.join(", ")}.
          </p>
          <VorlagenListe vorlagen={vorlagen} readOnly={readOnly} />
        </div>
      </Card>
    </main>
  );
}
