import Link from "next/link";
import { ChevronRight, UsersRound } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { ladeTeamHeute } from "@/lib/team-ueberblick-server";
import type { TeamCtx } from "@/lib/team";

// Karte „Team“ auf Heute des Inhabers (Ole, 21.11.2026): nur Teams ab 2 Personen, nur wer über der Schwelle ist
// (lib/team-ueberblick.ts TEAM_SCHWELLEN), eine Zeile je Person, höchstens 3. Ohne Befund keine Karte.
export async function TeamHeuteKarte({ ctx }: { ctx: TeamCtx }) {
  if (ctx.teamRole !== "owner") return null;
  const zeilen = await ladeTeamHeute(ctx).catch(() => []);
  if (!zeilen.length) return null;
  return (
    <Card tone="attention" className="mb-6">
      <div data-team-heute />
      <CardHeader icon={UsersRound} title="Team" count={zeilen.length} />
      <ul className="divide-y divide-[color:var(--border)]">
        {zeilen.map((z) => (
          <li key={z.userId}>
            <Link
              href={`/buyer/team?m=${encodeURIComponent(z.userId)}#m-${encodeURIComponent(z.userId)}`}
              className="flex min-h-12 items-center gap-3 px-5 py-3 text-[15px] hover:bg-[color:var(--surface-sunken)]"
            >
              <span className="min-w-0 flex-1">
                <span className="font-medium">{z.name}</span>
                <span className="text-[color:var(--muted)]">: {z.satz}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
