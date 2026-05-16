import Link from "next/link";
import { ResetPasswordForm } from "./reset-form";

type SearchParams = Promise<{ token?: string }>;

export const metadata = {
  title: "Neues Passwort | KPI-Dashboard",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const token = sp.token ?? "";

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-6rem)] w-full max-w-md flex-col justify-center px-4 py-12">
      <div className="rounded-2xl border border-[color:var(--border)] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_-12px_rgba(37,99,235,0.18)]">
        <div className="mb-6">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--brand-soft)] px-3 py-1 text-xs font-medium text-[color:var(--brand-dark)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--brand)]" />
            performancegrowth
          </span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight">
            Neues Passwort
          </h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Wähle ein neues Passwort (mind. 8 Zeichen).
          </p>
        </div>

        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Kein Reset-Token in der URL. Bitte fordere einen{" "}
            <Link
              href="/forgot-password"
              className="font-medium underline"
            >
              neuen Reset-Link
            </Link>{" "}
            an.
          </div>
        )}
      </div>
    </main>
  );
}
