import Link from "next/link";
import { connection } from "next/server";
import { BadgeCheck, Calculator, MessageCircle, Smartphone, TrendingUp } from "lucide-react";
import { consentTextFor, loadReferralSettings, referrerByCode } from "@/lib/kollegen";
import { benefitSentence } from "@/lib/kollegen-shared";
import { loadRechnerConfig } from "@/lib/rechner-server";
import { nowMs } from "@/lib/now";
import { ReferralForm } from "./referral-form";

export const metadata = {
  title: "Empfehlung · performancegrowth",
  description: "Ein Kollege empfiehlt Ihnen performancegrowth: neue Kunden über Werbung bei Meta, Leads direkt in der App.",
  robots: { index: false },
};

const PRIVACY_URL = process.env.BOOKING_PRIVACY_URL ?? "https://performancegrowth.de/datenschutz";

function Logo() {
  return (
    <div className="flex items-center gap-2 text-[17px] font-semibold">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--brand)] text-[13px] text-white">↗</span>
      <span>
        performance<span className="text-[color:var(--brand)]">growth</span>
      </span>
    </div>
  );
}

// Öffentliche Landingpage „Kollegen empfehlen“ (mobil zuerst). Der Empfohlene
// trägt sich selbst ein; daraus wird ein Vertriebskontakt (lib/kollegen.ts).
export default async function EmpfehlenPage({ params }: { params: Promise<{ code: string }> }) {
  await connection();
  const { code } = await params;
  const [ref, settings] = await Promise.all([referrerByCode(code), loadReferralSettings()]);

  if (!ref || !settings.enabled) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-10">
        <Logo />
        <div className="mt-6 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-6 shadow-[var(--shadow-md)]">
          <h1 className="text-xl font-semibold tracking-tight">Dieser Empfehlungslink ist nicht (mehr) gültig.</h1>
          <p className="mt-2 text-[15px] text-[color:var(--muted)]">
            Sie können sich trotzdem gern melden – oder vorab ausrechnen, ob sich Leadgenerierung für Sie lohnt.
          </p>
          <Link href="/rechner" className="mt-4 inline-flex h-11 items-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-[15px] font-semibold text-white">
            <Calculator className="h-4 w-4" /> Zum Rechner
          </Link>
        </div>
      </main>
    );
  }

  const config = await loadRechnerConfig();
  const guarantees = [config.guarantees.leads, config.guarantees.breakEven, config.guarantees.productSwap].filter((g) => g.enabled);
  const benefit = benefitSentence(settings);
  const bookingUrl = /^https:\/\//i.test(config.contactUrl) ? config.contactUrl : null;
  const who = ref.person !== ref.agency && ref.agency ? (
    <>
      {ref.person} <span className="font-normal text-[color:var(--muted)]">von</span> {ref.agency}
    </>
  ) : (
    ref.person
  );

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-6 sm:px-6">
      <Logo />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
        <section>
          <p className="text-sm font-semibold uppercase tracking-wide text-[color:var(--brand)]">Persönliche Empfehlung</p>
          <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-tight sm:text-4xl" data-empfehlen-headline>
            {who} empfiehlt Ihnen performancegrowth
          </h1>
          <p className="mt-3 text-[17px] leading-relaxed text-[color:var(--muted)]">
            Wir gewinnen für Versicherungsvermittler neue Kunden über Werbung bei Meta – und liefern die Software, mit der Sie jeden Kontakt nachverfolgen.
          </p>
          {benefit ? (
            <div className="mt-4 flex items-start gap-2 rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-4 py-3 text-[15px] text-emerald-900" data-empfehlen-benefit>
              <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{benefit}</span>
            </div>
          ) : null}
          <ul className="mt-6 space-y-3 text-[15px]">
            <li className="flex gap-3">
              <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--brand)]" />
              <span>Anzeigen bei Facebook und Instagram für Ihre Region und Ihre Produkte – wir kümmern uns um Kampagnen und Formulare.</span>
            </li>
            <li className="flex gap-3">
              <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--brand)]" />
              <span>Jeder neue Lead kommt sofort in Ihre App – mit Anrufliste, Wiedervorlagen und Terminen.</span>
            </li>
            <li className="flex gap-3">
              <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--brand)]" />
              <span>Auf Wunsch meldet sich ein WhatsApp-Assistent direkt bei neuen Leads und vereinbart Termine.</span>
            </li>
          </ul>
          {guarantees.length ? (
            <div className="mt-6 space-y-3">
              <h2 className="text-lg font-semibold tracking-tight">Unsere Garantien</h2>
              {guarantees.map((g) => (
                <div key={g.title} className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white p-4">
                  <div className="font-semibold">{g.title}</div>
                  <p className="mt-1 text-sm leading-relaxed text-[color:var(--muted)]">{g.text}</p>
                </div>
              ))}
              <a href={config.termsUrl} target="_blank" rel="noopener" className="text-sm text-[color:var(--muted)] underline">
                Details in unseren AGB
              </a>
            </div>
          ) : null}
          <Link
            href="/rechner"
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-4 text-[15px] font-semibold transition hover:bg-[color:var(--surface-sunken)]"
          >
            <Calculator className="h-4 w-4" /> Rechnet sich das für Sie? Zum Rechner
          </Link>
        </section>

        <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-md)] sm:p-6 lg:sticky lg:top-6">
          <h2 className="text-xl font-semibold tracking-tight">Erstgespräch anfragen</h2>
          <p className="mb-4 mt-1 text-sm text-[color:var(--muted)]">Kostenlos und unverbindlich. Ole Kannapinn meldet sich persönlich bei Ihnen.</p>
          <ReferralForm
            code={code}
            consentText={consentTextFor(ref.person)}
            privacyUrl={PRIVACY_URL}
            bookingUrl={bookingUrl}
            bookingLabel={config.contactLabel || "Termin vereinbaren"}
            renderedAt={nowMs()}
          />
        </section>
      </div>
    </main>
  );
}
