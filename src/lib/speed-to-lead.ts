import { prisma } from "@/lib/prisma";
import type { DateRange } from "@/lib/date-ranges";

export type SpeedBucket = {
  key: string;
  label: string;
  // Lower bound in hours (inclusive). Upper bound = next bucket's lower bound.
  lowerHours: number;
  upperHours: number | null; // null = unbounded
  total: number;
  closed: number;
  closingRate: number | null;
};

export type SpeedToLeadAnalysis = {
  buckets: SpeedBucket[];
  notReached: { total: number; closed: number };
  avgHoursToFirstContact: number | null;
  // Bucket-Index in dem der Schnitt liegt (oder -1 falls keine Daten).
  averageBucketIndex: number;
  bestBucket: SpeedBucket | null;
  worstBucket: SpeedBucket | null;
  // True wenn genug Daten für eine belastbare Aussage (>=5 Leads insgesamt).
  hasMeaningfulData: boolean;
};

const BUCKETS: { key: string; label: string; lowerHours: number; upperHours: number | null }[] = [
  { key: "lt1h", label: "Innerhalb 1 h", lowerHours: 0, upperHours: 1 },
  { key: "lt4h", label: "1 – 4 h", lowerHours: 1, upperHours: 4 },
  { key: "lt24h", label: "4 – 24 h", lowerHours: 4, upperHours: 24 },
  { key: "lt72h", label: "1 – 3 Tage", lowerHours: 24, upperHours: 72 },
  { key: "gt72h", label: "> 3 Tage", lowerHours: 72, upperHours: null },
];

function pickBucketIndex(hours: number): number {
  for (let i = 0; i < BUCKETS.length; i++) {
    const b = BUCKETS[i];
    if (b.upperHours == null) return i;
    if (hours < b.upperHours) return i;
  }
  return BUCKETS.length - 1;
}

export async function computeSpeedToLeadAnalysis(params: {
  range: DateRange;
  customerId?: string | null;
  product?: string | null;
}): Promise<SpeedToLeadAnalysis> {
  const { range, customerId, product } = params;

  const leads = await prisma.lead.findMany({
    where: {
      ...(customerId ? { customerId } : {}),
      ...(product ? { source: product } : {}),
      createdAt: { gte: range.from, lte: range.to },
    },
    select: {
      createdAt: true,
      firstContactAt: true,
      closedAt: true,
    },
  });

  const buckets: SpeedBucket[] = BUCKETS.map((b) => ({
    ...b,
    total: 0,
    closed: 0,
    closingRate: null,
  }));
  const notReached = { total: 0, closed: 0 };
  const hours: number[] = [];

  for (const l of leads) {
    if (!l.firstContactAt) {
      notReached.total += 1;
      if (l.closedAt != null) notReached.closed += 1;
      continue;
    }
    const ttfcHours =
      (l.firstContactAt.getTime() - l.createdAt.getTime()) / 1000 / 3600;
    hours.push(ttfcHours);
    const idx = pickBucketIndex(ttfcHours);
    const b = buckets[idx];
    b.total += 1;
    if (l.closedAt != null) b.closed += 1;
  }

  for (const b of buckets) {
    b.closingRate = b.total > 0 ? b.closed / b.total : null;
  }

  const avgHoursToFirstContact =
    hours.length > 0
      ? hours.reduce((a, b) => a + b, 0) / hours.length
      : null;
  const averageBucketIndex =
    avgHoursToFirstContact != null
      ? pickBucketIndex(avgHoursToFirstContact)
      : -1;

  // Beste/schlechteste Bucket: nur welche mit mindestens 3 Leads, sonst zu
  // verrauscht. Best = höchste Closing Rate, Worst = niedrigste.
  const evaluable = buckets.filter(
    (b) => b.total >= 3 && b.closingRate != null,
  );
  const bestBucket =
    evaluable.length > 0
      ? evaluable.reduce((acc, b) =>
          (b.closingRate ?? 0) > (acc.closingRate ?? 0) ? b : acc,
        )
      : null;
  const worstBucket =
    evaluable.length > 0
      ? evaluable.reduce((acc, b) =>
          (b.closingRate ?? 0) < (acc.closingRate ?? 0) ? b : acc,
        )
      : null;

  return {
    buckets,
    notReached,
    avgHoursToFirstContact,
    averageBucketIndex,
    bestBucket,
    worstBucket,
    hasMeaningfulData: leads.length >= 5,
  };
}
