// Diagnose q=ppl-kunde&kunde=<Kunden-ID> (Ole, 22.11.2026: Abgleich „wie viele Leads stehen noch zu“, z. B. Daniel Seidel).
// Alle Leads des Kunden (auch aus Airtable importierte ohne Bezug/Lieferdatum), mit Umsatzzeilen (cancelled = in Airtable storniert).
// Nur lesend: Pay-per-Lead-Bezüge des Kunden, Bestellungen (Zeitraum, Menge, Status) und alle gelieferten Leads mit
// Lieferzeit, Name, PLZ/Ort und Storno (Status, Grund, Bemerkung, Zeitpunkte, Gutschrift). Keine Telefonnummern/E-Mails.
import { prisma } from "@/lib/prisma";

type Feld = { label?: string; value?: unknown };

function formFeld(formData: unknown, re: RegExp): string | null {
  if (!Array.isArray(formData)) return null;
  const f = (formData as Feld[]).find((x) => x && typeof x.label === "string" && re.test(x.label));
  return f && f.value != null ? String(f.value) : null;
}

// Airtable-Felder je Lead (nur bei &airtable=1): Storno, Status, Lead-Nr., Prüfangaben. Keine Kontaktdaten.
const AT_FELD = /storno|lead-id|status|sms|beitrag|privat|situation|erstellt|created|reklam|bemerkung|versicherung|bezug|geliefert|zugestellt/i;
const AT_TABU = /telefon|e-mail|email|geburt|stra(ss|ß)e|iban/i;

async function airtableFelder(ids: string[]) {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!token || !baseId) return { fehler: "Airtable nicht angebunden" } as const;
  const { fetchAllStornogruende } = await import("@/lib/airtable-write");
  const gruende = await fetchAllStornogruende();
  const out: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent("Leads")}`);
    url.searchParams.set("filterByFormula", `OR(${chunk.map((id) => `RECORD_ID()='${id.replace(/[^A-Za-z0-9]/g, "")}'`).join(",")})`);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) return { fehler: `Airtable ${res.status}` } as const;
    const recs = ((await res.json()) as { records?: { id: string; createdTime?: string; fields: Record<string, unknown> }[] }).records ?? [];
    for (const r of recs) {
      const f: Record<string, unknown> = { _createdTime: r.createdTime };
      for (const [k, v] of Object.entries(r.fields)) {
        if (!AT_FELD.test(k) || AT_TABU.test(k)) continue;
        f[k] = Array.isArray(v) ? v.map((x) => (typeof x === "string" && gruende.has(x) ? gruende.get(x)!.grund : x)) : v;
      }
      out[r.id] = f;
    }
  }
  return out;
}

export async function pplKunde(p: URLSearchParams) {
  const id = (p.get("kunde") ?? "").trim();
  if (!id) return { fehler: "kunde=<Kunden-ID> fehlt" };
  const c = await prisma.customer.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!c) return { fehler: "Kunde nicht gefunden" };
  const subs = await prisma.leadSubscription.findMany({
    where: { customerId: id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, productKey: true, label: true, active: true, status: true, period: true, goal: true, startDate: true, price: true,
      stornoDays: true, stornoReasons: true, stornoAutoApprove: true, createdAt: true, updatedAt: true,
      orders: { orderBy: { periodStart: "asc" }, select: { id: true, periodStart: true, periodEnd: true, quantity: true, amount: true, status: true, autoRenew: true, createdAt: true } },
    },
  });
  const leads = await prisma.lead.findMany({
    where: { customerId: id },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true, airtableId: true, source: true, name: true, subscriptionId: true, orderId: true, deliveredAt: true, createdAt: true, isTest: true,
      status: true, stornoState: true, stornoReason: true, stornoNote: true, stornoRequestedAt: true, stornoDecidedAt: true, creditAmount: true,
      creditedAt: true, disqualifyReason: true, lostReason: true, lostNote: true, lostAt: true, erasedAt: true, formData: true,
      revenues: { select: { amount: true, occurredAt: true, cancelled: true } },
    },
  });
  const at = p.get("airtable") === "1" ? await airtableFelder(leads.map((l) => l.airtableId).filter((x): x is string => !!x)) : null;
  return {
    kunde: c,
    airtable: at,
    bezuege: subs,
    leads: leads.map(({ formData, ...l }) => ({
      ...l,
      plz: formFeld(formData, /^(plz|postleitzahl)/i),
      ort: formFeld(formData, /^(ort|wohnort|stadt)/i),
      leadNr: formFeld(formData, /lead-?(id|nr)/i),
    })),
  };
}
