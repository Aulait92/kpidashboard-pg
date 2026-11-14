import type { Metadata } from "next";
import { headers } from "next/headers";
import { CheckCircle2, ClipboardCheck, MessageCircle, UserRound } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { PhoneField } from "@/components/phone-field";
import { SubmitButton } from "@/components/submit-button";
import { countReferralVisit, loadReferralPage } from "@/lib/empfehlung/requests";
import { statusConsentText } from "@/lib/empfehlung/shared";
import { requestIp } from "@/lib/rate-limit";
import { nowMs } from "@/lib/now";
import { submitReferralAction } from "./actions";

// Empfohlene Person: trägt sich selbst ein (mit Einwilligung). Daraus wird ein
// normaler Lead beim Vertreter mit Quelle „Empfehlung“.
export const dynamic = "force-dynamic";

// Link-Vorschau (WhatsApp & Co.): Angebot und Vertreter statt eines nackten Links
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const page = /^[\w-]{10,64}$/.test(token) ? await loadReferralPage(token).catch(() => null) : null;
  const robots = { index: false, follow: false };
  if (!page) return { title: "Kontakt aufnehmen", robots };
  const title = page.offer ? `${page.offer.headline} bei ${page.vertreter}` : `Kontakt zu ${page.vertreter}`;
  const description = page.offer ? "Kostenlos und unverbindlich. Einfach Nummer hinterlassen." : `${page.vertreter} meldet sich persönlich bei Ihnen – unverbindlich und kostenlos.`;
  return { title, description, robots, openGraph: { title, description, type: "website" } };
}

const ERRORS: Record<string, string> = {
  name: "Bitte geben Sie Ihren Namen an.",
  phone: "Bitte geben Sie eine gültige Telefonnummer an.",
  email: "Bitte prüfen Sie die E-Mail-Adresse.",
  consent: "Bitte bestätigen Sie die Einwilligung.",
  busy: "Über diesen Link sind heute schon viele Anfragen eingegangen. Bitte versuchen Sie es morgen noch einmal.",
  unavailable: "Dieser Link ist nicht (mehr) aktiv.",
  invalid: "Die Anfrage konnte nicht verarbeitet werden.",
};

