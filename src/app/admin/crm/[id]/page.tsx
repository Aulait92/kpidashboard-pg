import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  DealActivityTimeline,
  type ActivityItem,
} from "@/components/deal-activity-timeline";
import { DealEditForm } from "@/components/deal-edit-form";
import { DeleteDealButton } from "@/components/delete-deal-button";
import { getCurrentSession } from "@/lib/auth";
import { formatDate, formatEUR } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Deal | KPI-Dashboard",
};

// Read-only-Felder, die wir aus dem rawFields-Snapshot des Sync ziehen.
// Werte stammen direkt aus Airtable, Schreiben passiert (vorerst) nur
// in Airtable selbst — der Sync zieht die Änderungen dann nach.
const RAW_FIELDS_HIDDEN = new Set<string>([
  "Name",
  "Deal",
  "Kontakt",
  "Lead",
  "Kunde",
  "Status",
  "Phase",
  "Stage",
  "Bearbeitungsstatus",
  "Owner",
  "Sales",
  "Inhaber",
  "Verantwortlich",
  "Zuständig",
  "Wert",
  "Deal-Wert",
  "Value",
  "Volumen",
  "MRR",
  "ARR",
  "Unternehmen",
  "Firma",
  "Company",
  "Account",
  "E-Mail",
  "Email",
  "Mail",
  "Telefon",
  "Telefonnummer",
  "Phone",
  "Tel",
  "Notizen",
  "Notes",
  "Beschreibung",
  "Description",
  "Source",
  "Quelle",
  "Kanal",
  "Close Date",
  "Abschlussdatum",
  "Erwarteter Abschluss",
  "Wunschdatum",
  "Lost Reason",
  "Verlustgrund",
  "Absagegrund",
]);

function formatRawValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "Ja" : "Nein";
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === "string" ? x : JSON.stringify(x)))
      .filter((x) => x && !x.startsWith("rec"))
      .join(", ");
  }
  return JSON.stringify(v);
}

export default async function AdminDealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") {
    redirect("/login");
  }
  const { id } = await params;
  const deal = await prisma.deal.findUnique({
    where: { id },
    include: {
      activities: {
        orderBy: { createdAt: "desc" },
        include: { createdBy: { select: { email: true } } },
      },
    },
  });
  if (!deal) notFound();

  const activities: ActivityItem[] = deal.activities.map((a) => ({
    id: a.id,
    kind: a.kind,
    title: a.title,
    body: a.body,
    scheduledFor: a.scheduledFor,
    createdAt: a.createdAt,
    createdBy: a.createdBy,
  }));

  const rawFields =
    (deal.rawFields ?? {}) as Record<string, unknown>;
  const extraRawRows = Object.entries(rawFields)
    .filter(([k]) => !RAW_FIELDS_HIDDEN.has(k))
    .map(([k, v]) => ({ key: k, value: formatRawValue(v) }))
    .filter((r) => r.value && r.value !== "—");

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/admin/crm"
        className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-[color:var(--brand)] hover:underline"
      >
        <ArrowLeft className="h-3 w-3" />
        Zurück zum CRM
      </Link>
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {deal.name ?? "Deal"}
          </h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            {[deal.company, deal.status].filter(Boolean).join(" · ") || "—"}
            {" · "}
            Erstellt {formatDate(deal.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          {deal.value != null ? (
            <span className="inline-flex items-center rounded-md bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800">
              {formatEUR(Number(deal.value))}
            </span>
          ) : null}
          <DeleteDealButton dealId={deal.id} dealName={deal.name} />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-6">
          <DealEditForm
            dealId={deal.id}
            initialStatus={deal.status ?? ""}
            initialName={deal.name ?? ""}
            initialCompany={deal.company ?? ""}
            initialValue={deal.value != null ? String(Number(deal.value)) : ""}
            initialCloseDate={
              deal.closeDate ? deal.closeDate.toISOString().slice(0, 10) : ""
            }
            initialNotes={deal.notes ?? ""}
          />
          <DealFactsCard deal={deal} extraRows={extraRawRows} />
        </div>
        <DealActivityTimeline dealId={deal.id} activities={activities} />
      </div>
    </main>
  );
}

function DealFactsCard({
  deal,
  extraRows,
}: {
  deal: {
    name: string | null;
    company: string | null;
    email: string | null;
    phone: string | null;
    source: string | null;
    status: string | null;
    closeDate: Date | null;
    wonAt: Date | null;
    lostAt: Date | null;
    lostReason: string | null;
    notes: string | null;
  };
  extraRows: { key: string; value: string }[];
}) {
  const baseRowsRaw: { label: string; value: string | null }[] = [
    { label: "Firma", value: deal.company },
    { label: "Status", value: deal.status },
    { label: "E-Mail", value: deal.email },
    { label: "Telefon", value: deal.phone },
    { label: "Quelle", value: deal.source },
    {
      label: "Abschluss-Datum",
      value: deal.closeDate ? formatDate(deal.closeDate) : null,
    },
    { label: "Serienbetrieb seit", value: deal.wonAt ? formatDate(deal.wonAt) : null },
    { label: "Verloren", value: deal.lostAt ? formatDate(deal.lostAt) : null },
    { label: "Verlustgrund", value: deal.lostReason },
  ];
  const baseRows: { label: string; value: string }[] = baseRowsRaw.flatMap(
    (r) => (r.value == null ? [] : [{ label: r.label, value: r.value }]),
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
      <header className="border-b border-[color:var(--border)] px-5 py-3">
        <h2 className="text-base font-semibold">Deal-Daten</h2>
        <p className="mt-0.5 text-xs text-[color:var(--muted)]">
          Aus der Airtable-Deal-Pipeline. Änderungen direkt in Airtable
          machen — der Sync zieht sie nach.
        </p>
      </header>
      <dl className="divide-y divide-[color:var(--border)]">
        {baseRows.map((row) => (
          <Row key={row.label} label={row.label} value={row.value} />
        ))}
        {deal.notes ? (
          <div className="px-5 py-3">
            <div className="text-xs text-[color:var(--muted)]">Notizen</div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">{deal.notes}</p>
          </div>
        ) : null}
        {extraRows.length > 0 ? (
          <>
            <div className="bg-[color:var(--brand-soft)]/30 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
              Weitere Felder aus Airtable
            </div>
            {extraRows.map((row) => (
              <Row key={row.key} label={row.key} value={row.value} />
            ))}
          </>
        ) : null}
      </dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-[color:var(--muted)]">{label}</dt>
      <dd className="min-w-0 whitespace-pre-wrap break-words text-sm font-medium text-[color:var(--foreground)]">
        {value}
      </dd>
    </div>
  );
}
