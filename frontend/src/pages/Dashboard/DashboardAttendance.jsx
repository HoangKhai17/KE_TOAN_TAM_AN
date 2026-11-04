import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { CalendarCheck, Clock, UserX, Plane, Timer, AlertTriangle, ArrowRight, Loader2, ClipboardCheck, Building2 } from 'lucide-react'
import { getRecordsSummary, listLeaveRequests, listOvertimeRequests, listLeavePolicies } from '../../api/attendance'
import s from './Dashboard.module.css'

const now = new Date()
const CUR_YEAR = now.getFullYear()
const CUR_MONTH = now.getMonth() + 1

const num = (v) => Number(v) || 0
const fmt = (v) => { const n = num(v); return Number.isInteger(n) ? n : n.toFixed(1) }
const shortName = (nm) => (nm || '').trim().split(/\s+/).slice(-2).join(' ')
const fmtD = (d) => (d ? new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—')
const DAYPART = { full: '', morning: 'sáng', afternoon: 'chiều', hours: 'theo giờ' }

export default function DashboardAttendance() {
  const navigate = useNavigate()

  const summaryQuery = useQuery({
    queryKey: ['dashboard-attn-summary', CUR_YEAR, CUR_MONTH],
    queryFn: () => getRecordsSummary({ month: CUR_MONTH, year: CUR_YEAR }),
    staleTime: 60_000,
  })
  // Đơn CHƯA DUYỆT (pending) — hàng đợi cần xử lý, không giới hạn theo tháng.
  const leaveQuery = useQuery({
    queryKey: ['dashboard-attn-leave-pending'],
    queryFn: () => listLeaveRequests({ status: 'pending', limit: 200 }),
    staleTime: 60_000,
  })
  const otQuery = useQuery({
    queryKey: ['dashboard-attn-ot-pending'],
    queryFn: () => listOvertimeRequests({ status: 'pending', limit: 200 }),
    staleTime: 60_000,
  })
  const policiesQuery = useQuery({
    queryKey: ['leave-policies'],
    queryFn: () => listLeavePolicies(),
    staleTime: 10 * 60_000,
  })

  const rows = Array.isArray(summaryQuery.data) ? summaryQuery.data : []
  const leaveReqs = leaveQuery.data?.requests ?? []
  const otReqs    = otQuery.data?.requests ?? []
  const loading = summaryQuery.isLoading
  const leaveLabel = useMemo(() => {
    const m = {}
    for (const p of (policiesQuery.data ?? [])) m[p.leaveType] = p.label
    return (k) => m[k] ?? k
  }, [policiesQuery.data])

  const t = useMemo(() => ({
    workDays:  rows.reduce((a, r) => a + num(r.actualWorkDays), 0),
    late:      rows.reduce((a, r) => a + num(r.lateCount), 0),
    early:     rows.reduce((a, r) => a + num(r.earlyCount), 0),
    absent:    rows.reduce((a, r) => a + num(r.absentDays), 0),
    leaveDays: rows.reduce((a, r) => a + num(r.leavePaidDays) + num(r.unpaidLeaveDays), 0),
    otHours:   rows.reduce((a, r) => a + num(r.totalOtHours), 0),
  }), [rows])

  const pendingTotal = leaveReqs.length + otReqs.length

  const CARDS = [
    { tone: s.kpiBlue,   Icon: CalendarCheck, label: 'Tổng ngày công', value: fmt(t.workDays), sub: `${rows.length} nhân viên` },
    { tone: s.kpiAmber,  Icon: Clock,         label: 'Đi muộn',        value: t.late, sub: `Về sớm ${t.early} lần` },
    { tone: s.kpiRed,    Icon: UserX,         label: 'Vắng',           value: fmt(t.absent), sub: 'ngày vắng mặt' },
    { tone: s.kpiPurple, Icon: Plane,         label: 'Nghỉ phép',      value: fmt(t.leaveDays), sub: 'ngày nghỉ trong kỳ' },
    { tone: s.kpiCyan,   Icon: Timer,         label: 'Tăng ca',        value: fmt(t.otHours), sub: 'giờ OT đã duyệt' },
  ]

  return (
    <div className={`${s.chartPanel} ${s.kpiPanel}`}>
      <div className={s.chartHeader}>
        <div>
          <span className={s.chartTitle}>Tổng quan chấm công</span>
          <span className={s.chartSub}>Tháng {CUR_MONTH}/{CUR_YEAR} · chấm công · nghỉ phép · tăng ca</span>
        </div>
        <button className={s.chartHeaderLink} onClick={() => navigate('/attendance/admin')}>
          Quản lý chấm công <ArrowRight size={12} />
        </button>
      </div>

      {loading ? (
        <div className={s.chartLoading}><Loader2 size={20} className={s.spin} /></div>
      ) : (
        <>
          <div className={s.attnCards}>
            {CARDS.map((c) => (
              <div key={c.label} className={`${s.kpiCard} ${c.tone}`}>
                <div className={s.kpiCardInner}>
                  <div className={s.kpiIcon}><c.Icon size={20} /></div>
                  <div className={s.kpiText}>
                    <p className={s.kpiLabel}>{c.label}</p>
                    <p className={s.kpiValue}>{c.value}</p>
                    <p className={s.kpiSub}>{c.sub}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Bảng chi tiết nhân viên */}
          <div className={s.kpiLeaderWrap} style={{ maxHeight: 300, marginTop: 14 }}>
            <table className={s.kpiLeaderTable}>
              <colgroup>
                <col /><col style={{ width: 78 }} /><col style={{ width: 66 }} /><col style={{ width: 66 }} /><col style={{ width: 60 }} /><col style={{ width: 74 }} /><col style={{ width: 70 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Nhân viên</th>
                  <th className={s.kpiLeaderNum}>Ngày công</th>
                  <th className={s.kpiLeaderNum}>Đi muộn</th>
                  <th className={s.kpiLeaderNum}>Về sớm</th>
                  <th className={s.kpiLeaderNum}>Vắng</th>
                  <th className={s.kpiLeaderNum}>Nghỉ phép</th>
                  <th className={s.kpiLeaderNum}>Tăng ca</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const leave = num(r.leavePaidDays) + num(r.unpaidLeaveDays)
                  const z = (v, cls) => (num(v) > 0 ? (cls ? <strong style={{ color: cls }}>{fmt(v)}</strong> : fmt(v)) : <span className={s.kpiLeaderMuted}>—</span>)
                  return (
                    <tr key={r.userId}>
                      <td className={s.kpiLeaderName} title={r.jobTitle ? `${r.userName} · ${r.jobTitle}` : r.userName}>{shortName(r.userName)}</td>
                      <td className={s.kpiLeaderNum}><strong>{fmt(r.actualWorkDays)}</strong></td>
                      <td className={s.kpiLeaderNum}>{z(r.lateCount, 'var(--color-accent-dark)')}</td>
                      <td className={s.kpiLeaderNum}>{z(r.earlyCount, 'var(--color-warning-dark)')}</td>
                      <td className={s.kpiLeaderNum}>{z(r.absentDays, 'var(--color-danger)')}</td>
                      <td className={s.kpiLeaderNum}>{z(leave, 'var(--color-purple, #7c3aed)')}</td>
                      <td className={s.kpiLeaderNum}>{z(r.totalOtHours, 'var(--color-cyan-dark, #0e7490)')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Đơn CHƯA DUYỆT — 2 section riêng (Nghỉ phép | Tăng ca) */}
          <div className={s.attnSplit}>
            {/* Nghỉ phép chờ duyệt */}
            <div className={s.attnSplitPane}>
              <div className={s.attnSecHead}>
                <span className={s.attnSecTitle}><Plane size={14} /> Nghỉ phép chờ duyệt {leaveReqs.length > 0 && <span className={s.attnSubCount}>{leaveReqs.length}</span>}</span>
                {leaveReqs.length > 0 && (
                  <button className={s.attnSecLink} onClick={() => navigate('/attendance/admin')}><ClipboardCheck size={12} /> Duyệt</button>
                )}
              </div>
              {leaveReqs.length === 0 ? (
                <div className={s.attnEmpty}><ClipboardCheck size={22} /> Không có đơn nghỉ phép chờ duyệt 🎉</div>
              ) : (
                <div className={s.kpiLeaderWrap} style={{ maxHeight: 300 }}>
                  <table className={s.kpiLeaderTable}>
                    <colgroup><col style={{ width: 92 }} /><col /><col style={{ width: 92 }} /><col style={{ width: 92 }} /><col style={{ width: 46 }} /></colgroup>
                    <thead>
                      <tr><th>Nhân viên</th><th>Loại nghỉ</th><th className={s.kpiLeaderNum}>Từ ngày</th><th className={s.kpiLeaderNum}>Đến ngày</th><th className={s.kpiLeaderNum}>Ngày</th></tr>
                    </thead>
                    <tbody>
                      {leaveReqs.map((r) => (
                        <tr key={r.id} className={s.attnRowClick} onClick={() => navigate('/attendance/admin')}>
                          <td className={s.kpiLeaderName} title={r.userName}>{shortName(r.userName)}</td>
                          <td className={s.kpiLeaderName}>{leaveLabel(r.leaveType)}{r.dayPart && r.dayPart !== 'full' && <span className={s.kpiLeaderSub}> · {DAYPART[r.dayPart]}</span>}</td>
                          <td className={s.kpiLeaderNum}>{fmtD(r.startDate)}</td>
                          <td className={s.kpiLeaderNum}>{fmtD(r.endDate)}</td>
                          <td className={s.kpiLeaderNum}><strong>{fmt(r.totalDays)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Tăng ca chờ duyệt */}
            <div className={s.attnSplitPane}>
              <div className={s.attnSecHead}>
                <span className={s.attnSecTitle}><Timer size={14} /> Tăng ca chờ duyệt {otReqs.length > 0 && <span className={s.attnSubCount}>{otReqs.length}</span>}</span>
                {otReqs.length > 0 && (
                  <button className={s.attnSecLink} onClick={() => navigate('/attendance/admin')}><ClipboardCheck size={12} /> Duyệt</button>
                )}
              </div>
              {otReqs.length === 0 ? (
                <div className={s.attnEmpty}><ClipboardCheck size={22} /> Không có đơn tăng ca chờ duyệt 🎉</div>
              ) : (
                <div className={s.kpiLeaderWrap} style={{ maxHeight: 300 }}>
                  <table className={s.kpiLeaderTable}>
                    <colgroup><col style={{ width: 92 }} /><col style={{ width: 48 }} /><col style={{ width: 104 }} /><col style={{ width: 96 }} /><col /></colgroup>
                    <thead>
                      <tr><th>Nhân viên</th><th className={s.kpiLeaderNum}>Giờ</th><th className={s.kpiLeaderCenter}>Khung giờ</th><th className={s.kpiLeaderNum}>Ngày</th><th>Khách hàng</th></tr>
                    </thead>
                    <tbody>
                      {otReqs.map((r) => (
                        <tr key={r.id} className={s.attnRowClick} onClick={() => navigate('/attendance/admin')}>
                          <td className={s.kpiLeaderName} title={r.userName}>{shortName(r.userName)}</td>
                          <td className={s.kpiLeaderNum}><strong>{fmt(r.otHours)}h</strong></td>
                          <td className={s.kpiLeaderCenter}>{r.startTime && r.endTime ? `${String(r.startTime).slice(0, 5)}–${String(r.endTime).slice(0, 5)}` : <span className={s.kpiLeaderMuted}>—</span>}</td>
                          <td className={s.kpiLeaderNum}>{fmtD(r.otDate)}</td>
                          <td className={s.kpiLeaderName}>{r.clientCompanyName ? <span className={s.attnCompany}><Building2 size={11} /><span className={s.attnCompanyName}>{r.clientCompanyName}</span></span> : <span className={s.kpiLeaderMuted}>—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
