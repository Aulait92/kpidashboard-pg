import { readFileSync, writeFileSync } from 'node:fs'

const IN = '/home/user/kpidashboard-pg/data/pkv-204-merged.csv'
const OUT = '/home/user/kpidashboard-pg/data/pkv-204-verified.csv'
const REPORT = '/home/user/kpidashboard-pg/data/pkv-204-verify-report.csv'

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += c
    } else {
      if (c === '"') inQ = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else if (c === '\r') { /* skip */ }
      else field += c
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.some(f => f.trim() !== ''))
}

function esc(v: string | number): string {
  const s = String(v ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

const KEYWORDS = [
  { re: /\bPKV\b/, name: 'PKV' },
  { re: /private\s+krankenversicherung/i, name: 'PrivateKV' },
  { re: /§\s?204/i, name: '§204' },
  { re: /tarifwechsel/i, name: 'Tarifwechsel' },
  { re: /beitragsoptimierung/i, name: 'Beitragsoptimierung' },
  { re: /beitragsentlastung/i, name: 'Beitragsentlastung' },
  { re: /beitragssenkung/i, name: 'Beitragssenkung' },
  { re: /beitragserh(ö|oe)hung/i, name: 'Beitragserhöhung' },
  { re: /honorarberat/i, name: 'Honorarberatung' },
  { re: /versicherungsmakler/i, name: 'Versicherungsmakler' },
  { re: /krankenversicherung/i, name: 'Krankenversicherung' },
]

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

async function fetchText(url: string, timeoutMs = 12000): Promise<string | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.5',
        'Accept': 'text/html,application/xhtml+xml',
      },
    })
    if (!r.ok) return null
    const ct = r.headers.get('content-type') ?? ''
    if (!/text|html|xml/i.test(ct)) return null
    const buf = await r.arrayBuffer()
    if (buf.byteLength > 3_000_000) return null
    return new TextDecoder('utf-8', { fatal: false }).decode(buf)
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
}

// Nur im <title> checken — Body-Match ist zu unspezifisch (Footer nennt oft Kanzlei/Verbraucherzentrale)
const TITLE_HINTS_BAD = [
  { re: /handballbund|handball-bund|dhb-fanshop/i, tag: 'Sport (Handball)' },
  { re: /bundesministerium|bmg\.bund\.de/i, tag: 'Behörde' },
  { re: /stiftung\s+warentest/i, tag: 'Stiftung Warentest' },
  { re: /verbraucherzentrale/i, tag: 'Verbraucherzentrale' },
  { re: /^(rechtsanw|anwalts?kanzlei|rechtsanwaltsgesellschaft)|kanzlei\s+f(ü|ue)r/i, tag: 'Anwaltskanzlei' },
  { re: /linkedin|xing\s*:\s*|^facebook/i, tag: 'Social Network' },
  { re: /handelskammer|industrie-\s?und\s?handelskammer/i, tag: 'IHK' },
  { re: /versicherungsbote|fachmagazin|fachzeitschrift|nachrichten\s+f(ü|ue)r\s+versicherung/i, tag: 'Fachpresse' },
  { re: /portal\s+f(ü|ue)r\s+gr(ü|ue)nder|f(ü|ue)r-gr(ü|ue)nder/i, tag: 'Gründerportal' },
  { re: /online\-?forum|community\-?forum|diskussionsforum/i, tag: 'Forum' },
  { re: /tarifrechner|tarifvergleich|preisvergleich|vergleichsportal/i, tag: 'Vergleichsportal' },
]

// Manuell bestätigte Ausschlüsse (Info-Portale/Fachmedien, die durch Title-Filter durchflutschen)
const MANUAL_EXCLUDES = new Map<string, string>([
  ['krankenkassen.de', 'Info-Portal'],
  ['pfefferminzia.de', 'Fachmagazin'],
  ['iww.de', 'Fachverlag'],
  ['whofinance.de', 'Berater-Vergleichsportal'],
  ['fuer-gruender.de', 'Gründerportal'],
  ['pkv-tarifvergleich.info', 'Vergleichsportal'],
])

// Bekannte PKV-Versicherer (die wollen wir nicht — die verkaufen selbst PKV, brauchen keine Optimierung)
const KNOWN_INSURERS = new Set([
  'allianz.de', 'axa.de', 'ergo.de', 'huk.de', 'huk24.de', 'debeka.de',
  'ottonova.de', 'continentale.de', 'signal-iduna.de', 'gothaer.de',
  'hansemerkur.de', 'nuernberger.de', 'alte-leipziger.de', 'hallesche.de',
  'dkv.com', 'dkv.de', 'universa.de', 'inter.de', 'lkh.de', 'ukv.de',
  'r-v.de', 'wuerttembergische.de', 'wgv.de', 'mv-versicherung.de',
  'concordia.de', 'sdk.de', 'barmenia.de', 'arag.de', 'lvm.de',
  'provinzial.de', 'clark.de', 'wefox.com', 'getsafe.de', 'feather-insurance.com',
])

// Domain-basierte Anwalts-Signale
const LAWYER_DOMAIN_RE = /(^|[.-])(anwalt|anwaelte|kanzlei|rechtsanwalt|rak-)/i

