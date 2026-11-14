"use client";
/* eslint-disable @next/next/no-img-element -- Vorschaubilder aus der eigenen Admin-API, keine Optimierung nötig */

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ImageOff, Loader2, Send, Sparkles, Trash2, Undo2, Upload } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  approveAction,
  deletePhotoAction,
  disconnectAction,
  discardAction,
  generateNowAction,
  importAction,
  saveDraftAction,
  saveSettingsAction,
  setImportedTextAction,
  setMetricsAction,
  unapproveAction,
  updatePhotoAction,
  uploadPhotosAction,
  type LiResult,
} from "./actions";

export type PhotoOption = { id: string; description: string };

function Note({ res }: { res: LiResult | null | undefined }) {
  if (!res?.error && !res?.info) return null;
  return <p className={cn("text-sm", res.error ? "text-rose-700" : "text-emerald-700")}>{res.error ?? res.info}</p>;
}

const COUNT_LIMIT = 3000;

/** Entwurf: Text bearbeiten, Bild wählen (Foto, KI-Bild, Grafik, keins), freigeben oder verwerfen. */
export function DraftCard(props: {
  id: string;
  text: string;
  /** aktuelle Bildwahl: "keins" | "grafik" | Foto-ID */
  image: string;
  /** KI-Bild dieses Entwurfs (falls erzeugt) */
  aiPhotoId: string | null;
  graphic: string | null;
  photos: PhotoOption[];
  connected: boolean;
  slot: string;
  hypothesis: string | null;
  idea: string | null;
  error: string | null;
}) {
  const router = useRouter();
  const [text, setText] = useState(props.text);
  const [image, setImage] = useState<string>(props.image);
  const [graphic, setGraphic] = useState(props.graphic ?? "");
  const [res, setRes] = useState<LiResult | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<LiResult>) =>
    start(async () => {
      const r = await fn();
      setRes(r);
      router.refresh();
    });
  const lines = text.split("\n");
  const tile = (active: boolean) =>
    cn("h-20 w-20 shrink-0 overflow-hidden rounded-[var(--radius-md)] border", active ? "border-[color:var(--brand)] ring-2 ring-[color:var(--brand)]" : "border-[color:var(--border)]");
  const graphicSrc = `/api/linkedin/grafik/${props.id}?t=${encodeURIComponent(graphic)}`;
  // Vorher speichern, damit eine geänderte Grafik-Aussage beim Freigeben gilt
  const saveFirst = async () => {
    if (graphic !== (props.graphic ?? "")) await saveDraftAction(props.id, text, image, graphic);
  };
  return (
    <article className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]" data-li-draft={props.id}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-[color:var(--surface-sunken)] px-2 py-0.5 font-semibold">{props.slot}</span>
        {props.idea ? <span className="text-[color:var(--muted)]">{props.idea}</span> : null}
      </div>
      {props.hypothesis ? (
        <p className="mb-3 rounded-[var(--radius-md)] bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <span className="font-semibold">Testet:</span> {props.hypothesis}
        </p>
      ) : null}
      {props.error ? <p className="mb-3 rounded-[var(--radius-md)] bg-rose-50 px-3 py-2 text-sm text-rose-800">Nicht veröffentlicht: {props.error}</p> : null}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.min(18, Math.max(6, lines.length + 1))}
        className="w-full rounded-[var(--radius-md)] border border-[color:var(--border)] p-3 text-[15px] leading-relaxed"
        aria-label="Post-Text"
      />
      <p className={cn("mt-1 text-right text-xs", text.length > COUNT_LIMIT ? "text-rose-700" : "text-[color:var(--muted)]")}>
        {text.length} / {COUNT_LIMIT} Zeichen · vor „mehr anzeigen“: {lines.slice(0, 2).join(" ").slice(0, 60)}…
      </p>
      <div className="mt-3">
        <p className="mb-1.5 text-xs font-semibold text-[color:var(--muted)]">Bild auswählen (eins wird gepostet)</p>
        <div className="flex flex-wrap items-start gap-4">
          {/* Große Vorschau des gewählten Bilds */}
          <div className="h-40 w-40 shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-sunken)]" data-li-preview>
            {image === "keins" ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-xs text-[color:var(--muted)]">
                <ImageOff className="h-6 w-6" /> Ohne Bild
              </div>
            ) : (
              <img src={image === "grafik" ? graphicSrc : `/api/linkedin/foto/${image}`} alt="Gewähltes Bild" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="Bild">
            {[
              { key: "keins", label: "Ohne", node: <ImageOff className="h-5 w-5" /> },
              ...(props.aiPhotoId
                ? [{ key: props.aiPhotoId, label: "KI-Bild", node: <img src={`/api/linkedin/foto/${props.aiPhotoId}`} alt="KI-Bild" className="h-full w-full object-cover" loading="lazy" /> }]
                : []),
              ...(graphic.trim() ? [{ key: "grafik", label: "Grafik", node: <img src={graphicSrc} alt="Text-Grafik" className="h-full w-full object-cover" loading="lazy" /> }] : []),
              ...props.photos.map((f) => ({ key: f.id, label: "Foto", node: <img src={`/api/linkedin/foto/${f.id}`} alt={f.description} className="h-full w-full object-cover" loading="lazy" /> })),
            ].map((o) => (
              <button key={o.key} type="button" onClick={() => setImage(o.key)} aria-pressed={image === o.key} className="flex shrink-0 flex-col items-center gap-1 text-xs text-[color:var(--muted)]">
                <span className={cn(tile(image === o.key), "flex items-center justify-center")}>{o.node}</span>
                <span className={image === o.key ? "font-semibold text-[color:var(--brand)]" : undefined}>{o.label}</span>
              </button>
            ))}
          </div>
        </div>
        {image === "grafik" || !graphic.trim() ? (
          <label className="mt-2 block text-xs text-[color:var(--muted)]">
            Aussage der Grafik
            <input value={graphic} onChange={(e) => setGraphic(e.target.value.slice(0, 120))} className="mt-1 w-full rounded border border-[color:var(--border)] px-2 py-1.5 text-sm text-[color:var(--foreground)]" placeholder="z. B. 100 Leads → 12 Abschlüsse" />
          </label>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" size="md" icon={pending ? Loader2 : Check} disabled={pending} onClick={() =>
            run(async () => {
              await saveFirst();
              return approveAction(props.id, text, image);
            })
          }
          data-li-approve>
          Freigeben
        </Button>
        <Button
          size="md"
          icon={Send}
          disabled={pending || !props.connected}
          title={props.connected ? undefined : "Erst LinkedIn verbinden"}
          onClick={() => {
            if (confirm("Jetzt sofort auf LinkedIn veröffentlichen?"))
              run(async () => {
                await saveFirst();
                return approveAction(props.id, text, image, true);
              });
          }}
        >
          Jetzt posten
        </Button>
        <Button size="md" variant="ghost" disabled={pending} onClick={() => run(() => saveDraftAction(props.id, text, image, graphic))}>
          Speichern
        </Button>
        <Button size="md" variant="ghost" icon={Trash2} disabled={pending} onClick={() => run(() => discardAction(props.id))}>
          Verwerfen
        </Button>
        <button type="button" className="ml-auto text-sm font-medium text-[color:var(--brand)] hover:underline" onClick={() => navigator.clipboard?.writeText(text)}>
          Text kopieren
        </button>
      </div>
      <div className="mt-2">
        <Note res={res} />
      </div>
    </article>
  );
}

