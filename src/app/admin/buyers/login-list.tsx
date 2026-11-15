"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { KeyRound, Mail, MoreHorizontal, Trash2 } from "lucide-react";
import { startPreviewAction } from "@/app/buyer/preview-actions";
import { Badge, Button } from "@/components/ui";
import { ActionSheet, Sheet, type SheetAction } from "@/components/ui/sheet";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { changeBuyerEmail, deleteBuyerAccount, resetBuyerPassword, sendBuyerAccessLink } from "./actions";
import { ReassignCustomerForm } from "./buyer-management";

export type LoginRow = {
  id: string;
  email: string;
  displayName: string | null;
  owner: boolean;
  /** z. B. „14.11.“ */
  created: string;
  /** z. B. „12.11.“, null = noch nie angemeldet */
  lastLogin: string | null;
  customer: { id: string; name: string } | null;
};

type Customer = { id: string; name: string };

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

// Logins: am Desktop als Tabelle, am Handy als Karten. Je Zeile bleibt nur „Ansehen“
// sichtbar, alles andere liegt im „…“-Menü (nichts wird abgeschnitten).
export function LoginList({ rows, customers }: { rows: LoginRow[]; customers: Customer[] }) {
  return (
    <ToastProvider>
      <div className="mt-3 hidden md:block">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col />
            <col className="w-[240px]" />
            <col className="w-[132px]" />
          </colgroup>
          <thead className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">
            <tr>
              <th className="border-b border-[color:var(--border)] py-2 pr-3 text-left">Login</th>
              <th className="border-b border-[color:var(--border)] py-2 pr-3 text-left">Kunde</th>
              <th className="border-b border-[color:var(--border)] py-2 text-right">
                <span className="sr-only">Aktionen</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[color:var(--border)] align-top last:border-b-0" data-login-row>
                <td className="py-2.5 pr-3">
                  <LoginInfo r={r} />
                </td>
                <td className="py-2.5 pr-3">
                  <ReassignCustomerForm userId={r.id} current={r.customer} customers={customers} />
                </td>
                <td className="py-2.5">
                  <RowActions r={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-3 divide-y divide-[color:var(--border)] md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="space-y-2 py-3" data-login-card>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <LoginInfo r={r} />
              </div>
              <RowActions r={r} />
            </div>
            <ReassignCustomerForm userId={r.id} current={r.customer} customers={customers} className="[&_select]:max-w-none" />
          </li>
        ))}
      </ul>
    </ToastProvider>
  );
}

function LoginInfo({ r }: { r: LoginRow }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium" title={r.displayName ?? r.email}>
        {r.displayName ?? r.email}
      </div>
      <div className="break-all text-xs text-[color:var(--muted)]">
        {r.displayName ? `${r.email} · ` : ""}
        {r.owner ? "Inhaber" : "Berater"}
      </div>
      {r.lastLogin ? (
        <div className="mt-1 text-xs text-[color:var(--muted)]">
          angelegt {r.created} · zuletzt eingeloggt {r.lastLogin}
        </div>
      ) : (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[color:var(--muted)]">
          <span>angelegt {r.created}</span>
          <OpenInvite userId={r.id} />
        </div>
      )}
    </div>
  );
}

/** Noch nie angemeldet: Etikett „Einladung offen“ und Knopf „erneut senden“. */
function OpenInvite({ userId }: { userId: string }) {
  const send = useSendLink();
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" data-open-invite>
      <Badge tone="warning">Einladung offen</Badge>
      <button
        type="button"
        disabled={send.pending}
        onClick={() => send.run(userId)}
        className="font-medium text-[color:var(--brand)] hover:underline disabled:opacity-60"
      >
        {send.pending ? "sendet…" : "erneut senden"}
      </button>
    </span>
  );
}

function useSendLink() {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (userId: string) =>
    start(async () => {
      try {
        const res = await sendBuyerAccessLink(fd({ userId }));
        toast.show(res.ok ? { message: res.message ?? "Gesendet" } : { message: res.error ?? "Das hat nicht geklappt.", tone: "error" });
        if (res.ok) router.refresh();
      } catch (err) {
        toast.show({ message: err instanceof Error ? err.message : "Das hat nicht geklappt.", tone: "error" });
      }
    });
  return { pending, run };
}

