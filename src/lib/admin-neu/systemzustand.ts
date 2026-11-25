// Systemzustand (Admin v2, Paket A5 „Zusammenlegen“, zuerst): alle technischen Prüfungen, die bisher über Status,
// Anbindungen, Rechnungsangaben, Kosten & Bank, Qualität und Werbekonten verteilt waren, als eine Liste unter
// Werkzeuge › Systemzustand. Jede Prüfung: Ampel, ein Satz, ein Knopf zur Stelle, an der man es behebt.
// Reine Bewertung ohne Datenbank (Tests: tests/unit/admin-neu-systemzustand.test.ts), Laden in systemzustand-server.ts.

export type Ampel = "ok" | "warnung" | "fehler" | "aus";
export type Pruefung = { key: string; titel: string; ampel: Ampel; text: string; href: string; knopf: string };

const RANG: Record<Ampel, number> = { fehler: 0, warnung: 1, aus: 2, ok: 3 };

/** Fehler zuerst, dann Warnungen, „nicht eingerichtet“, zuletzt alles, was läuft (Reihenfolge sonst wie geliefert). */
export function sortiere(p: Pruefung[]): Pruefung[] {
  return p
    .map((x, i) => ({ x, i }))
    .sort((a, b) => RANG[a.x.ampel] - RANG[b.x.ampel] || a.i - b.i)
    .map((y) => y.x);
}

/** Zusammenfassung für den Kopf: Zahl der Probleme (Fehler und Warnungen). */
export function zusammenfassung(p: Pruefung[]): { probleme: number; text: string } {
  const probleme = p.filter((x) => x.ampel === "fehler" || x.ampel === "warnung").length;
  return { probleme, text: probleme ? `${probleme} ${probleme === 1 ? "Prüfung braucht" : "Prüfungen brauchen"} Sie` : "Alles läuft" };
}

const TAG = 86_400_000;

/** Heartbeat: zu alt oder letzter Lauf mit Fehler. Ohne Heartbeat: noch nie gelaufen (Warnung). */
export function herzschlag(hb: { at: Date; ok: boolean; note: string | null } | undefined, maxAlterMin: number, now: Date): { ampel: Ampel; text: string } {
  if (!hb) return { ampel: "warnung", text: "Noch kein Lauf gemeldet." };
  const min = (now.getTime() - hb.at.getTime()) / 60000;
  if (min > maxAlterMin) return { ampel: "fehler", text: `Letzter Lauf vor ${min < 120 ? `${Math.round(min)} Min.` : `${Math.round(min / 60)} Std.`}` };
  if (!hb.ok) return { ampel: "fehler", text: hb.note ? `Fehler: ${hb.note.slice(0, 120)}` : "Letzter Lauf mit Fehler." };
  return { ampel: "ok", text: `Läuft, zuletzt vor ${Math.max(1, Math.round(min))} Min.` };
}

/** Zugang mit Ablaufdatum (Bank, LinkedIn): fehlt, gestört, bald ablaufend oder in Ordnung. */
export function zugang(z: { status: string; bis: Date | null; fehler?: string | null } | null, warnTage: number, now: Date, okStatus = ["ok", "active"]): { ampel: Ampel; text: string } {
  if (!z) return { ampel: "aus", text: "Nicht verbunden." };
  if (z.bis && z.bis.getTime() <= now.getTime()) return { ampel: "fehler", text: "Zugang abgelaufen, bitte neu verbinden." };
  if (!okStatus.includes(z.status)) return { ampel: "fehler", text: z.fehler ? `Gestört: ${z.fehler.slice(0, 120)}` : "Verbindung gestört." };
  const tage = z.bis ? Math.floor((z.bis.getTime() - now.getTime()) / TAG) : null;
  if (tage != null && tage < warnTage) return { ampel: "warnung", text: `Läuft in ${tage} ${tage === 1 ? "Tag" : "Tagen"} ab, bitte erneuern.` };
  return { ampel: "ok", text: tage != null ? `Verbunden, noch ${tage} Tage gültig.` : "Verbunden." };
}

/** Mail-Eingang bei Resend (lib/mail/resend-empfang.ts): Leserecht des Schlüssels laut letztem Abruf. */
export function mailEingang(hb: { ok: boolean; note: string | null } | undefined, schluessel: string | null): { ampel: Ampel; text: string } {
  if (!schluessel) return { ampel: "aus", text: "Kein Resend-Schlüssel gesetzt." };
  if (hb && !hb.ok) return { ampel: "fehler", text: hb.note ?? "Schlüssel ohne Leserecht." };
  if (!hb) return { ampel: "ok", text: `Noch kein Abruf gemeldet (Schlüssel: ${schluessel}).` };
  return { ampel: "ok", text: `Liest empfangene Mails (Schlüssel: ${schluessel}).` };
}

/** Werbekosten-Abgleich (AdSpendDaily): neuester Tag höchstens 2 Tage alt. */
export function werbekosten(neuester: Date | null, now: Date): { ampel: Ampel; text: string } {
  if (!neuester) return { ampel: "warnung", text: "Noch keine Werte: erste Zahlen nach dem nächsten Abgleich (täglich früh morgens)." };
  const tage = Math.floor((now.getTime() - neuester.getTime()) / TAG);
  return tage > 2 ? { ampel: "warnung", text: `Neueste Kosten vom ${neuester.toLocaleDateString("de-DE")}, Abgleich prüfen.` } : { ampel: "ok", text: "Kosten je Anzeige sind aktuell." };
}

/** Zustellfehler WhatsApp (14 Tage): ab 1 Warnung, ab 20 Fehler. */
export function zustellung(fehler: number): { ampel: Ampel; text: string } {
  if (!fehler) return { ampel: "ok", text: "Keine Zustellfehler in 14 Tagen." };
  return { ampel: fehler >= 20 ? "fehler" : "warnung", text: `${fehler} ${fehler === 1 ? "Nachricht" : "Nachrichten"} in 14 Tagen nicht zugestellt.` };
}

/** Google-Kontingent für „Kontakte anreichern“: ab 90 % Warnung, voll = Fehler. */
export function kontingent(genutzt: number, limit: number, schluessel: boolean): { ampel: Ampel; text: string } {
  if (!schluessel) return { ampel: "aus", text: "Google-Schlüssel fehlt, Anreichern ist aus." };
  if (limit > 0 && genutzt >= limit) return { ampel: "fehler", text: `Heute aufgebraucht (${genutzt} von ${limit}).` };
  if (limit > 0 && genutzt >= limit * 0.9) return { ampel: "warnung", text: `Fast aufgebraucht: ${genutzt} von ${limit} heute.` };
  return { ampel: "ok", text: `${genutzt} von ${limit} heute genutzt.` };
}
