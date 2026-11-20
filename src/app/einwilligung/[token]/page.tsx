import type { Metadata } from "next";
import { LeadLegalFooter } from "@/components/lead-legal-footer";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { AdvisorHeader } from "@/components/empfehlung/advisor-header";
import { buttonClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { verifyLink } from "@/lib/bestand/links";
import { loadConsentPage } from "@/lib/bestand/einwilligung-server";
import { consentQuestion } from "@/lib/bestand/einwilligung";
import { nowMs } from "@/lib/now";
import { a, type Ansprache } from "@/lib/ansprache";
import { submitConsentAction } from "./actions";

// Einwilligungs-Abfrage für Bestandskunden (Ole, 14.11.2026): „Darf ich Sie über passende Angebote per E-Mail
// bzw. WhatsApp informieren?“ Öffentlich, ohne Login, im Namen des Vermittlers. E-Mail mit Double-Opt-in.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ihre Einwilligung", robots: { index: false, follow: false } };

/** Fehlermeldungen je Ansprache (Einstellung des Vermittlers für seine Bestandskunden). */
const errors = (an: Ansprache): Record<string, string> => ({
  none: a(an, "Bitte wähle mindestens einen Weg aus.", "Bitte wählen Sie mindestens einen Weg aus."),
  email: a(an, "Bitte prüfe die E-Mail-Adresse.", "Bitte prüfen Sie die E-Mail-Adresse."),
  phone: a(an, "Bitte gib deine Handynummer an.", "Bitte geben Sie Ihre Handynummer an."),
  busy: a(an, "Gerade kamen sehr viele Anfragen. Bitte versuche es später noch einmal.", "Gerade kamen sehr viele Anfragen. Bitte versuchen Sie es später noch einmal."),
  invalid: "Die Anfrage konnte nicht verarbeitet werden.",
  unavailable: "Dieser Link ist nicht (mehr) aktiv.",
});

export default async function ConsentPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ ok?: string; doi?: string; wa?: string; err?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const v = verifyLink(token);
  const page = v?.kind === "e" ? await loadConsentPage(v.id).catch(() => null) : null;
  if (!page) {
    return (
      <Shell>
        <h1 className="text-xl font-bold">Link nicht mehr gültig</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">Dieser Link ist nicht (mehr) aktiv.</p>
      </Shell>
    );
  }
  const an = page.ansprache;
  const ERRORS = errors(an);
  if (sp.ok) {
    return (
      <Shell customerId={page.customerId} advisor={page.advisor}>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight" data-consent-done>
          Vielen Dank!
        </h1>
        {sp.wa ? <p className="mt-2 text-[15px] text-[color:var(--muted)]">{a(an, "Deine Einwilligung für WhatsApp ist gespeichert.", "Ihre Einwilligung für WhatsApp ist gespeichert.")}</p> : null}
        {sp.doi ? (
          <p className="mt-2 text-[15px] text-[color:var(--muted)]" data-consent-doi>
            {a(
              an,
              "Bitte bestätige noch deine E-Mail-Adresse: Wir haben dir dafür eine E-Mail mit einem Link geschickt.",
              "Bitte bestätigen Sie noch Ihre E-Mail-Adresse: Wir haben Ihnen dafür eine E-Mail mit einem Link geschickt.",
            )}
          </p>
        ) : null}
        <p className="mt-4 text-xs text-[color:var(--muted)]">
          {a(an, "Du kannst die Einwilligung jederzeit widerrufen", "Sie können die Einwilligung jederzeit widerrufen")}, zum Beispiel über den Abmeldelink in jeder E-Mail oder mit „Stopp“ per WhatsApp.
        </p>
      </Shell>
    );
  }
  const action = submitConsentAction.bind(null, token);
  return (
    <Shell customerId={page.customerId} advisor={page.advisor}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--brand)]/10 text-[color:var(--brand)]">
        <ShieldCheck className="h-6 w-6" />
      </div>
      <h1 className="mt-4 text-2xl font-bold tracking-tight" data-consent-title>
        {a(an, "Darf ich mich melden, wenn es bei deinen Verträgen etwas Wichtiges gibt?", "Darf ich mich melden, wenn es bei Ihren Verträgen etwas Wichtiges gibt?")}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-[color:var(--muted)]">
        {page.anrede} {a(an, "wähle, wie du informiert werden möchtest.", "wählen Sie, wie Sie informiert werden möchten.")}
      </p>
      {sp.err && ERRORS[sp.err] ? <p className="mt-4 rounded-[var(--radius-sm)] bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">{ERRORS[sp.err]}</p> : null}
      <form action={action} className="mt-5 space-y-3">
        {/* Rechtlich (UWG § 7, DSGVO Art. 7): nichts vorauswählen, beide Kanäle starten leer (P0-1, 19.11.2026) */}
        <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] has-[:checked]:border-[color:var(--brand)] has-[:checked]:bg-[color:var(--brand)]/5">
          <label className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3 text-base font-semibold">
            <input type="checkbox" name="email" className="h-6 w-6 shrink-0 accent-[color:var(--brand)]" data-consent-email />
            <span>Per E-Mail</span>
          </label>
          <div className="px-4 pb-3">
            <input
              name="emailAddress"
              type="email"
              defaultValue={page.email ?? ""}
              autoComplete="email"
              aria-label={a(an, "Deine E-Mail-Adresse", "Ihre E-Mail-Adresse")}
              placeholder={a(an, "Deine E-Mail-Adresse", "Ihre E-Mail-Adresse")}
              className="h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-base"
            />
            <p className="mt-1 text-xs text-[color:var(--muted)]">{a(an, "Du bekommst einen Link zum Bestätigen.", "Sie bekommen einen Link zum Bestätigen.")}</p>
          </div>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] has-[:checked]:border-[color:var(--brand)] has-[:checked]:bg-[color:var(--brand)]/5">
          <label className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3 text-base font-semibold">
            <input type="checkbox" name="whatsapp" className="h-6 w-6 shrink-0 accent-[color:var(--brand)]" data-consent-whatsapp />
            <span>Per WhatsApp</span>
          </label>
          <div className="px-4 pb-3">
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              aria-label={a(an, "Deine Handynummer", "Ihre Handynummer")}
              placeholder={
                page.phone
                  ? a(an, "Deine hinterlegte Nummer (oder eine andere eingeben)", "Ihre hinterlegte Nummer (oder eine andere eingeben)")
                  : a(an, "Deine Handynummer", "Ihre Handynummer")
              }
              className="h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-base"
            />
          </div>
        </div>
        <input
          type="text"
          name="zq_hp_field"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          data-1p-ignore
          data-lpignore="true"
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
        />
        <input type="hidden" name="rendered_at" value={String(nowMs())} />
        <p className="text-xs leading-relaxed text-[color:var(--muted)]" data-consent-text>
          {consentQuestion(page.advisor, ["email", "whatsapp"])} Hinweise in der{" "}
          <a href={page.privacyUrl} target="_blank" rel="noopener noreferrer" className="underline">
            Datenschutzerklärung
          </a>
          .
        </p>
        <SubmitButton pendingLabel="Wird gespeichert …" className={buttonClass("primary", "md", "h-12 w-full text-base")}>
          {a(an, "Ja, so informieren", "Ja, so informieren")}
        </SubmitButton>
        <p className="text-center text-xs text-[color:var(--muted)]">
          Ohne Auswahl passiert nichts. {a(an, "Du kannst diese Seite einfach schließen.", "Sie können diese Seite einfach schließen.")}
        </p>
      </form>
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
