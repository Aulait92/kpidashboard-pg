import { readFileSync, writeFileSync } from 'node:fs'

type Row = {
  domain: string
  companyName: string
  email: string
  emailsExtra: string
  phone: string
  street: string
  zip: string
  city: string
  website: string
  impressumUrl: string
  signals: string
  queryHits: number
  isSeed: boolean
  sources: Set<string>
}

const INPUTS = [
  { path: '/root/.claude/uploads/9fc4aee2-fbf2-5bdd-9953-a78fd84db27c/154ce20f-pkv204anbieter.csv', tag: 'v1' },
  { path: '/root/.claude/uploads/9fc4aee2-fbf2-5bdd-9953-a78fd84db27c/b06494d1-pkv204v4.csv',       tag: 'v4' },
  { path: '/root/.claude/uploads/9fc4aee2-fbf2-5bdd-9953-a78fd84db27c/7d34c827-pkv204v5.csv',       tag: 'v5' },
]

const OUT = '/home/user/kpidashboard-pg/data/pkv-204-merged.csv'

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { inQ = false }
      } else field += c
    } else {
      if (c === '"') inQ = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else if (c === '\r') { /* ignore */ }
      else field += c
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.some(f => f.trim() !== ''))
}

function normDomain(raw: string): string {
  if (!raw) return ''
  let d = raw.trim().toLowerCase()
  d = d.replace(/^https?:\/\//, '')
  d = d.replace(/^www\./, '')
  d = d.split('/')[0]
  d = d.split('?')[0]
  return d
}

function domainFromUrl(url: string): string {
  return normDomain(url)
}

function betterString(a: string, b: string): string {
  if (!a) return b
  if (!b) return a
  // Reject junk emails/values
  const junky = (s: string) => /^(flags@|globe@|contact@mysite\.com|yourname@|info@website\.com|email@stiftung|ihre@mail\.de|alex@muster\.de|firstclass@|businessclass@|student@|expats@|economy@|exklusiv|zahn\d)/i.test(s)
  if (junky(a) && !junky(b)) return b
  if (junky(b) && !junky(a)) return a
  return a.length >= b.length ? a : b
}

function betterCompany(a: string, b: string): string {
  const generic = (s: string) => !s || /^(pkv|home|startseite|linkedin)/i.test(s.trim())
  if (generic(a) && !generic(b)) return b
  if (generic(b) && !generic(a)) return a
  return betterString(a, b)
}

function mergeEmails(a: string, b: string): string {
  const set = new Set<string>()
  for (const s of [a, b]) {
    for (const e of s.split(/[;,]/)) {
      const t = e.trim()
      if (t) set.add(t)
    }
  }
  return [...set].join('; ')
}

function mergeSignals(a: string, b: string): string {
  const set = new Set<string>()
  for (const s of [a, b]) {
    for (const e of s.split(/;/)) {
      const t = e.trim()
      if (t) set.add(t)
    }
  }
  return [...set].join('; ')
}

const byDomain = new Map<string, Row>()

function upsert(patch: Partial<Row> & { domain: string; sourceTag: string }) {
  const d = patch.domain
  if (!d) return
  const existing = byDomain.get(d)
  if (!existing) {
    const r: Row = {
      domain: d,
      companyName: patch.companyName ?? '',
      email: patch.email ?? '',
      emailsExtra: patch.emailsExtra ?? '',
      phone: patch.phone ?? '',
      street: patch.street ?? '',
      zip: patch.zip ?? '',
      city: patch.city ?? '',
      website: patch.website ?? '',
      impressumUrl: patch.impressumUrl ?? '',
      signals: patch.signals ?? '',
      queryHits: patch.queryHits ?? 0,
      isSeed: patch.isSeed ?? false,
      sources: new Set([patch.sourceTag]),
    }
    byDomain.set(d, r)
    return
  }
  existing.companyName  = betterCompany(existing.companyName, patch.companyName ?? '')
  existing.email        = betterString(existing.email, patch.email ?? '')
  existing.emailsExtra  = mergeEmails(existing.emailsExtra, patch.emailsExtra ?? '')
  existing.phone        = betterString(existing.phone, patch.phone ?? '')
  existing.street       = betterString(existing.street, patch.street ?? '')
  existing.zip          = betterString(existing.zip, patch.zip ?? '')
  existing.city         = betterString(existing.city, patch.city ?? '')
  existing.website      = betterString(existing.website, patch.website ?? '')
  existing.impressumUrl = betterString(existing.impressumUrl, patch.impressumUrl ?? '')
  existing.signals      = mergeSignals(existing.signals, patch.signals ?? '')
  existing.queryHits    = Math.max(existing.queryHits, patch.queryHits ?? 0)
  existing.isSeed       = existing.isSeed || (patch.isSeed ?? false)
  existing.sources.add(patch.sourceTag)
}

for (const { path, tag } of INPUTS) {
  const text = readFileSync(path, 'utf8')
  const rows = parseCsv(text)
  const header = rows[0].map(h => h.trim())
  const idx = (name: string) => header.indexOf(name)

  const isV1 = idx('name') !== -1 && idx('source') !== -1

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (isV1) {
      const website = r[idx('website')] ?? ''
      const nameField = r[idx('name')] ?? ''
      const src = r[idx('source')] ?? ''
      const domain = domainFromUrl(website) || normDomain(nameField)
      if (!domain) continue
      const isSeed = /seed-list/i.test(src)
      const qh = (src.match(/(\d+)\s+query hits/i)?.[1]) ? Number(src.match(/(\d+)\s+query hits/i)![1]) : 0
      upsert({
        domain,
        sourceTag: tag,
        companyName: isSeed ? nameField : '',
        email: r[idx('email')] ?? '',
        emailsExtra: r[idx('emailsExtra')] ?? '',
        phone: r[idx('phone')] ?? '',
        street: r[idx('street')] ?? '',
        zip: r[idx('zip')] ?? '',
        city: r[idx('city')] ?? '',
        website,
        signals: isSeed ? `seed:${nameField}` : '',
        queryHits: qh,
        isSeed,
      })
    } else {
      const domainRaw = r[idx('domain')] ?? ''
      const website = r[idx('website')] ?? ''
      const domain = normDomain(domainRaw) || domainFromUrl(website)
      if (!domain) continue
      upsert({
        domain,
        sourceTag: tag,
        companyName: r[idx('companyName')] ?? '',
        email: r[idx('email')] ?? '',
        emailsExtra: r[idx('emailsExtra')] ?? '',
        phone: r[idx('phone')] ?? '',
        website,
        impressumUrl: r[idx('impressumUrl')] ?? '',
        signals: r[idx('signals')] ?? '',
        queryHits: Number(r[idx('queryHits')] ?? 0) || 0,
        isSeed: /^(ja|true|1)$/i.test((r[idx('isSeed')] ?? '').trim()),
      })
    }
  }
}

