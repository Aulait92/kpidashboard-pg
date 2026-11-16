"use client";

// Einheitliche Datei-Auswahl (Ole, 15.11.2026): sichtbarer Knopf, Ablegen per Ziehen, Dateiname und Größe,
// „Entfernen“, Prüfung von Format und Größe schon im Browser (der Server prüft weiterhin selbst).
//
// Das echte <input type="file"> bleibt immer an derselben Stelle im DOM (nur optisch versteckt, per Tab
// erreichbar). So geht die Datei bei normalen <form action={…}>-Formularen unter ihrem `name` mit; beim
// Ablegen wird sie per DataTransfer in das Feld gesetzt.
//
// Arten der Nutzung:
// - Formular: `name` setzen, Datei geht beim Absenden mit. Nach dem Zurücksetzen des Formulars (React setzt
//   Formulare nach einer Server Action zurück) ist die Auswahl leer.
// - autoSubmit: nach der Auswahl wird das Formular sofort abgeschickt.
// - instant: Auswahl geht nur an `onFiles` (z. B. Hochladen per fetch) und wird danach geleert; `busy` zeigt das Laden.
// - value: Auswahl liegt beim Aufrufer (`value` + `onFiles`), z. B. wenn die Datei später per FormData.set mitgeht.

import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, FileText, Loader2, Upload, X, type LucideIcon } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { fileHint, formatBytes, validateFiles } from "@/lib/file-upload";
import { cn } from "@/lib/utils";

export type FileDropProps = {
  /** Feldname im Formular (ohne name geht die Datei nicht automatisch mit) */
  name?: string;
  id?: string;
  /** wie beim nativen Feld, z. B. ".pdf,application/pdf" */
  accept?: string;
  /** Höchstgröße je Datei in Bytes */
  maxBytes?: number;
  /** Anzeige der Höchstgröße, falls abweichend von maxBytes (z. B. „1,5 MB“) */
  maxLabel?: string;
  multiple?: boolean;
  maxFiles?: number;
  required?: boolean;
  disabled?: boolean;
  /** Beschriftung des Knopfs, z. B. „PDF auswählen“ */
  label?: string;
  icon?: LucideIcon;
  /** Hinweis unter der Auswahl. Ohne Angabe: Formate und Höchstgröße; null blendet ihn aus. */
  hint?: React.ReactNode;
  /** zone: Ablagefläche mit Knopf; button: nur der Knopf (auch er nimmt abgelegte Dateien an) */
  variant?: "zone" | "button";
  buttonVariant?: "primary" | "secondary";
  size?: "sm" | "md";
  /** Wird mit den gültigen Dateien aufgerufen (leer nach „Entfernen“) */
  onFiles?: (files: File[]) => void;
  /** Auswahl liegt beim Aufrufer */
  value?: File[] | null;
  /** Nur an onFiles geben und die Auswahl gleich wieder leeren (Hochladen per fetch) */
  instant?: boolean;
  /** Formular nach der Auswahl sofort abschicken */
  autoSubmit?: boolean;
  /** Lädt gerade (beim Hochladen per fetch); beim Formular kommt das von selbst */
  busy?: boolean;
  pendingLabel?: string;
  /** Erfolgsmeldung des Aufrufers (z. B. „Hochgeladen“) */
  success?: React.ReactNode;
  className?: string;
  /** variant „button“: Knopf füllt die Breite des Elternelements (z. B. am Handy untereinander) */
  buttonClassName?: string;
};