export function UnapproveButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      icon={Undo2}
      disabled={pending}
      onClick={() =>
        start(async () => {
          await unapproveAction(id);
          router.refresh();
        })
      }
    >
      Zurücknehmen
    </Button>
  );
}

export function GenerateButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [res, setRes] = useState<LiResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="secondary"
        size="md"
        icon={pending ? Loader2 : Sparkles}
        disabled={pending || disabled}
        onClick={() =>
          start(async () => {
            setRes(await generateNowAction());
            router.refresh();
          })
        }
      >
        {pending ? "Schreibe Entwürfe … (ca. 1–2 Min.)" : "Jetzt Entwürfe schreiben"}
      </Button>
      <Note res={res} />
    </div>
  );
}

export function SettingsForm(props: {
  postsPerDay: number;
  slots: string;
  weekdays: boolean;
  autoDrafts: boolean;
  draftHour: number;
  about: string;
  icp: string;
  icpKeywords: string;
  trustNotes: string;
}) {
  const [res, action, pending] = useActionState(saveSettingsAction, {});
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="text-sm font-semibold">Zielgruppe (für sie schreibt die KI)</span>
        <textarea name="icp" defaultValue={props.icp} rows={4} className="mt-1 w-full rounded-[var(--radius-md)] border border-[color:var(--border)] p-3 text-sm" />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">Über mich</span>
        <span className="block text-xs text-[color:var(--muted)]">Wer du bist, was du erlebt hast, deine Haltung, Tonfall (Du/Sie). Nur was hier steht, darf die KI als Fakt verwenden.</span>
        <textarea name="about" defaultValue={props.about} rows={6} className="mt-1 w-full rounded-[var(--radius-md)] border border-[color:var(--border)] p-3 text-sm" placeholder="z. B. Gründer von performancegrowth, vorher … Ich schreibe per Du, direkt, ohne Floskeln …" />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">Trust-Material</span>
        <span className="block text-xs text-[color:var(--muted)]">
          Echte Kunden-Cases, Ergebnisse, Kundenstimmen. Nur was hier steht, darf die KI als Case oder Zitat verwenden. Namen nur, wenn du sie ausdrücklich freigibst (z. B. „Name darf genannt werden“). Zahlen aus der Software (Leads, Termine, Reaktionszeit, NPS) kommen automatisch dazu.
        </span>
        <textarea name="trustNotes" defaultValue={props.trustNotes} rows={6} className="mt-1 w-full rounded-[var(--radius-md)] border border-[color:var(--border)] p-3 text-sm" placeholder="z. B. Allianz-Agentur, Tierkrankenversicherung Katze: 100 Leads → 12 Abschlüsse → 4.300 € Nettoprämie, Provision knapp 2.500 € (WhatsApp vom Kunden liegt als Screenshot in den Fotos)." />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">Zielgruppe erkennen an (Branche/Beruf in den LinkedIn-Zuschauerdaten)</span>
        <input name="icpKeywords" defaultValue={props.icpKeywords} className="mt-1 w-full rounded-[var(--radius-md)] border border-[color:var(--border)] px-3 py-2 text-sm" />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="text-sm font-semibold">Posts pro Tag</span>
          <select name="postsPerDay" defaultValue={props.postsPerDay} className="mt-1 w-full rounded-[var(--radius-md)] border border-[color:var(--border)] px-3 py-2 text-sm">
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-semibold">Uhrzeiten</span>
          <input name="slots" defaultValue={props.slots} className="mt-1 w-full rounded-[var(--radius-md)] border border-[color:var(--border)] px-3 py-2 text-sm" placeholder="07:30, 09:30, 12:00, 15:00, 18:00" />
        </label>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="weekdays" defaultChecked={props.weekdays} /> Nur Montag bis Freitag
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="autoDrafts" defaultChecked={props.autoDrafts} /> Entwürfe automatisch schreiben, ab
          <select name="draftHour" defaultValue={props.draftHour} className="rounded border border-[color:var(--border)] px-1 py-0.5">
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {h}:00
              </option>
            ))}
          </select>
          Uhr für den nächsten Tag
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" size="md" disabled={pending}>
          Speichern
        </Button>
        <Note res={res} />
      </div>
    </form>
  );
}

