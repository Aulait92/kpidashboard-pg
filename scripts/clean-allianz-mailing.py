#!/usr/bin/env python3
"""
Clean cold-mailing list based on cold-calling notes.

Reads:
  - /root/.claude/uploads/.../16b0e1a7-Allianz_Cold_Calling_Liste_1.numbers (calling log)
  - /home/user/kpidashboard-pg/data/allianz-agenturen.csv (mailing list)

Writes:
  - /home/user/kpidashboard-pg/data/allianz-agenturen-mailing.csv (cleaned)
  - /home/user/kpidashboard-pg/data/allianz-cold-call-notes.csv  (notes export for reference)
"""
import sys, csv, re, collections
sys.path.insert(0, '/tmp/claude-0/-home-user-kpidashboard-pg/9fc4aee2-fbf2-5bdd-9953-a78fd84db27c/scratchpad/pylibs')
from numbers_parser import Document

NUMBERS_FILE = '/root/.claude/uploads/9fc4aee2-fbf2-5bdd-9953-a78fd84db27c/16b0e1a7-Allianz_Cold_Calling_Liste_1.numbers'
MAIL_LIST_IN = '/home/user/kpidashboard-pg/data/allianz-agenturen.csv'
MAIL_LIST_OUT = '/home/user/kpidashboard-pg/data/allianz-agenturen-mailing.csv'
NOTES_EXPORT = '/home/user/kpidashboard-pg/data/allianz-cold-call-notes.csv'

# Explizit vom User angefragt, aus der Mailing-Liste zu entfernen.
EXCLUDE_LEADERS = {
    ('rolf', 'schmalfuß'),
    ('rolf', 'schmalfuss'),
    ('alexander', 'gola'),
    ('henrik', 'lohmann'),
}

# E-Mail-basierte Ausschlüsse (falls Namenstreffer scheitert, z.B. Schreibvarianten).
EXCLUDE_EMAILS = {
    'agentur.lohmann@allianz.de',   # Henrik Lohmann, Buchholz
}

