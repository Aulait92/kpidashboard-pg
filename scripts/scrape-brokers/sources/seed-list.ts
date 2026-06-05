import { readFile } from "node:fs/promises";
import type { RawListing } from "../types.ts";

type SeedEntry = {
  name: string;
  city?: string;
  website?: string;
};

type SeedFile = {
  brokers?: SeedEntry[];
};

export async function loadSeedList(path: string): Promise<RawListing[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    console.warn(`  ! seed list not found at ${path}: ${(err as Error).message}`);
    return [];
  }
  let parsed: SeedFile;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn(`  ! seed list is not valid JSON: ${(err as Error).message}`);
    return [];
  }
  const entries = parsed.brokers ?? [];
  const out: RawListing[] = [];
  let skipped = 0;
  for (const e of entries) {
    if (!e.name || !e.website) {
      skipped++;
      continue;
    }
    out.push({
      name: e.name,
      city: e.city ?? "",
      website: e.website,
      source: "seed-list",
      sourceUrl: path,
    });
  }
  if (skipped > 0) {
    console.log(`  · seed: ${skipped} entries skipped (missing website)`);
  }
  return out;
}
