import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Award, Clock, Target, Wallet, Users, TrendingUp, ArrowRight, Loader2 } from 'lucide-react'
import { getKpiPerformance } from '../../api/kpi'
import { listGrades } from '../../api/rewardPenalty'
import s from './Dashboard.module.css'

const now = new Date()
const CUR_YEAR = now.getFullYear()
const CUR_MONTH = now.getMonth() + 1

const CLR = {
  point: '#2563eb',   // Điểm đạt
  missed: '#dc2626',  // Điểm chưa đạt
  ontime: '#0891b2',  // % đúng hạn
  grid: '#eef2f7',
  axis: '#94a3b8',
}

const fmtMoney = (n) => (Number(n) || 0).toLocaleString('vi-VN')
const fmtSigned = (n) => { const v = Number(n) || 0; return v > 0 ? `+${fmtMoney(v)}` : fmtMoney(v) }
// Điểm tối đa có thể đạt = điểm gốc việc định kỳ tháng này (gồm chưa xong) + điểm gốc việc cũ làm bù.
const maxPts    = (r) => (Number(r.volumePossible) || 0) + (Number(r.oldGross) || 0)
// Điểm CHƯA ĐẠT = tối đa − đã đạt (volumePoints). Luôn ≥ 0.
const missedPts = (r) => Math.max(0, maxPts(r) - (Number(r.volumePoints) || 0))
// Tên ngắn: 2 từ cuối (phần tên gọi). "Bùi Thị Thanh Thảo" → "Thanh Thảo".
const shortName = (nm) => (nm || '').trim().split(/\s+/).slice(-2).join(' ')
// Màu theo hạng (sort 0=E … 5=S) — bám palette hệ thống.
const GRADE_COLORS = [
  'var(--color-danger)', 'var(--color-accent)', 'var(--color-muted)',
  'var(--color-info)', 'var(--color-success)', 'var(--color-purple-bright)',
]
const gradeColor = (sort) => (sort != null ? (GRADE_COLORS[sort] ?? 'var(--color-muted)') : 'var(--color-muted)')
const pctTone = (p) => (p == null ? s.kpiGray : p >= 90 ? s.kpiGreen : p >= 80 ? s.kpiAmber : s.kpiRed)

// Danh sách n tháng gần nhất (gồm tháng hiện tại), cũ → mới.
function lastMonths(n) {
  const arr = []
  let y = CUR_YEAR, m = CUR_MONTH
  for (let i = 0; i < n; i++) { arr.unshift({ year: y, month: m }); m -= 1; if (m < 1) { m = 12; y -= 1 } }
  return arr
}

function GradeBadge({ label, sort }) {
  if (!label) return <span className={s.kpiGradeBadge} style={{ '--grade-color': 'var(--color-muted)' }}>Chưa xếp</span>
  return <span className={s.kpiGradeBadge} style={{ '--grade-color': gradeColor(sort) }}>{label}</span>
}

