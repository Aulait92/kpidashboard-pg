import Link from "next/link";
import { buttonClass } from "@/components/ui";

// Deutsche 404-Seite statt „This page could not be found.“ (16.11.2026). Sehen Vermittler und Leads (z. B. alter Link).
export const metadata = { title: "Seite nicht gefunden", robots: { index: false, follow: false } };

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-16 text-center" data-not-found>
      <p className="text-sm font-semibold text-[color:var(--brand)]">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Seite nicht gefunden</h1>
      <p className="mt-2 text-[15px] text-[color:var(--muted)]">Der Link ist abgelaufen oder unvollständig.</p>
      <Link href="/" className={buttonClass("primary", "md", "mt-6")}>
        Zur Startseite
      </Link>
    </main>
  );
}
