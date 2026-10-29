import { describe, expect, it } from 'vitest'
import {
  assistantContext, byChannel, change, comparePeriods, dailySeries, findAlerts, findWaste,
  generateDemoData, inWindow, totals, type DailyRow, type MarketingData,
} from './marketing'

const END = '2026-10-29'

function row(over: Partial<DailyRow>): DailyRow {
  return { date: END, campaignId: 'a', spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0, ...over }
}

describe('totals', () => {
  it('derives ratios and leaves them null when the divisor is zero', () => {
    const t = totals([row({ spend: 100, revenue: 300, clicks: 50, impressions: 1000, conversions: 4 })])
    expect(t.roas).toBe(3)
    expect(t.cpa).toBe(25)
    expect(t.cpc).toBe(2)
    expect(t.ctr).toBe(0.05)
    expect(totals([])).toMatchObject({ roas: null, cpa: null, cpc: null, ctr: null })
  })
})

describe('windows', () => {
  it('selects the inclusive window and the one before it', () => {
    const rows = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'].map(date => row({ date, spend: 10 }))
    expect(inWindow(rows, END, 2).map(r => r.date)).toEqual(['2026-10-28', '2026-10-29'])
    const { current, previous } = comparePeriods(rows, END, 2)
    expect(current.spend).toBe(20)
    expect(previous.spend).toBe(20)
  })

  it('reports no change against a missing or zero baseline', () => {
    expect(change(150, 100)).toBe(0.5)
    expect(change(5, 0)).toBeNull()
    expect(change(null, 3)).toBeNull()
  })
})

describe('demo data', () => {
  const data = generateDemoData(END)

  it('is deterministic and covers every campaign on every day', () => {
    expect(generateDemoData(END)).toEqual(data)
    expect(data.rows).toHaveLength(60 * data.campaigns.length)
    expect(dailySeries(data.rows)).toHaveLength(60)
    expect(dailySeries(data.rows).at(-1)?.date).toBe(END)
  })

  it('plants the findings the page demonstrates', () => {
    const rows = inWindow(data.rows, END, 30)
    const waste = findWaste(data, rows)
    expect(waste.find(w => w.campaign.id === 'g-display')?.reason).toBe('noConversions')
    expect(waste.some(w => w.reason === 'unprofitable')).toBe(true)
    expect(waste.every(w => w.wasted > 0)).toBe(true)

    const alerts = findAlerts(data, data.rows, END)
    expect(alerts.find(a => a.campaign.id === 'g-generic')?.kind).toBe('cpcSpike')
    expect(alerts.find(a => a.campaign.id === 'c-retarget')?.kind).toBe('spendDrop')
    expect(alerts.some(a => a.campaign.id === 'g-brand')).toBe(false)
  })

  it('groups spend by channel, largest first', () => {
    const channels = byChannel(data, inWindow(data.rows, END, 30))
    expect(channels.map(c => c.key).sort()).toEqual(['criteo', 'google', 'meta', 'tiktok'])
    expect(channels[0].totals.spend).toBeGreaterThanOrEqual(channels[1].totals.spend)
  })

  it('briefs the assistant with the window figures', () => {
    const text = assistantContext(data, END, 7)
    expect(text).toContain('son 7 gün')
    expect(text).toContain('Görüntülü Reklam – İlgi Alanı')
    expect(text).toContain('Boşa giden harcama')
  })
})

describe('findWaste', () => {
  const data: MarketingData = {
    campaigns: [
      { id: 'a', name: 'A', channel: 'google' },
      { id: 'b', name: 'B', channel: 'meta' },
      { id: 'c', name: 'C', channel: 'meta' },
      { id: 'd', name: 'D', channel: 'tiktok' },
    ],
    rows: [
      row({ campaignId: 'a', spend: 5000, revenue: 40000, conversions: 50 }), // ROAS 8, healthy
      row({ campaignId: 'b', spend: 2000, revenue: 0, conversions: 0 }),
      row({ campaignId: 'c', spend: 2000, revenue: 1500, conversions: 3 }),
      row({ campaignId: 'd', spend: 500, revenue: 0, conversions: 0 }), // under minSpend
    ],
  }

  it('flags no-conversion and unprofitable campaigns and skips thin data', () => {
    const found = findWaste(data, data.rows)
    expect(found.map(f => [f.campaign.id, f.reason, f.wasted])).toEqual([
      ['b', 'noConversions', 2000],
      ['c', 'unprofitable', 500],
    ])
  })
})