export default async function ReferralContactPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const page = /^[\w-]{10,64}$/.test(token) ? await loadReferralPage(token) : null;
  if (!page) {
    return (
      <Shell>
        <h1 className="text-xl font-bold">Link nicht mehr gültig</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">Dieser Empfehlungslink ist nicht (mehr) aktiv.</p>
      </Shell>
    );
  }
  if (sp.ok) {
    return (
      <Shell>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Danke, Ihre Anfrage ist angekommen!</h1>
        <p className="mt-2 text-[15px] text-[color:var(--muted)]">{page.vertreter} meldet sich in Kürze bei Ihnen.</p>
      </Shell>
    );
  }
  // Einzelne Besucher zählen (nur beim ersten Aufruf, nicht nach Fehlern)
  if (!sp.err) {
    const h = await headers();
    await countReferralVisit(page, { ip: await requestIp(), userAgent: h.get("user-agent") }).catch(() => {});
  }
  const action = submitReferralAction.bind(null, token);
  const offer = page.offer;
  const renderedAt = nowMs();
  return (
    <Shell>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--brand)]/10 text-[color:var(--brand)]">
        {offer ? <ClipboardCheck className="h-6 w-6" /> : <UserRound className="h-6 w-6" />}
      </div>
      {page.recommender ? (
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-[color:var(--brand)]" data-referral-from>
          Auf Empfehlung von {page.recommender}
        </p>
      ) : null}
      <h1 className={`${page.recommender ? "mt-1" : "mt-4"} text-2xl font-bold tracking-tight`}>{offer ? offer.headline : `Kontakt zu ${page.vertreter}`}</h1>
      {offer ? (
        <p className="mt-2 text-[15px] leading-relaxed text-[color:var(--muted)]" data-referral-offer>
          {offer.text} Hinterlassen Sie Ihre Nummer, dann meldet sich {page.vertreter} persönlich.
        </p>
      ) : (
        <p className="mt-2 text-[15px] leading-relaxed text-[color:var(--muted)]">
          {page.recommender ? `${page.recommender} hat Ihnen ${page.vertreter} empfohlen. ` : ""}Hinterlassen Sie Ihre Nummer, dann meldet sich {page.vertreter}{" "}
          persönlich – unverbindlich und kostenlos.
        </p>
      )}
      {sp.err && ERRORS[sp.err] ? <p className="mt-4 rounded-[var(--radius-sm)] bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">{ERRORS[sp.err]}</p> : null}
      {page.whatsappUrl ? (
        <div className="mt-5" data-referral-whatsapp>
          <a href={page.whatsappUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "md", "h-12 w-full text-base")}>
            <MessageCircle className="h-4 w-4" /> Per WhatsApp anfragen
          </a>
          <p className="mt-2 text-xs leading-relaxed text-[color:var(--muted)]">
            Die Nachricht ist schon vorgeschrieben, Sie müssen nur noch auf Senden tippen. Damit nehmen Sie selbst Kontakt zu {page.vertreter} auf. Hinweise in der{" "}
            <a href={page.privacyUrl} target="_blank" rel="noopener noreferrer" className="underline">
              Datenschutzerklärung
            </a>
            .
          </p>
          <p className="mt-4 text-center text-xs font-medium uppercase tracking-wide text-[color:var(--muted)]">oder Rückruf anfragen</p>
        </div>
      ) : null}
      <form action={action} className={page.whatsappUrl ? "mt-3 space-y-3" : "mt-5 space-y-3"}>
        <Field name="name" label="Vor- und Nachname" autoComplete="name" required />
        <PhoneField name="phone" label="Handynummer (für Anruf oder WhatsApp)" />
        <Field name="email" label="E-Mail-Adresse (optional)" type="email" autoComplete="email" />
        {page.topics.length ? (
          <label className="block text-sm font-medium">
            Worum geht es? (optional)
            <select name="topic" className="mt-1 h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-base">
              <option value="">Bitte wählen</option>
              {page.topics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value="Sonstiges">Sonstiges</option>
            </select>
          </label>
        ) : null}
        <label className="block text-sm font-medium">
          Nachricht (optional)
          <textarea name="message" rows={3} maxLength={500} className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2 text-base" />
        </label>
        <input
          type="text"
          name="zq_hp_field"
          tabIndex={-1}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          aria-hidden="true"
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
        />
        <input type="hidden" name="rendered_at" value={String(renderedAt)} />
        <label className="flex items-start gap-2 text-xs leading-relaxed text-[color:var(--muted)]">
          <input type="checkbox" name="consent" required className="mt-0.5" />
          <span>
            Ich bin einverstanden, dass {page.vertreter} mich zu meinem Anliegen per Telefon, WhatsApp oder E-Mail kontaktiert und meine Angaben dafür
            verarbeitet. Die Einwilligung kann ich jederzeit widerrufen. Hinweise in der{" "}
            <a href={page.privacyUrl} target="_blank" rel="noopener noreferrer" className="underline">
              Datenschutzerklärung
            </a>
            .
          </span>
        </label>
        {page.statusUpdates ? (
          <label className="flex items-start gap-2 text-xs leading-relaxed text-[color:var(--muted)]">
            <input type="checkbox" name="statusConsent" className="mt-0.5" />
            <span>{statusConsentText(page.recommender, page.vertreter)}</span>
          </label>
        ) : null}
        <SubmitButton pendingLabel="Wird gesendet …" className={buttonClass(page.whatsappUrl ? "secondary" : "primary", "md", "h-12 w-full text-base")}>
          {offer ? offer.cta : "Kontakt anfragen"}
        </SubmitButton>
      </form>
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

function Field({ name, label, type = "text", autoComplete, required }: { name: string; label: string; type?: string; autoComplete?: string; required?: boolean }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input name={name} type={type} autoComplete={autoComplete} required={required} className="mt-1 h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 text-base" />
    </label>
  );
}
