import { LoginForm } from "./login-form";

type SearchParams = Promise<{ next?: string }>;

export const metadata = {
  title: "Login | KPI-Dashboard",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") ? sp.next : "";

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-6rem)] w-full max-w-md flex-col justify-center px-4 py-12">
      <div className="rounded-2xl border border-[color:var(--border)] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_-12px_rgba(37,99,235,0.18)]">
        <div className="mb-6">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--brand-soft)] px-3 py-1 text-xs font-medium text-[color:var(--brand-dark)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--brand)]" />
            performancegrowth
          </span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight">
            Anmelden
          </h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Mit deinem Buyer- oder Admin-Account.
          </p>
        </div>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
