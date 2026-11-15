import { confirmEmailAction } from "./actions";

// Bestätigung einer neuen Login-E-Mail (lib/email-aendern.ts). Der Link aus der Mail öffnet nur diese Seite;
// erst der Knopf übernimmt die Adresse (Link-Prüfer in Postfächern verbrauchen den Token so nicht).
export const dynamic = "force-dynamic";
export const metadata = { title: "Neue E-Mail-Adresse bestätigen | performancegrowth", robots: { index: false, follow: false } };

export default async function EmailBestaetigenPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-6 text-[15px]">
        <h1 className="text-xl font-bold">Neue E-Mail-Adresse bestätigen</h1>
        <p className="mt-2 text-[color:var(--muted)]">
          Mit dem Knopf stellen Sie Ihre Anmeldung bei performancegrowth auf die neue Adresse um. Danach melden Sie sich damit und mit Ihrem bisherigen Passwort an.
        </p>
        <form action={confirmEmailAction} className="mt-5">
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            className="inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 font-semibold text-white hover:bg-[color:var(--brand-dark)]"
          >
            Neue Adresse bestätigen
          </button>
        </form>
      </div>
    </main>
  );
}
