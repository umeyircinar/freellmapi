// Marketing co-pilot (hidden /marketing page): ad-channel performance in one
// place, wasted-spend detection and anomaly alerts. There are no ad-platform
// connectors yet, so the page runs on a deterministic demo dataset generated
// here; every analysis function takes plain rows, so real connector data can
// replace generateDemoData() without touching the page.

export type ChannelId = 'google' | 'meta' | 'tiktok' | 'criteo'

export const CHANNELS: Record<ChannelId, { name: string; color: string }> = {
  google: { name: 'Google Ads', color: '#2a78d6' },
  meta: { name: 'Meta', color: '#7b5cd6' },
  tiktok: { name: 'TikTok', color: '#1baf7a' },
  criteo: { name: 'Criteo', color: '#d6852a' },
}

export interface Campaign {
  id: string
  name: string
  channel: ChannelId
}

/** One campaign's totals for one day. `date` is YYYY-MM-DD. */
export interface DailyRow {
  date: string
  campaignId: string
  spend: number
  impressions: number
  clicks: number
  conversions: number
  revenue: number
}

export interface MarketingData {
  campaigns: Campaign[]
  rows: DailyRow[]
}

export interface Totals {
  spend: number
  revenue: number
  impressions: number
  clicks: number
  conversions: number
  /** revenue / spend; null with no spend. */
  roas: number | null
  /** spend / conversions; null with no conversions. */
  cpa: number | null
  /** spend / clicks; null with no clicks. */
  cpc: number | null
  /** clicks / impressions; null with no impressions. */
  ctr: number | null
}

// ── Demo data ────────────────────────────────────────────────────────────

// mulberry32: small seeded PRNG, so the demo looks the same on every load.
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Scenario = 'steady' | 'star' | 'zombie' | 'losing' | 'cpcSpike' | 'stalled' | 'declining'

interface CampaignProfile extends Campaign {
  spend: number // daily spend
  cpc: number
  cvr: number // conversions per click
  aov: number // revenue per conversion
  scenario: Scenario
}

const PROFILES: CampaignProfile[] = [
  { id: 'g-brand', name: 'Marka Araması', channel: 'google', spend: 900, cpc: 2.1, cvr: 0.09, aov: 640, scenario: 'star' },
  { id: 'g-pmax', name: 'Performance Max – Tüm Ürünler', channel: 'google', spend: 3200, cpc: 4.8, cvr: 0.028, aov: 720, scenario: 'steady' },
  { id: 'g-generic', name: 'Genel Arama – Ayakkabı', channel: 'google', spend: 1800, cpc: 7.5, cvr: 0.012, aov: 560, scenario: 'cpcSpike' },
  { id: 'g-display', name: 'Görüntülü Reklam – İlgi Alanı', channel: 'google', spend: 650, cpc: 1.1, cvr: 0, aov: 0, scenario: 'zombie' },
  { id: 'm-retarget', name: 'Yeniden Hedefleme – Sepet', channel: 'meta', spend: 1400, cpc: 3.2, cvr: 0.06, aov: 610, scenario: 'star' },
  { id: 'm-prospect', name: 'Benzer Kitle – Satın Alanlar', channel: 'meta', spend: 2600, cpc: 3.9, cvr: 0.022, aov: 590, scenario: 'declining' },
  { id: 'm-video', name: 'Video – Yeni Sezon', channel: 'meta', spend: 1100, cpc: 2.6, cvr: 0.008, aov: 300, scenario: 'losing' },
  { id: 't-spark', name: 'Spark Ads – Kreatör İşbirliği', channel: 'tiktok', spend: 1500, cpc: 1.9, cvr: 0.014, aov: 480, scenario: 'steady' },
  { id: 't-catalog', name: 'Katalog Reklamları', channel: 'tiktok', spend: 800, cpc: 2.2, cvr: 0.006, aov: 350, scenario: 'losing' },
  { id: 'c-retarget', name: 'Dinamik Yeniden Hedefleme', channel: 'criteo', spend: 1200, cpc: 2.8, cvr: 0.035, aov: 650, scenario: 'stalled' },
]

const DAY_MS = 86_400_000

