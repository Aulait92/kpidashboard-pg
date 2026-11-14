"use client";

// Verträge im Kontakt (Cross-Selling, Ole 14.11.2026): Liste der Abschlüsse mit Sparte, Beitrag und
// geschätzter Provision, „Weiteren Abschluss eintragen“, Bearbeiten, Storno und Löschen.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, FileText, Loader2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useProvisionRates } from "@/components/provision-context";
import { addContractAction, setContractStatusAction, updateContractAction } from "@/app/buyer/vertrag-actions";
import { premiumFieldForSparte, SPARTEN, type SparteKey } from "@/lib/provision";
import type { LeadContractView } from "@/lib/vertraege";

const day = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
const isoDay = (iso: string) => new Date(iso).toISOString().slice(0, 10);
const fmtPremium = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));

type Draft = { sparte: SparteKey | ""; premium: string; signedAt: string; insurer: string; contractNo: string; fileId: string | null; fileName: string | null };

export function LeadContracts({ leadId, contracts, readOnly = false }: { leadId: string; contracts: LeadContractView[]; readOnly?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [edit, setEdit] = useState<{ id: string | null; draft: Draft } | null>(null);
  const extra = contracts.filter((c) => !c.primary && c.status === "aktiv").length;

  const openNew = () =>
    setEdit({ id: null, draft: { sparte: "", premium: "", signedAt: new Date().toISOString().slice(0, 10), insurer: "", contractNo: "", fileId: null, fileName: null } });
  const openEdit = (c: LeadContractView) =>
    setEdit({
      id: c.id,
      draft: { sparte: c.sparte, premium: fmtPremium(c.premium), signedAt: isoDay(c.signedAt), insurer: c.insurer ?? "", contractNo: c.contractNo ?? "", fileId: c.fileId, fileName: c.fileName },
    });

  const status = (c: LeadContractView, next: "aktiv" | "storniert" | "geloescht") => {
    if (next === "geloescht" && !window.confirm(`Vertrag ${c.sparteLabel} löschen?`)) return;
    if (next === "storniert" && !window.confirm(`Vertrag ${c.sparteLabel} als storniert markieren? Er zählt dann nicht mehr in Ihren Zahlen.`)) return;
    start(async () => {
      const res = await setContractStatusAction(c.id, next);
      if (!res.ok) return toast.show({ message: res.error, tone: "error" });
      toast.show({ message: next === "storniert" ? "Vertrag storniert" : next === "aktiv" ? "Vertrag wieder aktiv" : "Vertrag gelöscht" });
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
          <li key={c.id} className={`rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2 text-sm ${c.status === "storniert" ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{c.sparteLabel}</span>
              {c.primary ? <Badge tone="neutral">erster Abschluss</Badge> : <Badge tone="brand">Cross-Selling</Badge>}
              {c.status === "storniert" ? <Badge tone="danger">storniert</Badge> : null}
              <span className="text-xs text-[color:var(--muted)]">{day(c.signedAt)}</span>
              {!readOnly ? (
                <span className="ml-auto flex items-center gap-1">
                  <Button variant="ghost" size="sm" icon={Pencil} onClick={() => openEdit(c)} disabled={pending} aria-label="Bearbeiten">
                    Bearbeiten
                  </Button>
                  {c.status === "aktiv" ? (
                    <Button variant="ghost" size="sm" icon={Ban} onClick={() => status(c, "storniert")} disabled={pending} aria-label="Stornieren">
                      Storno
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => status(c, "aktiv")} disabled={pending}>
                      Wieder aktiv
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
              {c.premium == null && c.provisionValue == null ? " (ohne Beitrag rechnen wir mit dem Standard)" : null}
              {c.insurer || c.contractNo ? ` · ${[c.insurer, c.contractNo ? `Nr. ${c.contractNo}` : null].filter(Boolean).join(", ")}` : null}
              {c.fileId ? (
                <a href={`/api/buyer/leads/${leadId}/dateien/${c.fileId}`} className="ml-1 inline-flex items-center gap-0.5 text-[color:var(--brand)] underline" target="_blank" rel="noreferrer">
                  <FileText className="h-3 w-3" /> Police
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {edit ? <ContractSheet leadId={leadId} id={edit.id} initial={edit.draft} onClose={() => setEdit(null)} /> : null}
    </div>
  );
}

function ContractSheet({ leadId, id, initial, onClose }: { leadId: string; id: string | null; initial: Draft; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const rates = useProvisionRates();
  const [d, setD] = useState<Draft>(initial);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const field = d.sparte ? premiumFieldForSparte(d.sparte, rates) : null;

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
      const raw = { sparte: d.sparte, premium: d.premium, signedAt: d.signedAt, insurer: d.insurer, contractNo: d.contractNo, fileId: d.fileId };
      const res = id ? await updateContractAction(id, raw) : await addContractAction(leadId, raw);
      if (!res.ok) return toast.show({ message: res.error, tone: "error" });
      toast.show({ message: id ? "Vertrag gespeichert" : "Abschluss eingetragen" });
      onClose();
      router.refresh();
    });

  const input = "mt-1 h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-base";
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
          <select required value={d.sparte} onChange={(e) => setD({ ...d, sparte: e.target.value as SparteKey })} className={input} data-contract-sparte>
            <option value="">Bitte wählen</option>
            {SPARTEN.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-[color:var(--muted)]">{field ? field.label : "Beitrag netto"}</span>
          <span className="mt-1 flex items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 focus-within:border-[color:var(--brand)]">
            <input inputMode="decimal" value={d.premium} placeholder={field?.placeholder ?? "z. B. 400"} onChange={(e) => setD({ ...d, premium: e.target.value })} className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none" data-contract-premium />
            <span className="text-sm text-[color:var(--muted)]">€</span>
          </span>
          {field?.hint ? <span className="mt-1 block text-xs text-[color:var(--muted)]">{field.hint}</span> : null}
        </label>
        <label className="block">
          <span className="text-sm text-[color:var(--muted)]">Abschlussdatum</span>
          <input type="date" required value={d.signedAt} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setD({ ...d, signedAt: e.target.value })} className={input} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm text-[color:var(--muted)]">Versicherer (optional)</span>
            <input value={d.insurer} onChange={(e) => setD({ ...d, insurer: e.target.value })} className={input} />
          </label>
          <label className="block">
            <span className="text-sm text-[color:var(--muted)]">Vertragsnummer (optional)</span>
            <input value={d.contractNo} onChange={(e) => setD({ ...d, contractNo: e.target.value })} className={input} />
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
