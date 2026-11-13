"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, ExternalLink, Loader2, RefreshCw, Sparkles, XCircle } from "lucide-react";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import type { RunView } from "@/lib/kampagnen/run";
import { buildRunAction, cleanupRunAction, getRunAction, regenerateImageAction, startRunAction, updateCopyAction, type StartState } from "./actions";

type StepInfo = { key: string; label: string; doing: string };
const ACTIVE = ["queued", "running", "building"];
const input = "h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm";

export function KampagnenAgenten({
  customerId,
  products,
  defaults,
  initialRun,
  steps,
}: {
  customerId: string;
  products: { product: string; dailyBudget: number }[];
  defaults: { pageId: string; privacyUrl: string; adAccountId: string | null; place: string | null };
  initialRun: RunView | null;
  steps: StepInfo[];
}) {
  const [state, action, starting] = useActionState<StartState, FormData>(startRunAction, {});
  const [run, setRun] = useState<RunView | null>(initialRun);
  const runId = state.runId ?? run?.id ?? null;

  // Fortschritt live: alle 2,5 s abfragen, solange der Lauf arbeitet
  useEffect(() => {
    if (!runId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const v = await getRunAction(runId).catch(() => null);
      if (!alive) return;
      if (v) setRun(v);
      if (!v || ACTIVE.includes(v.status)) timer = setTimeout(tick, 2500);
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [runId, state.runId]);

  const busy = !!run && ACTIVE.includes(run.status);
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Kampagne mit KI erstellen" icon={Sparkles} hint="Alles wird pausiert angelegt – veröffentlichen tust du im Werbeanzeigenmanager." />
        <form action={action} className="space-y-3 px-5 pb-5 text-sm">
          <input type="hidden" name="customerId" value={customerId} />
          {products.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="font-medium">Produkt</span>
                <select name="product" className={`${input} mt-1`} defaultValue={products[0]?.product}>
                  {products.map((p) => (
                    <option key={p.product} value={p.product}>
                      {p.product} · {p.dailyBudget} €/Tag
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="font-medium">Zusatzwunsch (optional)</span>
                <input name="wish" maxLength={500} placeholder="z. B. eher Familien ansprechen, Fokus Freigänger" className={`${input} mt-1`} />
              </label>
              <label className="block">
                <span className="font-medium">Facebook-Seiten-ID des Kunden</span>
                <input name="pageId" defaultValue={defaults.pageId} inputMode="numeric" placeholder="z. B. 996034096924997" className={`${input} mt-1`} />
              </label>
              <label className="block">
                <span className="font-medium">Datenschutz-URL des Kunden</span>
                <input name="privacyUrl" defaultValue={defaults.privacyUrl} placeholder="https://…/datenschutz" className={`${input} mt-1`} />
              </label>
            </div>
          ) : (
            <p className="text-amber-800">Für diesen Kunden ist kein Werbebudget hinterlegt (Angebot bzw. „Budget ändern“). Ohne Budget kann keine Kampagne geplant werden.</p>
          )}
          <p className="text-[color:var(--muted)]">
            Werbekonto: {defaults.adAccountId ? `act_${defaults.adAccountId}` : "fehlt (Reiter „Leads & Formulare“)"} · Ort: {defaults.place ?? "nicht hinterlegt (dann Deutschland)"}
          </p>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="autoBuild" defaultChecked className="h-4 w-4" />
            Nach erfolgreicher Prüfung direkt pausiert bei Meta anlegen (1 Klick)
          </label>
          <Button type="submit" variant="primary" size="md" disabled={starting || busy || !products.length}>
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Kampagne mit KI erstellen
          </Button>
          {state.error ? <p className="text-rose-700">{state.error}</p> : null}
          {state.problems?.length ? (
            <div className="rounded-[var(--radius-md)] border border-amber-300 bg-amber-50 p-3 text-amber-950">
              <p className="mb-1 font-semibold">Vorher erledigen:</p>
              <ul className="list-disc space-y-1 pl-5">
                {state.problems.map((p) => (
                  <li key={p.key}>{p.message}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </form>
      </Card>
      {run ? <RunPanel run={run} steps={steps} onChange={setRun} /> : null}
    </div>
  );
}

function StepIcon({ status }: { status: string }) {
  if (status === "fertig") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "laeuft") return <Loader2 className="h-4 w-4 animate-spin text-[color:var(--brand)]" />;
  if (status === "fehler") return <XCircle className="h-4 w-4 text-rose-600" />;
  if (status === "uebersprungen") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return <CircleDashed className="h-4 w-4 text-[color:var(--muted)]" />;
}

function RunPanel({ run, steps, onChange }: { run: RunView; steps: StepInfo[]; onChange: (r: RunView) => void }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const editable = ["review", "failed", "blocked"].includes(run.status) && !run.built?.creativeIds?.length;
  const act = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.error ?? r.message ?? null);
      const v = await getRunAction(run.id);
      if (v) onChange(v);
    });
  const review = run.review;
  const tone = review?.status === "gruen" ? "success" : review?.status === "gelb" ? "warning" : review?.status === "rot" ? "danger" : "neutral";
  const hasBuilt = !!(run.built?.campaignId || run.built?.formId);

  return (
    <Card>
      <CardHeader title={`Lauf: ${run.product}`} hint={`KI-Kosten ≈ $${(run.costCents / 100).toFixed(2)}`} />
      <div className="space-y-5 px-5 pb-5 text-sm">
        <ol className="grid gap-1.5 sm:grid-cols-2">
          {steps.map((s) => {
            const st = run.steps.find((x) => x.key === s.key);
            return (
              <li key={s.key} className="flex items-start gap-2">
                <StepIcon status={st?.status ?? "offen"} />
                <span>
                  <b>{s.label}</b> {st?.status === "laeuft" ? s.doing + " …" : st?.status === "fertig" ? "fertig" : st?.status === "fehler" ? "Fehler" : st?.status === "uebersprungen" ? "übersprungen" : ""}
                  {st?.note ? <span className="text-[color:var(--muted)]"> – {st.note}</span> : null}
                  {st?.error ? <span className="block text-rose-700">{st.error}</span> : null}
                </span>
              </li>
            );
          })}
        </ol>
        {run.error && run.status !== "blocked" ? <p className="rounded-[var(--radius-md)] bg-rose-50 p-3 text-rose-800">{run.error}</p> : null}

        {run.status === "built" ? (
          <div className="rounded-[var(--radius-md)] border border-emerald-300 bg-emerald-50 p-3 text-emerald-950">
            <p className="font-semibold">Kampagne ist pausiert angelegt – bitte prüfen und veröffentlichen.</p>
            <div className="mt-2 flex flex-wrap gap-3">
              {run.links.adsManager ? (
                <a href={run.links.adsManager} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[color:var(--brand)] hover:underline">
                  Im Werbeanzeigenmanager öffnen <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
              {run.links.form ? (
                <a href={run.links.form} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[color:var(--brand)] hover:underline">
                  Formular ansehen <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {run.status === "review" ? (
            <Button variant="primary" size="md" disabled={pending} onClick={() => act(() => buildRunAction(run.id))}>
              Bei Meta anlegen (pausiert)
            </Button>
          ) : null}
          {run.status === "failed" ? (
            <Button variant="primary" size="md" disabled={pending} onClick={() => act(() => buildRunAction(run.id))}>
              <RefreshCw className="h-4 w-4" /> Fortsetzen
            </Button>
          ) : null}
          {hasBuilt && run.status !== "cancelled" && run.status !== "building" ? (
            <Button
              variant="secondary"
              size="md"
              disabled={pending}
              onClick={() => {
                if (confirm("Angelegte Kampagne bei Meta löschen und Formular archivieren?")) act(() => cleanupRunAction(run.id));
              }}
            >
              Bei Meta aufräumen
            </Button>
          ) : null}
          {msg ? <span className="self-center text-[color:var(--muted)]">{msg}</span> : null}
        </div>

        {run.plan ? (
          <section>
            <h3 className="mb-1 font-semibold">Plan</h3>
            <p>
              {run.plan.campaignName} · {run.plan.dailyBudgetEur} €/Tag · {run.plan.adSets.map((a) => `${a.name}: ${a.ageMin}–${a.ageMax} J., ${a.radiusKm} km${a.advantageAudience ? ", Advantage+" : ""}`).join(" | ")}
            </p>
            <p className="text-[color:var(--muted)]">{run.plan.zielgruppe}</p>
          </section>
        ) : null}

        {review ? (
          <section>
            <h3 className="mb-1 flex items-center gap-2 font-semibold">
              Prüfbericht <Badge tone={tone}>{review.status === "gruen" ? "grün" : review.status}</Badge>
              {review.revised ? <span className="font-normal text-[color:var(--muted)]">(einmal überarbeitet)</span> : null}
            </h3>
            <p>{review.summary}</p>
            {review.findings.length ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {review.findings.map((f, i) => (
                  <li key={i} className={f.severity === "rot" ? "text-rose-700" : "text-amber-800"}>
                    [{f.area}
                    {f.index != null ? ` #${f.index + 1}` : ""}] {f.issue} {f.fix ? `→ ${f.fix}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {run.copies?.length ? (
          <section className="space-y-3">
            <h3 className="font-semibold">Anzeigen</h3>
            <div className="grid gap-3 lg:grid-cols-2">
              {run.copies.map((c, i) => {
                const img = run.creatives?.find((im) => im.angleKey === c.angleKey);
                return <AdCard key={`${c.angleKey}-${i}`} runId={run.id} index={i} copy={c} imageUrl={img?.imageUrl ?? null} editable={editable} onDone={(v) => onChange(v)} />;
              })}
            </div>
          </section>
        ) : null}

        {run.form ? (
          <section>
            <h3 className="mb-1 font-semibold">Sofortformular: {run.form.formName}</h3>
            <p className="font-medium">{run.form.introTitle}</p>
            {run.form.introParagraphs.map((p, i) => (
              <p key={i} className="text-[color:var(--muted)]">
                {p}
              </p>
            ))}
            <ol className="mt-1 list-decimal pl-5">
              {run.form.questions.map((q) => (
                <li key={q.key}>
                  {q.label}
                  {q.options.length ? <span className="text-[color:var(--muted)]"> ({q.options.join(" · ")})</span> : null}
                </li>
              ))}
              <li>Name, Telefon, E-Mail (automatisch)</li>
            </ol>
            <p className="mt-1 text-[color:var(--muted)]">Einwilligung: {run.form.consentText}</p>
            <p className="text-[color:var(--muted)]">
              Danke-Seite: {run.form.thankYouTitle} – {run.form.thankYouBody}
            </p>
          </section>
        ) : null}
      </div>
    </Card>
  );
}

function AdCard({
  runId,
  index,
  copy,
  imageUrl,
  editable,
  onDone,
}: {
  runId: string;
  index: number;
  copy: NonNullable<RunView["copies"]>[number];
  imageUrl: string | null;
  editable: boolean;
  onDone: (v: RunView) => void;
}) {
  const [edit, setEdit] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.error ?? r.message ?? null);
      const v = await getRunAction(runId);
      if (v) onDone(v);
      if (r.ok) setEdit(false);
    });
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={copy.imageHeadline} className="mb-2 aspect-square w-full rounded-[var(--radius-sm)] object-cover" />
      ) : (
        <div className="mb-2 flex aspect-square w-full items-center justify-center rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] text-[color:var(--muted)]">kein Bild</div>
      )}
      {edit ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const patch = Object.fromEntries(["primaryText", "headline", "description", "imageHeadline", "imageSubline"].map((k) => [k, String(fd.get(k) ?? "")]));
            run(() => updateCopyAction(runId, index, patch));
          }}
        >
          <textarea name="primaryText" defaultValue={copy.primaryText} rows={5} className={`${input} h-auto py-2`} />
          <input name="headline" defaultValue={copy.headline} maxLength={40} className={input} />
          <input name="description" defaultValue={copy.description} maxLength={30} className={input} />
          <input name="imageHeadline" defaultValue={copy.imageHeadline} maxLength={60} className={input} />
          <input name="imageSubline" defaultValue={copy.imageSubline} maxLength={100} className={input} />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={pending}>
              Speichern
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setEdit(false)}>
              Abbrechen
            </Button>
          </div>
        </form>
      ) : (
        <>
          <p className="whitespace-pre-line">{copy.primaryText}</p>
          <p className="mt-1 font-semibold">{copy.headline}</p>
          <p className="text-[color:var(--muted)]">
            {copy.description} · Button: {copy.cta}
          </p>
        </>
      )}
      {editable && !edit ? (
        <div className="mt-2 flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEdit(true)}>
            Text bearbeiten
          </Button>
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => regenerateImageAction(runId, index))}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Bild neu
          </Button>
        </div>
      ) : null}
      {msg ? <p className="mt-1 text-xs text-[color:var(--muted)]">{msg}</p> : null}
    </div>
  );
}