// ── Biểu đồ đường: Điểm (trục trái) + % đúng hạn (trục phải) ───────────────────
function KpiLineChart({ data, xKey, title }) {
  return (
    <div className={s.kpiChartBox}>
      <p className={s.kpiChartTitle}>{title}</p>
      <ResponsiveContainer width="100%" height={248}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
          <CartesianGrid stroke={CLR.grid} vertical={false} />
          <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: CLR.axis }} tickLine={false} axisLine={{ stroke: CLR.grid }} />
          <YAxis yAxisId="pt" tick={{ fontSize: 11, fill: CLR.axis }} tickLine={false} axisLine={false} width={34} allowDecimals={false} />
          <YAxis yAxisId="ot" orientation="right" domain={[0, 100]} tick={{ fontSize: 11, fill: CLR.axis }} tickLine={false} axisLine={false} width={34} unit="%" />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--color-border-muted)' }}
            formatter={(v, n) => [v == null ? '—' : (n === '% đúng hạn' ? `${v}%` : v), n]}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          <Line yAxisId="pt" type="monotone" dataKey="diem" name="Đạt" stroke={CLR.point} strokeWidth={2.2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          <Line yAxisId="pt" type="monotone" dataKey="chuadat" name="Chưa đạt" stroke={CLR.missed} strokeWidth={2.2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          <Line yAxisId="ot" type="monotone" dataKey="ontime" name="% đúng hạn" stroke={CLR.ontime} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2 }} activeDot={{ r: 4 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Khối KPI nhân viên (cá nhân) ──────────────────────────────────────────────
function StaffKpi({ row, progressGrades, trend }) {
  const volPts    = Number(row.volumePoints ?? 0)              // Điểm khối lượng (khớp "Đánh giá")
  const progPts   = Number(row.progressPoints ?? volPts)       // = khối lượng + điểm KPI → quyết định xếp loại
  const onTimePct = row.onTimePct
  const totalAmt  = Number(row.totalAmount ?? row.amount ?? 0)

  // Tiến độ tới mốc xếp loại kế tiếp (theo ĐIỂM TIẾN ĐỘ — chính là cơ sở xếp loại ở backend)
  const tier = useMemo(() => {
    const asc = [...progressGrades].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    const cur = asc.find((g) => g.code === row.progressGradeCode || g.code === row.gradeCode)
    const curSort = cur?.sortOrder ?? row.gradeSort ?? -1
    const next = asc.find((g) => (g.sortOrder ?? 0) > curSort && g.minPoints != null)
    if (!next) return { atTop: true }
    const base = cur?.minPoints ?? 0
    const span = Math.max(1, next.minPoints - base)
    const pct = Math.max(0, Math.min(100, Math.round(((progPts - base) / span) * 100)))
    return { atTop: false, next, remaining: Math.max(0, Math.round((next.minPoints - progPts) * 10) / 10), pct }
  }, [progressGrades, row, progPts])

  const possible    = maxPts(row)
  const missed      = missedPts(row)
  const recPossible = Number(row.volumePossible ?? 0)
  const recMissed   = Math.max(0, recPossible - (Number(row.ptMonth) ?? 0))
  const oldGross    = Number(row.oldGross ?? 0)
  const oldLost     = Number(row.oldLost ?? 0)
  const muted = <span className={s.kpiLeaderMuted}>—</span>
  const missedCell = (v) => (v > 0 ? <strong style={{ color: 'var(--color-danger)' }}>{v}</strong> : <span className={s.kpiLeaderMuted}>0</span>)

  return (
    <>
      <div className={s.kpiMiniGrid}>
        <div className={`${s.kpiCard} ${s.kpiBlue}`}>
          <div className={s.kpiCardInner}>
            <div className={s.kpiIcon}><Award size={20} /></div>
            <div className={s.kpiText}>
              <p className={s.kpiLabel}>Điểm khối lượng</p>
              <p className={s.kpiValue}>{volPts}</p>
              <p className={s.kpiSub}>Tháng này <strong>{row.ptMonth ?? 0}</strong> · Việc cũ <strong>{row.ptOld ?? 0}</strong></p>
            </div>
          </div>
        </div>
        <div className={`${s.kpiCard} ${pctTone(onTimePct)}`}>
          <div className={s.kpiCardInner}>
            <div className={s.kpiIcon}><Clock size={20} /></div>
            <div className={s.kpiText}>
              <p className={s.kpiLabel}>Tỉ lệ đúng hạn</p>
              <p className={s.kpiValue}>{onTimePct == null ? '—' : <>{onTimePct}<small>%</small></>}</p>
              <p className={s.kpiSub}>{row.onTimeCount ?? 0}/{row.assignedCount ?? 0} việc đúng hạn</p>
            </div>
          </div>
        </div>
        <div className={`${s.kpiCard} ${s.kpiPurple}`}>
          <div className={s.kpiCardInner}>
            <div className={s.kpiIcon}><Target size={20} /></div>
            <div className={s.kpiText}>
              <p className={s.kpiLabel}>Xếp loại</p>
              <p className={s.kpiValue}><GradeBadge label={row.gradeLabel} sort={row.gradeSort} /></p>
              <p className={s.kpiSub}>Điểm KPI {fmtSigned(row.kpiPoints ?? 0)}</p>
            </div>
          </div>
        </div>
        <div className={`${s.kpiCard} ${totalAmt < 0 ? s.kpiRed : s.kpiGreen}`}>
          <div className={s.kpiCardInner}>
            <div className={s.kpiIcon}><Wallet size={20} /></div>
            <div className={s.kpiText}>
              <p className={s.kpiLabel}>{totalAmt < 0 ? 'Khấu trừ' : 'Tiền thưởng'}</p>
              <p className={s.kpiValue}>{fmtSigned(totalAmt)} <small>đ</small></p>
              <p className={s.kpiSub}>Tiến độ + thưởng/phạt</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tiến độ tới mốc xếp loại kế tiếp */}
      <div className={s.kpiTierBox}>
        {tier.atTop ? (
          <div className={s.kpiTierTop}>🏆 Bạn đang ở mức xếp loại cao nhất. Giữ vững phong độ nhé!</div>
        ) : (
          <>
            <div className={s.kpiTierHead}>
              <span>Tiến độ lên hạng <strong style={{ color: gradeColor(tier.next.sortOrder) }}>{tier.next.label}</strong></span>
              <span className={s.kpiTierRemain}>Còn <strong>{tier.remaining}</strong> điểm</span>
            </div>
            <div className={s.kpiTierTrack}>
              <div className={s.kpiTierFill} style={{ width: `${tier.pct}%`, background: gradeColor(tier.next.sortOrder) }} />
            </div>
          </>
        )}
      </div>

      {/* Chia đôi: bảng thành phần điểm · biểu đồ xu hướng */}
      <div className={s.kpiSplit}>
        <div className={s.kpiSplitPane}>
          <div className={s.kpiLeaderWrap}>
            <table className={s.kpiLeaderTable}>
              <colgroup>
                <col /><col style={{ width: 66 }} /><col style={{ width: 62 }} /><col style={{ width: 80 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Nhóm công việc</th>
                  <th className={s.kpiLeaderNum}>Tối đa</th>
                  <th className={s.kpiLeaderNum}>Đạt</th>
                  <th className={s.kpiLeaderNum}>Chưa đạt</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Định kỳ (tháng này)</td>
                  <td className={s.kpiLeaderNum}>{recPossible || muted}</td>
                  <td className={s.kpiLeaderNum}><strong>{row.ptMonth ?? 0}</strong></td>
                  <td className={s.kpiLeaderNum}>{missedCell(recMissed)}</td>
                </tr>
                <tr>
                  <td>Việc cũ (làm bù)</td>
                  <td className={s.kpiLeaderNum}>{oldGross || muted}</td>
                  <td className={s.kpiLeaderNum}><strong>{row.ptOld ?? 0}</strong></td>
                  <td className={s.kpiLeaderNum}>{missedCell(oldLost)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td>Tổng</td>
                  <td className={s.kpiLeaderNum}>{possible}</td>
                  <td className={s.kpiLeaderNum}><strong>{volPts}</strong></td>
                  <td className={s.kpiLeaderNum}>{missedCell(missed)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        <div className={s.kpiSplitPane}>
          <KpiLineChart data={trend} xKey="label" title="Xu hướng 6 tháng · Đạt · Chưa đạt · % đúng hạn" />
        </div>
      </div>
    </>
  )
}

// ── Khối KPI đội nhóm (admin) ─────────────────────────────────────────────────
function AdminKpi({ data }) {
  const rows = data.rows || []
  const summary = useMemo(() => {
    const n = rows.length
    const sumVol = rows.reduce((a, r) => a + (Number(r.volumePoints) || 0), 0)
    const sumAssigned = rows.reduce((a, r) => a + (Number(r.assignedCount) || 0), 0)
    const sumOnTime = rows.reduce((a, r) => a + (Number(r.onTimeCount) || 0), 0)
    const avgPct = sumAssigned > 0 ? Math.round((sumOnTime * 100) / sumAssigned) : null
    const sumAmount = rows.reduce((a, r) => a + (Number(r.totalAmount ?? r.amount) || 0), 0)
    const gm = new Map()
    for (const r of rows) {
      if (!r.gradeCode) continue
      const g = gm.get(r.gradeCode) || { code: r.gradeCode, label: r.gradeLabel, sort: r.gradeSort ?? 0, count: 0 }
      g.count += 1; gm.set(r.gradeCode, g)
    }
    const gradeDist = [...gm.values()].sort((a, b) => a.sort - b.sort)
    const graded = gradeDist.reduce((a, g) => a + g.count, 0)
    const leaders = [...rows].sort((a, b) => (b.volumePoints ?? 0) - (a.volumePoints ?? 0))
    return { n, sumVol, avgPct, sumAmount, gradeDist, graded, leaders }
  }, [rows])

  // Dữ liệu biểu đồ: điểm khối lượng & % đúng hạn theo từng nhân viên (đã xếp hạng)
  const chartData = useMemo(
    () => summary.leaders.map((r) => ({ label: shortName(r.userName), diem: r.volumePoints ?? 0, chuadat: missedPts(r), ontime: r.onTimePct })),
    [summary.leaders],
  )

  return (
    <>
      <div className={s.kpiMiniGrid}>
        <div className={`${s.kpiCard} ${s.kpiBlue}`}>
          <div className={s.kpiCardInner}>
            <div className={s.kpiIcon}><Users size={20} /></div>
            <div className={s.kpiText}>
              <p className={s.kpiLabel}>Nhân viên có KPI</p>
              <p className={s.kpiValue}>{summary.n}</p>
              <p className={s.kpiSub}>trong kỳ này</p>
            </div>
          </div>
        </div>
        <div className={`${s.kpiCard} ${s.kpiAmber}`}>
          <div className={s.kpiCardInner}>
            <div className={s.kpiIcon}><Award size={20} /></div>
            <div className={s.kpiText}>
              <p className={s.kpiLabel}>Tổng điểm khối lượng</p>
              <p className={s.kpiValue}>{fmtMoney(summary.sumVol)}</p>
              <p className={s.kpiSub}>cả đội nhóm</p>
            </div>
          </div>
        </div>
        <div className={`${s.kpiCard} ${pctTone(summary.avgPct)}`}>
          <div className={s.kpiCardInner}>
            <div className={s.kpiIcon}><Clock size={20} /></div>
            <div className={s.kpiText}>
              <p className={s.kpiLabel}>Đúng hạn TB</p>
              <p className={s.kpiValue}>{summary.avgPct == null ? '—' : <>{summary.avgPct}<small>%</small></>}</p>
              <p className={s.kpiSub}>trung bình toàn đội</p>
            </div>
          </div>
        </div>
        <div className={`${s.kpiCard} ${summary.sumAmount < 0 ? s.kpiRed : s.kpiGreen}`}>
          <div className={s.kpiCardInner}>
            <div className={s.kpiIcon}><Wallet size={20} /></div>
            <div className={s.kpiText}>
              <p className={s.kpiLabel}>Tổng thưởng/phạt</p>
              <p className={s.kpiValue}>{fmtSigned(summary.sumAmount)} <small>đ</small></p>
              <p className={s.kpiSub}>toàn đội trong kỳ</p>
            </div>
          </div>
        </div>
      </div>

      {/* Phân bố xếp loại */}
      {summary.graded > 0 && (
        <div className={s.kpiDistrib}>
          <div className={s.kpiDistribBar}>
            {summary.gradeDist.map((g) => (
              <span key={g.code} title={`${g.label}: ${g.count} NV`} style={{ width: `${(g.count / summary.graded) * 100}%`, background: gradeColor(g.sort) }} />
            ))}
          </div>
          <div className={s.kpiDistribLegend}>
            {summary.gradeDist.map((g) => (
              <span key={g.code} className={s.kpiDistribLg}>
                <span className={s.kpiDistribSw} style={{ background: gradeColor(g.sort) }} />
                {g.label} <strong>{g.count}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Chia đôi: bảng xếp hạng · biểu đồ đường */}
      <div className={s.kpiSplit}>
        <div className={s.kpiSplitPane}>
          <div className={s.kpiLeaderWrap}>
            <table className={s.kpiLeaderTable}>
              <colgroup>
                <col style={{ width: 32 }} /><col /><col style={{ width: 54 }} /><col style={{ width: 72 }} /><col style={{ width: 128 }} />
              </colgroup>
              <thead>
                <tr>
                  <th className={s.kpiLeaderRank}>#</th>
                  <th>Nhân viên</th>
                  <th className={s.kpiLeaderNum}>Đạt</th>
                  <th className={s.kpiLeaderNum}>Chưa đạt</th>
                  <th className={s.kpiLeaderCenter}>Xếp loại</th>
                </tr>
              </thead>
              <tbody>
                {summary.leaders.map((r, i) => {
                  const pts = r.volumePoints ?? 0
                  const miss = missedPts(r)
                  return (
                    <tr key={r.userId}>
                      <td className={s.kpiLeaderRank}>{i + 1}</td>
                      <td className={s.kpiLeaderName} title={r.jobTitle ? `${r.userName} · ${r.jobTitle}` : r.userName}>{shortName(r.userName)}</td>
                      <td className={s.kpiLeaderNum}><strong>{pts}</strong></td>
                      <td className={s.kpiLeaderNum}>{miss > 0 ? <strong style={{ color: 'var(--color-danger)' }}>{miss}</strong> : <span className={s.kpiLeaderMuted}>0</span>}</td>
                      <td className={s.kpiLeaderCenter}><GradeBadge label={r.gradeLabel} sort={r.gradeSort} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className={s.kpiSplitPane}>
          <KpiLineChart data={chartData} xKey="label" title="Đạt · Chưa đạt · % đúng hạn theo nhân viên" />
        </div>
      </div>
    </>
  )
}

// ── Panel chính ───────────────────────────────────────────────────────────────
export default function DashboardKpi({ user }) {
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin'

  const kpiQuery = useQuery({
    queryKey: ['dashboard-kpi', CUR_YEAR, CUR_MONTH],
    queryFn: () => getKpiPerformance(CUR_YEAR, CUR_MONTH),
    staleTime: 60_000,
  })
  const gradesQuery = useQuery({
    queryKey: ['kpi-progress-grades'],
    queryFn: () => listGrades({ activeOnly: true, category: 'progress' }),
    staleTime: 10 * 60_000,
    enabled: !isAdmin,   // chỉ staff cần mốc để vẽ tiến độ lên hạng
  })
  // Xu hướng 6 tháng (chỉ staff) — mỗi tháng lấy record của chính mình (buildFilter ép userId).
  const trendQuery = useQuery({
    queryKey: ['dashboard-kpi-trend', user?.id],
    queryFn: async () => {
      const months = lastMonths(6)
      const res = await Promise.all(months.map((mm) => getKpiPerformance(mm.year, mm.month).catch(() => ({ rows: [] }))))
      return months.map((mm, i) => {
        const r = (res[i].rows || [])[0]
        return { label: `T${mm.month}`, diem: r ? (r.volumePoints ?? 0) : 0, chuadat: r ? missedPts(r) : 0, ontime: r ? r.onTimePct : null }
      })
    },
    enabled: !isAdmin,
    staleTime: 5 * 60_000,
  })

  const data = kpiQuery.data ?? { rows: [] }
  const loading = kpiQuery.isLoading
  const myRow = !isAdmin ? (data.rows || [])[0] : null

  return (
    <div className={`${s.chartPanel} ${s.kpiPanel}`}>
      <div className={s.chartHeader}>
        <div>
          <span className={s.chartTitle}>{isAdmin ? 'KPI đội nhóm' : 'KPI của tôi'}</span>
          <span className={s.chartSub}>Tháng {CUR_MONTH}/{CUR_YEAR}{data.closed ? ' · đã chốt' : ' · đang mở'}</span>
        </div>
        <button className={s.chartHeaderLink} onClick={() => navigate('/reward-penalty')}>
          {isAdmin ? 'Quản lý KPI' : 'Xem chi tiết'} <ArrowRight size={12} />
        </button>
      </div>

      {loading ? (
        <div className={s.chartLoading}><Loader2 size={20} className={s.spin} /></div>
      ) : isAdmin ? (
        (data.rows || []).length === 0
          ? <div className={s.chartEmpty}><TrendingUp size={26} />Chưa có dữ liệu KPI trong kỳ này.</div>
          : <AdminKpi data={data} />
      ) : !myRow ? (
        <div className={s.chartEmpty}><TrendingUp size={26} />Bạn chưa có dữ liệu KPI trong kỳ này.</div>
      ) : (
        <StaffKpi row={myRow} progressGrades={gradesQuery.data ?? []} trend={trendQuery.data ?? []} />
      )}
    </div>
  )
}
