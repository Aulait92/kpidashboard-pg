import type { RawListing } from "../types.ts";

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(gmbh|kg|ag|ohg|ug|e\.k\.|mbh|& co|co\.)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function normalizeDomain(url: string | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function listingKey(l: RawListing): string {
  const domain = normalizeDomain(l.website);
  if (domain) return `d:${domain}`;
  return `n:${normalizeName(l.name)}|c:${l.city.toLowerCase()}`;
}

export function dedupeListings(listings: RawListing[]): RawListing[] {
  const map = new Map<string, RawListing>();
  for (const l of listings) {
    const key = listingKey(l);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, l);
      continue;
    }
    map.set(key, {
      ...existing,
      phone: existing.phone || l.phone,
      website: existing.website || l.website,
      street: existing.street || l.street,
      zip: existing.zip || l.zip,
    });
  }
  return [...map.values()];
}
