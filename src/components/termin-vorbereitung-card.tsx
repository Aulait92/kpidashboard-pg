// „Heute“: Aufgabe „Termin vorbereiten: Angebot rechnen“ (Ole, 15.11.2026). Gebuchte Termine in den
// nächsten 36 Std. (Vortag, kurzfristig gebuchte sofort), bis sie als vorbereitet abgehakt sind.

import Link from "next/link";
import { Calculator, ChevronRight } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import type { TeamCtx } from "@/lib/team";
import { listVorbereitungen } from "@/lib/termin-vorbereitung-server";

const zeit = (d: Date, heute: boolean) =>
  `${heute ? "Heute" : new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "numeric", month: "numeric" }).format(d)}, ${new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(d)} Uhr`;

export async function TerminVorbereitungCard({ ctx }: { ctx: TeamCtx }) {
  const list = await listVorbereitungen(ctx).catch(() => []);
  if (!list.length) return null;
  return (
    <Card className="mb-5" data-termin-vorbereitung>
      <CardHeader title="Termine vorbereiten: Angebot rechnen" icon={Calculator} count={list.length} />
      <ul className="divide-y divide-[color:var(--border)]">
        {list.map((t) => (
          <li key={t.id}>
            <Link href={`/buyer/termine/${t.id}/vorbereitung`} className="flex min-h-[56px] items-center gap-3 px-5 py-3 hover:bg-[color:var(--surface-sunken,#f8fafc)]">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t.name}</span>
                <span className="block text-sm text-[color:var(--muted)]">
                  {t.produkt} · {zeit(t.startsAt, t.heute)} · {t.mode === "video" ? "Videocall" : "Telefonat"}
                  {t.offen ? ` · ${t.offen} ${t.offen === 1 ? "Angabe" : "Angaben"} offen` : " · Angaben vollständig"}
                </span>
              </span>
              {t.heute ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">heute</span> : null}
              <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
