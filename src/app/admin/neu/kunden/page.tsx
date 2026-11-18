import Link from "next/link";
import { connection } from "next/server";
import { ChevronRight, Users } from "lucide-react";
import { Badge, ButtonLink, Card, EmptyState } from "@/components/ui";
import { Seite } from "@/components/admin-neu/ui/seite";
import { Aufmerksamkeit } from "@/components/admin-neu/ui/aufmerksamkeit";
import { punkteDerRolle } from "@/lib/admin-neu/rollen-server";
import { Chips } from "@/components/admin-neu/kunden/chips";
import { packageLabel, testKennung } from "@/lib/customer-package";
import { prisma } from "@/lib/prisma";
import { nowMs } from "@/lib/now";
import { onboardingProgressFor } from "@/lib/onboarding";
import { CUSTOMER_COLOR, CUSTOMER_LABEL } from "@/lib/vertrieb/crm";
import { ensureSource } from "@/lib/vertrieb/source";
import { nextStepRatesByCustomer, type NextStepRate } from "@/lib/lead-next-step-server";
import { NEXT_STEP_WARN_BELOW } from "@/lib/lead-next-step";
import { requireAuth } from "@/lib/vertrieb/auth";
import type { Prisma } from "@/generated/prisma/client";
import type { SalesCustomerStage as Stufe } from "@/generated/prisma/enums";

export const metadata = { title: "Kunden | performancegrowth Admin" };

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const tag = (d: Date) => d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "2-digit" });
const AUFBEWAHRUNG: Record<string, string> = { "24m": "24 Monate", "3m": "3 Monate", sofort: "sofort" };

// Status-Filter: ersetzen die frühere Kunden-Pipeline (Vertrag, Onboarding, Test, Aktiv, Pausiert, Gekündigt) und die
// Filter der alten Liste (Zahlung offen, Onboarding, Pausiert, Ruhend). Ruhende Konten sind sonst ausgeblendet.
const FILTER = [
  { key: "", label: "Alle" },
  { key: "einrichtung", label: "In Einrichtung" },
  { key: "test", label: "Test" },
  { key: "aktiv", label: "Aktiv" },
  { key: "pausiert", label: "Pausiert" },
  { key: "gekuendigt", label: "Gekündigt" },
  { key: "ruhend", label: "Ruhend" },
  { key: "zahlung", label: "Zahlung offen" },
  // Interne Konten (plan „internal“, z. B. Oles Testkunde) und Testkunden; sonst ausgeblendet (Ole, 17.11.2026)
  { key: "intern", label: "Intern/Test" },
] as const;
const INTERN_ODER_TEST: Prisma.CustomerWhereInput = { OR: [{ plan: "internal" }, { isTest: true }], dataDeletedAt: null };
type FilterKey = (typeof FILTER)[number]["key"];

type Zeile = {
  key: string;
  href: string;
  name: string;
  /** „Intern“ oder „Test“ (lib/customer-package.ts: testKennung) */
  kennung: string | null;
  stufe: Stufe | null;
  status: { label: string; tone: "success" | "warning" | "danger" | "brand" | "neutral" } | null;
  unter: string;
  hinweis: string | null;
  warnung: string | null;
  fortschritt: number | null;
  passt: (k: FilterKey) => boolean;
};