export function PhotoUpload() {
  const [res, action, pending] = useActionState(uploadPhotosAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      {/* Ein Knopf: Auswahl öffnet sich, nach der Auswahl wird sofort hochgeladen */}
      <label className={cn("inline-flex h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-4 text-sm font-semibold text-white", pending && "pointer-events-none opacity-60")}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {pending ? "Lade hoch und beschreibe …" : "Fotos hochladen"}
        <input
          type="file"
          name="photos"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="sr-only"
          onChange={(e) => e.currentTarget.files?.length && e.currentTarget.form?.requestSubmit()}
        />
      </label>
      <span className="text-xs text-[color:var(--muted)]">Mehrere auf einmal möglich (JPG, PNG, WebP).</span>
      <Note res={res} />
    </form>
  );
}

export function PhotoItem({ id, description, used }: { id: string; description: string; used: number }) {
  const router = useRouter();
  const [value, setValue] = useState(description);
  const [pending, start] = useTransition();
  return (
    <li className="overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white">
      <img src={`/api/linkedin/foto/${id}`} alt={description} className="aspect-square w-full object-cover" loading="lazy" />
      <div className="space-y-2 p-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => value !== description && start(async () => void (await updatePhotoAction(id, value)))}
          rows={3}
          className="w-full rounded border border-[color:var(--border)] p-1.5 text-xs"
          aria-label="Beschreibung"
        />
        <div className="flex items-center justify-between text-xs text-[color:var(--muted)]">
          <span>{used ? `${used}× genutzt` : "noch nicht genutzt"}</span>
          <button
            type="button"
            disabled={pending}
            className="text-rose-700 hover:underline"
            onClick={() => {
              if (confirm("Foto löschen? Geplante Posts gehen dann ohne Foto raus."))
                start(async () => {
                  await deletePhotoAction(id);
                  router.refresh();
                });
            }}
          >
            Löschen
          </button>
        </div>
      </div>
    </li>
  );
}