export function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * `days` days of demo performance ending at `endDate` (YYYY-MM-DD, inclusive).
 * The scenarios plant one of each finding the analysis looks for: a campaign
 * with spend and no conversions, campaigns losing money, a CPC spike over the
 * last days, a campaign that stopped spending, and one whose ROAS decays.
 */
export function generateDemoData(endDate: string, days = 60, seed = 42): MarketingData {
  const rand = prng(seed)
  const end = Date.parse(`${endDate}T00:00:00Z`)
  const rows: DailyRow[] = []
  for (let d = days - 1; d >= 0; d--) {
    const ms = end - d * DAY_MS
    const date = isoDate(ms)
    const weekday = new Date(ms).getUTCDay()
    const weekend = weekday === 0 || weekday === 6 ? 1.15 : 1
    const age = (days - 1 - d) / (days - 1) // 0 → oldest day, 1 → endDate
    for (const p of PROFILES) {
      const noise = () => 0.85 + rand() * 0.3
      let spend = p.spend * weekend * noise()
      let cpc = p.cpc * noise()
      let cvr = p.cvr * noise()
      if (p.scenario === 'cpcSpike' && d < 3) cpc *= 1.9
      if (p.scenario === 'stalled' && d < 2) spend *= 0.04
      if (p.scenario === 'declining') cvr *= 1.6 - age * 1.1
      if (p.scenario === 'star') cvr *= 1 + age * 0.2
      const clicks = Math.round(spend / cpc)
      spend = Math.round(clicks * cpc * 100) / 100
      const conversions = Math.round(clicks * cvr)
      const revenue = Math.round(conversions * p.aov * noise())
      // ~1.6% CTR on average; display/video sit lower.
      const impressions = Math.round(clicks / (0.016 * noise()))
      rows.push({ date, campaignId: p.id, spend, impressions, clicks, conversions, revenue })
    }
  }
  return { campaigns: PROFILES.map(({ id, name, channel }) => ({ id, name, channel })), rows }
}

// ── Aggregation ──────────────────────────────────────────────────────────

export function totals(rows: readonly DailyRow[]): Totals {
  let spend = 0, revenue = 0, impressions = 0, clicks = 0, conversions = 0
  for (const r of rows) {
    spend += r.spend
    revenue += r.revenue
    impressions += r.impressions
    clicks += r.clicks
    conversions += r.conversions
  }
  return {
    spend, revenue, impressions, clicks, conversions,
    roas: spend > 0 ? revenue / spend : null,
    cpa: conversions > 0 ? spend / conversions : null,
    cpc: clicks > 0 ? spend / clicks : null,
    ctr: impressions > 0 ? clicks / impressions : null,
  }
}

/** Rows whose date falls in the `days` days ending at `endDate`, inclusive. */
export function inWindow(rows: readonly DailyRow[], endDate: string, days: number, offsetDays = 0): DailyRow[] {
  const end = Date.parse(`${endDate}T00:00:00Z`) - offsetDays * DAY_MS
  const from = isoDate(end - (days - 1) * DAY_MS)
  const to = isoDate(end)
  return rows.filter(r => r.date >= from && r.date <= to)
}

/** The window and the equally long window right before it. */
export function comparePeriods(rows: readonly DailyRow[], endDate: string, days: number): { current: Totals; previous: Totals } {
  return {
    current: totals(inWindow(rows, endDate, days)),
    previous: totals(inWindow(rows, endDate, days, days)),
  }
}

/** Relative change from `previous` to `current`; null when either side is missing or previous is 0. */
export function change(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null
  return (current - previous) / previous
}

export interface DailyPoint { date: string; spend: number; revenue: number }

