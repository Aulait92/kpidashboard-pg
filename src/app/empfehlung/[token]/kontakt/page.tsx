import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { CheckCircle2, ChevronDown, MessageCircle, Phone, UserPlus } from "lucide-react";
import { ReferralInvalidLink, ReferralShell } from "@/components/empfehlung/public-shell";
import { REFERRAL_DRAFT_COOKIE, decodeReferralDraft } from "@/lib/empfehlung/entwurf";
import { buttonClass } from "@/components/ui";
import { PhoneField } from "@/components/phone-field";
import { SubmitButton } from "@/components/submit-button";
import { countReferralVisit, loadReferralPage } from "@/lib/empfehlung/requests";
import { anFromParam, contactConsentText, contactErrors, contactIntro, contactSuccess, statusConsentText, telHref, whatsappSelfNote } from "@/lib/empfehlung/shared";
import { a } from "@/lib/ansprache";
import { requestIp } from "@/lib/rate-limit";
import { nowMs } from "@/lib/now";
import { submitReferralAction } from "./actions";

// Empfohlene Person: trägt sich selbst ein. Daraus wird ein normaler Lead beim Vertreter mit Quelle „Empfehlung“,
// der Vertreter bekommt den Push „jetzt anrufen“ (lib/lead-intake.ts). Paket 3 (20.11.2026): sichtbar nur Name und
// Handy, der Rest hinter „Mehr angeben“; Einwilligung als Satz direkt über dem Knopf (Absenden = Einwilligung,
// Wortlaut und Zeitstempel werden gespeichert); Rückmeldung an den Empfehlenden als eigenes, freiwilliges Häkchen.
// Ansprache: ?an=du (vom Empfehlenden beim Teilen gewählt), sonst Sie.
export const dynamic = "force-dynamic";

type SP = { ok?: string; err?: string; an?: string };

// Link-Vorschau (WhatsApp & Co.): Angebot und Vertreter statt eines nackten Links
export async function generateMetadata({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<SP> }): Promise<Metadata> {
  const { token } = await params;
  const an = anFromParam((await searchParams).an);
  const page = /^[\w-]{10,64}$/.test(token) ? await loadReferralPage(token).catch(() => null) : null;
  const robots = { index: false, follow: false };
  if (!page) return { title: "Kontakt aufnehmen", robots };
  const title = page.offer ? `${page.offer.headline} bei ${page.vertreter}` : `Kontakt zu ${page.vertreter}`;
  const description = page.offer
    ? "Kostenlos und unverbindlich. Einfach Nummer hinterlassen."
    : a(an, `${page.vertreter} meldet sich persönlich bei dir, kostenlos und unverbindlich.`, `${page.vertreter} meldet sich persönlich bei Ihnen, kostenlos und unverbindlich.`);
  return { title, description, robots, openGraph: { title, description, type: "website" } };
}

