import { notFound } from "next/navigation";
import {
  getStornogruendePerLead,
  type LeadStornogrundOptions,
} from "@/app/buyer/actions";
import { LeadEditForm } from "@/components/lead-edit-form";
import { LeadStornoTrigger } from "@/components/lead-storno-trigger";
import { fetchLeadRecord } from "@/lib/airtable-write";
import { formatDate, formatEUR } from "@/lib/format";
import { displayProduct } from "@/lib/products";
import { prisma } from "@/lib/prisma";

// Shared Lead-Detail-Inhalt — wird sowohl von /buyer/leads/[id]
// (Vollseite) als auch vom Pipeline-Intercepting-Modal genutzt. Enthält
// Header + Read-Only-Karte + Edit-Form, aber NICHT die Außen-Hülle
// (main / dialog) und keinen Back-Link — das macht der jeweilige
// Wrapper, damit Page-Variante und Modal-Variante unterschiedliche
// Chrome haben können.

type ReadOnlyField = {
  key: string;
  label: string;
  format?: "date" | "datetime" | "eur" | "chip-product" | "chip-status";
};

// Immer relevante Kontaktfelder.
const COMMON_FIELDS: ReadOnlyField[] = [
  { key: "Vorname", label: "Vorname" },
  { key: "Nachname", label: "Nachname" },
  { key: "Telefonnummer", label: "Telefonnummer" },
  { key: "E-Mail", label: "E-Mail" },
  { key: "Postleitzahl", label: "Postleitzahl" },
  { key: "Ort", label: "Ort" },
  { key: "Bundesland", label: "Bundesland" },
];

// PKV-spezifisch (Wechsel/Tarifoptimierung/Neugeschäft).
const PKV_FIELDS: ReadOnlyField[] = [
  { key: "Geburtsdatum", label: "Geburtsdatum", format: "date" },
  { key: "Aktuelle Versicherung", label: "Aktuelle Versicherung" },
  { key: "Gesetzlich oder privat?", label: "Gesetzlich oder privat?" },
  { key: "Situation", label: "Situation" },
  { key: "Wie lange in PKV?", label: "Wie lange in PKV?" },
  { key: "Monatlicher Beitrag", label: "Monatlicher Beitrag", format: "eur" },
];

// Tierversicherung (Hund/Katze/Pferd) — die Felder sind in Airtable generisch
// „… (Tier)" benannt und für alle Tierarten dieselben.
const TIER_FIELDS: ReadOnlyField[] = [
  { key: "Tierart", label: "Tierart" },
  { key: "Rasse (Tier)", label: "Rasse" },
  { key: "Tiername", label: "Name des Tieres" },
  { key: "Geschlecht (Tier)", label: "Geschlecht" },
  { key: "Geburtsjahr (Tier)", label: "Geburtsjahr" },
  { key: "Geburtsmonat (Tier)", label: "Geburtsmonat" },
  { key: "Kastriert (Tier)", label: "Kastriert/Sterilisiert" },
  { key: "Haltung (Tier)", label: "Haltung" },
  { key: "Anzahl Tiere", label: "Anzahl Tiere" },
];

// Kinderwunsch.
const KIWU_FIELDS: ReadOnlyField[] = [
  { key: "Geburtsdatum", label: "Geburtsdatum", format: "date" },
  { key: "Alter der Frau", label: "Alter der Frau" },
  { key: "Verheiratet?", label: "Verheiratet?" },
  { key: "Offen für Behandlung?", label: "Offen für Behandlung?" },
  { key: "Wie lange versucht?", label: "Wie lange versucht?" },
  { key: "Vorbehandlung", label: "Vorbehandlung" },
];

// Immer am Ende: Produkt, Status, Auslieferung.
const TAIL_FIELDS: ReadOnlyField[] = [
  { key: "_produktEingang", label: "Produkt (Eingang)", format: "chip-product" },
  { key: "Bearbeitungsstatus", label: "Bearbeitungsstatus", format: "chip-status" },
  { key: "ausgeliefert_am", label: "ausgeliefert_am", format: "datetime" },
];

type LeadKind = "pkv" | "tier" | "kinderwunsch" | "other";

