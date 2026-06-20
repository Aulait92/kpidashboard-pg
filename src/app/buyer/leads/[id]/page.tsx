import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  getStornogruendePerLead,
  type LeadStornogrundOptions,
} from "@/app/buyer/actions";
import { LeadEditForm } from "@/components/lead-edit-form";
import { fetchLeadRecord } from "@/lib/airtable-write";
import { getCurrentSession } from "@/lib/auth";
import { formatDate, formatEUR } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lead-Detail | performancegrowth",
};

// Reihenfolge + Format der Read-Only-Felder — exakt wie im Airtable-
// Customer-Interface, das der Buyer kennt.
type ReadOnlyField = {
  key: string;
  label: string;
  format?: "date" | "datetime" | "eur" | "chip-product" | "chip-status";
};

const READ_ONLY_FIELDS: ReadOnlyField[] = [
  { key: "Vorname", label: "Vorname" },
  { key: "Nachname", label: "Nachname" },
  { key: "Telefonnummer", label: "Telefonnummer" },
  { key: "E-Mail", label: "E-Mail" },
  { key: "Geburtsdatum", label: "Geburtsdatum", format: "date" },
  { key: "Postleitzahl", label: "Postleitzahl" },
  { key: "Ort", label: "Ort" },
  { key: "Aktuelle Versicherung", label: "Aktuelle Versicherung" },
  { key: "Situation", label: "Situation" },
  { key: "Wie lange in PKV?", label: "Wie lange in PKV?" },
  { key: "Monatlicher Beitrag", label: "Monatlicher Beitrag", format: "eur" },
  // Produkt (Eingang) ist ein Linked-Record — der Klarname liegt im
  // Lookup-Feld "Zielgruppe Bezeichnung (from Produkt (Eingang))".
  { key: "_produktEingang", label: "Produkt (Eingang)", format: "chip-product" },
  { key: "Bearbeitungsstatus", label: "Bearbeitungsstatus", format: "chip-status" },
  { key: "ausgeliefert_am", label: "ausgeliefert_am", format: "datetime" },
];

function firstString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (Array.isArray(v)) {
    for (const x of v) {
      if (typeof x === "string" && x.trim() && !x.startsWith("rec")) {
        return x.trim();
      }
    }
  }
  return null;
}

function formatValue(
  v: unknown,
  format: ReadOnlyField["format"] | undefined,
): string | null {
  if (v == null) return null;
  if (Array.isArray(v) && v.length === 0) return null;
  const raw = firstString(v);
  if (!raw) return null;
  switch (format) {
    case "date": {
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? raw : formatDate(d);
    }
    case "datetime": {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return raw;
      const time = d.toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `${formatDate(d)}  ${time}`;
    }
    case "eur": {
      const n = Number.parseFloat(raw.replace(",", "."));
      return Number.isFinite(n) ? formatEUR(n) : raw;
    }
    default:
      return raw;
  }
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  if (!session || session.role !== "BUYER" || !session.customerId) {
    redirect("/login");
  }

  const { id } = await params;
  const lead = await prisma.lead.findFirst({
    where: { id, customerId: session.customerId },
    select: {
      id: true,
      airtableId: true,
      name: true,
      source: true,
      status: true,
      createdAt: true,
    },
  });
  if (!lead) notFound();

  let fields: Record<string, unknown> | null = null;
  let fetchError: string | null = null;
  if (lead.airtableId) {
    try {
      fields = await fetchLeadRecord({ airtableId: lead.airtableId });
    } catch (err) {
      fetchError = err instanceof Error ? err.message : String(err);
    }
  }

  // Stornogrund-Optionen für die Detail-Form bereitstellen (gleicher
  // Mechanismus wie im Storno-Modal aus der Lead-Tabelle).
  let stornoOptionsMap: LeadStornogrundOptions = new Map();
  try {
    stornoOptionsMap = await getStornogruendePerLead([lead.id]);
  } catch {
    /* still mit leer */
  }
  const stornoOptions = stornoOptionsMap.get(lead.id) ?? [];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/buyer"
        className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--brand)] hover:underline"
      >
        <ArrowLeft className="h-3 w-3" />
        Zurück zum Dashboard
      </Link>
      <header className="mt-4 mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {lead.name ?? "Lead-Detail"}
        </h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          {lead.source ?? "Produkt unbekannt"} · Eingegangen{" "}
          {formatDate(lead.createdAt)}
        </p>
      </header>

      {fetchError ? (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Airtable-Detail konnte nicht geladen werden: {fetchError}
        </div>
      ) : null}

      {fields ? (
        <>
          <ReadOnlyCard fields={fields} />
          <div className="mt-6">
            <LeadEditForm
              leadId={lead.id}
              initialKontaktversuche={
                Number.parseInt(firstString(fields["Kontaktversuche"]) ?? "0", 10) ||
                0
              }
              initialErsterKontaktversuch={isoDateOnly(
                firstString(fields["Erster Kontaktversuch"]),
              )}
              initialNotizen={firstString(fields["Notizen"]) ?? ""}
              initialStornoBemerkung={firstString(fields["Storno-Bemerkung"]) ?? ""}
              initialStornogrundId={firstRecId(fields["Stornogrund"])}
              stornoOptions={stornoOptions}
            />
          </div>
        </>
      ) : !fetchError ? (
        <div className="rounded-2xl border border-[color:var(--border)] bg-white p-6 text-sm text-[color:var(--muted)]">
          Für diesen Lead liegt keine Airtable-Referenz vor.
        </div>
      ) : null}
    </main>
  );
}

