const eur = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const pct = new Intl.NumberFormat("de-DE", {
  style: "percent",
  maximumFractionDigits: 1,
});

const num = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 2,
});

const dateFmt = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
});

const dateTimeFmt = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatEUR(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "–";
  return eur.format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "–";
  return pct.format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "–";
  return num.format(value);
}

export function formatDate(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return dateFmt.format(d);
}

export function formatDateTime(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return dateTimeFmt.format(d);
}

export function formatDuration(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours)) return "–";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${num.format(hours)} h`;
  return `${num.format(hours / 24)} d`;
}
