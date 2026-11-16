import { startPreviewAction } from "@/app/buyer/preview-actions";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CreateBuyerForm } from "./buyer-management";
import { LoginList, type LoginRow } from "./login-list";
import { AdminBack } from "@/components/admin/admin-back";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Buyer verwalten | performancegrowth Admin",
};

const dayMonth = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });
const dayMonthYear = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
const yearOf = (d: Date) => Number(new Intl.DateTimeFormat("de-DE", { year: "numeric", timeZone: "Europe/Berlin" }).format(d));

/** „14.11.“ im laufenden Jahr, sonst „14.11.2025“. */
function shortDate(d: Date): string {
  return yearOf(d) === yearOf(new Date()) ? dayMonth.format(d) : dayMonthYear.format(d);
}

export default async function AdminBuyersPage({ searchParams }: { searchParams?: Promise<{ kunde?: string }> }) {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") {
    redirect("/login");
  }
  // kunde = eingebettet in die Kundenakte (nur Logins dieses Kunden).
  const only = (await searchParams)?.kunde ?? null;

  const [buyers, customers] = await Promise.all([
    prisma.user.findMany({
      where: { role: "BUYER", ...(only ? { customerId: only } : {}) },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        displayName: true,
        teamRole: true,
        createdAt: true,
        lastLoginAt: true,
        customer: { select: { id: true, name: true } },
      },
    }),
    prisma.customer.findMany({
      where: { plan: { not: "internal" }, archived: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const rows: LoginRow[] = buyers.map((b) => ({
    id: b.id,
    email: b.email,
    displayName: b.displayName,
    owner: b.teamRole !== "advisor",
    created: shortDate(b.createdAt),
    lastLogin: b.lastLoginAt ? shortDate(b.lastLoginAt) : null,
    customer: b.customer,
  }));

  return (
    <main className={only ? "w-full max-w-4xl" : "mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 lg:px-8"}>
      {only ? (
        <form action={startPreviewAction} className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
          <input type="hidden" name="customerId" value={only} />
          <span className="flex-1 text-sm">So sieht der Kunde seinen Bereich (nur lesend).</span>
          <button type="submit" className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-400">
            Als Kunde ansehen
          </button>
        </form>
      ) : (
      <>
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <AdminBack href="/admin/einstellungen">Einstellungen</AdminBack>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Kunden-Logins
          </h1>
        </div>
      </header>

      <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
        <h2 className="text-base font-semibold">Als Kunde ansehen</h2>
        <p className="mt-1 text-xs text-[color:var(--muted)]">Nur lesend.</p>
        <form action={startPreviewAction} className="mt-3 flex flex-wrap gap-2">
          <select
            name="customerId"
            required
            defaultValue=""
            className="min-w-[240px] flex-1 rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm"
          >
            <option value="" disabled>
              Kunde wählen …
            </option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-400 active:scale-[0.97]"
          >
            Vorschau öffnen
          </button>
        </form>
      </section>
      </>
      )}

      <details className="group mt-6 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-md)] [&>summary::-webkit-details-marker]:hidden">
        <summary className="cursor-pointer text-base font-semibold text-[color:var(--brand)]">+ Neuen Login anlegen</summary>
        <CreateBuyerForm customers={only ? customers.filter((c) => c.id === only) : customers} />
      </details>

      <section className="mt-6 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-md)]">
        <h2 className="text-base font-semibold">Logins</h2>
        {buyers.length === 0 ? (
          <p className="mt-2 text-sm text-[color:var(--muted)]">
            Noch keine Buyer-Accounts angelegt.
          </p>
        ) : (
          <LoginList rows={rows} customers={customers} />
        )}
      </section>
    </main>
  );
}
