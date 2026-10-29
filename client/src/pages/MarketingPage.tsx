import { useMemo, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  ArrowDownRight, ArrowUpRight, BellRing, ChartLine, Flame, Layers, Megaphone, Send, Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { apiFetch } from '@/lib/api'
import {
  CHANNELS, assistantContext, byCampaign, byChannel, change, comparePeriods, dailySeries, findAlerts,
  findWaste, generateDemoData, inWindow, isoDate, type Alert, type AlertKind, type Totals, type WasteReason,
} from '@/lib/marketing'
import { PageHeader } from '@/components/page-header'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Markdown } from '@/components/markdown'

// Marketing co-pilot, Orphex-style: every ad channel in one view, the spend
// that is not coming back, and alerts on sudden changes, plus an assistant
// that answers from these numbers through the gateway's own routing.
//
// Hidden on purpose: the route exists but nothing links to it until ad
// accounts can be connected. The UI is Turkish-only for now and therefore
// not in the i18n catalogs; move the strings there before linking the page.

type Range = 7 | 14 | 30
const RANGES: Range[] = [7, 14, 30]

const tl = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })
const tl2 = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const int = new Intl.NumberFormat('tr-TR')
const pct = new Intl.NumberFormat('tr-TR', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' })
const shortDate = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' })

const ratio = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const roasText = (n: number | null) => (n == null ? '—' : `${ratio.format(n)}x`)
const moneyOrDash = (n: number | null, fmt = tl) => (n == null ? '—' : fmt.format(n))

const axisStyle = { fontSize: 11, fill: 'var(--muted-foreground)' } as const
const gridStyle = 'var(--border)'
const tooltipStyle = { backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 } as const
// Same validated two-series hues as the analytics page.
const chartVars = `
.marketing-viz { --series-a: #2a78d6; --series-b: #1baf7a; }
.dark .marketing-viz { --series-a: #3987e5; --series-b: #199e70; }
`

const WASTE_LABEL: Record<WasteReason, { title: string; advice: string }> = {
  noConversions: { title: 'Hiç dönüşüm yok', advice: 'Durdurun ya da hedeflemeyi daraltın; bütçeyi en iyi kampanyaya taşıyın.' },
  unprofitable: { title: 'Zarar ediyor', advice: 'Harcadığından az kazandırıyor. Teklifi düşürün veya kreatifi yenileyin.' },
  belowAverage: { title: 'Ortalamanın çok altında', advice: 'Kârlı ama hesap ortalamasının yarısından az getiriyor. Bütçesini kısın.' },
}

const ALERT_TEXT: Record<AlertKind, (a: Alert) => string> = {
  cpcSpike: a => `Tıklama başı maliyet ${tl2.format(a.baseline)} → ${tl2.format(a.value)}`,
  cpaSpike: a => `Dönüşüm başı maliyet ${tl.format(a.baseline)} → ${tl.format(a.value)}`,
  spendDrop: a => `Günlük harcama ${tl.format(a.baseline)} → ${tl.format(a.value)}. Kampanya durmuş, ödeme sorunu ya da reddedilmiş reklam olabilir.`,
  roasDrop: a => `ROAS ${roasText(a.baseline)} → ${roasText(a.value)}`,
}

const ALERT_TITLE: Record<AlertKind, string> = {
  cpcSpike: 'TBM fırladı',
  cpaSpike: 'Dönüşüm maliyeti arttı',
  spendDrop: 'Harcama durdu',
  roasDrop: 'ROAS düştü',
}

const SUGGESTIONS = [
  'Bütçeyi nasıl yeniden dağıtmalıyım?',
  'Bu hafta en çok neye dikkat etmeliyim?',
  'Hangi kampanyayı durdurmalıyım?',
]

function Panel({ icon: Icon, title, actions, children, bodyClassName = 'p-5' }: {
  icon: LucideIcon; title: string; actions?: React.ReactNode; children: React.ReactNode; bodyClassName?: string
}) {
  return (
    <section className="rounded-3xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
          {title}
        </h2>
        {actions}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

/** `better` says which direction is good news; spend has none. */
function Delta({ value, better }: { value: number | null; better: 'up' | 'down' | null }) {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>
  const good = better == null ? null : (value > 0) === (better === 'up')
  const tone = value === 0 || good == null
    ? 'text-muted-foreground'
    : good ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`inline-flex items-center gap-0.5 whitespace-nowrap text-xs tabular-nums ${tone}`}>
      <Icon className="size-3" aria-hidden="true" />
      {pct.format(value)}
    </span>
  )
}

function Kpi({ label, value, delta, better }: { label: string; value: string; delta: number | null; better: 'up' | 'down' | null }) {
  return (
    <div className="rounded-3xl border bg-card px-5 py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5">
        <Delta value={delta} better={better} />
        <span className="whitespace-nowrap text-xs text-muted-foreground">önceki döneme göre</span>
      </p>
    </div>
  )
}

function ChannelDot({ color }: { color: string }) {
  return <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
}

function Assistant({ context }: { context: string }) {
  const [question, setQuestion] = useState('')
  const [asked, setAsked] = useState<string | null>(null)
  const [answer, setAnswer] = useState<string | null>(null)
  const [via, setVia] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const { data: keyData } = useQuery<{ apiKey: string }>({
    queryKey: ['unified-key'],
    queryFn: () => apiFetch('/api/settings/api-key'),
  })

  async function ask(q: string) {
    const text = q.trim()
    if (!text || busy) return
    setBusy(true)
    setAsked(text)
    setAnswer(null)
    setVia(null)
    setError(null)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (keyData?.apiKey) headers.Authorization = `Bearer ${keyData.apiKey}`
      const base = import.meta.env.BASE_URL.replace(/\/$/, '')
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: [
            { role: 'system', content: context },
            { role: 'user', content: text },
          ],
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error?.message ?? `HTTP ${res.status}`)
      setAnswer(data?.choices?.[0]?.message?.content ?? '')
      setVia(res.headers.get('X-Routed-Via'))
      setQuestion('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => { e.preventDefault(); void ask(question) }

  return (
    <Panel icon={Sparkles} title="Pazarlama asistanı">
      <p className="text-sm text-muted-foreground">
        Bu sayfadaki rakamlara bakarak yanıt verir. İstekler FreeLLMAPI'nin yönlendirmesiyle ücretsiz modellere gider.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map(s => (
          <Button key={s} variant="outline" size="sm" disabled={busy} onClick={() => void ask(s)}>{s}</Button>
        ))}
      </div>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <Input
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Kampanyalarınız hakkında bir soru sorun…"
          aria-label="Asistana soru"
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !question.trim()} aria-label="Sor">
          <Send data-icon="inline-start" className="size-3.5" />
          Sor
        </Button>
      </form>
      {asked && (
        <div className="mt-4 rounded-2xl bg-muted/50 p-4" aria-live="polite">
          <p className="text-xs font-medium text-muted-foreground">{asked}</p>
          {busy && <p className="mt-2 text-sm text-muted-foreground">Düşünüyor…</p>}
          {error && (
            <p className="mt-2 text-sm text-destructive">
              Yanıt alınamadı: {error.replace(/\.+$/, '')}. Keys sayfasından en az bir sağlayıcı anahtarı eklediğinizden emin olun.
            </p>
          )}
          {answer != null && <Markdown className="mt-2">{answer}</Markdown>}
          {via && <p className="mt-2 text-[11px] text-muted-foreground">Yanıtlayan: {via}</p>}
        </div>
      )}
    </Panel>
  )
}

