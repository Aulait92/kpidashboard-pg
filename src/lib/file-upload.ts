// Datei-Auswahl (Ole, 15.11.2026): reine Helfer für components/ui/file-drop.tsx, ohne Browser-APIs,
// damit sie im Unit-Test laufen. Die Prüfung im Browser ist nur Komfort; der Server prüft weiterhin selbst.

export const MB = 1024 * 1024;

/** Dateigröße für Menschen: „850 KB“, „1,5 MB“. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes >= MB) return `${(bytes / MB).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Die einzelnen Einträge eines accept-Attributs (".pdf,application/pdf" → [".pdf", "application/pdf"]). */
export function acceptTokens(accept: string | undefined | null): string[] {
  return (accept ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  csv: "text/csv",
  txt: "text/plain",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const MIME_LABEL: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/webp": "WebP",
  "image/gif": "GIF",
  "image/*": "Bilder",
  "text/csv": "CSV",
  "text/plain": "TXT",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
};

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

/** Passt die Datei zum accept-Attribut? Endung („.pdf“), genauer Typ („application/pdf“) oder Gruppe („image/*“). */
export function matchesAccept(file: { name: string; type?: string }, accept: string | undefined | null): boolean {
  const tokens = acceptTokens(accept);
  if (!tokens.length) return true;
  const ext = extOf(file.name);
  // Manche Browser liefern für CSV/XLSX keinen Typ: dann aus der Endung ableiten
  const type = (file.type || EXT_MIME[ext] || "").toLowerCase();
  return tokens.some((t) => {
    if (t.startsWith(".")) return ext !== "" && `.${ext}` === t;
    if (t.endsWith("/*")) return type.startsWith(t.slice(0, -1));
    return type === t;
  });
}

/** Lesbare Liste der erlaubten Formate („PDF“, „XLSX, CSV“). */
export function acceptLabel(accept: string | undefined | null): string {
  const out: string[] = [];
  for (const t of acceptTokens(accept)) {
    const label = t.startsWith(".") ? (t === ".jpeg" || t === ".jpg" ? "JPG" : t.slice(1).toUpperCase()) : MIME_LABEL[t];
    if (label && !out.includes(label)) out.push(label);
  }
  return out.join(", ");
}

export type FileRules = {
  accept?: string | null;
  /** Höchstgröße je Datei in Bytes */
  maxBytes?: number | null;
  /** Anzeige der Höchstgröße, falls sie nicht aus maxBytes folgen soll (z. B. „1,5 MB“ bei 1.500.000 Bytes) */
  maxLabel?: string | null;
};

/** Hinweis unter der Auswahl: „PDF, höchstens 5 MB“. */
export function fileHint(rules: FileRules): string {
  const parts: string[] = [];
  const formats = acceptLabel(rules.accept);
  if (formats) parts.push(formats);
  if (rules.maxBytes) parts.push(`höchstens ${rules.maxLabel ?? formatBytes(rules.maxBytes)}`);
  return parts.join(", ");
}

/** Fehlermeldung für eine Datei oder null, wenn sie passt. */
export function validateFile(file: { name: string; type?: string; size: number }, rules: FileRules): string | null {
  if (!matchesAccept(file, rules.accept)) {
    const formats = acceptLabel(rules.accept);
    return formats ? `„${file.name}“ hat ein anderes Format. Möglich: ${formats}.` : `„${file.name}“ hat ein Format, das hier nicht geht.`;
  }
  if (file.size <= 0) return `„${file.name}“ ist leer.`;
  if (rules.maxBytes && file.size > rules.maxBytes) {
    return `„${file.name}“ ist zu groß (${formatBytes(file.size)}). Höchstens ${rules.maxLabel ?? formatBytes(rules.maxBytes)}.`;
  }
  return null;
}

/** Mehrere Dateien prüfen: passende behalten, Fehler sammeln. Ohne multiple ist nur eine Datei erlaubt. */
export function validateFiles<F extends { name: string; type?: string; size: number }>(
  files: F[],
  rules: FileRules & { multiple?: boolean; maxFiles?: number | null },
): { ok: F[]; errors: string[] } {
  if (!rules.multiple && files.length > 1) return { ok: [], errors: ["Bitte nur eine Datei auswählen."] };
  const ok: F[] = [];
  const errors: string[] = [];
  for (const f of files) {
    const e = validateFile(f, rules);
    if (e) errors.push(e);
    else ok.push(f);
  }
  if (rules.maxFiles && ok.length > rules.maxFiles) {
    errors.push(`Höchstens ${rules.maxFiles} Dateien auf einmal.`);
    ok.length = rules.maxFiles;
  }
  return { ok, errors };
}
