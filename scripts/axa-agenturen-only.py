#!/usr/bin/env python3
"""Clean AXA agencies: 1 row per email, with reliable salutation/firstName/lastName."""
import csv, re
IN = 'data/axa-agenturen.csv'
OUT = 'data/axa-agenturen-only.csv'

FEMALE_FIRSTS = set("""
sabine petra karin angelika andrea susanne barbara christine sandra nicole claudia stefanie julia anja silke
birgit heike kerstin martina gabriele gabi ulrike katja daniela christina christiane maria monika annette iris
tanja sabrina jana yvonne sonja alexandra franziska katharina vanessa melanie simone nadine verena annika annett
beate elisabeth elke esther eva gudrun gisela hanna hannah helga ines ingrid isabel isabelle jasmin jessica
jennifer johanna juliane karina karoline lena lisa mandy manuela marion mareike meike michaela miriam nina regina
renate rita saskia sarah sylvia sigrid sophia sophie stefani tina ulla ute viviane wiebke angela astrid britta
carina carolin caroline cornelia dagmar denise diana dorothea edith ellen evelyn gaby hannelore heidi helene
henriette hilde inge inken jacqueline janine jutta katrin kirsten laura leonie liane luisa madeleine maike marina
marita martha melissa natalie nathalie nelli olga pamela patricia peggy philippa rebecca rebekka roswitha ruth
selina sibylle sieglinde silvia stefania theresa ursula vera viktoria waltraud finja amelie charlotte emma mia
lea emilia mila clara paula frieda greta ronja juna orsina nicolle svenja alina anne antje alexa elena natascha
susan susan steffi stephanie bettina brigitte bianca melina michelle sara sophia silja sonja friederike
""".split())

FIRM_RE = re.compile(r'\b(oHG|OHG|GmbH|KG|e\.?K\.|GbR|Co\.?\s*KG|Co\.\s*KG|&amp;)\b|[&+,]', re.IGNORECASE)

def name_from_email(local: str):
    s = re.sub(r'\d+$', '', local)
    parts = [p for p in re.split(r'[._-]+', s) if p]
    if len(parts) < 2:
        return ('', '')
    prefix = parts[0].lower()
    if prefix in {'agentur', 'info', 'kontakt', 'service', 'team', 'office', 'buero', 'mail',
                  'axa', 'axa-center', 'direktservice', 'vertretung', 'generalagentur'}:
        rest = parts[1:]
        if not rest: return ('', '')
        return ('', ' '.join(p.capitalize() for p in rest))
    first = parts[0].capitalize()
    last = ' '.join(p.capitalize() for p in parts[1:])
    return (first, last)

def detect_salutation(first_name: str, last_name: str, api_salutation: str):
    # Firmenname → kein Herr/Frau
    full = f"{first_name} {last_name}"
    if FIRM_RE.search(full):
        return ''
    if api_salutation in {'Herr', 'Frau'}:
        return api_salutation
    first = first_name.lower().split('-')[0].split(' ')[0]
    if first in FEMALE_FIRSTS:
        return 'Frau'
    if first_name:
        return 'Herr'
    return ''

rows = list(csv.DictReader(open(IN, encoding='utf-8')))
seen = set()
out = []
for r in rows:
    email = (r.get('email') or '').strip().lower()
    if not email or email in seen: continue
    seen.add(email)

    first = (r.get('firstName') or '').strip()
    last  = (r.get('lastName') or '').strip()
    # If firstName empty and lastName looks like a company → try from email
    if not first:
        f2, l2 = name_from_email(email.split('@')[0])
        if f2:
            first = f2
            last = l2
        elif l2 and not last:
            last = l2

    salutation = detect_salutation(first, last, (r.get('salutation') or '').strip())

    out.append({
        'salutation': salutation,
        'firstName': first,
        'lastName': last,
        'email': email,
        'phone': r.get('phone') or '',
        'mobile': r.get('mobile') or '',
        'fax': r.get('fax') or '',
        'agencyName': r.get('agencyName') or '',
        'street': r.get('street') or '',
        'zip': r.get('zip') or '',
        'city': r.get('city') or '',
        'ekomiRating': r.get('ekomiRating') or '',
        'ekomiCount': r.get('ekomiCount') or '',
        'languages': r.get('languages') or '',
        'url': r.get('url') or '',
    })

out.sort(key=lambda r: (r['zip'], r['lastName']))
cols = list(out[0].keys())
with open(OUT, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    w.writerows(out)

from collections import Counter
c = Counter(r['salutation'] for r in out)
print(f"{len(out)} Agenturen → {OUT}")
print(f"  Herr: {c['Herr']}  Frau: {c['Frau']}  (Firma/leer: {c['']})")
print(f"  firstName vorhanden: {sum(1 for r in out if r['firstName'])}")
print(f"  lastName vorhanden: {sum(1 for r in out if r['lastName'])}")