// Produkt-Kategorie des Leads bestimmen — steuert, welche Feldgruppe angezeigt
// wird. „Tierart" gesetzt ⇒ Tier; sonst über Produktname/Slug/source.
function detectLeadKind(
  source: string | null | undefined,
  fields: Record<string, unknown>,
): LeadKind {
  if (firstString(fields["Tierart"])) return "tier";
  const hay = [
    source ?? "",
    firstString(fields["slug (from Produkt (Eingang))"]) ?? "",
    firstString(fields["Zielgruppe Bezeichnung (from Produkt (Eingang))"]) ?? "",
  ]
    .join(" ")
    .toLowerCase();
  if (/tier|hund|katze|pferd/.test(hay)) return "tier";
  if (/kinderwunsch|kiwu/.test(hay)) return "kinderwunsch";
  if (/pkv|wechsel|tarifopt|neugesch|beihilfe|krankenvoll/.test(hay))
    return "pkv";
  return "other";
}

function fieldGroupFor(kind: LeadKind): ReadOnlyField[] {
  switch (kind) {
    case "tier":
      return TIER_FIELDS;
    case "kinderwunsch":
      return KIWU_FIELDS;
    case "pkv":
      return PKV_FIELDS;
    default:
      return [];
  }
}

// Interne/technische Felder, die in „Weitere Angaben" NIE auftauchen dürfen.
const INTERNAL_KEYS = new Set<string>([
  "Lead-ID",
  "Datum",
  "Produkt (Eingang)",
  "Source",
  "SMS-Verifizierung",
  "score",
  "ist_beamter",
  "schwach",
  "Preis",
  "Zuweisungsdatum",
  "Perspective-ID",
  "delivery_id",
  "ausgeliefert_am",
  "liefer_status",
  "Bearbeitungsstatus",
  "Kontaktversuche",
  "Erster Kontaktversuch",
  "Notizen",
  "Abschlusswert",
  "Im Storno-Fenster",
  "Stornogrund",
  "storniert_am",
  "Storno-Bemerkung",
  "Zählt zum Kontingent",
  "Im aktuellen Monat",
  "Abrechenbar",
  "Abgerechnet",
  "Gutschrift fällig",
  "Gutgeschrieben",
  "Telefon-Prüfung",
]);

function firstString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  // Airtable liefert Number-Felder (z. B. "Monatlicher Beitrag",
  // "Kontaktversuche") als JS-Zahl, nicht als String. Boolean ebenfalls
  // direkt — beide stringifizieren, damit die Read-Only-Anzeige nicht
  // leer bleibt.
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "Ja" : "Nein";
  if (Array.isArray(v)) {
    for (const x of v) {
      if (typeof x === "string" && x.trim() && !x.startsWith("rec")) {
        return x.trim();
      }
      if (typeof x === "number" && Number.isFinite(x)) return String(x);
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

// "YYYY-MM-DDTHH:mm" in UTC für <input type="datetime-local">. Bewusst UTC,
// damit Dashboard und Airtable-GMT-Anzeige dieselben Ziffern zeigen.
function isoDateTimeLocal(raw: string | null): string {
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate(),
  )}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export async function LeadDetailBody({
  leadId,
  customerId,
}: {
  leadId: string;
  customerId: string;
}) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, customerId },
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

  let stornoOptionsMap: LeadStornogrundOptions = new Map();
  try {
    stornoOptionsMap = await getStornogruendePerLead([lead.id]);
  } catch {
    /* still mit leer */
  }
  const stornoOptions = stornoOptionsMap.get(lead.id) ?? [];

  return (
    <>
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {lead.name ?? "Lead-Detail"}
          </h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            {lead.source ? displayProduct(lead.source) : "Produkt unbekannt"} ·
            Eingegangen {formatDate(lead.createdAt)}
          </p>
        </div>
        {lead.status && lead.status.toLowerCase().startsWith("storno") ? (
          <span className="inline-flex items-center self-start rounded-md bg-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-800">
            Storniert
          </span>
        ) : (
          <LeadStornoTrigger
            leadId={lead.id}
            leadName={lead.name}
            leadCreatedAt={lead.createdAt}
            stornoOptions={stornoOptions}
          />
        )}
      </header>

      {fetchError ? (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Airtable-Detail konnte nicht geladen werden: {fetchError}
        </div>
      ) : null}

      {fields ? (
        <>
          <ReadOnlyCard fields={fields} source={lead.source} />
          <div className="mt-6">
            <LeadEditForm
              leadId={lead.id}
              initialBearbeitungsstatus={
                firstString(fields["Bearbeitungsstatus"]) ?? ""
              }
              initialKontaktversuche={
                Number.parseInt(firstString(fields["Kontaktversuche"]) ?? "0", 10) ||
                0
              }
              initialErsterKontaktversuch={isoDateTimeLocal(
                firstString(fields["Erster Kontaktversuch"]),
              )}
              initialNotizen={firstString(fields["Notizen"]) ?? ""}
            />
          </div>
        </>
      ) : !fetchError ? (
        <div className="rounded-2xl border border-[color:var(--border)] bg-white p-6 text-sm text-[color:var(--muted)]">
          Für diesen Lead liegt keine Airtable-Referenz vor.
        </div>
      ) : null}
    </>
  );
}

