import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminTabs } from "@/components/admin-tabs";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import {
  CreateBuyerForm,
  DeleteBuyerButton,
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
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            Buyer-Accounts
          </h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Hier legst du Logins für Buyer an. Sie sehen nur ihre eigenen
            Leads und Statistiken.
          </p>
        </div>
      </header>

      <AdminTabs />

      <section className="mt-6 rounded-2xl border border-[color:var(--border)] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
        <h2 className="text-base font-semibold">Neuen Account anlegen</h2>
        <CreateBuyerForm customers={customers} />
      </section>

      <section className="mt-6 rounded-2xl border border-[color:var(--border)] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
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
                      {b.customer?.name ?? (
                        <span className="text-[color:var(--muted)]">
                          – nicht zugeordnet –
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-[color:var(--muted)]">
                      {formatDate(b.createdAt)}
                    </td>
                    <td className="py-2 pr-3 text-[color:var(--muted)]">
                      {b.lastLoginAt ? formatDate(b.lastLoginAt) : "noch nie"}
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-4">
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
