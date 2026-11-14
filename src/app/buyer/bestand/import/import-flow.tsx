"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileSpreadsheet, ShieldCheck, Users } from "lucide-react";
import { Button, Card, CardHeader } from "@/components/ui";
import { FIELD_GROUPS, FIELDS, groupRows, importWarning, mappingIssues, type FieldKey, type Mapping } from "@/lib/bestand/rows";
import { analyzeImportAction, runImportAction, type AnalyzeState, type ImportState } from "../actions";

const select = "h-10 w-full rounded-[var(--radius-sm)] border bg-white px-2 text-sm text-[color:var(--foreground)]";
const de = (n: number) => n.toLocaleString("de-DE");
const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function ImportFlow() {
  const [analysis, analyze, analyzing] = useActionState<AnalyzeState, FormData>(analyzeImportAction, {});
  const [result, runImport, importing] = useActionState<ImportState, FormData>(runImportAction, {});
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  // Zuordnung je Datei (neu erkannt, sobald eine andere Datei geprüft wurde)
  const [edits, setEdits] = useState<{ key: AnalyzeState; mapping: Mapping } | null>(null);
  const mapping: Mapping = useMemo(() => (edits?.key === analysis ? edits.mapping : (analysis.mapping ?? {})), [edits, analysis]);
  const setField = (k: FieldKey, col: string) => {
    const next = { ...mapping };
    if (col) next[k] = col;
    else delete next[k];
    setEdits({ key: analysis, mapping: next });
  };

  // Live-Vorschau mit derselben Gruppierung wie beim Übernehmen
  const live = useMemo(() => (analysis.rows ? groupRows(analysis.rows, mapping) : null), [analysis.rows, mapping]);
  const warning = live ? importWarning(live) : null;
  // Zuordnung prüfen: doppelte Spalten (Warnung) und unpassende Inhalte (über 50 % → gesperrt)
  const issues = useMemo(() => mappingIssues(analysis.rows ?? analysis.preview ?? [], mapping), [analysis.rows, analysis.preview, mapping]);
  const blocking = issues.filter((i) => i.block);
  const issuesOf = (k: FieldKey) => issues.filter((i) => i.field === k);

  const withFile = (fd: FormData) => {
    if (file) fd.set("file", file);
    return fd;
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="1. Datei wählen" icon={FileSpreadsheet} />
        <form action={(fd) => analyze(withFile(fd))} className="flex flex-wrap items-center gap-3 px-5 pb-5 text-sm">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,.txt"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="min-w-0 flex-1 text-sm file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-[color:var(--brand-soft)] file:px-3 file:py-2 file:font-semibold file:text-[color:var(--brand-dark,var(--brand))]"
          />
          <Button type="submit" variant="primary" size="md" disabled={!file || analyzing}>
            {analyzing ? "Wird gelesen …" : "Datei prüfen"}
          </Button>
          <p className="w-full text-sm text-[color:var(--muted)]">
            Eine Zeile je Kunde oder je Vertrag ist beides möglich: Zeilen desselben Kunden werden über Kundennummer, Telefon oder E-Mail zusammengeführt, so
            hat ein Kunde mehrere Verträge. Gesundheitsangaben werden nie übernommen.
          </p>
          {analysis.error ? <p className="w-full text-rose-700">{analysis.error}</p> : null}
        </form>
      </Card>

      {analysis.headers ? (
        <form action={(fd) => runImport(withFile(fd))}>
          <Card>
            <CardHeader title={`2. Spalten zuordnen (${de(analysis.total ?? 0)} Zeilen)`} />
            <div className="space-y-6 px-5 pb-5">
              {FIELD_GROUPS.map((g) => (
                <fieldset key={g.title} className="space-y-3" data-import-group={g.title}>
                  <legend className="text-base font-semibold">{g.title}</legend>
                  <p className="-mt-1 text-sm text-[color:var(--muted)]">{g.hint}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {g.fields.map(({ key, label, important, hint }) => {
                      const own = issuesOf(key);
                      const bad = own.some((i) => i.block);
                      return (
                        <label key={key} className="text-sm font-medium" data-import-field={key} data-import-field-state={bad ? "block" : own.length ? "warn" : "ok"}>
                          <span className="flex flex-wrap items-center gap-x-2">
                            {label}
                            {important ? (
                              <span className="rounded-full bg-[color:var(--brand-soft)] px-1.5 py-px text-[11px] font-medium text-[color:var(--brand-dark,var(--brand))]">empfohlen</span>
                            ) : null}
                          </span>
                          <select
                            name={`map_${key}`}
                            value={mapping[key] ?? ""}
                            onChange={(e) => setField(key, e.target.value)}
                            aria-invalid={bad || undefined}
                            className={`mt-1 ${select} ${bad ? "border-rose-400 bg-rose-50 ring-1 ring-rose-300" : own.length ? "border-amber-400" : "border-[color:var(--border)]"}`}
                          >
                            <option value="">Nicht zuordnen</option>
                            {analysis.headers!.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                          {hint && !own.length ? <span className="mt-1 block text-xs font-normal text-[color:var(--muted)]">{hint}</span> : null}
                          {own.map((i) => (
                            <span key={i.kind} className={`mt-1 block text-xs font-normal ${i.block ? "text-rose-700" : "text-amber-800"}`} data-import-issue={i.kind}>
                              {i.text}
                            </span>
                          ))}
                        </label>
                      );
                    })}
                  </div>
                  {g.title === "Kunde" && !mapping.phone ? (
                    <p className="flex items-start gap-2 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-import-no-phone>
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      Ohne Telefonnummer können wir diese Kunden nicht per WhatsApp anschreiben. Import ist trotzdem möglich (für E-Mail bzw. Übersicht).
                    </p>
                  ) : null}
                </fieldset>
              ))}
              {analysis.blocked?.length ? <p className="text-sm text-[color:var(--muted)]">Ausgelassen (Gesundheitsangaben): {analysis.blocked.join(", ")}</p> : null}
            </div>
            <div className="overflow-x-auto border-t border-[color:var(--border)]">
              <table className="w-full text-xs">
                <thead className="text-left text-[color:var(--muted)]">
                  <tr>
                    {analysis.headers.slice(0, 8).map((h) => (
                      <th key={h} className="px-3 py-2 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analysis.preview?.map((r, i) => (
                    <tr key={i} className="border-t border-[color:var(--border)]">
                      {analysis.headers!.slice(0, 8).map((h) => (
                        <td key={h} className="max-w-[160px] truncate px-3 py-1.5">
                          {r[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="mt-5">
            <CardHeader title="3. Übernehmen" icon={ShieldCheck} />
            <div className="space-y-4 px-5 pb-5 text-sm">
              {live ? (
                <div className="rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-4 py-3" data-import-summary>
                  <p className="flex items-center gap-2 text-base font-semibold">
                    <Users className="h-4 w-4 text-[color:var(--brand)]" />
                    {de(live.rows)} Zeilen → {de(live.groups.size)} Kunden mit {de(live.contracts)} Verträgen
                  </p>
                  <p className="mt-1 text-[color:var(--muted)]">
                    {de(live.withPhone)} mit Mobilnummer
                    {live.premiumTotal > 0 ? ` · Beitragsvolumen ${eur(live.premiumTotal)} pro Jahr (aktive Verträge)` : ""}
                    {live.inactiveContracts ? ` · ${de(live.inactiveContracts)} Verträge storniert oder ruhend (zählen nicht für Chancen)` : ""}
                    {live.skipped ? ` · ${de(live.skipped)} Zeilen werden übersprungen` : ""}
                  </p>
                  {live.withoutName ? (
                    <p className="mt-1 text-[color:var(--muted)]" data-import-nameless>
                      {de(live.withoutName)} Kunden ohne Namen, werden neutral angesprochen.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-[color:var(--muted)]">Sehr große Datei: Die Zahl der Kunden sehen Sie nach dem Übernehmen.</p>
              )}
              {blocking.length ? (
                <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900" data-import-warning="mapping">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">Die Zuordnung passt noch nicht, so würden falsche Daten übernommen:</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {blocking.map((i) => (
                        <li key={i.field}>
                          <b>{FIELDS[i.field]}:</b> {i.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}
              {warning ? (
                <p
                  className={`flex items-start gap-2 rounded-[var(--radius-md)] border px-4 py-3 ${warning.block ? "border-rose-200 bg-rose-50 text-rose-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}
                  data-import-warning={warning.block ? "block" : "warn"}
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {warning.text}
                </p>
              ) : null}
              <label className="flex items-start gap-2">
                <input type="checkbox" name="consent" className="mt-0.5 h-4 w-4" />
                <span>
                  Für diese Kunden liegt die Einwilligung zur Kontaktaufnahme per WhatsApp/E-Mail vor (laut Versicherer). Wer „Stopp“ antwortet, wird
                  automatisch gesperrt.
                </span>
              </label>
              {result.error ? <p className="text-rose-700">{result.error}</p> : null}
              {result.message ? (
                <p className="text-emerald-700">
                  {result.message}{" "}
                  <a href="/buyer/bestand" className="font-semibold underline">
                    Zu den Chancen
                  </a>
                </p>
              ) : null}
              <Button type="submit" variant="primary" size="md" disabled={importing || !!warning?.block || blocking.length > 0}>
                {importing ? "Wird übernommen …" : live ? `${de(live.groups.size)} Kunden übernehmen` : "Kunden übernehmen"}
              </Button>
            </div>
          </Card>
        </form>
      ) : null}
    </div>
  );
}