export default function MarketingPage() {
  const [range, setRange] = useState<Range>(7)
  // "Today" is fixed at mount so the demo window doesn't shift mid-session
  // and render stays pure.
  const [endDate] = useState(() => isoDate(Date.now()))
  const data = useMemo(() => generateDemoData(endDate), [endDate])

  const view = useMemo(() => {
    const rows = inWindow(data.rows, endDate, range)
    const { current, previous } = comparePeriods(data.rows, endDate, range)
    const waste = findWaste(data, rows)
    return {
      current,
      previous,
      series: dailySeries(rows),
      channels: byChannel(data, rows),
      campaigns: byCampaign(data, rows),
      waste,
      wasteTotal: waste.reduce((s, w) => s + w.wasted, 0),
      alerts: findAlerts(data, data.rows, endDate),
      context: assistantContext(data, endDate, range),
    }
  }, [data, endDate, range])

  const { current: c, previous: p } = view
  const d = (pick: (t: Totals) => number | null) => change(pick(c), pick(p))
  const wastedIds = new Map(view.waste.map(w => [w.campaign.id, w.reason]))
  const alertedIds = new Set(view.alerts.map(a => a.campaign.id))

  return (
    <div className="marketing-viz">
      <style>{chartVars}</style>
      <PageHeader
        title="Pazarlama"
        description="Tüm reklam kanallarınız tek ekranda: nereye harcadığınız, ne kazandırdığı ve nerede para kaçtığı."
        actions={
          <SegmentedControl
            value={String(range) as `${Range}`}
            onValueChange={v => setRange(Number(v) as Range)}
            options={RANGES.map(r => ({ value: String(r) as `${Range}`, label: `${r} gün` }))}
            ariaLabel="Dönem"
          />
        }
      />

      <p className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="secondary">Örnek veri</Badge>
        Reklam hesapları henüz bağlı değil; rakamlar gerçekçi bir mağaza senaryosundan geliyor.
      </p>

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi label="Harcama" value={tl.format(c.spend)} delta={d(t => t.spend)} better={null} />
          <Kpi label="Gelir" value={tl.format(c.revenue)} delta={d(t => t.revenue)} better="up" />
          <Kpi label="ROAS" value={roasText(c.roas)} delta={d(t => t.roas)} better="up" />
          <Kpi label="Dönüşüm" value={int.format(c.conversions)} delta={d(t => t.conversions)} better="up" />
          <Kpi label="Dönüşüm başı maliyet" value={moneyOrDash(c.cpa)} delta={d(t => t.cpa)} better="down" />
        </div>

        <Panel icon={ChartLine} title="Harcama ve gelir">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={view.series} margin={{ top: 6, right: 6, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke={gridStyle} />
              <XAxis
                dataKey="date"
                tick={axisStyle}
                tickLine={false}
                axisLine={{ stroke: gridStyle }}
                tickFormatter={(v: string) => shortDate.format(new Date(`${v}T00:00:00Z`))}
                minTickGap={24}
              />
              <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => `${int.format(Math.round(v / 1000))}B`} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(v) => shortDate.format(new Date(`${String(v)}T00:00:00Z`))}
                formatter={(value) => tl.format(Number(value))}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="line" />
              <Line type="monotone" dataKey="revenue" name="Gelir" stroke="var(--series-b)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="spend" name="Harcama" stroke="var(--series-a)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <Panel
            icon={Flame}
            title="Boşa giden harcama"
            actions={view.waste.length > 0 && (
              <span className="text-sm font-semibold tabular-nums text-destructive">{tl.format(view.wasteTotal)}</span>
            )}
            bodyClassName="divide-y"
          >
            {view.waste.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">Bu dönemde boşa giden harcama bulunmadı.</p>
            ) : view.waste.map(w => (
              <div key={w.campaign.id} className="px-5 py-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-medium">{w.campaign.name}</p>
                  <p className="shrink-0 text-sm tabular-nums">{tl.format(w.wasted)}</p>
                </div>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ChannelDot color={CHANNELS[w.campaign.channel].color} />
                  {CHANNELS[w.campaign.channel].name} · {WASTE_LABEL[w.reason].title} · ROAS {roasText(w.roas)}
                </p>
                <p className="mt-1.5 text-xs">{WASTE_LABEL[w.reason].advice}</p>
              </div>
            ))}
          </Panel>

          <Panel icon={BellRing} title="Uyarılar" actions={<span className="text-xs text-muted-foreground">Son 2 gün, önceki 14 güne göre</span>} bodyClassName="divide-y">
            {view.alerts.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">Olağan dışı bir değişiklik yok.</p>
            ) : view.alerts.map(a => (
              <div key={`${a.campaign.id}-${a.kind}`} className="flex gap-3 px-5 py-3.5">
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${a.severity === 'high' ? 'bg-destructive' : 'bg-amber-500'}`}
                  aria-label={a.severity === 'high' ? 'Yüksek önem' : 'Orta önem'}
                  role="img"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{ALERT_TITLE[a.kind]} <span className="font-normal text-muted-foreground">· {a.campaign.name}</span></p>
                  <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{ALERT_TEXT[a.kind](a)}</p>
                </div>
              </div>
            ))}
          </Panel>
        </div>

        <Panel icon={Layers} title="Kanallar" bodyClassName="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Kanal</TableHead>
                <TableHead className="text-right">Harcama</TableHead>
                <TableHead className="hidden w-40 sm:table-cell">Pay</TableHead>
                <TableHead className="text-right">Gelir</TableHead>
                <TableHead className="text-right">ROAS</TableHead>
                <TableHead className="text-right">Dönüşüm</TableHead>
                <TableHead className="pr-5 text-right">CPA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.channels.map(({ key, totals: t }) => {
                const share = c.spend > 0 ? t.spend / c.spend : 0
                return (
                  <TableRow key={key}>
                    <TableCell className="pl-5">
                      <span className="flex items-center gap-2 font-medium"><ChannelDot color={CHANNELS[key].color} />{CHANNELS[key].name}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{tl.format(t.spend)}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full rounded-full" style={{ width: `${share * 100}%`, backgroundColor: CHANNELS[key].color }} />
                        </span>
                        <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{Math.round(share * 100)}%</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{tl.format(t.revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{roasText(t.roas)}</TableCell>
                    <TableCell className="text-right tabular-nums">{int.format(t.conversions)}</TableCell>
                    <TableCell className="pr-5 text-right tabular-nums">{moneyOrDash(t.cpa)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Panel>

        <Panel icon={Megaphone} title="Kampanyalar" bodyClassName="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Kampanya</TableHead>
                <TableHead className="text-right">Harcama</TableHead>
                <TableHead className="text-right">Gelir</TableHead>
                <TableHead className="text-right">ROAS</TableHead>
                <TableHead className="text-right">TBM</TableHead>
                <TableHead className="text-right">Dönüşüm</TableHead>
                <TableHead className="pr-5">Durum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.campaigns.map(({ key: camp, totals: t }) => {
                const waste = wastedIds.get(camp.id)
                return (
                  <TableRow key={camp.id}>
                    <TableCell className="pl-5">
                      <span className="block max-w-72 truncate font-medium">{camp.name}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><ChannelDot color={CHANNELS[camp.channel].color} />{CHANNELS[camp.channel].name}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{tl.format(t.spend)}</TableCell>
                    <TableCell className="text-right tabular-nums">{tl.format(t.revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{roasText(t.roas)}</TableCell>
                    <TableCell className="text-right tabular-nums">{moneyOrDash(t.cpc, tl2)}</TableCell>
                    <TableCell className="text-right tabular-nums">{int.format(t.conversions)}</TableCell>
                    <TableCell className="pr-5">
                      {waste
                        ? <Badge variant="destructive">{WASTE_LABEL[waste].title}</Badge>
                        : alertedIds.has(camp.id)
                          ? <Badge variant="outline">Uyarı var</Badge>
                          : <span className="text-xs text-muted-foreground">Sağlıklı</span>}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Panel>

        <Assistant context={view.context} />
      </div>
    </div>
  )
}