export function ImportForm() {
  const [res, action, pending] = useActionState(importAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      {/* Ein Knopf: Auswahl öffnet sich, nach der Auswahl wird die Datei sofort eingelesen */}
      <label className={cn("inline-flex h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-4 text-sm font-semibold text-white", pending && "pointer-events-none opacity-60")}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {pending ? "Lese Datei …" : "Export-Datei hochladen"}
        <input
          type="file"
          name="file"
          accept=".xlsx,.csv"
          className="sr-only"
          onChange={(e) => e.currentTarget.files?.length && e.currentTarget.form?.requestSubmit()}
        />
      </label>
      <span className="text-xs text-[color:var(--muted)]">Excel-Datei (.xlsx) aus LinkedIn, wie sie heruntergeladen wurde.</span>
      <Note res={res} />
    </form>
  );
}

/** Ergebnis-Zeile: Text älterer Posts ergänzen, Zahlen von Hand nachtragen. */
export function ResultEdit({ id, imported, hasText, impressions, icpPercent }: { id: string; imported: boolean; hasText: boolean; impressions: number | null; icpPercent: number | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [imp, setImp] = useState(impressions?.toString() ?? "");
  const [icp, setIcp] = useState(icpPercent?.toString() ?? "");
  const [res, setRes] = useState<LiResult | null>(null);
  const [pending, start] = useTransition();
  if (!open)
    return (
      <button type="button" className="text-xs font-medium text-[color:var(--brand)] hover:underline" onClick={() => setOpen(true)}>
        {imported && !hasText ? "Text ergänzen" : "Zahlen ändern"}
      </button>
    );
  return (
    <div className="mt-2 space-y-2 rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] p-3">
      {imported ? (
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Post-Text einfügen (damit die KI daraus lernt)" className="w-full rounded border border-[color:var(--border)] p-2 text-sm" />
      ) : null}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1">
          Impressionen <input value={imp} onChange={(e) => setImp(e.target.value)} inputMode="numeric" className="w-24 rounded border border-[color:var(--border)] px-2 py-1" />
        </label>
        <label className="flex items-center gap-1">
          Zielgruppe % <input value={icp} onChange={(e) => setIcp(e.target.value)} inputMode="decimal" className="w-16 rounded border border-[color:var(--border)] px-2 py-1" />
        </label>
        <Button
          variant="primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const n = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
              if (imported && text.trim()) await setImportedTextAction(id, text);
              const r = await setMetricsAction(id, n(imp), n(icp));
              setRes(r);
              if (r.ok) setOpen(false);
              router.refresh();
            })
          }
        >
          Speichern
        </Button>
      </div>
      <Note res={res} />
    </div>
  );
}

export function DisconnectButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      disabled={pending}
      onClick={() => {
        if (confirm("LinkedIn trennen? Geplante Posts gehen dann nicht raus."))
          start(async () => {
            await disconnectAction();
            router.refresh();
          });
      }}
    >
      Trennen
    </Button>
  );
}
