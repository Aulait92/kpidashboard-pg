// GetMyInvoices Accounts API v3 (nur lesend). Schlüssel in GETMYINVOICES_API_KEY (Railway), Konto-ID für den
// vorgeschriebenen User-Agent in GETMYINVOICES_ACCOUNT_ID (Standard: unser Konto).
// Doku: https://api.getmyinvoices.com/accounts/v3/doc/

const BASIS = "https://api.getmyinvoices.com/accounts/v3";

export function gmiKonfiguriert(): boolean {
  return !!process.env.GETMYINVOICES_API_KEY;
}

function kopf(): Record<string, string> {
  const konto = process.env.GETMYINVOICES_ACCOUNT_ID || "G-6712208";
  return {
    "X-API-KEY": process.env.GETMYINVOICES_API_KEY ?? "",
    // GetMyInvoices verlangt Produktname + Konto-ID im User-Agent
    "User-Agent": `performancegrowth Belegabgleich/1.0 ${konto}`,
    Accept: "application/json",
  };
}

export type GmiDokument = {
  documentUid: number;
  documentType: string;
  companyName: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  netAmount: number | null;
  vat: number | null;
  grossAmount: number | null;
  currency: string | null;
  filename: string | null;
  isOcrCompleted: number | boolean | null;
};

/** Alle Belege ab einem Datum (Belegdatum), seitenweise. */
export async function gmiDokumente(ab: string, signal?: AbortSignal): Promise<GmiDokument[]> {
  const alle: GmiDokument[] = [];
  for (let seite = 1; seite <= 40; seite++) {
    const q = new URLSearchParams({ startDateFilter: ab, perPage: "500", pageNumber: String(seite), archivedFilter: "1" });
    const res = await fetch(`${BASIS}/documents?${q}`, { headers: kopf(), signal, cache: "no-store" });
    if (!res.ok) throw new Error(`GetMyInvoices ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { records?: GmiDokument[]; maxPages?: number };
    alle.push(...(j.records ?? []));
    if (!j.maxPages || seite >= j.maxPages) break;
  }
  return alle;
}

/** Datei eines Belegs (PDF). GetMyInvoices liefert sie roh oder als Base64 in JSON. */
export async function gmiDatei(uid: number): Promise<{ daten: Uint8Array; typ: string } | null> {
  const res = await fetch(`${BASIS}/documents/${uid}/file`, { headers: { ...kopf(), Accept: "*/*" }, cache: "no-store" });
  if (!res.ok) return null;
  const typ = res.headers.get("content-type") ?? "";
  if (typ.includes("json")) {
    const j = (await res.json()) as unknown;
    const b64 = typeof j === "string" ? j : ((j as { fileContent?: string; content?: string })?.fileContent ?? (j as { content?: string })?.content);
    if (!b64) return null;
    return { daten: Uint8Array.from(Buffer.from(b64, "base64")), typ: "application/pdf" };
  }
  return { daten: new Uint8Array(await res.arrayBuffer()), typ: typ || "application/pdf" };
}