const all = [...byDomain.values()]
all.sort((a, b) => {
  if (a.isSeed !== b.isSeed) return a.isSeed ? -1 : 1
  if (a.queryHits !== b.queryHits) return b.queryHits - a.queryHits
  return a.domain.localeCompare(b.domain)
})

function esc(v: string | number | boolean): string {
  const s = String(v ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

const cols = ['domain','companyName','email','emailsExtra','phone','street','zip','city','website','impressumUrl','signals','queryHits','isSeed','sources']
const lines = [cols.join(',')]
for (const r of all) {
  lines.push([
    r.domain, r.companyName, r.email, r.emailsExtra, r.phone,
    r.street, r.zip, r.city, r.website, r.impressumUrl,
    r.signals, r.queryHits, r.isSeed ? 'ja' : '',
    [...r.sources].sort().join('+'),
  ].map(esc).join(','))
}

writeFileSync(OUT, lines.join('\n') + '\n', 'utf8')

const seedCount = all.filter(r => r.isSeed).length
const withEmail = all.filter(r => r.email).length
const withPhone = all.filter(r => r.phone).length
const multiSrc = all.filter(r => r.sources.size > 1).length

console.log(`Merged: ${all.length} unique domains`)
console.log(`  - Seeds: ${seedCount}`)
console.log(`  - Mit E-Mail: ${withEmail}`)
console.log(`  - Mit Telefon: ${withPhone}`)
console.log(`  - In mehreren Quellen: ${multiSrc}`)
console.log(`Output: ${OUT}`)