export function dailySeries(rows: readonly DailyRow[]): DailyPoint[] {
  const byDate = new Map<string, DailyPoint>()
  for (const r of rows) {
    const p = byDate.get(r.date) ?? { date: r.date, spend: 0, revenue: 0 }
    p.spend += r.spend
    p.revenue += r.revenue
    byDate.set(r.date, p)
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export interface GroupStats<K> { key: K; totals: Totals }

export function byChannel(data: MarketingData, rows: readonly DailyRow[]): GroupStats<ChannelId>[] {
  const channelOf = new Map(data.campaigns.map(c => [c.id, c.channel]))
  const groups = new Map<ChannelId, DailyRow[]>()
  for (const r of rows) {
    const ch = channelOf.get(r.campaignId)
    if (!ch) continue
    groups.set(ch, [...(groups.get(ch) ?? []), r])
  }
  return [...groups].map(([key, rs]) => ({ key, totals: totals(rs) })).sort((a, b) => b.totals.spend - a.totals.spend)
}

export function byCampaign(data: MarketingData, rows: readonly DailyRow[]): GroupStats<Campaign>[] {
  return data.campaigns
    .map(c => ({ key: c, totals: totals(rows.filter(r => r.campaignId === c.id)) }))
    .filter(g => g.totals.spend > 0)
    .sort((a, b) => b.totals.spend - a.totals.spend)
}

// ── Wasted spend ─────────────────────────────────────────────────────────

export type WasteReason = 'noConversions' | 'unprofitable' | 'belowAverage'

export interface WasteFinding {
  campaign: Campaign
  reason: WasteReason
  spend: number
  roas: number | null
  /** The part of the spend judged wasted, in currency. */
  wasted: number
}

/**
 * Campaigns spending money that does not come back. A campaign is skipped
 * below `minSpend` in the window: too little data to judge.
 * - noConversions: spend and not one conversion. All of it is wasted.
 * - unprofitable: ROAS under 1, every lira returns less than a lira. The
 *   wasted part is what was not earned back (spend − revenue).
 * - belowAverage: profitable, but under half the account's ROAS. The wasted
 *   part is the spend that, at the account ROAS, would have bought the
 *   revenue it actually made.
 */
export function findWaste(data: MarketingData, rows: readonly DailyRow[], minSpend = 1000): WasteFinding[] {
  const account = totals(rows).roas
  const findings: WasteFinding[] = []
  for (const { key: campaign, totals: t } of byCampaign(data, rows)) {
    if (t.spend < minSpend) continue
    if (t.conversions === 0) {
      findings.push({ campaign, reason: 'noConversions', spend: t.spend, roas: t.roas, wasted: t.spend })
    } else if (t.roas != null && t.roas < 1) {
      findings.push({ campaign, reason: 'unprofitable', spend: t.spend, roas: t.roas, wasted: t.spend - t.revenue })
    } else if (t.roas != null && account != null && t.roas < account / 2) {
      findings.push({ campaign, reason: 'belowAverage', spend: t.spend, roas: t.roas, wasted: t.spend - t.revenue / account })
    }
  }
  return findings.sort((a, b) => b.wasted - a.wasted)
}

// ── Alerts ───────────────────────────────────────────────────────────────

export type AlertKind = 'cpcSpike' | 'cpaSpike' | 'spendDrop' | 'roasDrop'

export interface Alert {
  campaign: Campaign
  kind: AlertKind
  severity: 'high' | 'medium'
  /** Latest value and the trailing baseline it is compared with. */
  value: number
  baseline: number
}

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length
}

/**
 * Compares each campaign's last `recentDays` against the 14 days before them.
 * - cpcSpike / cpaSpike: cost per click / acquisition up 50%+ (high at 2x).
 * - spendDrop: daily spend down 70%+, usually a paused campaign, a payment
 *   problem or a rejected ad.
 * - roasDrop: ROAS down 35%+ (high at 50%).
 */
export function findAlerts(data: MarketingData, rows: readonly DailyRow[], endDate: string, recentDays = 2): Alert[] {
  const alerts: Alert[] = []
  for (const campaign of data.campaigns) {
    const own = rows.filter(r => r.campaignId === campaign.id)
    const recent = totals(inWindow(own, endDate, recentDays))
    const baseRows = inWindow(own, endDate, 14, recentDays)
    if (baseRows.length < 7) continue
    const base = totals(baseRows)
    const dailyBaseSpend = mean(baseRows.map(r => r.spend))
    const dailyRecentSpend = recent.spend / recentDays

    if (dailyBaseSpend > 0 && dailyRecentSpend < dailyBaseSpend * 0.3) {
      alerts.push({ campaign, kind: 'spendDrop', severity: 'high', value: dailyRecentSpend, baseline: dailyBaseSpend })
      continue // the other ratios are noise on a near-zero day
    }
    if (recent.cpc != null && base.cpc != null && recent.cpc >= base.cpc * 1.5) {
      alerts.push({ campaign, kind: 'cpcSpike', severity: recent.cpc >= base.cpc * 2 ? 'high' : 'medium', value: recent.cpc, baseline: base.cpc })
    }
    if (recent.cpa != null && base.cpa != null && recent.cpa >= base.cpa * 1.5) {
      alerts.push({ campaign, kind: 'cpaSpike', severity: recent.cpa >= base.cpa * 2 ? 'high' : 'medium', value: recent.cpa, baseline: base.cpa })
    }
    if (recent.roas != null && base.roas != null && base.roas > 0 && recent.roas <= base.roas * 0.65) {
      alerts.push({ campaign, kind: 'roasDrop', severity: recent.roas <= base.roas * 0.5 ? 'high' : 'medium', value: recent.roas, baseline: base.roas })
    }
  }
  const rank = { high: 0, medium: 1 }
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity])
}