async function verify(website: string, domain: string): Promise<{
  status: 'ok' | 'weak' | 'no_match' | 'unreachable' | 'off_topic'
  matched: string[]
  offTopic?: string
  title?: string
}> {
  // Manuelle Ausschlüsse
  const manualTag = MANUAL_EXCLUDES.get(domain)
  if (manualTag) {
    return { status: 'off_topic', matched: [], offTopic: manualTag }
  }
  // Sofort-Ausschluss: bekannter Versicherer
  if (KNOWN_INSURERS.has(domain)) {
    return { status: 'off_topic', matched: [], offTopic: 'PKV-Versicherer' }
  }
  // Sofort-Ausschluss: Anwaltskanzlei per Domain
  if (LAWYER_DOMAIN_RE.test(domain)) {
    return { status: 'off_topic', matched: [], offTopic: 'Anwaltskanzlei (Domain)' }
  }

  const html = await fetchText(website)
  if (!html) return { status: 'unreachable', matched: [] }
  const text = stripHtml(html)
  const title = (html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1] ?? '').trim()

  // Off-topic detection — nur im <title>
  for (const bad of TITLE_HINTS_BAD) {
    if (bad.re.test(title)) {
      return { status: 'off_topic', matched: [], offTopic: bad.tag, title }
    }
  }

  const matched = KEYWORDS.filter(k => k.re.test(text)).map(k => k.name)
  const pkvCount = (text.match(/\bPKV\b/g) ?? []).length
  const pkvKeywordCount = matched.filter(m => m === 'PKV' || m === 'PrivateKV' || m === '§204' || m === 'Tarifwechsel').length

  if (matched.length >= 3 && pkvKeywordCount >= 2) return { status: 'ok', matched, title }
  if (pkvCount >= 5) return { status: 'ok', matched, title }
  if (matched.length >= 2) return { status: 'weak', matched, title }

  // Try /pkv fallback
  const base = website.replace(/\/+$/, '')
  const fallbacks = [`${base}/pkv`, `${base}/pkv-tarifwechsel`, `${base}/private-krankenversicherung`]
  for (const url of fallbacks) {
    const h2 = await fetchText(url, 8000)
    if (!h2) continue
    const t2 = stripHtml(h2)
    const m2 = KEYWORDS.filter(k => k.re.test(t2)).map(k => k.name)
    const pkv2 = (t2.match(/\bPKV\b/g) ?? []).length
    if ((m2.length >= 3 && (m2.includes('PKV') || m2.includes('PrivateKV'))) || pkv2 >= 5) {
      return { status: 'ok', matched: [...new Set([...matched, ...m2])], title }
    }
  }

  return { status: 'no_match', matched, title }
}

async function main() {
  const rows = parseCsv(readFileSync(IN, 'utf8'))
  const header = rows[0]
  const idx = (n: string) => header.indexOf(n)
  const data = rows.slice(1)

  const results: Array<{ row: string[]; verdict: Awaited<ReturnType<typeof verify>> }> = []

  const CONCURRENCY = 6
  let cursor = 0
  async function worker() {
    while (cursor < data.length) {
      const i = cursor++
      const row = data[i]
      const website = row[idx('website')]
      const domain = row[idx('domain')]
      if (!website) { results[i] = { row, verdict: { status: 'unreachable', matched: [] } }; continue }
      const v = await verify(website, domain)
      results[i] = { row, verdict: v }
      const flag = v.status === 'ok' ? '✅' : v.status === 'weak' ? '🟡' : v.status === 'off_topic' ? '🚫' : v.status === 'unreachable' ? '⚠️' : '❌'
      console.log(`${flag} ${domain.padEnd(45)} ${v.status.padEnd(11)} ${v.offTopic ? '['+v.offTopic+'] ' : ''}${v.matched.join(', ')}`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  // Verified CSV: only 'ok' rows
  const okRows = results.filter(r => r.verdict.status === 'ok').map(r => r.row)
  writeFileSync(OUT, [header.join(','), ...okRows.map(r => r.map(esc).join(','))].join('\n') + '\n', 'utf8')

  // Full report
  const reportHeader = ['domain', 'website', 'status', 'offTopic', 'matched', 'title']
  const reportLines = [reportHeader.join(',')]
  for (const r of results) {
    reportLines.push([
      r.row[idx('domain')],
      r.row[idx('website')],
      r.verdict.status,
      r.verdict.offTopic ?? '',
      r.verdict.matched.join('; '),
      r.verdict.title ?? '',
    ].map(esc).join(','))
  }
  writeFileSync(REPORT, reportLines.join('\n') + '\n', 'utf8')

  const counts = { ok: 0, weak: 0, no_match: 0, off_topic: 0, unreachable: 0 }
  for (const r of results) counts[r.verdict.status]++
  console.log('\n' + '='.repeat(60))
  console.log(`Total: ${data.length}`)
  console.log(`  ✅ ok:          ${counts.ok}`)
  console.log(`  🟡 weak:        ${counts.weak}`)
  console.log(`  ❌ no_match:    ${counts.no_match}`)
  console.log(`  🚫 off_topic:   ${counts.off_topic}`)
  console.log(`  ⚠️  unreachable: ${counts.unreachable}`)
  console.log(`\nVerified CSV: ${OUT} (${okRows.length} rows)`)
  console.log(`Report:       ${REPORT}`)
}

main()
