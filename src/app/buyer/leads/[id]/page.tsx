import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { fetchLeadRecord } from "@/lib/airtable-write";
import { getCurrentSession } from "@/lib/auth";
import { formatDate, formatEUR } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lead-Detail | performancegrowth",
};

// Reihenfolge der Felder im Detail-View — orientiert sich am Airtable-
// Customer-Interface. Spalten, die nicht im Record vorkommen, werden
// übersprungen; unbekannte Spalten landen am Ende im "Weitere"-Block.
type FieldDef = {
  key: string;
  label: string;
  format?: "date" | "datetime" | "eur" | "phone" | "email" | "checkbox";
};

const FIELDS: FieldDef[] = [
  { key: "Vorname", label: "Vorname" },
  { key: "Nachname", label: "Nachname" },
  { key: "Telefonnummer", label: "Telefonnummer", format: "phone" },
  { key: "E-Mail", label: "E-Mail", format: "email" },
  { key: "Geburtsdatum", label: "Geburtsdatum", format: "date" },
  { key: "Postleitzahl", label: "Postleitzahl" },
  { key: "Ort", label: "Ort" },
  { key: "Aktuelle Versicherung", label: "Aktuelle Versicherung" },
  { key: "Situation", label: "Situation" },
  { key: "Wie lange in PKV?", label: "Wie lange in PKV?" },
  { key: "Monatlicher Beitrag", label: "Monatlicher Beitrag", format: "eur" },
  { key: "Gesetzlich oder privat?", label: "Gesetzlich oder privat?" },
  { key: "Bearbeitungsstatus", label: "Bearbeitungsstatus" },
  { key: "Datum", label: "Eingegangen am", format: "date" },
  { key: "ausgeliefert_am", label: "Ausgeliefert am", format: "datetime" },
  { key: "Source", label: "Werbekanal" },
  { key: "Preis", label: "Lead-Kosten", format: "eur" },
  { key: "Kontaktversuche", label: "Kontaktversuche" },
  { key: "Erster Kontaktversuch", label: "Erster Kontaktversuch", format: "datetime" },
  { key: "Notizen", label: "Notizen" },
  { key: "Storno-Bemerkung", label: "Storno-Bemerkung" },
  { key: "Stornogrund", label: "Stornogrund" },
];

function formatValue(
  v: unknown,
  format: FieldDef["format"] | undefined,
): string | null {
  if (v == null) return null;
  // Lookup/Linked-Record-Arrays: erstes Element nehmen oder kommagetrennt.
  if (Array.isArray(v)) {
    if (v.length === 0) return null;
    return v
      .map((x) => (typeof x === "string" ? x : JSON.stringify(x)))
      .filter((x) => x && !x.startsWith("rec"))
      .join(", ") || null;
  }
  const raw = typeof v === "string" ? v : String(v);
  if (raw === "") return null;
  switch (format) {
    case "date": {
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? raw : formatDate(d);
    }
    case "datetime": {
      const d = new Date(raw);
      return Number.isNaN(d.getTime())
        ? raw
        : `${formatDate(d)} ${d
            .toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
            .replace(":", ":")}`;
    }
    case "eur": {
      const n = Number.parseFloat(raw);
      return Number.isFinite(n) ? formatEUR(n) : raw;
    }
    case "checkbox":
      return v === true || raw === "1" || raw === "true" ? "Ja" : "Nein";
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
          {lead.source ?? "Produkt unbekannt"} · Eingegangen {formatDate(lead.createdAt)}
        </p>
      </header>

      {fetchError ? (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Airtable-Detail konnte nicht geladen werden: {fetchError}
        </div>
      ) : null}

      {fields ? (
        <FieldsCard fields={fields} />
      ) : !fetchError ? (
        <div className="rounded-2xl border border-[color:var(--border)] bg-white p-6 text-sm text-[color:var(--muted)]">
          Für diesen Lead liegt keine Airtable-Referenz vor.
        </div>
      ) : null}
    </main>
  );
}

function FieldsCard({ fields }: { fields: Record<string, unknown> }) {
  const known = FIELDS.map((def) => ({
    def,
    value: formatValue(fields[def.key], def.format),
  })).filter((r) => r.value != null);

  const knownKeys = new Set(FIELDS.map((f) => f.key));
  // „Weitere" — alles, was wir noch nicht explizit eingeordnet haben, plus
  // ein paar Hilfsspalten ausblenden, die für den Buyer-Blick irrelevant sind.
  const IGNORE = new Set([
    "delivery_id",
    "Lead-ID",
    "score",
    "test_dauer_tage",
    "test_menge",
    "Im aktuellen Monat",
    "Zählt zum Kontingent",
    "Im Storno-Fenster",
    "Storno-Fenster (Tage) (from Kunden-Produkt-Bezug)",
    "Effektiver Preis (from Kunden-Produkt-Bezug)",
    "Abrechnungsmodus (from Kunden-Produkt-Bezug)",
    "Abrechenbar",
    "Gutschrift fällig",
    "Zuweisungsdatum",
    "ist_beamter",
    "Einwilligungstext (from Produkt (Eingang))",
    "slug (from Produkt (Eingang))",
    "Zielgruppe Bezeichnung (from Produkt (Eingang))",
    "Bezug (from Kunden-Produkt-Bezug)",
    "Kunde (from Kunden-Produkt-Bezug)",
    "Produkt (from Kunden-Produkt-Bezug)",
    "Produkt (Eingang)",
    "Kunden-Produkt-Bezug",
    "SMS-Verifizierung",
  ]);
  const extras: { key: string; value: string }[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (knownKeys.has(k) || IGNORE.has(k)) continue;
    const formatted = formatValue(v, undefined);
    if (formatted) extras.push({ key: k, value: formatted });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
      <dl className="divide-y divide-[color:var(--border)]">
        {known.map(({ def, value }) => (
          <Row key={def.key} label={def.label} value={value!} />
        ))}
        {extras.length > 0 ? (
          <>
            <div className="bg-[color:var(--brand-soft)]/30 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
              Weitere Felder
            </div>
            {extras.map((row) => (
              <Row key={row.key} label={row.key} value={row.value} />
            ))}
          </>
        ) : null}
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-[200px_1fr] sm:gap-4">
      <dt className="text-sm text-[color:var(--muted)]">{label}</dt>
      <dd className="text-sm font-medium text-[color:var(--foreground)] break-words">
        {value}
      </dd>
    </div>
  );
}
