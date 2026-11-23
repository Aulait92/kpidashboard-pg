"use client";

// Brücke zur App-Store-App (Capacitor-Hülle, Ordner mobile/). Alle Funktionen
// sind ohne App harmlos (No-op bzw. false): die Web-App lädt keine Capacitor-
// Pakete, sondern nutzt die von der App eingespeisten Plugins unter
// window.Capacitor.Plugins.

type Listener = { remove: () => Promise<void> | void };
type PluginApi = Record<string, (...args: never[]) => Promise<unknown>> & {
  addListener?: (event: string, cb: (data: never) => void) => Promise<Listener> | Listener;
};
type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, PluginApi | undefined>;
};

function cap(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor ?? null;
}

/** Läuft die Seite in der App (nicht im Browser)? */
export function isNativeApp(): boolean {
  const c = cap();
  if (c?.isNativePlatform?.()) return true;
  return typeof navigator !== "undefined" && /performancegrowthApp\//.test(navigator.userAgent);
}

export function nativePlatform(): "ios" | "android" | null {
  const p = cap()?.getPlatform?.();
  return p === "ios" || p === "android" ? p : null;
}

function plugin(name: string): PluginApi | null {
  return (isNativeApp() && cap()?.Plugins?.[name]) || null;
}

async function call(name: string, method: string, arg?: unknown): Promise<unknown> {
  const p = plugin(name);
  const fn = p?.[method] as ((a?: unknown) => Promise<unknown>) | undefined;
  if (!fn) return undefined;
  try {
    return await fn.call(p, arg);
  } catch {
    return undefined;
  }
}

/** Kurzes haptisches Feedback – siehe lib/haptics.ts (semantische Funktionen). */
export { haptic } from "@/lib/haptics";

/** Natives Teilen-Menü; false = nicht verfügbar (dann Web-Fallback nutzen). */
export async function nativeShare(opts: { title?: string; text?: string; url?: string }): Promise<boolean> {
  if (!plugin("Share")) return false;
  await call("Share", "share", { ...opts, dialogTitle: opts.title });
  return true;
}

/** Zähler am App-Symbol setzen (0 = ausblenden). */
export function setAppBadge(count: number): void {
  if (!isNativeApp()) return;
  void call("Badge", count > 0 ? "set" : "clear", count > 0 ? { count } : undefined);
}

/** URL im System-Browser öffnen (In-App-Safari bzw. Chrome Custom Tab). */
export async function openInSystemBrowser(url: string): Promise<void> {
  if (plugin("Browser")) await call("Browser", "open", { url, presentationStyle: "popover" });
  else window.open(url, "_blank", "noopener");
}

// ─── Push ──────────────────────────────────────────────────────────────

const TOKEN_KEY = "pg-native-push-token";

export type NativePushState = "granted" | "denied" | "prompt" | "unsupported";

export async function nativePushPermission(): Promise<NativePushState> {
  if (!plugin("PushNotifications")) return "unsupported";
  const r = (await call("PushNotifications", "checkPermissions")) as { receive?: string } | undefined;
  const s = r?.receive;
  return s === "granted" ? "granted" : s === "denied" ? "denied" : s ? "prompt" : "unsupported";
}

let listenersReady = false;

/** Listener einmalig: Token an den Server, Tippen auf Benachrichtigung → Seite öffnen. */
export async function initNativePushListeners(navigate: (url: string) => void): Promise<void> {
  const p = plugin("PushNotifications");
  if (!p?.addListener || listenersReady) return;
  listenersReady = true;
  await p.addListener("registration", ((t: { value: string }) => {
    try {
      localStorage.setItem(TOKEN_KEY, t.value);
    } catch {
      /* egal */
    }
    void fetch("/api/app/device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: t.value, platform: nativePlatform(), appVersion: navigator.userAgent.match(/performancegrowthApp\/([\d.]+)/)?.[1] ?? null }),
    }).catch(() => {});
  }) as never);
  await p.addListener("pushNotificationActionPerformed", ((a: { notification?: { data?: { url?: string } } }) => {
    const url = a.notification?.data?.url;
    if (url && url.startsWith("/")) navigate(url);
  }) as never);
  if (nativePlatform() === "android") {
    await call("PushNotifications", "createChannel", {
      id: "leads",
      name: "Neue Leads und Aufgaben",
      description: "Neue Leads, Antworten und Termine",
      importance: 5,
      visibility: 1,
      vibration: true,
    });
  }
}

