import { redirect } from "next/navigation";
import { CheckCircle2, Mail, PenLine, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { MicrosoftAdminConsent } from "@/components/microsoft-admin-consent";
import { PostfachVerbindenKnoepfe } from "@/components/postfach-verbinden";
import { microsoftAdminConsentUrl } from "@/lib/microsoft-admin-consent";
import { buttonClass, Card, CardHeader } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { googleMailAvailable, googleMailFreigegeben, microsoftMailAvailable, postfachOf, PROVIDER_LABEL } from "@/lib/mail/postfach";
import { loadVorlagen, PLATZHALTER, ZUSATZ_PLATZHALTER } from "@/lib/mail/vorlagen";
import { AnspracheForm } from "@/components/ansprache-form";
import { asAnsprache } from "@/lib/ansprache";
import { disconnectPostfachAction } from "./actions";
import { SignaturForm, SmtpForm, TestButton, VorlagenListe } from "./forms";
import { MailFeaturesToggle } from "@/components/mail-features-toggle";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = { title: "E-Mail-Postfach | performancegrowth" };

const STATUS_TEXT: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Postfach verbunden." },
  denied: { ok: false, text: "Die Anmeldung wurde abgebrochen." },
  consent: { ok: false, text: "Ihr Firmenkonto erlaubt das Verbinden nicht ohne Freigabe Ihrer IT. Bei Microsoft 365 hilft der Link unten, sonst SMTP nutzen." },
  scope: { ok: false, text: "Bitte beim Anmelden das Senden von E-Mails erlauben." },
  error: { ok: false, text: "Das Verbinden hat nicht geklappt. Bitte noch einmal versuchen oder SMTP nutzen." },
};

