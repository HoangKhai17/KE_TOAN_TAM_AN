import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ClipboardList, RefreshCw, Building2, Calendar,
  CheckCircle2, AlertTriangle, XCircle, Clock, Eye,
} from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import { getAdminOverview } from '../../api/clientRequests'
import s from './adminClientRequests.module.css'

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const STATUS_BADGE = {
  pending:      { bg: '#fffbeb', color: '#92400e', border: '#fcd34d', label: 'Chờ KH' },
  received:     { bg: '#f0fdf4', color: '#15803d', border: '#86efac', label: 'Đã nhận' },
  not_required: { bg: '#f8fafc', color: '#64748b', border: '#cbd5e1', label: 'Không cần' },
  overdue:      { bg: '#fef2f2', color: '#b91c1c', border: '#fca5a5', label: 'Quá hạn' },
}

export default function AdminClientRequests() {
  const navigate   = useNavigate()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getAdminOverview()
      .then((d) => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setError('Không thể tải dữ liệu tổng quan') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const cancel = load()
    return cancel
  }, [load])

  const stats = data?.stats ?? {}
  const upcoming = data?.upcomingDeadlines ?? []

  const kpiCards = [
    { label: 'Đang chờ',    value: stats.pending     ?? 0, icon: Clock,        color: '#d97706', bg: '#fffbeb' },
    { label: 'Quá hạn',     value: stats.overdue     ?? 0, icon: AlertTriangle, color: '#b91c1c', bg: '#fef2f2', urgent: (stats.overdue ?? 0) > 0 },
    { label: 'Đã nhận',     value: stats.received    ?? 0, icon: CheckCircle2,  color: '#15803d', bg: '#f0fdf4' },
    { label: 'Không cần',   value: stats.notRequired ?? 0, icon: XCircle,       color: '#64748b', bg: '#f8fafc' },
    { label: 'Tổng cộng',   value: stats.total       ?? 0, icon: ClipboardList, color: '#2563eb', bg: '#eff6ff' },
  ]

  return (
    <AppLayout>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 0 32px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Yêu cầu tài liệu khách hàng
            </h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
              Tổng quan tất cả yêu cầu tài liệu trong hệ thống
            </p>
          </div>
          <button
            onClick={load}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8, fontSize: 13,
              border: '1px solid #e2e8f0', background: '#fff',
              color: '#475569', cursor: 'pointer',
            }}
          >
            <RefreshCw size={13} /> Làm mới
          </button>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* KPI cards */}
        <div className={s.kpiGrid}>
          {kpiCards.map((card) => {
            const Icon = card.icon
            return (
              <div
                key={card.label}
                className={`${s.kpiCard} ${card.urgent ? s.kpiCardUrgent : ''}`}
                style={{ background: card.bg }}
              >
                <div className={s.kpiIconWrap} style={{ color: card.color }}>
                  <Icon size={22} />
                </div>
                <div className={s.kpiBody}>
                  {loading ? (
                    <div className={s.kpiSkeleton} />
                  ) : (
                    <div className={s.kpiValue} style={{ color: card.color }}>{card.value}</div>
                  )}
                  <div className={s.kpiLabel}>{card.label}</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Upcoming deadlines */}
        <div className={s.section}>
          <div className={s.sectionHead}>
            <div className={s.sectionTitle}>
              <Calendar size={14} style={{ color: '#d97706' }} />
              Hạn nộp trong 7 ngày tới
            </div>
            <span className={s.sectionCount}>{upcoming.length} yêu cầu</span>
          </div>

          {loading ? (
            <div className={s.skeletonList}>
              {[1, 2, 3].map((i) => (
                <div key={i} className={s.skeletonRow}>
                  <div className={s.skeletonBar} style={{ width: '40%' }} />
                  <div className={s.skeletonBar} style={{ width: '20%' }} />
                  <div className={s.skeletonBar} style={{ width: '15%' }} />
                </div>
              ))}
            </div>
          ) : upcoming.length === 0 ? (
            <div className={s.empty}>
              <CheckCircle2 size={32} style={{ color: '#86efac' }} />
              <p>Không có yêu cầu nào đến hạn trong 7 ngày tới</p>
            </div>
          ) : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Tài liệu yêu cầu</th>
                    <th>Công ty</th>
                    <th>Kỳ</th>
                    <th style={{ width: 100 }}>Hạn nộp</th>
                    <th style={{ width: 100 }}>Trạng thái</th>
                    <th style={{ width: 50 }} />
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((item) => {
                    const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.pending
                    return (
                      <tr key={item.id}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>
                            {item.documentName}
                          </div>
                          {item.requestedByName && (
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                              Tạo bởi {item.requestedByName}
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569' }}>
                            <Building2 size={12} style={{ color: '#94a3b8', flexShrink: 0 }} />
                            <span
                              style={{ cursor: 'pointer', color: '#2563eb', textDecoration: 'underline' }}
                              onClick={() => navigate(`/companies/${item.companyId}?tab=client-requests`)}
                            >
                              {item.companyName}
                            </span>
                          </div>
                        </td>
                        <td style={{ fontSize: 12, color: '#64748b' }}>
                          {item.periodLabel || '—'}
                        </td>
                        <td style={{ fontSize: 12, color: item.status === 'overdue' ? '#b91c1c' : '#64748b', fontWeight: 600 }}>
                          {fmtDate(item.deadlineDate)}
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-flex', padding: '2px 9px', borderRadius: 20,
                            fontSize: 11, fontWeight: 600,
                            background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`,
                          }}>
                            {badge.label}
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => navigate(`/companies/${item.companyId}?tab=client-requests`)}
                            style={{
                              background: 'none', border: '1px solid #e2e8f0',
                              borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
                              color: '#64748b', display: 'flex', alignItems: 'center',
                            }}
                            title="Xem tại công ty"
                          >
                            <Eye size={12} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Quick nav to full list */}
        <div className={s.section} style={{ marginTop: 16 }}>
          <div className={s.sectionHead}>
            <div className={s.sectionTitle}>
              <ClipboardList size={14} style={{ color: '#2563eb' }} />
              Quản lý nhanh
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '16px 0 4px' }}>
            <button
              onClick={() => navigate('/tasks?audience=client_request')}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer',
              }}
            >
              <ClipboardList size={14} />
              Xem tất cả yêu cầu KH trong Công việc
            </button>
            <button
              onClick={() => navigate('/companies')}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: '#fff', color: '#1e293b', border: '1px solid #e2e8f0', cursor: 'pointer',
              }}
            >
              <Building2 size={14} />
              Đến trang công ty
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
