// OpenAI-Bildmodelle (Ole, 14.11.2026): „gpt-image-1“ gibt es für unseren Schlüssel nicht mehr
// („The model 'gpt-image-1' does not exist“). Wir probieren die aktuellen Modelle der Reihe nach
// und merken uns das erste, das funktioniert. Fest einstellbar per OPENAI_IMAGE_MODEL.

const DEFAULT_CANDIDATES = ["gpt-image-2.6-sunburst", "gpt-image-2.6-flare", "gpt-image-2.5-sunburst", "gpt-image-2.5-flare", "gpt-image-2", "gpt-image-1.5", "gpt-image-1", "gpt-image-1-mini"];

let working: string | null = null;

export function imageModelCandidates(): string[] {
  const pinned = process.env.OPENAI_IMAGE_MODEL?.trim();
  const list = pinned ? [pinned, ...DEFAULT_CANDIDATES.filter((m) => m !== pinned)] : DEFAULT_CANDIDATES;
  return working ? [working, ...list.filter((m) => m !== working)] : list;
}

/** Fehler „Modell gibt es nicht / kein Zugriff“ → nächstes Modell probieren. */
export function isModelUnavailable(status: number, body: string): boolean {
  if (status === 404) return true;
  if (status !== 400 && status !== 403) return false;
  return /model[^"]*(does not exist|not found|not supported|not available|do not have access|unknown|invalid)|must be verified|model_not_found|invalid_model/i.test(body);
}

export function rememberWorkingModel(model: string) {
  working = model;
}

/** Nur für Tests. */
export function resetWorkingModel() {
  working = null;
}

export type ImageCallResult = { ok: true; model: string; json: unknown } | { ok: false; status: number; body: string };

/**
 * Bild-Anfrage mit Modell-Fallback. `send(model)` macht den eigentlichen Aufruf und gibt
 * Status + Text zurück; bei „Modell nicht verfügbar“ geht es mit dem nächsten Modell weiter.
 */
export async function withImageModel(send: (model: string) => Promise<{ status: number; body: string }>): Promise<ImageCallResult> {
  let last: { status: number; body: string } = { status: 0, body: "kein Modell versucht" };
  for (const model of imageModelCandidates()) {
    const res = await send(model);
    if (res.status >= 200 && res.status < 300) {
      rememberWorkingModel(model);
      try {
        return { ok: true, model, json: JSON.parse(res.body) };
      } catch {
        return { ok: false, status: res.status, body: res.body.slice(0, 300) };
      }
    }
    last = res;
    if (!isModelUnavailable(res.status, res.body)) break;
  }
  return { ok: false, status: last.status, body: last.body.slice(0, 300) };
}