/** Erlaubnis anfragen (falls nötig) und beim Betriebssystem anmelden. */
export async function enableNativePush(): Promise<NativePushState> {
  let state = await nativePushPermission();
  if (state === "prompt") {
    const r = (await call("PushNotifications", "requestPermissions")) as { receive?: string } | undefined;
    state = r?.receive === "granted" ? "granted" : r?.receive === "denied" ? "denied" : "prompt";
  }
  if (state === "granted") await call("PushNotifications", "register");
  return state;
}

/** Beim Abmelden: Gerät vom Login lösen (keepalive, damit es auch beim Seitenwechsel ankommt). */
export function forgetNativeDevice(): void {
  if (!isNativeApp()) return;
  let token: string | null = null;
  try {
    token = localStorage.getItem(TOKEN_KEY);
  } catch {
    token = null;
  }
  void fetch("/api/app/device", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(token ? { token } : {}),
    keepalive: true,
  }).catch(() => {});
  setAppBadge(0);
}

// ─── Anmeldung mit Google/Microsoft in der App ─────────────────────────
// Google verbietet OAuth in eingebetteten Ansichten. Darum: Start im System-Browser
// (/api/auth/<anbieter>/start?app=1), der Callback leitet mit Einmal-Code auf
// performancegrowth://login?code=… zurück, die App fängt das ab (App-Plugin
// „appUrlOpen“), schließt den Browser und löst den Code in der App-Ansicht ein.

const SSO_LOGIN_FEHLER = new Set(["abgebrochen", "abgelaufen", "kein-konto", "fehlgeschlagen", "admin-freigabe", "einstellung"]);

/** Ziel in der App-Ansicht für eine performancegrowth://login-Adresse; null = nicht unsere. */
export function appLoginTarget(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "performancegrowth:" || u.hostname !== "login") return null;
  const code = u.searchParams.get("code");
  if (code) return /^[A-Za-z0-9_-]{20,100}$/.test(code) ? `/api/app/login-handoff?code=${encodeURIComponent(code)}` : "/login?fehler=abgelaufen";
  const fehler = u.searchParams.get("fehler") ?? "";
  return `/login?fehler=${SSO_LOGIN_FEHLER.has(fehler) ? fehler : "fehlgeschlagen"}`;
}

/** Google/Microsoft-Anmeldung aus der App im System-Browser starten. */
export function startSsoInSystemBrowser(provider: "google" | "microsoft", next: string): void {
  const u = new URL(`/api/auth/${provider}/start`, window.location.origin);
  u.searchParams.set("app", "1");
  if (next) u.searchParams.set("next", next);
  void openInSystemBrowser(u.toString());
}

let appLoginReady = false;

/** Rücksprung aus dem System-Browser abfangen (einmalig): Browser schließen, Code einlösen. */
export function initAppLoginListener(): void {
  const app = plugin("App");
  if (!app?.addListener || appLoginReady) return;
  appLoginReady = true;
  void app.addListener("appUrlOpen", ((d: { url?: string }) => {
    const target = d?.url ? appLoginTarget(d.url) : null;
    if (!target) return;
    void call("Browser", "close");
    // Volle Navigation (nicht router.push): die Route setzt das Sitzungs-Cookie und leitet weiter.
    window.location.assign(new URL(target, window.location.origin).toString());
  }) as never);
}

/** Pfade, die Google/Microsoft-Anmeldung auslösen und in der App nicht gehen. */
export function needsSystemBrowser(href: string): boolean {
  try {
    const u = new URL(href, window.location.origin);
    if (u.origin !== window.location.origin) return false;
    return /^\/api\/(google|microsoft)\/connect\b/.test(u.pathname);
  } catch {
    return false;
  }
}
