// Admin → Pay-per-Lead → „HvK-Abrechnungen“: eine Zeile je Woche (Gutschrift von Lead-Production) und die
// Reklamationen ohne eindeutigen Lead unter „Storno prüfen“. Logik: lib/ppl/hvk-abrechnung*.ts.

import { AlertTriangle, FileText } from "lucide-react";
import { Badge, Card, CardHeader } from "@/components/ui";
import { hvkMailAvailable, hvkMailbox, hvkMailboxStatus } from "@/lib/ppl/hvk-mail";
import { listHvkInvoices, openHvkReklamationen, type HvkInvoiceRow } from "@/lib/ppl/hvk-abrechnung-server";
import { HvkAssign, HvkBackfill, HvkFetchNow, HvkUpload } from "./hvk-client";
import { hvkDiscardAction } from "./hvk-actions";

const eur = (c: number) => (c / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const dm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
const dmy = (iso: string) => iso.split("-").reverse().join(".");
const dt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);

const POSTFACH: Record<string, { tone: "success" | "warning"; text: string }> = {
  verbunden: { tone: "success", text: "Postfach verbunden. Neue Abrechnungen kommen ab jetzt automatisch (Mo bis Mi stündlich)." },
  "falsches-postfach": { tone: "warning", text: `Falsches Postfach. Bitte mit ${hvkMailbox()} anmelden.` },
  recht: { tone: "warning", text: "Das Lesen von E-Mails wurde nicht erlaubt. Bitte erneut verbinden und zustimmen." },
  freigabe: { tone: "warning", text: "Microsoft verlangt eine Admin-Freigabe für das Lesen von E-Mails." },
  abgelehnt: { tone: "warning", text: "Anmeldung abgebrochen." },
  fehler: { tone: "warning", text: "Verbinden hat nicht geklappt. Bitte erneut versuchen." },
};

// Gleiche Spalten für Kopf und Zeilen (Handy: zwei Zeilen mit Beschriftung)
const GRID = "grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_repeat(4,minmax(0,0.8fr))_minmax(0,1fr)] sm:items-center";
const Label = ({ children }: { children: React.ReactNode }) => <span className="text-[color:var(--muted)] sm:hidden">{children} </span>;

/**
 * versand: Zeile „Versand an Pivacom“ (ppl-versand.tsx), direkt unter dem Kopf, neben „Postfach verbinden“.
 * abgleich: „Neu abgleichen“ (HvkReabgleich) unter der Liste, nur wenn es Abrechnungen gibt.
 */
