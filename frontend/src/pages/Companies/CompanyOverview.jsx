import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import {
  LayoutGrid, ArrowLeft, Loader2, Download, Search, Eye, Copy, Check,
  ChevronLeft, ChevronRight, Building2,
} from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import { useToastStore } from '../../stores/toastStore'
import { overviewCompanies, exportCompanies } from '../../api/companies'
import { revealCredential } from '../../api/credentials'
import { EXPORT_SECTIONS } from '../../utils/companyExportSections'
import s from './companies.module.css'

const ALL_SECTION_KEYS = EXPORT_SECTIONS.map((sec) => sec.key)
const PAGE_SIZE = 50

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function CompanyOverview() {
  const navigate = useNavigate()
  const location = useLocation()
  const addToast = useToastStore((st) => st.toast)

  const companyIds = location.state?.companyIds ?? null
  const defIds     = location.state?.defIds ?? []
  const scopeLabel = location.state?.scopeLabel ?? ''

  const [data, setData]       = useState(null)   // { companyCount, sections }
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [exporting, setExporting] = useState(false)

  const [activeKey, setActiveKey]     = useState(null)
  const [hidden, setHidden]           = useState(() => new Set())  // section keys ẩn
  const [search, setSearch]           = useState('')
  const [page, setPage]               = useState(1)

  // Reveal mật khẩu: credentialId -> password
  const [revealed, setRevealed]   = useState({})
  const [revealing, setRevealing] = useState(() => new Set())
  const [copiedId, setCopiedId]   = useState(null)

  // Nạp dữ liệu tổng quan
  useEffect(() => {
    if (!companyIds || companyIds.length === 0) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    overviewCompanies({
      companyIds,
      sections: ALL_SECTION_KEYS,
      defIds,
      includeCredentials: true,   // gồm nhóm Tài khoản (mật khẩu vẫn che, tiết lộ theo yêu cầu)
    })
      .then((res) => {
        if (cancelled) return
        setData(res)
        setActiveKey(res.sections[0]?.key ?? null)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.response?.data?.error?.message ?? 'Không thể tải dữ liệu tổng quan')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sections     = data?.sections ?? []
  const visibleTabs  = sections.filter((sec) => !hidden.has(sec.key))
  const activeSection = visibleTabs.find((sec) => sec.key === activeKey) ?? visibleTabs[0] ?? null

  // Reset trang + tìm kiếm khi đổi tab
  useEffect(() => { setPage(1); setSearch('') }, [activeSection?.key])

  const filteredRows = useMemo(() => {
    if (!activeSection) return []
    const q = search.trim().toLowerCase()
    if (!q) return activeSection.rows
    return activeSection.rows.filter((r) =>
      r.cells.some((c) => String(c ?? '').toLowerCase().includes(q))
    )
  }, [activeSection, search])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageRows   = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const pwColIndex = activeSection?.key === 'credentials'
    ? activeSection.columns.indexOf('Mật khẩu')
    : -1

  function toggleSection(key) {
    setHidden((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function handleReveal(credentialId, companyId) {
    if (revealed[credentialId] !== undefined || revealing.has(credentialId)) return
    setRevealing((prev) => new Set(prev).add(credentialId))
    try {
      const pw = await revealCredential(companyId, credentialId)
      setRevealed((prev) => ({ ...prev, [credentialId]: pw }))
    } catch {
      addToast('Không thể hiển thị mật khẩu', 'error')
    } finally {
      setRevealing((prev) => { const n = new Set(prev); n.delete(credentialId); return n })
    }
  }

  async function handleCopy(id, text) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch { addToast('Không thể sao chép', 'error') }
  }

  async function handleQuickExport() {
    setExporting(true)
    try {
      const visibleKeys = visibleTabs.filter((t) => !t.key.startsWith('def:')).map((t) => t.key)
      const visibleDefIds = visibleTabs.filter((t) => t.key.startsWith('def:')).map((t) => t.key.slice(4))
      const { blob, filename } = await exportCompanies({
        companyIds,
        sections: visibleKeys,
        defIds: visibleDefIds,
        includeCredentials: false,   // xuất nhanh không kèm mật khẩu; cần mật khẩu → dùng modal Xuất ở danh sách
        layout: 'aggregate',
      })
      downloadBlob(blob, filename)
      addToast('Đã xuất Excel tổng hợp', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể xuất Excel', 'error')
    } finally {
      setExporting(false)
    }
  }

  // ── Guard: không có công ty (vào trực tiếp / refresh) ──
  if (!companyIds || companyIds.length === 0) {
    return (
      <AppLayout>
        <div className={s.page}>
          <div className={s.ovEmptyPage}>
            <Building2 size={40} style={{ color: 'var(--color-muted-soft)', marginBottom: 12 }} />
            <p>Chưa chọn công ty để xem tổng quan.</p>
            <button className={s.btnPrimary} onClick={() => navigate('/companies')}>
              <ArrowLeft size={14} /> Về danh sách công ty
            </button>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className={s.page}>

        {/* Header */}
        <div className={s.pageHeader}>
          <div className={s.pageTitleGroup}>
            <h1 className={s.pageTitle}>
              <LayoutGrid size={20} style={{ marginRight: 8, verticalAlign: '-3px' }} />
              Tổng quan dữ liệu công ty
            </h1>
            <p className={s.pageSubtitle}>
              {loading ? 'Đang tải…' : `${data?.companyCount ?? 0} công ty${scopeLabel ? ` · ${scopeLabel}` : ''}`}
            </p>
          </div>
          <div className={s.pageHeaderActions}>
            <button className={s.btnOutline} onClick={() => navigate('/companies')}>
              <ArrowLeft size={14} /> Quay lại
            </button>
            <button className={s.btnPrimary} onClick={handleQuickExport} disabled={loading || exporting || !!error}>
              {exporting ? <Loader2 size={14} className={s.spin} /> : <Download size={14} />} Xuất Excel
            </button>
          </div>
        </div>

        {loading ? (
          <div className={s.loadingCenter}>
            <Loader2 size={18} className={s.spin} style={{ marginRight: 8 }} /> Đang tải dữ liệu…
          </div>
        ) : error ? (
          <div className={s.errorBox}>{error}</div>
        ) : sections.length === 0 ? (
          <div className={s.ovEmptyPage}><p>Không có dữ liệu để hiển thị.</p></div>
        ) : (
          <>
            {/* Chips bật/tắt nhóm */}
            <div className={s.ovChips}>
              {sections.map((sec) => (
                <button
                  key={sec.key}
                  className={`${s.ovChip} ${hidden.has(sec.key) ? '' : s.ovChipOn}`}
                  onClick={() => toggleSection(sec.key)}
                  title={hidden.has(sec.key) ? 'Hiện nhóm' : 'Ẩn nhóm'}
                >
                  {sec.label} <span className={s.ovChipCount}>{sec.rows.length}</span>
                </button>
              ))}
            </div>

            {/* Tabs */}
            <div className={s.ovTabs}>
              {visibleTabs.map((sec) => (
                <button
                  key={sec.key}
                  className={`${s.ovTab} ${activeSection?.key === sec.key ? s.ovTabActive : ''}`}
                  onClick={() => setActiveKey(sec.key)}
                >
                  {sec.label} <span className={s.ovTabCount}>{sec.rows.length}</span>
                </button>
              ))}
            </div>

            {activeSection && (
              <>
                {/* Toolbar: tìm kiếm + đếm */}
                <div className={s.ovToolbar}>
                  <div className={s.ovSearch}>
                    <Search size={14} />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                      placeholder={`Tìm trong ${activeSection.label.toLowerCase()}…`}
                    />
                  </div>
                  <span className={s.ovCount}>
                    {filteredRows.length} dòng{search.trim() ? ` (lọc từ ${activeSection.rows.length})` : ''}
                  </span>
                </div>

                {/* Bảng */}
                {activeSection.rows.length === 0 ? (
                  <div className={s.ovEmpty}>Không có dữ liệu trong nhóm này.</div>
                ) : (
                  <div className={s.tableScroll}>
                    <table className={`${s.table} ${s.ovTable}`}>
                      <thead>
                        <tr>
                          <th className={s.ovSttCol}>#</th>
                          {activeSection.columns.map((col, i) => (
                            <th key={i}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map((row, ri) => (
                          <tr key={ri}>
                            <td className={s.ovSttCol}>{(safePage - 1) * PAGE_SIZE + ri + 1}</td>
                            {row.cells.map((cell, ci) => {
                              // Cột đầu = tên công ty → link sang chi tiết
                              if (ci === 0 && row.companyId) {
                                return (
                                  <td key={ci}>
                                    <Link to={`/companies/${row.companyId}`} className={s.ovCompanyLink}>
                                      {String(cell ?? '') || '—'}
                                    </Link>
                                  </td>
                                )
                              }
                              // Cột mật khẩu (nhóm credentials) → che + nút tiết lộ
                              if (ci === pwColIndex && row.credentialId) {
                                const pw = revealed[row.credentialId]
                                return (
                                  <td key={ci}>
                                    {pw !== undefined ? (
                                      <span className={s.ovPwRevealed}>
                                        <code>{pw || '(trống)'}</code>
                                        {pw && (
                                          <button
                                            className={s.ovIconBtn}
                                            onClick={() => handleCopy(row.credentialId, pw)}
                                            title="Sao chép"
                                          >
                                            {copiedId === row.credentialId ? <Check size={13} /> : <Copy size={13} />}
                                          </button>
                                        )}
                                      </span>
                                    ) : (
                                      <button
                                        className={s.ovRevealBtn}
                                        onClick={() => handleReveal(row.credentialId, row.companyId)}
                                        disabled={revealing.has(row.credentialId)}
                                      >
                                        {revealing.has(row.credentialId)
                                          ? <Loader2 size={12} className={s.spin} />
                                          : <Eye size={12} />} Xem
                                      </button>
                                    )}
                                  </td>
                                )
                              }
                              return <td key={ci} className={s.ovCell}>{String(cell ?? '')}</td>
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Phân trang */}
                {totalPages > 1 && (
                  <div className={s.ovPager}>
                    <button
                      className={s.btnOutline}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                    >
                      <ChevronLeft size={14} /> Trước
                    </button>
                    <span className={s.ovPagerInfo}>Trang {safePage}/{totalPages}</span>
                    <button
                      className={s.btnOutline}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage >= totalPages}
                    >
                      Sau <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}