function ReadOnlyCard({
  fields,
  source,
}: {
  fields: Record<string, unknown>;
  source: string | null;
}) {
  const kind = detectLeadKind(source, fields);
  let group = fieldGroupFor(kind);
  // „Haltung" fragt der Funnel nur bei der Katze ab (Freigänger/Wohnung) —
  // bei Hund/Pferd ist das Feld leer und irrelevant, also ausblenden.
  if (kind === "tier") {
    const tierart = (firstString(fields["Tierart"]) ?? "").toLowerCase();
    if (!tierart.includes("katze")) {
      group = group.filter((f) => f.key !== "Haltung (Tier)");
    }
  }
  // Bei Tieren sind PLZ/Ort/Bundesland irrelevant (der Funnel erfasst sie
  // nicht) — nur die reinen Kontaktdaten zeigen.
  let common = COMMON_FIELDS;
  if (kind === "tier") {
    const hide = new Set(["Postleitzahl", "Ort", "Bundesland"]);
    common = common.filter((f) => !hide.has(f.key));
  }
  const curated = [...common, ...group, ...TAIL_FIELDS];

  const rows = curated.map((def) => {
    if (def.key === "_produktEingang") {
      const name =
        firstString(fields["Zielgruppe Bezeichnung (from Produkt (Eingang))"]) ??
        firstString(fields["Produkt (Eingang)"]);
      return { def, value: name };
    }
    return { def, value: formatValue(fields[def.key], def.format) };
  });

  // Catch-all für fachliche Zusatzfelder, die (noch) keiner Gruppe zugeordnet
  // sind — interne/technische Felder und bereits gezeigte bleiben außen vor.
  const shownKeys = new Set<string>([
    ...curated.map((f) => f.key),
    ...COMMON_FIELDS.map((f) => f.key),
    "Produkt (Eingang)",
    "Zielgruppe Bezeichnung (from Produkt (Eingang))",
    // group-Felder, die bei diesem kind evtl. nicht in curated sind, trotzdem
    // nicht doppelt als „weitere Angabe" zeigen:
    ...TIER_FIELDS.map((f) => f.key),
    ...PKV_FIELDS.map((f) => f.key),
    ...KIWU_FIELDS.map((f) => f.key),
  ]);
  const extra = Object.entries(fields)
    .filter(
      ([k]) =>
        !shownKeys.has(k) &&
        !INTERNAL_KEYS.has(k) &&
        !k.startsWith("_") &&
        !k.includes("(from "),
    )
    .map(([k, v]) => ({ key: k, value: firstString(v) }))
    .filter((r): r is { key: string; value: string } => r.value != null);

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
      {extra.length > 0 ? (
        <>
          <div className="bg-[color:var(--brand-soft)]/30 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
            Weitere Angaben
          </div>
          <dl className="divide-y divide-[color:var(--border)]">
            {extra.map(({ key, value }) => (
              <DetailRow key={key} label={key}>
                {value}
              </DetailRow>
            ))}
          </dl>
        </>
      ) : null}
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
  if (s.startsWith("storno")) return "emerald";
  if (s === "abschluss") return "emerald";
  if (s === "kein interesse") return "rose";
  if (s === "termin vereinbart" || s.startsWith("angebot")) return "blue";
  if (s === "erreicht" || s === "qualifiziert") return "amber";
  return "zinc";
}