export function FileDrop({
  name,
  id,
  accept,
  maxBytes,
  maxLabel,
  multiple = false,
  maxFiles,
  required,
  disabled = false,
  label,
  icon: Icon = Upload,
  hint,
  variant = "zone",
  buttonVariant = "secondary",
  size = "md",
  onFiles,
  value,
  instant = false,
  autoSubmit = false,
  busy = false,
  pendingLabel,
  success,
  className,
  buttonClassName,
}: FileDropProps) {
  const autoId = useId();
  const inputId = id ?? `file-${autoId}`;
  const hintId = `${inputId}-hint`;
  const errId = `${inputId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);
  const { pending: formPending } = useFormStatus();

  const files = value ?? picked;
  const working = busy || (formPending && (files.length > 0 || autoSubmit));
  const locked = disabled || working;
  const rules = { accept, maxBytes, maxLabel, multiple, maxFiles };
  const hintNode = hint === undefined ? (variant === "zone" ? fileHint(rules) : null) : hint;
  const showFiles = !instant && files.length > 0 && !(variant === "button" && autoSubmit);
  const buttonLabel = label ?? (multiple ? "Dateien auswählen" : "Datei auswählen");

  // React setzt Formulare nach einer Server Action zurück: dann auch die Anzeige leeren.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    // Fehlermeldungen bleiben stehen (z. B. „x.bmp hat ein anderes Format“ nach dem Hochladen der übrigen)
    const onReset = () => setPicked([]);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  /** Dateien in das echte Feld setzen (false, wenn der Browser das nicht kann). */
  function syncInput(list: File[]): boolean {
    const el = inputRef.current;
    if (!el) return true;
    if (!list.length) {
      el.value = "";
      return true;
    }
    try {
      const dt = new DataTransfer();
      list.forEach((f) => dt.items.add(f));
      el.files = dt.files;
      return true;
    } catch {
      return false;
    }
  }

  function take(list: File[], source: "input" | "drop") {
    if (!list.length) {
      // Abbrechen im Dialog leert in manchen Browsern das Feld: bisherige Auswahl behalten
      if (source === "input" && !instant && files.length) syncInput(files);
      return;
    }
    const { ok, errors } = validateFiles(list, rules);
    setError(errors.length ? errors.join(" ") : null);
    if (!ok.length) {
      // Ungültige Auswahl aus dem Dialog: vorherige gültige Auswahl wiederherstellen
      if (source === "input") syncInput(instant ? [] : files);
      return;
    }
    if (instant) {
      syncInput([]);
      onFiles?.(ok);
      return;
    }
    if ((source === "drop" || errors.length) && !syncInput(ok) && name) {
      setError("Ablegen klappt in diesem Browser nicht. Bitte die Datei über den Knopf auswählen.");
      return;
    }
    if (value === undefined) setPicked(ok);
    onFiles?.(ok);
    if (autoSubmit) inputRef.current?.form?.requestSubmit();
  }

  function remove() {
    syncInput([]);
    setPicked([]);
    setError(null);
    onFiles?.([]);
    inputRef.current?.focus();
  }

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const dropHandlers = locked
    ? {}
    : {
        onDragEnter: (e: React.DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          setDragging(true);
        },
        onDragOver: (e: React.DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        },
        onDragLeave: (e: React.DragEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        },
        onDrop: (e: React.DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          setDragging(false);
          take(Array.from(e.dataTransfer.files), "drop");
        },
      };

  const describedBy = [hintNode && !showFiles ? hintId : null, error ? errId : null].filter(Boolean).join(" ") || undefined;
  const ring = "ring-2 ring-[color:var(--brand)] ring-offset-2";

  const pickButton = (text: string, extra?: string, ButtonIcon: LucideIcon = Icon) => (
    <label
      htmlFor={inputId}
      aria-disabled={locked || undefined}
      className={cn(
        buttonClass(buttonVariant, size, "max-w-full cursor-pointer"),
        buttonClassName,
        focused && ring,
        locked && "pointer-events-none opacity-50",
        extra,
      )}
    >
      {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <ButtonIcon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />}
      <span className="truncate">{working && pendingLabel ? pendingLabel : text}</span>
    </label>
  );

  const fileList = (
    <ul className="min-w-0 space-y-1.5" data-file-drop-files>
      {files.map((f, i) => (
        <li key={`${f.name}-${i}`} className="flex min-w-0 items-center gap-2.5">
          <FileText className="h-5 w-5 shrink-0 text-[color:var(--brand)]" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium" title={f.name}>
              {f.name}
            </span>
            <span className="block text-xs text-[color:var(--muted)]">{formatBytes(f.size)}</span>
          </span>
        </li>
      ))}
    </ul>
  );

  const removeButton = (
    <button type="button" onClick={remove} disabled={locked} className={buttonClass("ghost", "sm")} data-file-drop-remove>
      <X className="h-3.5 w-3.5" />
      Entfernen
    </button>
  );

  return (
    <div className={cn("relative min-w-0", className)} data-file-drop>
      <input
        ref={inputRef}
        id={inputId}
        name={name}
        type="file"
        accept={accept}
        multiple={multiple}
        required={required}
        disabled={disabled}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className="sr-only"
        tabIndex={working ? -1 : undefined}
        onFocus={(e) => setFocused(e.currentTarget.matches(":focus-visible"))}
        onBlur={() => setFocused(false)}
        onChange={(e) => take(Array.from(e.currentTarget.files ?? []), "input")}
      />

      {variant === "button" ? (
        <div className={cn("flex min-w-0 flex-wrap items-center gap-2", dragging && "rounded-[var(--radius-sm)] bg-[color:var(--brand-soft)]")} {...dropHandlers}>
          {pickButton(showFiles ? (multiple ? "Andere Dateien" : "Andere Datei") : buttonLabel, dragging ? ring : undefined)}
          {showFiles ? (
            <>
              <span className="min-w-0 max-w-full truncate text-sm text-[color:var(--muted)]" title={files.map((f) => f.name).join(", ")}>
                {files.length === 1 ? `${files[0].name} (${formatBytes(files[0].size)})` : `${files.length} Dateien`}
              </span>
              {working ? null : removeButton}
            </>
          ) : hintNode ? (
            <span id={hintId} className="min-w-0 text-xs text-[color:var(--muted)] [overflow-wrap:anywhere]">
              {hintNode}
            </span>
          ) : null}
        </div>
      ) : (
        <div
          className={cn(
            "rounded-[var(--radius-md)] border border-dashed p-4 transition-colors",
            dragging ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)]" : "border-[color:var(--border-strong)] bg-[color:var(--surface-sunken)]",
            disabled && "opacity-60",
          )}
          {...dropHandlers}
        >
          {showFiles ? (
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">{fileList}</div>
              {working ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-[color:var(--muted)]" role="status">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {pendingLabel ?? "Wird hochgeladen …"}
                </span>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {pickButton(multiple ? "Andere Dateien" : "Andere Datei", undefined, Upload)}
                  {removeButton}
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[color:var(--muted)] ring-1 ring-[color:var(--border)] sm:flex">
                <Upload className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="hidden font-medium sm:block">{dragging ? "Jetzt loslassen" : multiple ? "Dateien hierher ziehen oder auswählen" : "Datei hierher ziehen oder auswählen"}</p>
                {hintNode ? (
                  <p id={hintId} className="text-xs text-[color:var(--muted)] [overflow-wrap:anywhere]">
                    {hintNode}
                  </p>
                ) : null}
              </div>
              {pickButton(buttonLabel, "w-full sm:w-auto")}
            </div>
          )}
        </div>
      )}

      {error ? (
        <p id={errId} role="alert" className="mt-1.5 text-sm font-medium text-rose-700 [overflow-wrap:anywhere]" data-file-drop-error>
          {error}
        </p>
      ) : success && !working ? (
        <p role="status" className="mt-1.5 flex min-w-0 items-center gap-1.5 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{success}</span>
        </p>
      ) : null}
    </div>
  );
}