# Regex-Patterns, die eine Mailing-Ausschluss-Entscheidung triggern.
EXCLUDE_PATTERNS = [
    # Klare Ablehnung
    (r'\bkein\s+interesse\b',                    'rejection'),
    (r'\bkein\s+bedarf\b',                       'rejection'),
    (r'brauch[te]*\s+keine?\s+kunden',           'rejection'),
    (r'haben?\s+genug\s+kunden',                 'rejection'),
    (r'haben?\s+schon\s+viele\s+leads',          'rejection'),
    (r'ist\s+schon\s+versorgt',                  'rejection'),
    (r'anderweitig\s+vergeben',                  'rejection'),
    (r'voll\s+ausgelastet(?!\s+aber)',           'rejection'),       # "voll ausgelastet aber will sich melden" → keep for callback
    (r'hat\s+zuviel\s+gesch(ä|ae)ft',            'rejection'),
    (r'zu\s+teuer(?!,\s+will\s+im\s+januar)',    'rejection'),
    (r'hat\s+eine\s+cold\s+calling\s+l(ö|oe)sung', 'rejection'),
    (r'schalten\s+schon\s+werbung.*kein\s+bedarf', 'rejection'),
    (r'an\s+meta\s+ads.*z(ä|ae)hne\s+ausgebissen', 'rejection'),
    (r'leadgesch(ä|ae)ft\s+ist\s+nichts\s+f(ü|ue)r', 'rejection'),
    (r'ist\s+nicht\s+aufgeschlossen',            'rejection'),
    (r'ruft\s+jeden\s+tag\s+jemand\s+mit\s+leads', 'rejection'),
    (r'arbeitet\s+mit\s+agentur\s+zusammen',     'rejection'),
    (r'arbeiten?\s+schon\s+mit\s+leads',         'rejection'),
    (r'arbeitet\s+mit\s+terminadler',            'rejection'),
    (r'machen?\s+schon\s+leads',                 'rejection'),
    (r'austausch\s+mit\s+anderer\s+firma',       'rejection'),
    (r'aktuell\s+zu\s+viele\s+kunden',           'rejection'),
    (r'wollen\s+nur\s+leads\s+(ü|ue)ber\s+die\s+allianz', 'rejection'),
    (r'hat\s+schon\s+jemanden',                  'rejection'),
    (r'einzelk(ä|ae)mpfer',                      'rejection'),
    (r'kaufen\s+schon\s+leads',                  'rejection'),
    (r'bekommen\s+schon\s+leads',                'rejection'),
    (r'macht\s+kein\s+online',                   'rejection'),
    (r'\bblacklist\b',                           'rejection'),
    (r'will\s+allianz\s+kollegen.*abwerben',     'rejection'),  # er WILL verkaufen, nicht kaufen
    (r'arbeiten\s+nur\s+mit\s+firmen',           'rejection'),
    (r'brauchen?\s+keine?\s+kunden',             'rejection'),
    (r'aktuell\s+(noch\s+)?kein\s+budget',       'rejection'),
    (r'sind\s+schon\s+versorgt',                 'rejection'),
    (r'macht\s+schon\s+werbung',                 'rejection'),
    (r'ist\s+versorgt\s+mit\s+leads',            'rejection'),
    (r'sind\s+(ü|ue)ber\s+die\s+allianz\s+bedient', 'rejection'),
    (r'arbeitet\s+mit\s+leads.*kein\s+bedarf',   'rejection'),
    (r'hat\s+schon\s+viele\s+leads',             'rejection'),
    (r'(mach(t|en)\s+sie\s+schon\s+lange|machen\s+sie\s+schon\s+lange)', 'rejection'),
    (r'mundpropaganda',                          'rejection'),
    (r'arbeitet\s+noch\s+\d+\s+wochen.*rente',   'rejection'),
    (r'vertretungsvertrag\s+gek(ü|ue)ndigt',     'rejection'),
    (r'kein\s+deutsch',                          'rejection'),
    (r'braucht?\s+mitarbeiter.*(ü|ue)ber\s+die\s+allianz', 'rejection'),
    (r'braucht?\s+(a|ei)nen?\s+mitarbeiter.*allianz', 'rejection'),
    (r'brauchen?\s+mitarbeiter.*(ü|ue)ber\s+die\s+allianz', 'rejection'),
    (r'arbeitet\s+mit\s+leads\s+und\s+hat\s+keinen\s+bedarf', 'rejection'),
    (r'braucht\s+keinen?\s+kunden',              'rejection'),
    (r'(ü|ue)berlastet',                         'rejection'),
    (r'einfach\s+aufgelegt',                     'rejection'),
    (r'brauchen?\s+keine\s+leads',               'rejection'),
    (r'social\s+media\s+toolbox',                'rejection'),
    (r'geht\s+(n(ä|ae)chstes\s+jahr\s+)?in\s+(ruhestand|rente)', 'rejection'),
    (r'macht\s+schon\s+meta',                    'rejection'),
    (r'keine\s+kapazi(t|z)(ä|ae)ten',            'rejection'),
    (r'agentur\s+wurde\s+(ü|ue)bernommen',       'rejection'),
    (r'sind\s+versorgt\s+und\s+haben\s+keinen\s+bedarf', 'rejection'),

    # Aktiver Lead / Termin / Rückruf-Nachricht
    (r'stellen\s+sich\s+gerade\s+auf',           'active_lead'),
    (r'ab\s+m(ä|ae)rz\s+interessant',            'active_lead'),
    (r'n(ä|ae)chstes\s+jahr\s+ggfs',             'active_lead'),
    (r'umdeckungsphase',                         'active_lead'),
    (r'k(ö|oe)nnen\s+kunden\s+gebrauchen',       'active_lead'),
    (r'\d{1,2}\.\d{1,2}\.?\s+(vormittags|mit\s+hr)', 'active_lead'),
    (r'ruft\s+bei\s+interesse\s+zur(ü|ue)ck',    'active_lead'),
    (r'e-?mail\s+schreiben,?\s+ist\s+besch(ä|ae)ftigt', 'active_lead'),
    (r'hat\s+interesse',                         'active_lead'),
    (r'nur\s+per\s+mail\s+schicken',             'active_lead'),  # user plant Mail → nicht separate Mail-Welle
    (r'suchen\s+gerade\s+eine\s+marketingagentur', 'active_lead'),
    (r'ist\s+skeptisch,?\s+aber\s+m(ö|oe)chte\s+einseiter', 'active_lead'),
    (r'termin\s+(f(ü|ue)r|mit)',                 'active_lead'),
    (r'will\s+es\s+machen',                      'active_lead'),

    # Aktiver Lead / schon in Verkaufsprozess — Mail wäre Doppel-Touch
    (r'bestellt\s+(ü|ue)ber\s+leadnow',          'active_lead'),
    (r'daten\s+notiert',                         'active_lead'),
    (r'daten\s+weitergegeben',                   'active_lead'),
    (r'melden\s+sich\s+bei\s+interesse',         'active_lead'),
    (r'meldet\s+sich\s+bei\s+interesse',         'active_lead'),
    (r'meldet\s+sich\s+zur(ü|ue)ck',             'active_lead'),
    (r'einseiter\s+(zuschicken|gesendet)',       'active_lead'),
    (r'will\s+einseiter',                        'active_lead'),
    (r'ruft\s+zur(ü|ue)ck',                      'active_lead'),
    (r'zettel\s+hingelegt',                      'active_lead'),
    (r'nummer\s+weitergegeben',                  'active_lead'),
    (r'weitergeleitet\s+und\s+dann\s+kam\s+nichts', 'active_lead'),
    (r'rangegangen,?\s+aber\s+nichts\s+geh(ö|oe)rt', 'active_lead'),
    (r'telefonassistenz',                        'active_lead'),
    (r'n(ä|ae)chstes\s+jahr\s+angehen',          'active_lead'),
    (r'hat\s+ende\s+januar\s+ggfs',              'active_lead'),
    (r'voll\s+ausgelastet\s+aber\s+will\s+sich\s+melden', 'active_lead'),
    (r'zu\s+teuer,\s+will\s+im\s+januar',        'active_lead'),
    (r'tiktok\s+ads.*tkv\s+leads',               'active_lead'),  # er WILL Leads und kommt zurück
    (r'einseiter\s+und\s+leads',                 'active_lead'),
    (r'roy\s+stemmer\s+meldet\s+sich',           'active_lead'),
]

