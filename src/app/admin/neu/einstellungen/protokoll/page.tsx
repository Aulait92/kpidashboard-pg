import Link from "next/link";
import { EinstellungSeite, LISTE } from "@/components/admin-neu/einstellungen/rahmen";
import { Button, Card } from "@/components/ui";
import { AUDIT_LABEL } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Änderungsprotokoll | performancegrowth Admin" };

// Änderungsprotokoll (Demo „e-protokoll“, heute /admin/einstellungen/protokoll): dieselbe Abfrage mit Filter nach
// Kunde und Art, 100 je Seite. Statt Tabelle eine Liste (am Handy lesbar ohne waagrechtes Scrollen).

const PAGE = 50;
const BASIS = "/admin/neu/einstellungen/protokoll";
const SELECT = "h-10 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2.5 text-sm sm:flex-none";
const fmt = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
const ROLE: Record<string, string> = { ADMIN: "Admin", BUYER: "Kunde", kunde: "Kunde (Angebot)", system: "System", lead: "Lead" };

function detailText(d: unknown): string {
  if (!d || typeof d !== "object") return "";
  return Object.entries(d as Record<string, unknown>)
    // Interne Kennungen (leadId, existingContractId, nachweisId …) helfen beim Lesen nicht
    .filter(([k, v]) => v != null && v !== "" && k !== "filter" && !/id$/i.test(k))
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export default async function Page({ searchParams }: { searchParams: Promise<{ kunde?: string; art?: string; seite?: string }> }) {
  await requireAuth();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.seite) || 1);
  // UX-Umbau 20.11.2026: Standard ohne erfolgreiche Anmeldungen (die machen den Großteil aus und verdecken Änderungen);
  // „Alles, auch Anmeldungen“ (art=alle) zeigt sie wieder, fehlgeschlagene Anmeldungen bleiben immer sichtbar.
  const artFilter = sp.art === "alle" ? {} : sp.art ? { action: sp.art } : { action: { notIn: ["login", "login.2fa"] } };
  const where = { ...(sp.kunde ? { customerId: sp.kunde } : {}), ...artFilter };
  const [rows, total, customers] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { at: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    prisma.auditLog.count({ where }),
    prisma.customer.findMany({ where: { plan: { not: "internal" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const names = new Map(customers.map((c) => [c.id, c.name.replace(/^Allianz\s+/i, "")]));
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "seite") as [string, string][]).toString();
  const seite = (n: number) => `${BASIS}?${qs}${qs ? "&" : ""}seite=${n}`;

  return (
    <EinstellungSeite pfad={BASIS} breit>
      <form className="flex flex-wrap gap-2" data-funktion="page--protokoll-filtern-nach-kunde-und-art">
        <select name="kunde" defaultValue={sp.kunde ?? ""} className={SELECT} aria-label="Kunde">
          <option value="">Alle Kunden</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {names.get(c.id)}
            </option>
          ))}
        </select>
        <select name="art" defaultValue={sp.art ?? ""} className={SELECT} aria-label="Art">
          <option value="">Alle Änderungen</option>
          <option value="alle">Alles, auch Anmeldungen</option>
          {Object.entries(AUDIT_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <Button size="md">Filtern</Button>
      </form>
      <Card>
        <ul className={LISTE} data-funktion="page--aenderungsprotokoll-ansehen">
          {rows.map((r) => (
            <li key={r.id} className="px-5 py-3 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="font-medium">{AUDIT_LABEL[r.action] ?? r.action.replace(".", ": ").replace(/_/g, " ")}</span>
                {r.customerId && names.get(r.customerId) ? <span>{names.get(r.customerId)}</span> : null}
                <span className="ml-auto whitespace-nowrap text-xs text-[color:var(--muted)]">{fmt(r.at)}</span>
              </div>
              <div className="text-[color:var(--muted)]">
                {[r.actorEmail, r.actorRole ? (ROLE[r.actorRole] ?? r.actorRole) : null].filter(Boolean).join(" · ") || "Unbekannt"}
              </div>
              {detailText(r.details) ? <div className="mt-0.5 break-words text-xs text-[color:var(--muted)]">{detailText(r.details)}</div> : null}
            </li>
          ))}
          {rows.length === 0 ? <li className="px-5 py-8 text-center text-sm text-[color:var(--muted)]">Keine Einträge{qs ? " für diesen Filter" : ""}.</li> : null}
        </ul>
      </Card>
      {total > PAGE ? (
        <div className="flex items-center justify-center gap-4 text-sm">
          {page > 1 ? <Link href={seite(page - 1)} className="text-[color:var(--brand)] hover:underline">zurück</Link> : null}
          <span className="text-[color:var(--muted)]">
            Seite {page} von {Math.ceil(total / PAGE)}
          </span>
          {page * PAGE < total ? <Link href={seite(page + 1)} className="text-[color:var(--brand)] hover:underline">weiter</Link> : null}
        </div>
      ) : null}
    </EinstellungSeite>
  );
}