function isoDateOnly(raw: string | null): string {
  if (!raw) return "";
  // Airtable liefert Date-Felder als "YYYY-MM-DD" oder als ISO mit Zeit.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function firstRecId(v: unknown): string | null {
  if (Array.isArray(v)) {
    for (const x of v) {
      if (typeof x === "string" && x.startsWith("rec")) return x;
    }
  }
  return null;
}

function ReadOnlyCard({ fields }: { fields: Record<string, unknown> }) {
  const rows = READ_ONLY_FIELDS.map((def) => {
    if (def.key === "_produktEingang") {
      const name =
        firstString(fields["Zielgruppe Bezeichnung (from Produkt (Eingang))"]) ??
        firstString(fields["Produkt (Eingang)"]);
      return { def, value: name };
    }
    return { def, value: formatValue(fields[def.key], def.format) };
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
      <dl className="divide-y divide-[color:var(--border)]">
        {rows.map(({ def, value }) => (
          <DetailRow key={def.label} label={def.label}>
            {value == null ? (
              <span className="text-[color:var(--muted)]">–</span>
            ) : def.format === "chip-product" ? (
              <Chip tone="lilac">{value}</Chip>
            ) : def.format === "chip-status" ? (
              <Chip tone={statusTone(value)}>{value}</Chip>
            ) : (
              value
            )}
          </DetailRow>
        ))}
      </dl>
    </div>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-[200px_1fr] sm:gap-4">
      <dt className="text-sm text-[color:var(--muted)]">{label}</dt>
      <dd className="text-sm font-medium text-[color:var(--foreground)] break-words">
        {children}
      </dd>
    </div>
  );
}

function Chip({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "lilac" | "emerald" | "amber" | "rose" | "blue" | "zinc";
}) {
  const cls = {
    lilac: "bg-violet-100 text-violet-900",
    emerald: "bg-emerald-100 text-emerald-900",
    amber: "bg-amber-100 text-amber-900",
    rose: "bg-rose-100 text-rose-900",
    blue: "bg-blue-100 text-blue-900",
    zinc: "bg-zinc-100 text-zinc-700",
  }[tone];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

function statusTone(status: string): "emerald" | "amber" | "rose" | "blue" | "zinc" {
  const s = status.toLowerCase();
  if (s.startsWith("storno")) return "emerald"; // wie im Airtable-Screenshot
  if (s === "abschluss") return "emerald";
  if (s === "kein interesse") return "rose";
  if (s === "termin vereinbart" || s.startsWith("angebot")) return "blue";
  if (s === "erreicht" || s === "qualifiziert") return "amber";
  return "zinc";
}