def classify(note: str):
    """Return (category, matched_pattern) or (None, None) to keep."""
    if not note:
        return None, None
    n = note.lower()
    for pat, cat in EXCLUDE_PATTERNS:
        if re.search(pat, n):
            return cat, pat
    return None, None

def to_s(v):
    if v is None: return ''
    return str(v).strip()

# ---------- 1. Load Numbers calling log ----------
doc = Document(NUMBERS_FILE)
rows = list(doc.sheets[0].tables[0].rows(values_only=True))
hdr = rows[0]
# notes column was col 12
NOTE_COL = 12
DATE_COL = 13
EMAIL_COL = 1

notes_by_email = {}
for r in rows[1:]:
    email = to_s(r[EMAIL_COL]).lower() if len(r) > EMAIL_COL else ''
    note = to_s(r[NOTE_COL]) if len(r) > NOTE_COL else ''
    date = to_s(r[DATE_COL]) if len(r) > DATE_COL else ''
    if not email or not note:
        continue
    notes_by_email[email] = (note, date)

print(f"Calling log: {len(notes_by_email)} Agenturen mit Notizen")

# ---------- 2. Classify ----------
excluded = {}   # email -> (category, note)
kept_with_note = {}  # email -> note
cat_counter = collections.Counter()
unclassified = []

for email, (note, date) in notes_by_email.items():
    cat, pat = classify(note)
    if cat:
        excluded[email] = (cat, note)
        cat_counter[cat] += 1
    else:
        kept_with_note[email] = note
        cat_counter['keep (no contact / callback / unmatched)'] += 1
        if not any(k in note.lower() for k in [
            'mailbox','warteschleife','telefonwall','urlaub','nochmal','probieren',
            'falsche','komische','nicht der chef','weirde','nicht im haus',
            'wieder da','gegen','ab 16h','bis 12','freitag','ab dienstag',
            '27.10','28.10','29.10','2.11','29.10','w(ö|oe)chentlich'
        ]):
            unclassified.append((email, note))

print(f"\nKlassifikation:")
for cat, c in cat_counter.most_common():
    print(f"  {c:4d}  {cat}")

if unclassified:
    print(f"\nNoch nicht eingeordnete Notizen ({len(unclassified)}):")
    for e, n in unclassified[:20]:
        print(f"  {e}  →  {n[:100]}")

# ---------- 3. Filter the mailing CSV ----------
with open(MAIL_LIST_IN, newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    headers = reader.fieldnames
    all_rows = list(reader)

print(f"\nMailing-Liste Input: {len(all_rows)} Agenturen")

kept_rows = []
removed_notes = 0
removed_named = 0
removed_named_detail = []
not_contacted = 0
contacted_but_kept = 0
for row in all_rows:
    email = row.get('email', '').strip().lower()
    first = row.get('firstName', '').strip().lower()
    # strip title etc; keep umlauts for match
    last = row.get('lastName', '').strip().lower()
    key = (first.split()[0] if first else '', last)
    if key in EXCLUDE_LEADERS or email in EXCLUDE_EMAILS:
        removed_named += 1
        removed_named_detail.append(f"{row.get('firstName')} {row.get('lastName')}  <{email}>")
        continue
    if email in excluded:
        removed_notes += 1
        continue
    kept_rows.append(row)
    if email in kept_with_note:
        contacted_but_kept += 1
    else:
        not_contacted += 1

print(f"  entfernt wegen Notizen: {removed_notes}")
print(f"  entfernt wegen Namen (Rolf/Alexander/Henrik): {removed_named}")
for d in removed_named_detail:
    print(f"      - {d}")
print(f"  behalten (nie erreicht / Rückruf geplant): {contacted_but_kept}")
print(f"  behalten (nie telefonisch kontaktiert): {not_contacted}")
print(f"  Mailing-Liste Output: {len(kept_rows)}")

# ---------- 4. Write cleaned mailing list ----------
with open(MAIL_LIST_OUT, 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=headers)
    writer.writeheader()
    writer.writerows(kept_rows)
print(f"\n→ {MAIL_LIST_OUT}")

# ---------- 5. Export the classification for user review ----------
with open(NOTES_EXPORT, 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['email','decision','category','note'])
    for email, (cat, note) in sorted(excluded.items()):
        w.writerow([email, 'EXCLUDE', cat, note])
    for email, note in sorted(kept_with_note.items()):
        w.writerow([email, 'KEEP', 'no-reach / callback / neutral', note])
print(f"→ {NOTES_EXPORT}")
