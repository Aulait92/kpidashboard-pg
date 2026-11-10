"use client";

import { useActionState, useRef, useState } from "react";
import { FileSpreadsheet, ShieldCheck } from "lucide-react";
import { Button, Card, CardHeader } from "@/components/ui";
import { analyzeImportAction, runImportAction, type AnalyzeState, type ImportState } from "../actions";

const FIELDS: [string, string, boolean][] = [
  ["firstName", "Vorname", false],
  ["lastName", "Nachname", false],
  ["fullName", "Name (komplett, falls nicht getrennt)", false],
  ["phone", "Mobil/Telefon", true],
  ["email", "E-Mail", false],
  ["birthday", "Geburtsdatum", false],
  ["line", "Sparte/Produkt", true],
  ["renewalDate", "Ablauf/Hauptfälligkeit", false],
  ["startDate", "Vertragsbeginn", false],
  ["externalNo", "Kundennummer", false],
  ["street", "Straße", false],
  ["zip", "PLZ", false],
  ["city", "Ort", false],
];

const select = "h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm";

export function ImportFlow() {
  const [analysis, analyze, analyzing] = useActionState<AnalyzeState, FormData>(analyzeImportAction, {});
  const [result, runImport, importing] = useActionState<ImportState, FormData>(runImportAction, {});
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

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
          <p className="w-full text-xs text-[color:var(--muted)]">
            Eine Zeile je Kunde oder je Vertrag ist beides möglich. Gesundheitsangaben werden nie übernommen.
          </p>
          {analysis.error ? <p className="w-full text-rose-700">{analysis.error}</p> : null}
        </form>
      </Card>

      {analysis.headers ? (
        <form action={(fd) => runImport(withFile(fd))}>
          <Card>
            <CardHeader title={`2. Spalten zuordnen (${analysis.total} Zeilen)`} />
            <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
              {FIELDS.map(([key, label, important]) => (
                <label key={key} className="text-xs font-medium text-[color:var(--muted)]">
                  {label}
                  {important ? " *" : ""}
                  <select name={`map_${key}`} defaultValue={analysis.mapping?.[key as keyof typeof analysis.mapping] ?? ""} className={`mt-1 ${select}`}>
                    <option value="">– nicht vorhanden –</option>
                    {analysis.headers!.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              {analysis.blocked?.length ? (
                <p className="text-xs text-[color:var(--muted)] sm:col-span-2">
                  Ausgelassen (Gesundheitsangaben): {analysis.blocked.join(", ")}
                </p>
              ) : null}
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
            <div className="space-y-3 px-5 pb-5 text-sm">
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
              <Button type="submit" variant="primary" size="md" disabled={importing}>
                {importing ? "Wird übernommen …" : "Kunden übernehmen"}
              </Button>
            </div>
          </Card>
        </form>
      ) : null}
    </div>
  );
}