// Eigenes Postfach verbinden (Ole, 13.11.2026): E-Mails an Leads gehen aus Ihrem Postfach,
// mit Vorlagen. Google, Microsoft oder SMTP (z. B. IONOS, Strato, T-Online).
export default async function PostfachPage({ searchParams }: { searchParams: Promise<{ postfach?: string; google?: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const sp = await searchParams;
  const [conn, vorlagen, me, ansprache] = await Promise.all([
    postfachOf(ctx.userId),
    loadVorlagen(ctx.customerId),
    ctx.userId ? prisma.user.findUnique({ where: { id: ctx.userId }, select: { mailSignature: true } }) : null,
    prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { leadAddress: true, mailFeaturesOff: true } }),
  ]);
  const status = sp.postfach ? STATUS_TEXT[sp.postfach] : null;
  const readOnly = ctx.preview;
  // Gmail erst anbieten, wenn Google die App geprüft hat (sonst Warnseite „nicht überprüft“).
  // Zum Testen vorher: /buyer/postfach?google=1
  const showGoogle = googleMailFreigegeben() || (googleMailAvailable() && sp.google === "1");
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader back="/buyer/einstellungen" title="E-Mail-Postfach" subtitle="E-Mails an Leads direkt aus der App senden, aus Ihrem eigenen Postfach, mit Vorlagen." />
      {status ? (
        <p className={`flex items-center gap-2 rounded-[var(--radius-md)] px-4 py-3 text-sm ${status.ok ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
          {status.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <TriangleAlert className="h-4 w-4 shrink-0" />} {status.text}
        </p>
      ) : null}
      {sp.postfach === "consent" && microsoftAdminConsentUrl() ? <MicrosoftAdminConsent url={microsoftAdminConsentUrl()!} /> : null}

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
                Gesendete E-Mails finden Sie auch im Gesendet-Ordner Ihres Postfachs{conn.provider === "smtp" ? " (je nach Anbieter)" : ""}. Beim Lead stehen sie im Verlauf. Wir senden nur E-Mails, die Sie selbst auslösen, und lesen Ihr Postfach nicht.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-[color:var(--muted)]">Verbinden Sie Ihr Postfach. Danach schreiben Sie Leads direkt aus der App an, auf Wunsch mit dem Angebot im Anhang.</p>
              <p className="text-sm text-[color:var(--muted)]" data-postfach-datenschutz>
                Wir senden nur E-Mails, die Sie selbst auslösen, und lesen Ihr Postfach nicht.
              </p>
              {/* Firmenkonto-Hinweis nur, wenn der Freigabe-Hinweis oben nicht schon steht */}
              <PostfachVerbindenKnoepfe google={showGoogle} microsoft={microsoftMailAvailable()} readOnly={readOnly} adminConsentUrl={sp.postfach === "consent" ? null : microsoftAdminConsentUrl()} />
              <details className="rounded-[var(--radius-md)] border border-[color:var(--border)] px-4 py-3">
                <summary className="cursor-pointer text-[15px] font-medium">Anderer Anbieter (SMTP, z. B. IONOS, Strato, T-Online, GMX, Gmail mit App-Passwort)</summary>
                <div className="mt-3">
                  <SmtpForm readOnly={readOnly} />
                </div>
              </details>
              <p className="text-sm text-[color:var(--muted)]">
                Firmen-Postfächer mancher Versicherer (z. B. Allianz) lassen sich oft nicht verbinden. Dann bleibt „E-Mail schreiben“ über Ihr Mailprogramm.
              </p>
            </>
          )}
        </div>
      </Card>

      <Card id="signatur">
        <CardHeader title="Signatur" icon={PenLine} />
        <div className="p-5">
          <p className="mb-3 text-sm text-[color:var(--muted)]">Steht automatisch unter jeder E-Mail an Ihre Kontakte.</p>
          <SignaturForm signatur={me?.mailSignature ?? ""} readOnly={readOnly} />
        </div>
      </Card>

      <Card id="vorlagen">
        <CardHeader title="Vorlagen" icon={Mail} />
        <div className="p-5">
          <p className="mb-3 text-sm text-[color:var(--muted)]">Name, Anrede und Terminlink setzt die App beim Schreiben selbst ein. Passende Vorlagen stehen im Fenster vorn.</p>
          {/* Technische Platzhalter-Liste zum Aufklappen (UX-Runde 19.11.2026: vorher zwei lange Absätze) */}
          <details className="mb-4 rounded-[var(--radius-md)] border border-[color:var(--border)] px-4 py-3" data-platzhalter-hilfe>
            <summary className="cursor-pointer text-sm font-medium">Platzhalter für eigene Vorlagen</summary>
          <p className="mb-3 mt-3 text-sm text-[color:var(--muted)]">
            Platzhalter werden beim Schreiben ersetzt: {PLATZHALTER.join(", ")}. {"{anrede}"} wird je nach Ansprache zu „Guten Tag Frau Beispiel“
            (Sie; ohne bekannte Anrede „Guten Tag Anna Beispiel“, ohne Nachname „Guten Tag“) oder „Hallo Anna“ (Du). {"{terminlink}"} ist der persönliche Buchungslink des Kontakts; steht schon ein
            Termin an, fällt der Satz weg.
          </p>
          <p className="mb-3 text-sm text-[color:var(--muted)]" data-zusatz-platzhalter>
            Diese Platzhalter füllen Sie beim Schreiben über Felder im Fenster: {ZUSATZ_PLATZHALTER.join(", ")}. Im Fenster stehen die Vorlagen vorn, die zur Phase des
            Kontakts passen.
          </p>
          <p className="text-sm text-[color:var(--muted)]">In einer Vorlage bestimmen Sie die Stelle der Signatur mit {"{signatur}"}.</p>
          </details>
          {ctx.teamRole === "owner" ? (
            <div className="mb-4">
              <AnspracheForm current={asAnsprache(ansprache?.leadAddress)} readOnly={readOnly} />
            </div>
          ) : null}
          <VorlagenListe vorlagen={vorlagen} readOnly={readOnly} />
        </div>
      </Card>
      {/* Seltene Einstellung ans Ende (UX-Runde 19.11.2026): die Seite beginnt mit dem Verbinden */}
      {ctx.teamRole === "owner" ? (
        <Card>
          <div className="p-5">
            <MailFeaturesToggle on={!ansprache?.mailFeaturesOff} readOnly={readOnly} />
          </div>
        </Card>
      ) : null}
    </main>
  );
}
