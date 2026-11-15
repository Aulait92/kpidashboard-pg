import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { LoginForm } from "./login-form";
import { ssoEnabled } from "@/lib/sso";
import { SSO_ERRORS } from "@/lib/sso-errors";
import { headers } from "next/headers";
import { activeLoginCards } from "@/lib/login-karten-server";
import { LOGIN_CARD_HEADER, cardClickHref, parseCardCounter, pickCard, safeInternalPath } from "@/lib/login-karten";
import { LoginInfoCard } from "@/components/login-info-card";

type SearchParams = Promise<{ next?: string; fehler?: string; schritt?: string; karte?: string; hinweis?: string }>;

export const metadata = {
  title: "Anmelden | performancegrowth",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const next = safeInternalPath(sp.next) ?? "";
  // Infokarte: nach Klick auf eine Karte (?karte=) dieselbe, sonst reihum (Zähler aus der Middleware)
  const cards = await activeLoginCards();
  const clicked = sp.karte ? (cards.find((c) => c.id === sp.karte) ?? null) : null;
  const card = clicked ?? pickCard(cards, parseCardCounter((await headers()).get(LOGIN_CARD_HEADER)) ?? 0);
  const showInfo = !!card;

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-white">
      <header className="px-5 pt-5 sm:px-8 sm:pt-7">
        <Link href="/" className="inline-flex items-center gap-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--brand)] text-white">
            <TrendingUp className="h-4 w-4" strokeWidth={2.75} aria-hidden="true" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">
            performance<span className="text-[color:var(--brand)]">growth</span>
          </span>
        </Link>
      </header>

      <main
        className={`mx-auto grid w-full flex-1 items-center gap-10 px-5 py-10 sm:px-8 ${
          showInfo ? "max-w-6xl lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-16" : "max-w-md"
        }`}
      >
        <div className="mx-auto w-full max-w-[400px]">
          <div className="mb-7 text-center">
            <h1 className="text-[28px] font-bold leading-tight tracking-tight sm:text-3xl">Willkommen zurück</h1>
            <p className="mt-2 text-[15px] text-[color:var(--muted)]">Schön, dass Sie da sind. Melden Sie sich mit Ihrem Zugang an.</p>
            {sp.hinweis === "email-geaendert" ? (
              <p className="mt-3 rounded-[var(--radius-md)] bg-emerald-50 px-3 py-2 text-sm text-emerald-900" data-login-hinweis>
                Ihre neue E-Mail-Adresse ist bestätigt. Bitte melden Sie sich jetzt damit an.
              </p>
            ) : sp.hinweis === "email-link-ungueltig" ? (
              <p className="mt-3 rounded-[var(--radius-md)] bg-amber-50 px-3 py-2 text-sm text-amber-900" data-login-hinweis>
                Der Bestätigungslink ist ungültig oder abgelaufen. Bitte fordern Sie nach der Anmeldung einen neuen an.
              </p>
            ) : null}
            {clicked?.linkText && next ? (
              <p className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--brand-soft)] px-3 py-2 text-sm text-[color:var(--brand-dark)]">
                Nach der Anmeldung geht es direkt weiter: <b>{clicked.linkText}</b>
              </p>
            ) : null}
          </div>
          <LoginForm
            next={next}
            startWithCode={sp.schritt === "code"}
            error={sp.fehler ? SSO_ERRORS[sp.fehler] : undefined}
            sso={{ google: ssoEnabled("google"), microsoft: ssoEnabled("microsoft") }}
          />
          <p className="mt-8 text-center text-sm text-[color:var(--muted)]">
            Noch kein Zugang? Wir richten ihn gemeinsam mit Ihnen ein:{" "}
            <a href="https://performancegrowth.de" target="_blank" rel="noopener noreferrer" className="font-medium text-[color:var(--brand)] hover:underline">
              performancegrowth.de
            </a>
          </p>
        </div>

        {card ? (
          <div className="mx-auto w-full max-w-[560px] lg:max-w-none">
            <LoginInfoCard info={card} imageSrc={card.imageSrc} linkHref={card.linkUrl ? cardClickHref(card.id) : undefined} />
          </div>
        ) : null}
      </main>

      <footer className="px-5 pb-6 pt-2 text-center text-xs text-[color:var(--muted)] sm:px-8">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <span>© performancegrowth</span>
          <a href="https://performancegrowth.de/impressum" target="_blank" rel="noopener noreferrer" className="hover:text-[color:var(--brand)] hover:underline">
            Impressum
          </a>
          <a href="https://performancegrowth.de/datenschutz" target="_blank" rel="noopener noreferrer" className="hover:text-[color:var(--brand)] hover:underline">
            Datenschutz
          </a>
          <Link href="/rechtliches/agb" className="hover:text-[color:var(--brand)] hover:underline">
            AGB
          </Link>
          <Link href="/sicherheit" className="hover:text-[color:var(--brand)] hover:underline">
            Sicherheit &amp; Datenschutz
          </Link>
          <Link href="/status" className="hover:text-[color:var(--brand)] hover:underline">
            Status
          </Link>
        </div>
      </footer>
    </div>
  );
}
