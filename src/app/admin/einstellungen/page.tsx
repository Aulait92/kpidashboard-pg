import Link from "next/link";
import { Calculator, ChevronRight, FileUp, History, KeyRound, LogIn, MessageCircle, ShieldCheck, Wallet, Workflow } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Einstellungen | KPI-Dashboard" };

const ITEMS = [
  { href: "/admin/lead-eingang", icon: Workflow, color: "bg-blue-500", title: "Lead-Eingang", text: "Meta-Verbindung und Leadformulare zuordnen" },
  { href: "/admin/whatsapp/settings", icon: MessageCircle, color: "bg-emerald-500", title: "WhatsApp-Assistent", text: "Nummern, Vorlagen, Erstanschreiben je Kunde" },
  { href: "/admin/buyers", icon: KeyRound, color: "bg-amber-500", title: "Kunden-Logins", text: "Zugänge anlegen, Passwort, Vorschau" },
  { href: "/admin/vertrieb/import", icon: FileUp, color: "bg-violet-500", title: "Anbindungen", text: "Instantly, Calendly, Formulare, Import" },
  { href: "/admin/einstellungen/kosten", icon: Wallet, color: "bg-emerald-600", title: "Laufende Kosten", text: "Tools und eigene Werbung für Marge und Kundengewinnung" },
  { href: "/admin/einstellungen/rechner", icon: Calculator, color: "bg-sky-500", title: "Rechner", text: "Break-even-Rechner für Interessenten: Produkte, Quoten, Garantien" },
  { href: "/admin/einstellungen/login", icon: LogIn, color: "bg-indigo-500", title: "Login-Seite", text: "Infokarte neben dem Login: Neuigkeiten und Hinweise für Kunden" },
  { href: "/admin/einstellungen/sicherheit", icon: ShieldCheck, color: "bg-slate-600", title: "Sicherheit", text: "Zwei-Faktor-Login" },
  { href: "/admin/einstellungen/protokoll", icon: History, color: "bg-slate-400", title: "Änderungsprotokoll", text: "Wer hat wann was geändert" },
];

export default async function EinstellungenPage() {
  const session = await requireAuth();
  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { totpEnabledAt: true } });
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">Einstellungen</h1>
      {!me?.totpEnabledAt ? (
        <Link
          href="/admin/einstellungen/sicherheit"
          className="mb-4 flex items-center gap-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span className="flex-1">Zwei-Faktor-Login ist noch nicht eingerichtet.</span>
          <span className="font-semibold">Einrichten</span>
        </Link>
      ) : null}
      <ul className="divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
        {ITEMS.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="flex min-h-[64px] items-center gap-4 px-5 py-3 transition hover:bg-[color:var(--surface-sunken)]">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-white ${i.color}`}>
                <i.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{i.title}</span>
                <span className="block truncate text-sm text-[color:var(--muted)]">{i.text}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
