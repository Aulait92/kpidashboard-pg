import { CheckCircle2, TriangleAlert } from "lucide-react";

// Rücksprung nach der Microsoft-Admin-Freigabe (lib/microsoft-admin-consent.ts). Öffentlich, ohne Login:
// Hier landet die IT des Kunden.
export const metadata = { title: "Microsoft-Freigabe | performancegrowth" };

export default async function MicrosoftFreigabePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ok = (sp.admin_consent ?? "").toLowerCase() === "true" && !sp.error;
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-16">
      <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-6 shadow-[var(--shadow-md)]">
        {ok ? (
          <>
            <CheckCircle2 className="mb-3 h-8 w-8 text-emerald-600" />
            <h1 className="mb-2 text-xl font-semibold">Freigabe erteilt</h1>
            <p className="text-[15px] text-[color:var(--muted)]">
              Vielen Dank. performancegrowth ist für Ihr Unternehmen freigegeben. Ihre Kolleginnen und Kollegen können Kalender und Postfach jetzt in der App verbinden.
            </p>
          </>
        ) : (
          <>
            <TriangleAlert className="mb-3 h-8 w-8 text-amber-600" />
            <h1 className="mb-2 text-xl font-semibold">Freigabe nicht erteilt</h1>
            <p className="text-[15px] text-[color:var(--muted)]">
              Die Freigabe wurde abgebrochen oder ist fehlgeschlagen. Bitte den Link noch einmal mit einem Administrator-Konto öffnen.
              {sp.error_description ? <span className="mt-2 block text-xs">Hinweis von Microsoft: {sp.error_description.slice(0, 300)}</span> : null}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
