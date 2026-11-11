"use client";

// Haptik mit Bedeutung statt Rohwerten. In der App-Store-App über das native
// Haptics-Plugin (iOS Taptic Engine / Android Vibrator), im Web No-op – außer
// kurze Vibration für Erfolg/Warnung/Fehler auf Android-Browsern.
//
// Wo was (Stand der Einbindung):
//   tap / selection   – Tabs, untere Navigation, Chips, Schalter, Segmente, Auswahl
//   impact("light")   – Pull-to-refresh ausgelöst, „Rückgängig“, Kontextmenü öffnen
//   impact("medium")  – Anruf starten, Long-Press
//   success           – Erledigt/Gespeichert (Erfolgs-Hinweis)
//   warning           – Löschen/gefährliche Aktion bestätigen
//   error             – Fehler-Hinweis (Formular/Server)
//   notification      – neuer Lead / Live-Update im Vordergrund

type HapticsPlugin = {
  impact?: (o: { style: "LIGHT" | "MEDIUM" | "HEAVY" }) => Promise<void>;
  notification?: (o: { type: "SUCCESS" | "WARNING" | "ERROR" }) => Promise<void>;
  selectionStart?: () => Promise<void>;
  selectionChanged?: () => Promise<void>;
  selectionEnd?: () => Promise<void>;
};

function native(): HapticsPlugin | null {
  if (typeof window === "undefined") return null;
  const c = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { Haptics?: HapticsPlugin } } }).Capacitor;
  return c?.isNativePlatform?.() ? (c.Plugins?.Haptics ?? null) : null;
}

function webVibrate(pattern: number | number[]) {
  if (typeof navigator === "undefined" || !/Android/i.test(navigator.userAgent)) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* nicht verfügbar */
  }
}

// Gleiche Rückmeldung nicht doppelt in kurzer Folge (z. B. Klick + Toast)
let last = { kind: "", at: 0 };
function debounced(kind: string, ms = 120): boolean {
  const now = Date.now();
  if (last.kind === kind && now - last.at < ms) return true;
  last = { kind, at: now };
  return false;
}

export function impact(style: "light" | "medium" | "heavy" = "light"): void {
  if (debounced(`impact-${style}`)) return;
  void native()?.impact?.({ style: style.toUpperCase() as "LIGHT" | "MEDIUM" | "HEAVY" }).catch(() => {});
}

/** Leichter Auswahl-Klick (Tabs, Chips, Schalter). */
export function selection(): void {
  if (debounced("selection", 60)) return;
  const h = native();
  if (!h) return;
  if (h.selectionChanged) {
    void h.selectionStart?.().catch(() => {});
    void h.selectionChanged().catch(() => {});
    void h.selectionEnd?.().catch(() => {});
  } else void h.impact?.({ style: "LIGHT" }).catch(() => {});
}

/** Synonym für selection – kurzer, leichter Tipp. */
export const tap = selection;
export const selectionChanged = selection;

export function success(): void {
  if (debounced("success", 400)) return;
  const h = native();
  if (h) void h.notification?.({ type: "SUCCESS" }).catch(() => {});
  else webVibrate(12);
}

export function warning(): void {
  if (debounced("warning", 400)) return;
  const h = native();
  if (h) void h.notification?.({ type: "WARNING" }).catch(() => {});
  else webVibrate([10, 60, 10]);
}

export function error(): void {
  if (debounced("error", 400)) return;
  const h = native();
  if (h) void h.notification?.({ type: "ERROR" }).catch(() => {});
  else webVibrate([20, 50, 20]);
}

/** Neuer Lead / Live-Update im Vordergrund. */
export function notification(): void {
  if (debounced("notification", 1500)) return;
  const h = native();
  if (h) void h.notification?.({ type: "SUCCESS" }).catch(() => {});
}

export type HapticKind = "tap" | "selection" | "light" | "medium" | "heavy" | "success" | "warning" | "error" | "notification";

export function haptic(kind: HapticKind): void {
  switch (kind) {
    case "tap":
    case "selection":
      return selection();
    case "light":
    case "medium":
    case "heavy":
      return impact(kind);
    case "success":
      return success();
    case "warning":
      return warning();
    case "error":
      return error();
    case "notification":
      return notification();
  }
}

/**
 * Globale Delegation (nur in der App aktiv, von NativeAppBridge installiert):
 * - Elemente mit data-haptic="…" → genau diese Haptik
 * - Schalter, Tabs, Radios, Checkboxen, aria-pressed (Chips/Segmente) → selection
 * - tel:-Links (Anruf starten) → impact medium
 * - gefährliche Knöpfe (data-tone="danger") → warning
 * Normale Links/Seitenwechsel und Scrollen bewusst ohne Haptik.
 */
export function installHapticDelegates(): () => void {
  const onClick = (e: MouseEvent) => {
    const el = (e.target as HTMLElement | null)?.closest?.(
      "[data-haptic],a[href^='tel:'],[role='switch'],[role='tab'],[role='radio'],[role='menuitemradio'],[aria-pressed],input[type='checkbox'],input[type='radio'],[data-tone='danger']",
    ) as HTMLElement | null;
    if (!el || (el as HTMLButtonElement).disabled) return;
    const explicit = el.getAttribute("data-haptic");
    if (explicit) return haptic(explicit as HapticKind);
    if (el.matches("a[href^='tel:']")) return impact("medium");
    if (el.matches("[data-tone='danger']")) return warning();
    return selection();
  };
  const onChange = (e: Event) => {
    const el = e.target as HTMLElement | null;
    if (el?.matches?.("select")) selection();
  };
  // Long-Press (Kontextmenü) auf Elementen mit data-longpress
  const onContext = (e: Event) => {
    if ((e.target as HTMLElement | null)?.closest?.("[data-longpress]")) impact("medium");
  };
  document.addEventListener("click", onClick, true);
  document.addEventListener("change", onChange, true);
  document.addEventListener("contextmenu", onContext, true);
  return () => {
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("change", onChange, true);
    document.removeEventListener("contextmenu", onContext, true);
  };
}