// ── Assistant context ────────────────────────────────────────────────────

const money = (n: number) => `${Math.round(n).toLocaleString('tr-TR')} TL`
const ratio = (n: number | null) => (n == null ? '—' : n.toFixed(2))

/**
 * A compact Turkish briefing of the window, sent as the system message so the
 * model answers from these numbers instead of inventing its own.
 */
export function assistantContext(data: MarketingData, endDate: string, days: number): string {
  const rows = inWindow(data.rows, endDate, days)
  const { current: t, previous: p } = comparePeriods(data.rows, endDate, days)
  const lines: string[] = [
    'Sen bir e-ticaret pazarlama analistisin. Yalnızca aşağıdaki verilere dayanarak, Türkçe, kısa ve uygulanabilir yanıt ver. Verilerde olmayan bir şeyi uydurma; bilmiyorsan söyle.',
    `Dönem: ${endDate} tarihinde biten son ${days} gün. Para birimi TL. Bu veriler örnek (demo) verilerdir.`,
    `Toplam: harcama ${money(t.spend)}, gelir ${money(t.revenue)}, ROAS ${ratio(t.roas)}, dönüşüm ${t.conversions}, CPA ${t.cpa == null ? '—' : money(t.cpa)}.`,
    `Önceki ${days} gün: harcama ${money(p.spend)}, gelir ${money(p.revenue)}, ROAS ${ratio(p.roas)}, dönüşüm ${p.conversions}.`,
    'Kanallar:',
    ...byChannel(data, rows).map(({ key, totals: c }) =>
      `- ${CHANNELS[key].name}: harcama ${money(c.spend)}, gelir ${money(c.revenue)}, ROAS ${ratio(c.roas)}, dönüşüm ${c.conversions}`),
    'Kampanyalar:',
    ...byCampaign(data, rows).map(({ key, totals: c }) =>
      `- ${key.name} (${CHANNELS[key.channel].name}): harcama ${money(c.spend)}, gelir ${money(c.revenue)}, ROAS ${ratio(c.roas)}, dönüşüm ${c.conversions}, TBM ${c.cpc == null ? '—' : c.cpc.toFixed(2) + ' TL'}`),
  ]
  const waste = findWaste(data, rows)
  if (waste.length > 0) {
    lines.push('Boşa giden harcama tespitleri:')
    lines.push(...waste.map(w => `- ${w.campaign.name}: ${w.reason}, tahmini boşa giden ${money(w.wasted)}`))
  }
  const alerts = findAlerts(data, data.rows, endDate)
  if (alerts.length > 0) {
    lines.push('Son 2 günün uyarıları:')
    lines.push(...alerts.map(a => `- ${a.campaign.name}: ${a.kind} (${a.severity}), son değer ${a.value.toFixed(2)}, önceki ortalama ${a.baseline.toFixed(2)}`))
  }
  return lines.join('\n')
}
