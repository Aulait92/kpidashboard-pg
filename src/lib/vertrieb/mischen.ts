// Kontakte für Kalt-Mails mischen (Ole, 19.11.2026): „nicht nur an eine Organisation E-Mails zur gleichen Zeit, sondern
// an alle gleichzeitig“. Reißverschluss nach Gesellschaft (DVAG, ERGO, SIGNAL IDUNA, LVM …), innerhalb jeder
// Gesellschaft nach Mail-Domain, dazu Tagesportionen mit Obergrenze je Ziel-Domain, damit die Mail-Gateways der
// Konzerne (dvag.de, ergo.de, *.lvm.de) keine Welle sehen. Rein, ohne Datenbank (Tests, Import, Instantly-Portion).

/** Ziel-Domain für die Obergrenze: die letzten zwei Teile (a-baum.lvm.de → lvm.de, gs.provinzial.com → provinzial.com). */
export function mailDomain(email: string | null | undefined): string {
  const host = String(email ?? "").trim().toLowerCase().split("@").pop() ?? "";
  const teile = host.split(".").filter(Boolean);
  return teile.length > 2 ? teile.slice(-2).join(".") : teile.join(".");
}

/**
 * Gleichmäßig verteilen (gewichteter Reißverschluss): jede Gruppe kommt über die ganze Liste verteilt im Verhältnis
 * ihrer Größe vor, nie zweimal hintereinander, solange eine andere Gruppe noch Einträge hat. Reihenfolge innerhalb
 * einer Gruppe bleibt. Für wenige Gruppen gedacht (Gesellschaften); viele Gruppen: verteilenNachGroesse.
 */
export function reissverschluss<T>(items: readonly T[], gruppe: (t: T) => string): T[] {
  const gruppen = new Map<string, T[]>();
  for (const t of items) {
    const g = gruppe(t);
    const liste = gruppen.get(g);
    if (liste) liste.push(t);
    else gruppen.set(g, [t]);
  }
  type Slot = { liste: T[]; pos: number; gewicht: number; stand: number };
  const g: Slot[] = [...gruppen.values()].map((liste) => ({ liste, pos: 0, gewicht: liste.length, stand: 0 }));
  const out: T[] = [];
  let vorher: Slot | null = null;
  let summe = items.length;
  while (out.length < items.length) {
    // Smooth Weighted Round Robin: jede offene Gruppe sammelt ihr Gewicht, die mit dem höchsten Stand ist dran
    let beste: Slot | null = null;
    let ersatz: Slot | null = null;
    for (const x of g) {
      if (x.pos >= x.liste.length) continue;
      x.stand += x.gewicht;
      if (x === vorher) {
        ersatz = x;
        continue;
      }
      if (!beste || x.stand > beste.stand) beste = x;
    }
    const wahl: Slot = (beste ?? ersatz)!;
    wahl.stand -= summe;
    out.push(wahl.liste[wahl.pos++]);
    if (wahl.pos >= wahl.liste.length) summe -= wahl.gewicht;
    vorher = wahl;
  }
  return out;
}

/**
 * Viele Gruppen (Mail-Domains): immer die Gruppe mit den meisten offenen Einträgen, aber nie die vorige, solange es
 * eine andere gibt. Heap, damit auch Tausende Domains schnell gehen.
 */
export function verteilenNachGroesse<T>(items: readonly T[], gruppe: (t: T) => string): T[] {
  const gruppen = new Map<string, { liste: T[]; pos: number; nr: number }>();
  for (const t of items) {
    const k = gruppe(t);
    const x = gruppen.get(k);
    if (x) x.liste.push(t);
    else gruppen.set(k, { liste: [t], pos: 0, nr: gruppen.size });
  }
  type G = { liste: T[]; pos: number; nr: number };
  const rest = (x: G) => x.liste.length - x.pos;
  const vor = (a: G, b: G) => rest(a) > rest(b) || (rest(a) === rest(b) && a.nr < b.nr);
  const heap: G[] = [];
  const hoch = (i: number) => {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!vor(heap[i], heap[p])) break;
      [heap[i], heap[p]] = [heap[p], heap[i]];
      i = p;
    }
  };
  const runter = (i: number) => {
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < heap.length && vor(heap[l], heap[m])) m = l;
      if (r < heap.length && vor(heap[r], heap[m])) m = r;
      if (m === i) return;
      [heap[i], heap[m]] = [heap[m], heap[i]];
      i = m;
    }
  };
  const push = (x: G) => {
    heap.push(x);
    hoch(heap.length - 1);
  };
  const pop = (): G | undefined => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length && last) {
      heap[0] = last;
      runter(0);
    }
    return top;
  };
  for (const x of gruppen.values()) push(x);
  const out: T[] = [];
  let zurueck: G | null = null; // die vorige Gruppe setzt eine Runde aus
  while (heap.length || zurueck) {
    const x = pop();
    if (!x) {
      // nur noch die vorige Gruppe übrig
      out.push(zurueck!.liste[zurueck!.pos++]);
      if (rest(zurueck!) === 0) zurueck = null;
      continue;
    }
    out.push(x.liste[x.pos++]);
    if (zurueck) push(zurueck);
    zurueck = rest(x) > 0 ? x : null;
  }
  return out;
}

/** Erst innerhalb jeder Gesellschaft nach Mail-Domain verteilen, dann die Gesellschaften im Reißverschluss. */
export function mischen<T>(items: readonly T[], gesellschaft: (t: T) => string | null | undefined, email: (t: T) => string | null | undefined): T[] {
  const nachGesellschaft = new Map<string, T[]>();
  for (const t of items) {
    const g = gesellschaft(t)?.trim() || "";
    const liste = nachGesellschaft.get(g);
    if (liste) liste.push(t);
    else nachGesellschaft.set(g, [t]);
  }
  const vorgemischt = [...nachGesellschaft.values()].flatMap((liste) => verteilenNachGroesse(liste, (t) => mailDomain(email(t))));
  return reissverschluss(vorgemischt, (t) => gesellschaft(t)?.trim() || "");
}

/** Standard-Obergrenze je Ziel-Domain und Tag (VERTRIEB_DOMAIN_TAGESLIMIT). */
export function domainTageslimit(): number {
  const n = Number(process.env.VERTRIEB_DOMAIN_TAGESLIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
}

/**
 * Tagesportion aus einer gemischten Liste: höchstens `menge` Einträge, je Ziel-Domain höchstens `proDomain`
 * (abzüglich `schon` heute vergebener). Die Reihenfolge bleibt gemischt; was nicht passt, kommt an einem späteren Tag.
 */
export function tagesPortion<T>(gemischt: readonly T[], email: (t: T) => string | null | undefined, opts: { menge: number; proDomain: number; schon?: Map<string, number> }): T[] {
  const zahl = new Map(opts.schon ?? []);
  const out: T[] = [];
  for (const t of gemischt) {
    if (out.length >= opts.menge) break;
    const d = mailDomain(email(t));
    const n = zahl.get(d) ?? 0;
    if (n >= opts.proDomain) continue;
    zahl.set(d, n + 1);
    out.push(t);
  }
  return out;
}
