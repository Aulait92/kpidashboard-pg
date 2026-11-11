import Link from "next/link";
import { connection } from "next/server";
import { requireAuth } from "@/lib/vertrieb/auth";
import { loadLoginInfo } from "@/lib/login-info-server";
import { LoginInfoForm } from "./form";

export const metadata = { title: "Login-Seite | performancegrowth Admin" };

// Infokarte neben dem Login: Hinweise und Neuigkeiten für Kunden.
export default async function LoginSeiteEinstellungenPage() {
  await connection();
  await requireAuth();
  const info = await loadLoginInfo();
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-5 px-4 py-8 sm:px-6">
      <div>
        <Link href="/admin/einstellungen" className="text-xs text-[color:var(--brand)] hover:underline">← Einstellungen</Link>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Login-Seite</h1>
          <a href="/login" target="_blank" rel="noopener" className="text-sm font-medium text-[color:var(--brand)] hover:underline">Login-Seite öffnen ↗</a>
        </div>
        <p className="text-sm text-[color:var(--muted)]">
          Die Karte rechts neben dem Login sehen alle Kunden und Berater beim Anmelden – gut für Neuigkeiten, Termine oder Hinweise.
        </p>
      </div>
      <LoginInfoForm info={info} imageUrl={info.hasImage ? `/api/login-info/image?v=${info.version}` : null} />
    </main>
  );
}
