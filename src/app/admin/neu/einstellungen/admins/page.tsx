import { ShieldCheck } from "lucide-react";
import { EinstellungSeite, LISTE, Zeile } from "@/components/admin-neu/einstellungen/rahmen";
import { Badge, Card, CardHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admins & Rechte | performancegrowth Admin" };

// Admins & Rechte (Demo „e-admins“, neu): wer Zugang zum Admin hat, mit Zwei-Faktor-Stand und letzter Anmeldung.
// Nur lesend: Abgestufte Rechte und „+ Admin“ gibt es heute nicht (alle Admins dürfen alles); neue Admins legt die
// Technik an. Kommt eine Rechteverwaltung, gehört sie hierher.
const fmt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "2-digit" }).format(d);

export default async function Page() {
  const session = await requireAuth();
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true, email: true, displayName: true, totpEnabledAt: true, lastLoginAt: true },
    orderBy: { createdAt: "asc" },
  });
  return (
    <EinstellungSeite pfad="/admin/neu/einstellungen/admins">
      <Card>
        <CardHeader title="Admins" count={admins.length} hint="alle mit vollen Rechten" />
        <ul className={LISTE}>
          {admins.map((a) => (
            <Zeile
              key={a.id}
              titel={
                <>
                  {a.displayName ?? a.email}
                  {a.id === session.userId ? <span className="ml-1.5 font-normal text-[color:var(--muted)]">(Sie)</span> : null}
                </>
              }
              text={[a.displayName ? a.email : null, a.lastLoginAt ? `zuletzt angemeldet ${fmt(a.lastLoginAt)}` : "noch nie angemeldet"].filter(Boolean).join(" · ")}
              rechts={a.totpEnabledAt ? <Badge tone="success" icon={ShieldCheck}>Zwei-Faktor</Badge> : <Badge tone="warning">ohne Zwei-Faktor</Badge>}
            />
          ))}
        </ul>
      </Card>
    </EinstellungSeite>
  );
}