function RowActions({ r }: { r: LoginRow }) {
  const toast = useToast();
  const router = useRouter();
  const send = useSendLink();
  const [open, setOpen] = useState<"menu" | "password" | "email" | "delete" | null>(null);
  const [password, setPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const title = r.displayName ?? r.email;

  const actions: SheetAction[] = [
    { label: "Passwort setzen", icon: KeyRound, onSelect: () => setTimeout(() => setOpen("password"), 0) },
    { label: "E-Mail-Adresse ändern", icon: Mail, onSelect: () => setTimeout(() => setOpen("email"), 0) },
    {
      label: r.lastLogin ? "Link zum Passwort ändern senden" : "Einladung erneut senden",
      icon: Mail,
      onSelect: () => send.run(r.id),
    },
    { label: "Login löschen", icon: Trash2, tone: "danger", onSelect: () => setTimeout(() => setOpen("delete"), 0) },
  ];

  const close = () => {
    setOpen(null);
    setPassword("");
    setNewEmail("");
    setError(null);
  };

  const savePassword = () =>
    start(async () => {
      const res = await resetBuyerPassword({}, fd({ userId: r.id, password }));
      if (res.error) {
        setError(res.error);
        return;
      }
      close();
      toast.show({ message: `Neues Passwort für ${r.email} gesetzt` });
      router.refresh();
    });

  const saveEmail = () =>
    start(async () => {
      const res = await changeBuyerEmail({}, fd({ userId: r.id, email: newEmail }));
      if (res.error) {
        setError(res.error);
        return;
      }
      close();
      toast.show({ message: `Login-E-Mail geändert: ${res.createdEmail}` });
      router.refresh();
    });

  const remove = () =>
    start(async () => {
      await deleteBuyerAccount(fd({ userId: r.id }));
      close();
      toast.show({ message: `Login ${r.email} gelöscht` });
      router.refresh();
    });

  return (
    <div className="flex shrink-0 items-center justify-end gap-1">
      {r.customer ? (
        <form action={startPreviewAction}>
          <input type="hidden" name="customerId" value={r.customer.id} />
          <button type="submit" className="h-9 rounded-md px-2 text-xs font-medium text-amber-700 hover:bg-amber-50 hover:underline">
            Ansehen
          </button>
        </form>
      ) : null}
      <span title="Weitere Aktionen" className="inline-flex">
        <Button
          variant="ghost"
          icon={MoreHorizontal}
          className="h-9 w-9 px-0"
          aria-label={`Weitere Aktionen für ${r.email}`}
          disabled={send.pending}
          onClick={() => setOpen("menu")}
          data-row-more
        />
      </span>
      <ActionSheet open={open === "menu"} onClose={close} title={title} message={r.displayName ? r.email : undefined} actions={actions} />
      <Sheet open={open === "password"} onClose={close} title="Passwort setzen" message={`${r.email} · alle Sitzungen dieses Logins enden.`}>
        <form
          className="space-y-3 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            savePassword();
          }}
        >
          <label className="block">
            <span className="text-xs font-medium text-[color:var(--muted)]">Neues Passwort (min. 8 Zeichen)</span>
            <input
              type="text"
              autoFocus
              autoComplete="off"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none"
            />
          </label>
          {error ? <p className="text-xs font-medium text-rose-700">{error}</p> : null}
          <Button type="submit" variant="primary" size="md" className="w-full" disabled={pending || password.length < 8}>
            {pending ? "Speichert…" : "Passwort speichern"}
          </Button>
        </form>
      </Sheet>
      <Sheet open={open === "email"} onClose={close} title="E-Mail-Adresse ändern" message={`${r.email} · der Login meldet sich danach mit der neuen Adresse an, Passwort bleibt.`}>
        <form
          className="space-y-3 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            saveEmail();
          }}
        >
          <label className="block">
            <span className="text-xs font-medium text-[color:var(--muted)]">Neue E-Mail-Adresse</span>
            <input
              type="email"
              autoFocus
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none"
            />
          </label>
          {error ? <p className="text-xs font-medium text-rose-700">{error}</p> : null}
          <Button type="submit" variant="primary" size="md" className="w-full" disabled={pending || !newEmail.includes("@")}>
            {pending ? "Speichert…" : "E-Mail speichern"}
          </Button>
        </form>
      </Sheet>
      <Sheet open={open === "delete"} onClose={close} title={`Login ${r.email} löschen?`} message="Der Zugang ist danach weg. Leads und Kunde bleiben erhalten.">
        <div className="p-5">
          <Button variant="danger" size="md" className="w-full" disabled={pending} onClick={remove}>
            {pending ? "Löscht…" : "Endgültig löschen"}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