export async function HvkAbrechnungen({ postfach, versand, abgleich }: { postfach?: string; versand?: React.ReactNode; abgleich?: React.ReactNode }) {
  const [rows, box] = await Promise.all([listHvkInvoices(), hvkMailboxStatus()]);
  const connected = !!box;
  const notice = postfach ? POSTFACH[postfach] : null;
  const connect = (
    <a href="/api/admin/hvk-abrechnung/verbinden" className="inline-flex h-9 items-center rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-3 text-sm font-semibold text-white">
      {connected ? "Neu verbinden" : "Postfach verbinden"}
    </a>
  );
  return (
    <Card>
      <CardHeader title="HvK-Abrechnungen" count={rows.length} actions={connected && box.status === "ok" ? <HvkFetchNow /> : hvkMailAvailable() ? connect : undefined} />
      {versand}
      {notice ? <p className={`border-b border-[color:var(--border)] px-5 py-2 text-sm ${notice.tone === "success" ? "text-emerald-700" : "text-amber-800"}`}>{notice.text}</p> : null}
      {box?.status === "error" ? (
        <p className="flex items-center gap-2 border-b border-[color:var(--border)] px-5 py-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" /> Postfach meldet einen Fehler: {box.lastError ?? "unbekannt"}
        </p>
      ) : null}

      {!rows.length ? (
        <div className="space-y-3 px-5 py-6 text-sm">
          <p className="text-[color:var(--muted)]">
            {connected ? "Noch keine Abrechnung übernommen. Unten unter „Rückwirkend ab Juli“ die Vorschau starten." : `Noch keine Abrechnung. Postfach ${hvkMailbox()} verbinden, dann kommen die Gutschriften automatisch.`}
          </p>
          {!connected && hvkMailAvailable() ? connect : null}
        </div>
      ) : (
        <div className="text-sm">
          <div className={`${GRID} hidden border-b border-[color:var(--border)] px-5 py-2 text-xs text-[color:var(--muted)] sm:grid`}>
            <span>Rechnung</span>
            <span>Zeitraum</span>
            <span className="text-right">Geliefert</span>
            <span className="text-right">Abgerechnet</span>
            <span className="text-right">Stornos</span>
            <span className="text-right">Differenz</span>
            <span className="text-right">Netto</span>
          </div>
          <ul className="divide-y divide-[color:var(--border)]">
            {rows.map((r) => (
              <InvoiceRow key={r.id} r={r} />
            ))}
          </ul>
          {abgleich ? <div className="border-t border-[color:var(--border)] px-5 py-3">{abgleich}</div> : null}
        </div>
      )}

      <details className="border-t border-[color:var(--border)] px-5 py-3 text-sm">
        <summary className="cursor-pointer font-medium text-[color:var(--muted)]">Mehr: rückwirkend ab Juli, PDF hochladen, Postfach</summary>
        <div className="mt-3 space-y-4">
          <section className="space-y-1.5">
            <h3 className="font-medium">Rückwirkend ab Juli 2026</h3>
            <p className="text-xs text-[color:var(--muted)]">Vorschau ändert nichts. Danach „Übernehmen“: Abrechnungen speichern, eindeutige Reklamationen als Storno eintragen.</p>
            <HvkBackfill connected={connected} />
          </section>
          <section className="space-y-1.5">
            <h3 className="font-medium">PDF von Hand</h3>
            <HvkUpload />
          </section>
          <section className="space-y-1 text-xs text-[color:var(--muted)]">
            <h3 className="text-sm font-medium text-[color:var(--foreground)]">Postfach</h3>
            <p>
              {box ? `${box.email}, nur lesen${box.lastCheckAt ? `, zuletzt geprüft ${dt(box.lastCheckAt)}` : ""}.` : `Nicht verbunden (${hvkMailbox()}, nur lesen).`}
            </p>
            {!hvkMailAvailable() ? (
              <p className="text-amber-800">Microsoft-Anmeldung ist nicht eingerichtet (MICROSOFT_CLIENT_ID).</p>
            ) : connected ? (
              <a href="/api/admin/hvk-abrechnung/verbinden" className="font-medium text-[color:var(--brand)] hover:underline">
                Neu verbinden
              </a>
            ) : null}
          </section>
        </div>
      </details>
    </Card>
  );
}

