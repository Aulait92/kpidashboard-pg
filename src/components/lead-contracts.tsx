"use client";

// Verträge im Kontakt (Cross-Selling, Ole 14.11.2026): Liste der Abschlüsse mit Sparte, Beitrag und
// geschätzter Provision, „Weiteren Abschluss eintragen“, Bearbeiten, „Vertrag gekündigt bzw. storniert“
// (Datum, Grund, Rückbelastung; rückgängig machbar) und Löschen. Leben/BU mit Monatsbeitrag, Laufzeit
// bzw. Alter und Endalter oder Beitragssumme; PKV-Tarifoptimierung mit der monatlichen Ersparnis.

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, FileText, Loader2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useEigeneProdukte, useProvisionRates } from "@/components/provision-context";
import { META_LERNT } from "@/lib/zahlen-tipps";
import { anteil, EigenesProduktFelder, produktEingabe, sonstigesStandard, type ProduktEingabe } from "@/components/eigenes-produkt-felder";
import { addContractAction, cancelContractAction, setContractStatusAction, updateContractAction } from "@/app/buyer/vertrag-actions";
import {
  CANCEL_REASONS,
  cancelReasonLabel,
  contractProvision,
  premiumFactor,
  premiumFieldForSparte,
  sparteKind,
  spartenAuswahl,
  suggestedChargeback,
  type CancelReason,
  type SparteKey,
} from "@/lib/provision";
import type { LeadContractView } from "@/lib/vertraege";

const day = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
const isoDay = (iso: string) => new Date(iso).toISOString().slice(0, 10);
const fmtNum = (n: number | null) => (n == null ? "" : String(Math.round(n * 100) / 100).replace(".", ","));
const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const parseNum = (s: string) => {
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return s.trim() === "" || !Number.isFinite(n) ? null : n;
};

type Draft = {
  sparte: SparteKey | "";
  /** Eingabe (Leben/BU: Monatsbeitrag; gespeichert × 12). */
  premium: string;
  signedAt: string;
  insurer: string;
  contractNo: string;
  fileId: string | null;
  fileName: string | null;
  termYears: string;
  customerAge: string;
  endAge: string;
  beitragssumme: string;
} & ProduktEingabe;

const leerProdukt: ProduktEingabe = { productName: "", rateAbschluss: "", rateBestand: "" };

