import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { LoginForm } from "./login-form";
import { ssoEnabled } from "@/lib/sso";
import { SSO_ERRORS } from "@/lib/sso-errors";
import { loadLoginInfo } from "@/lib/login-info-server";
import { LoginInfoCard } from "@/components/login-info-card";

type SearchParams = Promise<{ next?: string; fehler?: string; schritt?: string }>;

export const metadata = {
  title: "Anmelden | performancegrowth",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") ? sp.next : "";
  const info = await loadLoginInfo();
  const showInfo = info.enabled;
  const imageSrc = info.hasImage ? `/api/login-info/image?v=${info.version}` : null;

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
            <p className="mt-2 text-[15px] text-[color:var(--muted)]">Schön, dass du da bist. Melde dich mit deinem Zugang an.</p>
          </div>
          <LoginForm
            next={next}
            startWithCode={sp.schritt === "code"}
            error={sp.fehler ? SSO_ERRORS[sp.fehler] : undefined}
            sso={{ google: ssoEnabled("google"), microsoft: ssoEnabled("microsoft") }}
          />
          <p className="mt-8 text-center text-sm text-[color:var(--muted)]">
            Noch kein Zugang? Wir richten ihn mit dir zusammen ein –{" "}
            <a href="https://performancegrowth.de" target="_blank" rel="noopener noreferrer" className="font-medium text-[color:var(--brand)] hover:underline">
              performancegrowth.de
            </a>
          </p>
        </div>

        {showInfo ? (
          <div className="mx-auto w-full max-w-[560px] lg:max-w-none">
            <LoginInfoCard info={info} imageSrc={imageSrc} />
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
        </div>
      </footer>
    </div>
  );
}
