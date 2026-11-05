#!/usr/bin/env python3
"""Reduce the AXA team CSV to 1 row per agency (= 1 Postfach)."""
import csv
IN = 'data/axa-agenturen.csv'
OUT = 'data/axa-agenturen-only.csv'

rows = list(csv.DictReader(open(IN, encoding='utf-8')))
# dedupe by agency email (= unique Postfach)
seen = set()
out = []
for r in rows:
    key = (r.get('email') or '').lower()
    if not key or key in seen:
        continue
    seen.add(key)
    out.append(r)

# keep only mailing-relevant columns
cols = ['salutation','firstName','lastName','email','phone','mobile','fax',
        'agencyName','street','zip','city','ekomiRating','ekomiCount',
        'languages','url']
with open(OUT, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=cols, extrasaction='ignore')
    w.writeheader()
    out.sort(key=lambda r: (r.get('zip') or '', r.get('lastName') or ''))
    w.writerows(out)
print(f"{len(out)} Agenturen → {OUT}")