// Kunden › Liste: alle Kunden mit Status, Paket, Leads, WhatsApp und Hinweis; Klick öffnet die Kundenakte.
export default async function KundenListe({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  await connection();
  const session = await requireAuth();
  // Startseite der Rolle Betreuen (Admin v2): oben „Braucht Aufmerksamkeit“, parallel zur Kundenliste geladen
  const punkteLaden = punkteDerRolle(session.userId, "betreuen");
  const roh = (await searchParams).filter ?? "";
  const filter: FilterKey = FILTER.some((f) => f.key === roh) ? (roh as FilterKey) : "";

  // Wie die frühere Kunden-Pipeline: gewonnene Kontakte ohne Kunden-Stufe übernehmen, Kanal vorschlagen
  await prisma.salesContact.updateMany({ where: { stage: "GEWONNEN", customerStage: null }, data: { customerStage: "VERTRAG" } });
  for (const { id } of await prisma.salesContact.findMany({ where: { customerStage: { not: null }, customerSource: null }, select: { id: true } })) {
    await ensureSource(id);
  }

  const seit = new Date(nowMs() - 30 * 24 * 60 * 60 * 1000);
  const auswahl = {
    id: true,
    name: true,
    isTest: true,
    plan: true,
    retainerMonthly: true,
    paymentOverdueSince: true,
    cancelEffectiveAt: true,
    onboarding: { select: { id: true } },
    salesContact: { select: { customerStage: true, monthlyValue: true, products: true } },
    pauses: { where: { status: "active" }, select: { kind: true, endsAt: true }, take: 1 },
    agentConfig: { select: { active: true } },
    whatsAppAccount: { select: { status: true } },
    _count: { select: { leads: { where: { createdAt: { gte: seit } } }, users: { where: { role: "BUYER" } } } },
  } satisfies Prisma.CustomerSelect;
  const [kunden, interne, ruhende, ohneKonto] = await Promise.all([
    prisma.customer.findMany({
      where: { plan: { not: "internal" }, archived: false, OR: [{ dormantSince: null }, { dataDeletedAt: { not: null } }] },
      orderBy: { name: "asc" },
      select: auswahl,
    }),
    prisma.customer.findMany({ where: INTERN_ODER_TEST, orderBy: { name: "asc" }, select: auswahl }),
    prisma.customer.findMany({
      where: { plan: { not: "internal" }, dormantSince: { not: null }, dataDeletedAt: null },
      orderBy: { dormantSince: "desc" },
      select: { id: true, name: true, isTest: true, dormantSince: true, deleteAfter: true, retentionChoice: true, cancelReason: true },
    }),
    // Kontakte mit Kunden-Stufe, aber noch ohne Kundenkonto (z. B. Vertrag versendet)
    prisma.salesContact.findMany({
      where: { customerStage: { not: null }, customerId: null },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, city: true, customerStage: true, monthlyValue: true, products: true },
    }),
  ]);
  const alle = [...new Map([...kunden, ...interne].map((c) => [c.id, c])).values()];
  const [fortschritt, schritte] = await Promise.all([
    onboardingProgressFor(alle.filter((c) => c.onboarding).map((c) => c.id)),
    nextStepRatesByCustomer(alle.map((c) => c.id)).catch(() => new Map<string, NextStepRate>()),
  ]);

  // Zeile eines Kundenkontos; Intern/Test-Konten erscheinen nur im Filter „Intern/Test“
  const kundeZeile = (c: (typeof kunden)[number], nurIntern = false): Zeile => {
    const ob = fortschritt.get(c.id);
    const stufe = c.salesContact?.customerStage ?? null;
    const pause = c.pauses[0];
    const einrichtung = (!!ob && !ob.live) || stufe === "VERTRAG" || stufe === "ONBOARDING";
    const pausiert = !!pause || stufe === "PAUSIERT";
    const st = schritte.get(c.id);
    const wa = c.plan === "service" ? null : c.agentConfig?.active && c.whatsAppAccount?.status === "connected" ? "WhatsApp aktiv" : "WhatsApp aus";
    const mrr = c.salesContact?.monthlyValue ?? (c.retainerMonthly ? Number(c.retainerMonthly) : null);
    return {
      key: c.id,
      href: `/admin/neu/kunden/${c.id}`,
      name: c.name.replace(/^Allianz\s+/i, ""),
      kennung: testKennung(c),
      stufe,
      status: c.paymentOverdueSince
        ? { label: "Zahlung offen", tone: "danger" }
        : pause
          ? { label: pause.kind === "dunning" ? "Pausiert (Zahlung)" : "Pausiert", tone: "warning" }
          : ob && !ob.live
            ? { label: `Einrichtung ${ob.percent} %`, tone: "brand" }
            : null,
      unter: [c.plan === "internal" ? null : packageLabel(c), c.salesContact?.products, mrr ? `${eur(mrr)}/Monat` : null, `${c._count.leads} Leads in 30 T.`, wa, `${c._count.users} ${c._count.users === 1 ? "Login" : "Logins"}`]
        .filter(Boolean)
        .join(" · "),
      hinweis: pause?.endsAt ? `Pause bis ${tag(pause.endsAt)}` : c.cancelEffectiveAt ? `Vertrag endet ${tag(c.cancelEffectiveAt)}` : ob && !ob.live && ob.waitingYou ? `${ob.waitingYou} Schritt${ob.waitingYou === 1 ? "" : "e"} bei Ihnen` : null,
      warnung: st?.rate != null && st.open >= 5 && st.rate < NEXT_STEP_WARN_BELOW ? `Nächster Schritt ${Math.round(st.rate * 100)} %` : null,
      fortschritt: ob && !ob.live ? ob.percent : null,
      passt: (k) =>
        nurIntern
          ? k === "intern"
          : k === "" ||
            (k === "einrichtung" && einrichtung) ||
            (k === "test" && stufe === "TEST") ||
            (k === "aktiv" && stufe === "AKTIV" && !pausiert) ||
            (k === "pausiert" && pausiert) ||
            (k === "gekuendigt" && (stufe === "GEKUENDIGT" || !!c.cancelEffectiveAt)) ||
            (k === "zahlung" && !!c.paymentOverdueSince),
    };
  };
  const internZeilen = interne.map((c) => kundeZeile(c, true));

  const zeilen: Zeile[] = [
    ...kunden.map((c) => kundeZeile(c)),
    ...ohneKonto.map((k): Zeile => ({
      key: `kontakt-${k.id}`,
      href: `/admin/vertrieb/kontakte/${k.id}`,
      name: k.name,
      kennung: null,
      stufe: k.customerStage,
      status: null,
      unter: ["noch kein Kundenkonto", k.city, k.products, k.monthlyValue ? `${eur(k.monthlyValue)}/Monat` : null].filter(Boolean).join(" · "),
      hinweis: null,
      warnung: null,
      fortschritt: null,
      passt: (f) =>
        f === "" ||
        (f === "einrichtung" && (k.customerStage === "VERTRAG" || k.customerStage === "ONBOARDING")) ||
        (f === "test" && k.customerStage === "TEST") ||
        (f === "aktiv" && k.customerStage === "AKTIV") ||
        (f === "pausiert" && k.customerStage === "PAUSIERT") ||
        (f === "gekuendigt" && k.customerStage === "GEKUENDIGT"),
    })),
  ];
  const ruhendZeilen: Zeile[] = ruhende.map((r) => ({
    key: r.id,
    href: `/admin/neu/kunden/${r.id}/abrechnung`,
    name: r.name.replace(/^Allianz\s+/i, ""),
    kennung: r.isTest ? "Test" : null,
    stufe: null,
    status: { label: "Ruhend", tone: "neutral" },
    unter: [`ruht seit ${tag(r.dormantSince!)}`, r.deleteAfter ? `Löschung am ${tag(r.deleteAfter)}` : null, r.retentionChoice ? `Aufbewahrung ${AUFBEWAHRUNG[r.retentionChoice] ?? r.retentionChoice}` : null]
      .filter(Boolean)
      .join(" · "),
    hinweis: r.cancelReason ? `Grund: ${r.cancelReason}` : null,
    warnung: null,
    fortschritt: null,
    passt: (k) => k === "ruhend",
  }));

  const sichtbar = filter === "ruhend" ? ruhendZeilen : filter === "intern" ? internZeilen : zeilen.filter((z) => z.passt(filter));
  const mrrAktiv = kunden.reduce((a, c) => a + (c.salesContact?.customerStage === "AKTIV" ? (c.salesContact.monthlyValue ?? 0) : 0), 0);
  const href = (k: string) => (k ? `/admin/neu/kunden?filter=${k}` : "/admin/neu/kunden");

  return (
    <Seite titel="Betreuen" reiter="betreuen" untertitel={`${kunden.length} Kunden · ${eur(mrrAktiv)} Monatsumsatz aktiv`}>
      <Aufmerksamkeit punkte={await punkteLaden} />
      <div className="space-y-4">
        <div data-funktion="page-filters--filter-alle-zahlung-offen-onboarding-pausiert page-filters--filter-intern-test-interne-konten-und-testkunden actions-dragcustomer--kunden-pipeline-vertrag-onboarding-test-aktiv">
          <Chips
            label="Status"
            eintraege={FILTER.map((f) => ({
              label: f.label,
              href: href(f.key),
              anzahl: f.key === "ruhend" ? ruhendZeilen.length : f.key === "intern" ? internZeilen.length : zeilen.filter((z) => z.passt(f.key)).length,
              aktiv: f.key === filter,
              immer: !f.key,
            }))}
          />
        </div>

        <Card>
          <ul
            className="divide-y divide-[color:var(--border)]"
            data-funktion="page--kundenliste-mit-status-test-zahlung-offen-pause page--uebersicht-aller-kunden-mit-assistent-liste page--ruhende-konten-mit-loeschdatum-aufbewahrung"
          >
            {sichtbar.map((z) => (
              <li key={z.key}>
                <Link href={z.href} className="flex items-center gap-4 px-4 py-3 transition hover:bg-[color:var(--surface-sunken)] sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="mr-0.5 truncate font-medium">{z.name}</span>
                      {z.status ? <Badge tone={z.status.tone}>{z.status.label}</Badge> : null}
                      {!z.status && z.stufe ? <span className={`badge ${CUSTOMER_COLOR[z.stufe]}`}>{CUSTOMER_LABEL[z.stufe]}</span> : null}
                      {!z.status && !z.stufe && z.kennung !== "Intern" ? <Badge>Leads (Airtable)</Badge> : null}
                      {z.kennung ? <span className="badge bg-amber-100 text-amber-900">{z.kennung}</span> : null}
                      {z.warnung ? <Badge tone="danger">{z.warnung}</Badge> : null}
                    </div>
                    <div className="mt-0.5 text-xs text-[color:var(--muted)]">{z.unter}</div>
                    {z.hinweis ? <div className="mt-0.5 text-xs text-amber-800">{z.hinweis}</div> : null}
                  </div>
                  {z.fortschritt != null ? (
                    <div className="hidden w-32 shrink-0 sm:block" aria-label={`Einrichtung ${z.fortschritt} %`}>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-[color:var(--brand)]" style={{ width: `${z.fortschritt}%` }} />
                      </div>
                    </div>
                  ) : null}
                  <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
                </Link>
              </li>
            ))}
          </ul>
          {sichtbar.length === 0 ? (
            <EmptyState
              icon={Users}
              title={zeilen.length ? "Kein Kunde in diesem Filter" : "Noch keine Kunden"}
              text={zeilen.length ? undefined : "Kunden entstehen aus angenommenen Angeboten im Vertrieb."}
              action={
                <ButtonLink href={zeilen.length ? "/admin/neu/kunden" : "/admin/neu/vertrieb"} variant="primary" size="md">
                  {zeilen.length ? "Alle Kunden zeigen" : "Zum Vertrieb"}
                </ButtonLink>
              }
            />
          ) : null}
        </Card>
      </div>
    </Seite>
  );
}
