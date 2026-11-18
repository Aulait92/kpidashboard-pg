"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import { AlertTriangle, FileSpreadsheet, ShieldCheck, Users } from "lucide-react";
import { Button, Card, CardHeader } from "@/components/ui";
import { FileDrop } from "@/components/ui/file-drop";
import { MB } from "@/lib/file-upload";
import { FIELD_GROUPS, FIELDS, groupRows, importWarning, mappingIssues, type FieldKey, type Mapping } from "@/lib/bestand/rows";
import { analyzeImportAction, runImportAction, type AnalyzeState, type ImportState } from "../actions";

const select = "h-10 w-full rounded-[var(--radius-sm)] border bg-white px-2 text-sm text-[color:var(--foreground)]";
const de = (n: number) => n.toLocaleString("de-DE");
const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** agentConfirm: Bestätigung der Befugnis vor dem ersten Import (gebundene Vertreter), null = schon bestätigt. */
export function ImportFlow({ agentConfirm = null }: { agentConfirm?: { text: string; bound: boolean } | null }) {
  const [analysis, analyze, analyzing] = useActionState<AnalyzeState, FormData>(analyzeImportAction, {});
  const [result, runImport, importing] = useActionState<ImportState, FormData>(runImportAction, {});
  const [bulk, setBulk] = useState({ email: false, whatsapp: false });
  const [hinweisBulk, setHinweisBulk] = useState(false);
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
          {/* Datei bleibt im Zustand (Formular wird nach dem Prüfen zurückgesetzt), geht per withFile mit */}
          <FileDrop
            accept=".xlsx,.csv,.txt"
            maxBytes={15 * MB}
            label="Datei auswählen"
            pendingLabel="Wird gelesen …"
            value={file ? [file] : []}
            onFiles={(fs) => setFile(fs[0] ?? null)}
            className="w-full"
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
        <form
          // Kein automatisches Zurücksetzen nach dem Absenden (React setzt Formulare mit action={…} zurück): Sonst stünden
          // nach einer Fehlermeldung alle Zuordnungen optisch auf „Nicht zuordnen“ und der nächste Versuch schickte leere Felder.
          onSubmit={(e) => {
            e.preventDefault();
            const fd = withFile(new FormData(e.currentTarget));
            startTransition(() => runImport(fd));
          }}
          data-import-form
        >
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
                    {de(live.withPhone)} mit Mobilnummer · {de(live.withEmail)} mit E-Mail
                    {live.premiumTotal > 0 ? ` · Beitragsvolumen ${eur(live.premiumTotal)} pro Jahr (aktive Verträge)` : ""}
                    {live.inactiveContracts ? ` · ${de(live.inactiveContracts)} Verträge storniert oder ruhend (zählen nicht für Chancen)` : ""}
                    {live.skipped ? ` · ${de(live.skipped)} Zeilen werden übersprungen` : ""}
                  </p>
                  {live.consent.emailJa + live.consent.emailNein + live.consent.whatsappJa + live.consent.whatsappNein ? (
                    <p className="mt-1 text-[color:var(--muted)]" data-import-consent-counts>
                      Einwilligung laut Datei: E-Mail {de(live.consent.emailJa)} ja, {de(live.consent.emailNein)} nein · WhatsApp {de(live.consent.whatsappJa)} ja,{" "}
                      {de(live.consent.whatsappNein)} nein
                    </p>
                  ) : null}
                  {mapping.widerspruchHinweis ? (
                    <p className="mt-1 text-[color:var(--muted)]" data-import-hinweis-counts>
                      Hinweis auf Widerspruchsrecht laut Datei: {de(live.consent.hinweisJa)} ja, {de(live.consent.hinweisNein)} nein
                    </p>
                  ) : null}
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
              <fieldset className="space-y-2 rounded-[var(--radius-md)] border border-[color:var(--border)] px-4 py-3" data-import-consent>
                <legend className="px-1 font-semibold">Einwilligung in Werbung</legend>
                <p className="text-[color:var(--muted)]">
                  Angaben aus der Datei (Spalten E-Mail- bzw. WhatsApp-Einwilligung) gelten immer. Ohne Angabe bleibt die Einwilligung „unbekannt“: Dann geht keine
                  WhatsApp-Kampagne raus, E-Mails nur zum selben Vertrag nach § 7 Abs. 3 UWG und nur mit Nachweis zum Hinweis auf das Widerspruchsrecht (unten).
                </p>
                <label className="flex items-start gap-2">
                  <input type="checkbox" name="bulk_email" className="mt-0.5 h-4 w-4" checked={bulk.email} onChange={(e) => setBulk({ ...bulk, email: e.target.checked })} />
                  <span>Alle Kunden dieser Liste haben in Werbung per E-Mail eingewilligt</span>
                </label>
                <label className="flex items-start gap-2">
                  <input type="checkbox" name="bulk_whatsapp" className="mt-0.5 h-4 w-4" checked={bulk.whatsapp} onChange={(e) => setBulk({ ...bulk, whatsapp: e.target.checked })} />
                  <span>Alle Kunden dieser Liste haben in Werbung per WhatsApp eingewilligt</span>
                </label>
                {bulk.email || bulk.whatsapp ? (
                  <label className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-amber-50 px-3 py-2 text-amber-900">
                    <input type="checkbox" name="bulk_confirm" className="mt-0.5 h-4 w-4" />
                    <span>
                      Ich bestätige ausdrücklich, dass diese Einwilligungen für alle Kunden der Liste vorliegen (z. B. laut Versicherer) und ich sie auf Anfrage nachweisen
                      kann. Ein „nein“ aus der Datei oder eine Abmeldung bleibt bestehen.
                    </span>
                  </label>
                ) : null}
              </fieldset>
              <fieldset className="space-y-2 rounded-[var(--radius-md)] border border-[color:var(--border)] px-4 py-3" data-import-hinweis>
                <legend className="px-1 font-semibold">Hinweis auf das Widerspruchsrecht (E-Mail ohne Einwilligung)</legend>
                <p className="text-[color:var(--muted)]">
                  Ohne Einwilligung dürfen Sie Bestandskunden per E-Mail nur anschreiben, wenn Sie sie schon bei der Erhebung der E-Mail-Adresse darauf hingewiesen
                  haben, dass sie der Werbung jederzeit widersprechen können (§ 7 Abs. 3 UWG). Ohne diesen Nachweis gehen E-Mails nur mit Einwilligung raus.
                  {mapping.widerspruchHinweis ? " Angaben aus der Spalte der Datei gelten immer." : " Sie können dafür auch oben eine Spalte zuordnen."}
                </p>
                <label className="flex items-start gap-2">
                  <input type="checkbox" name="hinweis_bulk" className="mt-0.5 h-4 w-4" checked={hinweisBulk} onChange={(e) => setHinweisBulk(e.target.checked)} data-import-hinweis-bulk />
                  <span>Alle Kunden dieser Liste wurden bei der Erhebung ihrer E-Mail-Adresse auf ihr Widerspruchsrecht hingewiesen</span>
                </label>
                {hinweisBulk ? (
                  <div className="space-y-2 rounded-[var(--radius-sm)] bg-amber-50 px-3 py-2 text-amber-900">
                    <label className="block text-xs font-medium">
                      Wortlaut oder Quelle des Hinweises (Pflicht, wird protokolliert)
                      <textarea
                        name="hinweis_text"
                        rows={2}
                        maxLength={500}
                        placeholder="z. B. Antragsformular Kfz, Abschnitt Datenschutz: „Sie können der Verwendung Ihrer E-Mail-Adresse für Werbung jederzeit widersprechen.“"
                        className="mt-1 w-full rounded-[var(--radius-sm)] border border-amber-200 bg-white px-3 py-2 text-sm text-[color:var(--foreground)]"
                      />
                    </label>
                    <label className="block text-xs font-medium">
                      Hinweis gegeben seit (optional)
                      <input type="date" name="hinweis_date" className="mt-1 h-10 rounded-[var(--radius-sm)] border border-amber-200 bg-white px-3 text-sm text-[color:var(--foreground)]" />
                    </label>
                    <label className="flex items-start gap-2">
                      <input type="checkbox" name="hinweis_confirm" className="mt-0.5 h-4 w-4" />
                      <span>
                        Ich bestätige ausdrücklich, dass dieser Hinweis für alle Kunden der Liste bei der Erhebung der Adresse gegeben wurde und ich das auf Anfrage
                        nachweisen kann. Ein „nein“ aus der Datei bleibt bestehen.
                      </span>
                    </label>
                  </div>
                ) : null}
              </fieldset>
              {live?.withPersonLines ? (
                <p className="flex items-start gap-2 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900" data-import-person-lines>
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {de(live.withPersonLines)} Kunden haben Personenversicherungen (Kranken, Leben, BU, Unfall, Pflege). Hier ist schon die Tatsache des Vertrags besonders
                  geschützt: Importieren Sie diese Daten nur im Rahmen Ihrer Befugnisse.
                </p>
              ) : null}
              <label className="flex items-start gap-2">
                <input type="checkbox" name="befugnis" className="mt-0.5 h-4 w-4" data-import-befugnis />
                <span>
                  Ich darf diese Kundendaten nutzen (im Rahmen meines Vertretervertrags bzw. meiner Befugnisse). Wer „Stopp“ antwortet oder sich abmeldet, wird
                  automatisch und dauerhaft gesperrt.
                </span>
              </label>
              {agentConfirm ? (
                <div className="space-y-2 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900" data-import-agent-confirm>
                  {agentConfirm.bound ? (
                    <p>
                      Als Vertreter mit Agenturvertrag gehören Kundendaten aus Ihrer Vertretertätigkeit oft dem Versicherer. Laden Sie sie nur hoch, wenn Ihr
                      Agenturvertrag und das Datenschutzrecht das erlauben. Die rechtliche Bewertung liegt bei Ihnen.
                    </p>
                  ) : null}
                  <label className="flex items-start gap-2">
                    <input type="checkbox" name="agentConfirm" className="mt-0.5 h-4 w-4" data-agent-confirm />
                    <span className="font-medium">{agentConfirm.text}</span>
                  </label>
                </div>
              ) : null}
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
