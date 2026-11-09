import Link from "next/link";
import { startPreviewAction } from "@/app/buyer/preview-actions";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import {
  CreateBuyerForm,
  DeleteBuyerButton,
  ReassignCustomerForm,
  ResetPasswordButton,
} from "./buyer-management";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Buyer verwalten | KPI-Dashboard",
};

export default async function AdminBuyersPage() {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") {
    redirect("/login");
  }

  const [buyers, customers] = await Promise.all([
    prisma.user.findMany({
      where: { role: "BUYER" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
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

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Link
            href="/"
            className="text-xs text-[color:var(--brand)] hover:underline"
          >
            ← zum Dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Buyer-Accounts
          </h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Hier legst du Logins für Buyer an. Sie sehen nur ihre eigenen
            Leads und Statistiken.
          </p>
        </div>
      </header>

      <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
        <h2 className="text-base font-semibold">👁 Als Kunde ansehen</h2>
        <p className="mt-1 text-xs text-[color:var(--muted)]">
          Zeigt das Kunden-CRM genau so, wie der Kunde es sieht – nur lesend,
          Änderungen sind in der Vorschau deaktiviert.
        </p>
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

      <section className="mt-6 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-md)]">
        <h2 className="text-base font-semibold">Neuen Account anlegen</h2>
        <CreateBuyerForm customers={customers} />
      </section>

      <section className="mt-6 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-md)]">
        <h2 className="text-base font-semibold">Bestehende Buyer-Accounts</h2>
        {buyers.length === 0 ? (
          <p className="mt-2 text-sm text-[color:var(--muted)]">
            Noch keine Buyer-Accounts angelegt.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">
                <tr>
                  <th className="border-b border-[color:var(--border)] py-2 pr-3 text-left">
                    Email
                  </th>
                  <th className="border-b border-[color:var(--border)] py-2 pr-3 text-left">
                    Kunde
                  </th>
                  <th className="border-b border-[color:var(--border)] py-2 pr-3 text-left">
                    Angelegt
                  </th>
                  <th className="border-b border-[color:var(--border)] py-2 pr-3 text-left">
                    Letzter Login
                  </th>
                  <th className="border-b border-[color:var(--border)] py-2 text-right">
                    Aktionen
                  </th>
                </tr>
              </thead>
              <tbody>
                {buyers.map((b) => (
                  <tr
                    key={b.id}
                    className="border-b border-[color:var(--border)] last:border-b-0"
                  >
                    <td className="py-2 pr-3 font-medium">{b.email}</td>
                    <td className="py-2 pr-3">
                      <ReassignCustomerForm
                        userId={b.id}
                        currentCustomerId={b.customer?.id ?? null}
                        customers={customers}
                      />
                    </td>
                    <td className="py-2 pr-3 text-[color:var(--muted)]">
                      {formatDate(b.createdAt)}
                    </td>
                    <td className="py-2 pr-3 text-[color:var(--muted)]">
                      {b.lastLoginAt ? formatDate(b.lastLoginAt) : "noch nie"}
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-4">
                        {b.customer ? (
                          <form action={startPreviewAction}>
                            <input type="hidden" name="customerId" value={b.customer.id} />
                            <button
                              type="submit"
                              className="text-xs font-medium text-amber-700 hover:underline"
                            >
                              Ansehen
                            </button>
                          </form>
                        ) : null}
                        <ResetPasswordButton userId={b.id} email={b.email} />
                        <DeleteBuyerButton userId={b.id} email={b.email} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
