import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-form";

export const metadata = {
  title: "Passwort vergessen | KPI-Dashboard",
};

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-6rem)] w-full max-w-md flex-col justify-center px-4 py-12">
      <div className="rounded-2xl border border-[color:var(--border)] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_-12px_rgba(37,99,235,0.18)]">
        <div className="mb-6">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--brand-soft)] px-3 py-1 text-xs font-medium text-[color:var(--brand-dark)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--brand)]" />
            performancegrowth
          </span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight">
            Passwort vergessen
          </h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Wir schicken dir einen Reset-Link an deine Email-Adresse.
          </p>
        </div>
        <ForgotPasswordForm />
        <div className="mt-4 text-center text-xs text-[color:var(--muted)]">
          <Link href="/login" className="text-[color:var(--brand)] hover:underline">
            ← Zurück zum Login
          </Link>
        </div>
      </div>
    </main>
  );
}