export function LeadContracts({ leadId, contracts, readOnly = false }: { leadId: string; contracts: LeadContractView[]; readOnly?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [edit, setEdit] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [cancel, setCancel] = useState<LeadContractView | null>(null);
  const extra = contracts.filter((c) => !c.primary && c.status === "aktiv").length;

  const openNew = () =>
    setEdit({
      id: null,
      draft: { sparte: "", premium: "", signedAt: new Date().toISOString().slice(0, 10), insurer: "", contractNo: "", fileId: null, fileName: null, termYears: "", customerAge: "", endAge: "", beitragssumme: "", ...leerProdukt },
    });
  const openEdit = (c: LeadContractView) =>
    setEdit({
      id: c.id,
      draft: {
        sparte: c.sparte,
        premium: fmtNum(c.premium == null ? null : c.premium / premiumFactor(c.sparte)),
        signedAt: isoDay(c.signedAt),
        insurer: c.insurer ?? "",
        contractNo: c.contractNo ?? "",
        fileId: c.fileId,
        fileName: c.fileName,
        termYears: c.termYears != null ? String(c.termYears) : "",
        customerAge: c.customerAge != null ? String(c.customerAge) : "",
        endAge: c.endAge != null ? String(c.endAge) : "",
        beitragssumme: fmtNum(c.beitragssumme),
        productName: c.productName ?? "",
        rateAbschluss: c.rateAbschluss != null ? fmtNum(c.rateAbschluss * 100) : "",
        rateBestand: c.rateBestand != null ? fmtNum(c.rateBestand * 100) : "",
      },
    });

  const status = (c: LeadContractView, next: "aktiv" | "geloescht") => {
    if (next === "geloescht" && !window.confirm(`Vertrag ${c.sparteLabel} löschen?`)) return;
    if (next === "aktiv" && !window.confirm(`Kündigung von ${c.sparteLabel} zurücknehmen? Der Vertrag zählt dann wieder voll, eine Rückbelastung entfällt.`)) return;
    start(async () => {
      const res = await setContractStatusAction(c.id, next);
      if (!res.ok) return toast.show({ message: res.error, tone: "error" });
      toast.show({ message: next === "aktiv" ? "Kündigung zurückgenommen" : "Vertrag gelöscht" });
      router.refresh();
    });
  };

  return (
    <div className="border-t border-[color:var(--border)] px-5 py-3" data-lead-contracts>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">
          Verträge{extra > 0 ? <span className="ml-1 font-normal text-[color:var(--muted)]">({contracts.filter((c) => c.status === "aktiv").length})</span> : null}
        </div>
        {!readOnly ? (
          <Button variant="secondary" size="sm" icon={Plus} onClick={openNew} disabled={pending} data-add-contract>
            Weiteren Abschluss eintragen
          </Button>
        ) : null}
      </div>
      <ul className="space-y-2">
        {contracts.map((c) => (
          <li key={c.id} className={`rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2 text-sm ${c.status === "storniert" ? "bg-[color:var(--surface-sunken,#f8fafc)]" : ""}`} data-contract={c.id}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{c.sparteLabel}</span>
              {c.primary ? <Badge tone="neutral">erster Abschluss</Badge> : <Badge tone="brand">Cross-Selling</Badge>}
              {c.status === "storniert" ? <Badge tone="danger">gekündigt bzw. storniert</Badge> : null}
              <span className="text-xs text-[color:var(--muted)]">{day(c.signedAt)}</span>
              {!readOnly ? (
                <span className="ml-auto flex flex-wrap items-center gap-1">
                  <Button variant="ghost" size="sm" icon={Pencil} onClick={() => openEdit(c)} disabled={pending} aria-label="Bearbeiten">
                    Bearbeiten
                  </Button>
                  {c.status === "aktiv" ? (
                    <Button variant="ghost" size="sm" icon={Ban} onClick={() => setCancel(c)} disabled={pending} data-cancel-contract>
                      Vertrag gekündigt bzw. storniert
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => status(c, "aktiv")} disabled={pending} data-undo-cancel>
                      Kündigung zurücknehmen
                    </Button>
                  )}
                  {!c.primary ? (
                    <Button variant="ghost" size="sm" icon={Trash2} onClick={() => status(c, "geloescht")} disabled={pending} aria-label="Löschen" />
                  ) : null}
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 text-xs text-[color:var(--muted)]">
              {c.summary.split(" · ").slice(1).join(" · ") || "Beitrag nicht eingetragen"}
              {c.premium == null && c.provisionValue == null && c.beitragssumme == null ? " (ohne Beitrag rechnen wir mit dem Standard)" : null}
              {c.insurer || c.contractNo ? ` · ${[c.insurer, c.contractNo ? `Nr. ${c.contractNo}` : null].filter(Boolean).join(", ")}` : null}
              {c.fileId ? (
                <a href={`/api/buyer/leads/${leadId}/dateien/${c.fileId}`} className="ml-1 inline-flex items-center gap-0.5 text-[color:var(--brand)] underline" target="_blank" rel="noreferrer">
                  <FileText className="h-3 w-3" /> Police
                </a>
              ) : null}
            </div>
            {c.status === "storniert" ? (
              <div className="mt-0.5 text-xs text-rose-700" data-cancel-info>
                {c.cancelledAt ? `Gekündigt bzw. storniert zum ${day(c.cancelledAt)}` : "Storniert"}
                {c.cancelReason ? ` · ${cancelReasonLabel(c.cancelReason)}` : ""}
                {c.chargeback ? ` · Rückbelastung ${eur(c.chargeback)}` : ""}
                {c.cancelReason ? " · ab dem Datum ohne Bestandsprovision" : " · zählt nicht in Ihren Zahlen"}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {edit ? <ContractSheet leadId={leadId} id={edit.id} initial={edit.draft} onClose={() => setEdit(null)} /> : null}
      {cancel ? <CancelSheet contract={cancel} onClose={() => setCancel(null)} /> : null}
    </div>
  );
}

const inputCls = "mt-1 h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-base";

function CancelSheet({ contract, onClose }: { contract: LeadContractView; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const rates = useProvisionRates();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState<CancelReason | "">("");
  const [amount, setAmount] = useState<string | null>(null);
  const [toggle, setToggle] = useState<boolean | null>(null);
  const p = contractProvision({ ...contract, status: "aktiv" }, rates);
  // Vorschlag: Widerruf = volle Abschlussprovision, Leben/BU anteilig in der Stornohaftungszeit
  const suggestion = useMemo(() => {
    const d = new Date(`${date}T12:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return null;
    return suggestedChargeback({ ...contract, signedAt: new Date(contract.signedAt) }, d, reason || null, rates);
  }, [contract, date, reason, rates]);
  const shown = amount ?? (suggestion != null ? fmtNum(suggestion) : "");
  const chargebackOn = toggle ?? (suggestion != null && suggestion > 0);

  const save = () =>
    start(async () => {
      const res = await cancelContractAction(contract.id, { cancelledAt: date, reason, chargeback: chargebackOn ? shown : "" });
      if (!res.ok) return toast.show({ message: res.error, tone: "error" });
      toast.show({ message: "Vertrag als gekündigt bzw. storniert eingetragen" });
      onClose();
      router.refresh();
    });

  return (
    <Sheet open onClose={onClose} title="Vertrag gekündigt bzw. storniert" message={`${contract.sparteLabel}, abgeschlossen am ${day(contract.signedAt)}. Ab dem Datum zählt der Vertrag nicht mehr für die Bestandsprovision.`}>
      <form
        className="space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (reason) save();
        }}
        data-cancel-sheet
      >
        <label className="block">
          <span className="text-sm text-[color:var(--muted)]">Gekündigt bzw. storniert zum</span>
          <input type="date" required value={date} min={isoDay(contract.signedAt)} onChange={(e) => setDate(e.target.value)} className={inputCls} data-cancel-date />
        </label>
        <label className="block">
          <span className="text-sm text-[color:var(--muted)]">Grund</span>
          <select required value={reason} onChange={(e) => setReason(e.target.value as CancelReason)} className={inputCls} data-cancel-reason>
            <option value="">Bitte wählen</option>
            {CANCEL_REASONS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        {p.abschluss > 0 ? (
          <div className="rounded-[var(--radius-sm)] border border-[color:var(--border)] p-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={chargebackOn} onChange={(e) => setToggle(e.target.checked)} data-chargeback-on />
              {p.honorar ? "Honorar wird zurückgezahlt (optional)" : "Abschlussprovision wird zurückbelastet (optional)"}
            </label>
            {suggestion === 0 && !chargebackOn ? (
              <span className="mt-1 block text-xs text-[color:var(--muted)]">Die Stornohaftungszeit ist abgelaufen, eine Rückbelastung ist nicht zu erwarten.</span>
            ) : null}
            {chargebackOn ? (
              <>
                <span className="mt-2 flex items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 focus-within:border-[color:var(--brand)]">
                  <input inputMode="decimal" value={shown} placeholder="Betrag" onChange={(e) => setAmount(e.target.value)} className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none" data-chargeback />
                  <span className="text-sm text-[color:var(--muted)]">€</span>
                </span>
                <span className="mt-1 block text-xs text-[color:var(--muted)]">
                  {suggestion != null && suggestion > 0
                    ? reason === "widerruf"
                      ? `Vorschlag bei Widerruf: die volle ${p.honorar ? "Summe" : "Abschlussprovision"} (${eur(p.abschluss)}).`
                      : `Vorschlag: anteilig für die restliche Stornohaftungszeit (${p.haftungMonate} Monate) von ${eur(p.abschluss)} Abschlussprovision.`
                    : `Geschätzte Abschlussprovision: ${eur(p.abschluss)}. Tragen Sie den Betrag laut Abrechnung ein.`}{" "}
                  Die Rückbelastung mindert Provision und Gewinn im Monat der Kündigung.
                </span>
              </>
            ) : null}
          </div>
        ) : null}
        <Button type="submit" variant="primary" size="md" className="w-full" disabled={pending || !reason}>
          {pending ? "Speichere …" : "Speichern"}
        </Button>
      </form>
    </Sheet>
  );
}

function ContractSheet({ leadId, id, initial, onClose }: { leadId: string; id: string | null; initial: Draft; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const rates = useProvisionRates();
  const products = useEigeneProdukte();
  const [d, setD] = useState<Draft>(initial);
  const eigen = d.sparte === "sonstiges";
  const known = eigen ? products.find((p) => p.name.toLowerCase() === d.productName.trim().toLowerCase()) : undefined;
  const selectValue = known ? `eigen:${known.name}` : d.sparte;
  const chooseSparte = (v: string) => {
    if (v.startsWith("eigen:")) {
      const p = products.find((x) => x.name === v.slice(6));
      if (p) return setD({ ...d, sparte: "sonstiges", ...produktEingabe(p) });
    }
    if (v === "sonstiges") return setD({ ...d, sparte: "sonstiges", ...sonstigesStandard(rates) });
    setD({ ...d, sparte: v as SparteKey, ...leerProdukt });
  };
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const field = d.sparte ? premiumFieldForSparte(d.sparte, rates) : null;
  const leben = !!d.sparte && sparteKind(d.sparte) === "beitragssumme";
  // Vorschau der Schätzung mit den Eingaben
  const preview = useMemo(() => {
    if (!d.sparte) return null;
    const entered = parseNum(d.premium);
    const p = contractProvision(
      {
        sparte: d.sparte,
        premium: entered == null ? null : entered * premiumFactor(d.sparte),
        termYears: parseNum(d.termYears),
        customerAge: parseNum(d.customerAge),
        endAge: parseNum(d.endAge),
        beitragssumme: parseNum(d.beitragssumme),
        ...(eigen ? { productName: d.productName, rateAbschluss: anteil(d.rateAbschluss), rateBestand: anteil(d.rateBestand) } : {}),
      },
      rates,
    );
    const parts: string[] = [];
    if (p.basis === "beitragssumme" && p.termYears && p.beitragssumme) parts.push(`${p.termYears} Jahre, ${eur(p.beitragssumme)} Beitragssumme`);
    if (p.abschluss > 0) parts.push(`≈ ${eur(p.abschluss)} ${p.honorar ? "Honorar (vom Kunden)" : "Abschlussprovision"}`);
    if (p.trailPerYear > 0) parts.push(`≈ ${eur(p.trailPerYear)} Bestand pro Jahr${p.trailFromYear2 ? " ab dem 2. Jahr" : ""}`);
    return parts.length ? parts.join(", ") : null;
  }, [d, rates]);

  async function upload(file: File) {
    setUploading(true);
    try {
      const res = await fetch(`/api/buyer/leads/${leadId}/dateien?kind=police`, {
        method: "POST",
        headers: { "x-file-name": encodeURIComponent(file.name), "content-type": "application/octet-stream" },
        body: file,
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
      if (!res.ok || !j.id) throw new Error(j.error ?? "Hochladen hat nicht geklappt.");
      setD((x) => ({ ...x, fileId: j.id!, fileName: file.name }));
    } catch (e) {
      toast.show({ message: e instanceof Error ? e.message : "Hochladen hat nicht geklappt.", tone: "error" });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const save = () =>
    start(async () => {
      const raw = {
        sparte: d.sparte,
        premium: d.premium,
        signedAt: d.signedAt,
        insurer: d.insurer,
        contractNo: d.contractNo,
        fileId: d.fileId,
        termYears: d.termYears,
        customerAge: d.customerAge,
        endAge: d.endAge,
        beitragssumme: d.beitragssumme,
        productName: d.productName,
        rateAbschluss: d.rateAbschluss,
        rateBestand: d.rateBestand,
      };
      const res = id ? await updateContractAction(id, raw) : await addContractAction(leadId, raw);
      if (!res.ok) return toast.show({ message: res.error, tone: "error" });
      toast.show({ message: id ? "Vertrag gespeichert" : "Abschluss eingetragen" });
      onClose();
      router.refresh();
    });

  return (
    <Sheet open onClose={onClose} title={id ? "Vertrag bearbeiten" : "Weiteren Abschluss eintragen"} message="Sparte, Beitrag und Datum. Versicherer, Vertragsnummer und Police sind optional.">
      <form
        className="space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="block">
          <span className="text-sm text-[color:var(--muted)]">Sparte</span>
          <select required value={selectValue} onChange={(e) => chooseSparte(e.target.value)} className={inputCls} data-contract-sparte>
            <option value="">Bitte wählen</option>
            {spartenAuswahl(selectValue).map((s) => (
              <option key={s.key} value={s.key}>
                {s.key === "sonstiges" ? "Anderes Produkt (neu anlegen)" : s.label}
              </option>
            ))}
            {products.length ? (
              <optgroup label="Ihre Produkte">
                {products.map((p) => (
                  <option key={p.name} value={`eigen:${p.name}`}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>
        {eigen ? (
          <EigenesProduktFelder value={{ productName: d.productName, rateAbschluss: d.rateAbschluss, rateBestand: d.rateBestand }} onChange={(v) => setD({ ...d, ...v })} inputCls={inputCls} />
        ) : null}
        <label className="block">
          <span className="text-sm text-[color:var(--muted)]">{field ? field.label : "Beitrag netto"}</span>
          <span className="mt-1 flex items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 focus-within:border-[color:var(--brand)]">
            <input inputMode="decimal" value={d.premium} placeholder={field?.placeholder ?? "z. B. 400"} onChange={(e) => setD({ ...d, premium: e.target.value })} className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none" data-contract-premium />
            <span className="text-sm text-[color:var(--muted)]">€</span>
          </span>
          {field?.hint ? <span className="mt-1 block text-xs text-[color:var(--muted)]">{field.hint}</span> : null}
          <span className="mt-1 block text-xs text-[color:var(--muted)]" data-meta-lernt>
            {META_LERNT}
          </span>
        </label>
        {leben ? (
          <div className="space-y-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] p-3" data-contract-leben>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="text-sm text-[color:var(--muted)]">Laufzeit (Jahre)</span>
                <input inputMode="numeric" value={d.termYears} onChange={(e) => setD({ ...d, termYears: e.target.value })} className={inputCls} data-contract-term />
              </label>
              <label className="block">
                <span className="text-sm text-[color:var(--muted)]">oder Alter</span>
                <input inputMode="numeric" value={d.customerAge} onChange={(e) => setD({ ...d, customerAge: e.target.value })} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-sm text-[color:var(--muted)]">und Endalter</span>
                <input inputMode="numeric" value={d.endAge} onChange={(e) => setD({ ...d, endAge: e.target.value })} className={inputCls} />
              </label>
            </div>
            <label className="block">
              <span className="text-sm text-[color:var(--muted)]">Beitragssumme (optional, geht vor)</span>
              <span className="mt-1 flex items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 focus-within:border-[color:var(--brand)]">
                <input inputMode="decimal" value={d.beitragssumme} onChange={(e) => setD({ ...d, beitragssumme: e.target.value })} className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none" data-contract-summe />
                <span className="text-sm text-[color:var(--muted)]">€</span>
              </span>
            </label>
          </div>
        ) : null}
        {preview ? (
          <p className="text-sm text-[color:var(--muted)]" data-contract-preview>
            {preview}
          </p>
        ) : null}
        <label className="block">
          <span className="text-sm text-[color:var(--muted)]">Abschlussdatum</span>
          <input type="date" required value={d.signedAt} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setD({ ...d, signedAt: e.target.value })} className={inputCls} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm text-[color:var(--muted)]">Versicherer (optional)</span>
            <input value={d.insurer} onChange={(e) => setD({ ...d, insurer: e.target.value })} className={inputCls} />
          </label>
          <label className="block">
            <span className="text-sm text-[color:var(--muted)]">Vertragsnummer (optional)</span>
            <input value={d.contractNo} onChange={(e) => setD({ ...d, contractNo: e.target.value })} className={inputCls} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input ref={fileInput} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <Button type="button" variant="secondary" size="sm" icon={uploading ? Loader2 : FileText} disabled={uploading} onClick={() => fileInput.current?.click()}>
            {d.fileId ? "Andere Police hochladen" : "Police hochladen (optional)"}
          </Button>
          {d.fileName ? <span className="text-[color:var(--muted)]">{d.fileName}</span> : null}
        </div>
        <Button type="submit" variant="primary" size="md" className="w-full" disabled={pending || uploading || !d.sparte}>
          {pending ? "Speichere …" : id ? "Speichern" : "Abschluss eintragen"}
        </Button>
      </form>
    </Sheet>
  );
}