export default async function ReferralContactPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<SP> }) {
  const { token } = await params;
  const sp = await searchParams;
  const an = anFromParam(sp.an);
  const page = /^[\w-]{10,64}$/.test(token) ? await loadReferralPage(token) : null;
  if (!page) return <ReferralInvalidLink />;
  const offer = an === "du" ? page.offerDu : page.offer;
  const privacyLink = (
    <a href={page.privacyUrl} target="_blank" rel="noopener noreferrer" className="underline" data-referral-privacy>
      Datenschutz
    </a>
  );

  if (sp.ok) {
    const done = contactSuccess(page.vertreter, an, !!page.advisorPhone);
    return (
      <ReferralShell customerId={page.customerId} advisor={page.vertreter}>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <h1 className="text-xl font-bold tracking-tight" data-referral-success>
            {done.title}
          </h1>
        </div>
        <p className="mt-3 text-[15px] leading-relaxed text-[color:var(--muted)]">{done.text}</p>
        {page.advisorPhone ? (
          <div className="mt-4 space-y-3" data-referral-save-number>
            <a href={telHref(page.advisorPhone)} className="block text-center text-2xl font-semibold tabular-nums tracking-tight text-[color:var(--foreground)]">
              {page.advisorPhone}
            </a>
            <a href={`/empfehlung/${token}/nummer`} className={buttonClass("primary", "md", "h-12 w-full text-base")} data-referral-vcard>
              <UserPlus className="h-5 w-5" /> Nummer speichern
            </a>
          </div>
        ) : null}
      </ReferralShell>
    );
  }

  // Einzelne Besucher zählen (nur beim ersten Aufruf, nicht nach Fehlern)
  if (!sp.err) {
    const h = await headers();
    await countReferralVisit(page, { ip: await requestIp(), userAgent: h.get("user-agent") }).catch(() => {});
  }
  // Nach einem Fehler: Eingaben wieder einsetzen (Cookie aus der Aktion, nur nach ?err=…)
  const draft = sp.err ? decodeReferralDraft((await cookies()).get(REFERRAL_DRAFT_COOKIE)?.value) : null;
  const errors = contactErrors(an);
  const action = submitReferralAction.bind(null, token);
  const moreOpen = !!(draft?.email || draft?.topic || draft?.message || sp.err === "email");
  return (
    <ReferralShell customerId={page.customerId} advisor={page.vertreter}>
      {page.recommender ? (
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700" data-referral-from>
          Empfohlen von {page.recommender}
        </p>
      ) : null}
      <h1 className={`${page.recommender ? "mt-1" : ""} text-2xl font-bold leading-tight tracking-tight`}>{offer ? offer.headline : `Kontakt zu ${page.vertreter}`}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-[color:var(--muted)]" data-referral-intro>
        {contactIntro(page.vertreter, an)}
      </p>
      {sp.err && errors[sp.err] ? (
        <p className="mt-3 rounded-[var(--radius-sm)] bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800" role="alert" data-referral-error={sp.err}>
          {errors[sp.err]}
        </p>
      ) : null}
      <form action={action} className="mt-4 space-y-3" data-referral-form>
        <input type="hidden" name="an" value={an} />
        <Field name="name" label={a(an, "Dein Name", "Ihr Name")} autoComplete="name" required defaultValue={draft?.name} invalid={sp.err === "name"} />
        <PhoneField name="phone" label={a(an, "Deine Handynummer", "Ihre Handynummer")} defaultInternational={draft?.phone || undefined} />
        <details className="group" open={moreOpen} data-referral-more>
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-semibold text-[color:var(--brand)] [&::-webkit-details-marker]:hidden">
            Mehr angeben (optional) <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
          </summary>
          <div className="mt-2 space-y-3">
            <Field name="email" label="E-Mail-Adresse" type="email" autoComplete="email" defaultValue={draft?.email} invalid={sp.err === "email"} />
            {page.topics.length ? (
              <label className="block text-sm font-medium">
                Worum geht es?
                <select name="topic" defaultValue={draft?.topic ?? ""} className="mt-1 h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-base">
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
              Nachricht
              <textarea name="message" rows={3} maxLength={500} defaultValue={draft?.message} className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2 text-base" />
            </label>
          </div>
        </details>
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
        <input type="hidden" name="rendered_at" value={String(nowMs())} />
        {page.statusUpdates ? (
          <label className="flex min-h-11 items-start gap-2.5 text-xs leading-relaxed text-[color:var(--muted)]" data-referral-status-consent>
            <input type="checkbox" name="statusConsent" defaultChecked={draft?.statusConsent ?? false} className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{statusConsentText(page.recommender, page.vertreter)}</span>
          </label>
        ) : null}
        <p className="text-xs leading-relaxed text-[color:var(--muted)]" data-referral-consent>
          {contactConsentText(page.vertreter, an)} {privacyLink}
        </p>
        <SubmitButton pendingLabel="Wird gesendet …" className={buttonClass("primary", "md", "h-12 w-full text-base")}>
          <Phone className="h-5 w-5" /> Rückruf anfordern
        </SubmitButton>
      </form>
      {page.whatsappUrl ? (
        <div className="mt-5 border-t border-[color:var(--border)] pt-4" data-referral-whatsapp>
          <a href={page.whatsappUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "md", "h-12 w-full text-base")}>
            <MessageCircle className="h-5 w-5" /> Lieber per WhatsApp schreiben
          </a>
          <p className="mt-2 text-xs leading-relaxed text-[color:var(--muted)]">
            {whatsappSelfNote(page.vertreter, an)} {privacyLink}
          </p>
        </div>
      ) : null}
    </ReferralShell>
  );
}

function Field({
  name,
  label,
  type = "text",
  autoComplete,
  required,
  defaultValue,
  invalid,
}: {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  defaultValue?: string;
  invalid?: boolean;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        defaultValue={defaultValue}
        aria-invalid={invalid || undefined}
        className={`mt-1 h-11 w-full rounded-[var(--radius-sm)] border px-3 text-base ${invalid ? "border-rose-400" : "border-[color:var(--border)]"}`}
      />
    </label>
  );
}