function InvoiceRow({ r }: { r: HvkInvoiceRow }) {
  const diff = r.delivered - r.billed;
  const hasDetails = r.unbilled.length || r.foreign.length || r.warnings.length;
  return (
    <li>
      <details className="group">
        <summary className={`${GRID} cursor-pointer list-none px-5 py-2.5 hover:bg-[color:var(--background)] [&::-webkit-details-marker]:hidden`}>
          <span className="font-medium">
            {r.invoiceNo}
            {r.warnings.length ? <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-amber-500" /> : null}
          </span>
          <span className="text-right text-[color:var(--muted)] sm:text-left">
            {dm(r.periodStart)} – {dmy(r.periodEnd)}
          </span>
          <span className="tabular-nums sm:text-right">
            <Label>geliefert</Label>
            {r.delivered}
          </span>
          <span className="text-right tabular-nums">
            <Label>abgerechnet</Label>
            {r.billed}
          </span>
          <span className="tabular-nums sm:text-right">
            <Label>Stornos</Label>
            {r.stornoAuto}
            {r.stornoOpen ? <span className="text-amber-700"> + {r.stornoOpen} prüfen</span> : null}
          </span>
          <span className="text-right tabular-nums" title={hasDetails ? `${r.unbilled.length} nicht abgerechnet, ${r.foreign.length} nicht von uns geliefert` : undefined}>
            <Label>Differenz</Label>
            {diff || hasDetails ? <Badge tone="warning">{diff > 0 ? `+${diff}` : diff}</Badge> : <span className="text-[color:var(--muted)]">0</span>}
          </span>
          <span className="col-span-2 flex items-center justify-between gap-2 tabular-nums sm:col-span-1 sm:justify-end">
            <span>
              <Label>Auszahlung netto</Label>
              <span className="font-medium">{eur(-r.netCents)}</span>
            </span>
            <a href={`/api/admin/hvk-abrechnung/${r.id}/pdf`} target="_blank" rel="noreferrer" title="PDF ansehen" className="text-[color:var(--muted)] hover:text-[color:var(--brand)]">
              <FileText className="h-4 w-4" />
            </a>
          </span>
        </summary>
        <div className="space-y-3 bg-[color:var(--background)] px-5 py-3 text-xs">
          <DiffList
            title="Geliefert, aber nicht abgerechnet"
            items={r.unbilled.map((u) => `${u.name ?? "Lead"} · ${[u.plz, u.ort].filter(Boolean).join(" ") || "PLZ fehlt"} · geliefert ${dmy(u.date)} · ID ${u.id}`)}
          />
          <DiffList title="Abgerechnet, aber nicht von uns geliefert" items={r.foreign.map((f) => `HvK Lead ID ${f.hvkLeadId} · ${f.plz} ${f.ort} · ${f.product}`)} />
          {r.warnings.map((w) => (
            <p key={w} className="text-amber-800">
              {w}
            </p>
          ))}
        </div>
      </details>
    </li>
  );
}

function DiffList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="font-medium">
        {title} <span className="font-normal text-[color:var(--muted)]">{items.length}</span>
      </div>
      {items.length ? (
        <ul className="mt-1 space-y-0.5 text-[color:var(--muted)]">
          {items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Unter „Storno prüfen“: Reklamationen aus der HvK-Abrechnung ohne eindeutigen Lead. */
export async function HvkReklamationenReview() {
  const rows = await openHvkReklamationen();
  if (!rows.length) return null;
  return (
    <Card tone="attention">
      <CardHeader title="HvK-Reklamationen zuordnen" count={rows.length} hint="aus der Abrechnung, Lieferdatum und PLZ nicht eindeutig" />
      <ul className="divide-y divide-[color:var(--border)]">
        {rows.map((r) => {
          const date = r.deliveryDate.toISOString().slice(0, 10);
          return (
            <li key={r.id} className="space-y-2 px-5 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                <span className="font-medium">
                  HvK Lead ID {r.hvkLeadId} · {r.plz} {r.ort}
                </span>
                <span className="text-xs text-[color:var(--muted)]">
                  geliefert {dmy(date)} · {r.invoice.invoiceNo} · {eur(r.cents)}
                </span>
              </div>
              <div className="text-xs text-[color:var(--muted)]">
                {r.candidates.length ? `${r.candidates.length} Leads mit gleichem Lieferdatum und gleicher PLZ:` : "Kein Lead mit diesem Lieferdatum und dieser PLZ. Lead-ID unter „Gelieferte Leads“ suchen oder verwerfen."}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <HvkAssign
                  reklamationId={r.id}
                  candidates={r.candidates.map((c) => ({
                    id: c.id,
                    label: `${c.name ?? "Lead"} · geliefert ${dt(c.deliveredAt ?? c.createdAt)}${c.stornoState === "approved" ? " · schon storniert" : ""}`,
                  }))}
                />
                <form action={hvkDiscardAction}>
                  <input type="hidden" name="reklamationId" value={r.id} />
                  <button className="text-xs font-medium text-[color:var(--muted)] hover:text-rose-700">Verwerfen</button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
