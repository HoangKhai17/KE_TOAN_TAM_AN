import { useState } from 'react'
import { Download, FileSpreadsheet, FileArchive, Loader2, AlertTriangle, Table2 } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { useToastStore } from '../../stores/toastStore'
import { exportCompanies } from '../../api/companies'
import { EXPORT_SECTIONS } from '../../utils/companyExportSections'
import s from './companies.module.css'

// Tải Blob về máy
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

// ── CompanyExportModal — xuất tổng hợp nhiều công ty ra Excel (admin) ───────────
//
// Props:
//   companies   — Array<company> đã chọn
//   customDefs  — Array<{id, name}> các bảng generic
//   onClose     — () => void
//
export default function CompanyExportModal({ companies, customDefs = [], onClose }) {
  const addToast = useToastStore((st) => st.toast)

  const [layout, setLayout] = useState('aggregate')  // aggregate | per_company
  const [sections, setSections] = useState(
    () => new Set(EXPORT_SECTIONS.filter((s) => !s.sensitive).map((s) => s.key))
  )
  const [defIds, setDefIds] = useState(() => new Set(customDefs.map((d) => d.id)))
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState(null)

  const credentialsOn = sections.has('credentials')
  const nothingSelected = sections.size === 0 && defIds.size === 0

  function toggleSection(key) {
    setSections((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }
  function toggleDef(id) {
    setDefIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function selectAll(on) {
    setSections(on ? new Set(EXPORT_SECTIONS.map((s) => s.key)) : new Set())
    setDefIds(on ? new Set(customDefs.map((d) => d.id)) : new Set())
  }

  async function handleExport() {
    if (nothingSelected || companies.length === 0) return
    setExporting(true)
    setError(null)
    try {
      const { blob, filename } = await exportCompanies({
        companyIds: companies.map((c) => c.id),
        sections: [...sections],
        defIds: [...defIds],
        includeCredentials: credentialsOn,
        layout,
      })
      downloadBlob(blob, filename)
      addToast(
        layout === 'per_company'
          ? `Đã xuất hồ sơ ${companies.length} công ty (.zip)`
          : `Đã xuất tổng hợp ${companies.length} công ty`,
        'success'
      )
      onClose()
    } catch (err) {
      // Lỗi trả về dạng Blob (responseType blob) — đọc message nếu có
      let msg = 'Không thể xuất dữ liệu. Vui lòng thử lại.'
      const data = err?.response?.data
      if (data instanceof Blob) {
        try { msg = JSON.parse(await data.text())?.error?.message ?? msg } catch { /* keep */ }
      } else if (err?.message) { msg = err.message }
      setError(msg)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Modal title={`Xuất tổng hợp — ${companies.length} công ty`} onClose={() => !exporting && onClose()} wide>
      <div className={s.modalForm}>

        {/* Cấu trúc file */}
        <div className={s.expBlock}>
          <div className={s.expBlockTitle}>Cấu trúc file</div>
          <div className={s.expStructRow}>
            <button
              type="button"
              className={`${s.expStructBtn} ${layout === 'aggregate' ? s.expStructBtnActive : ''}`}
              onClick={() => setLayout('aggregate')}
            >
              <FileSpreadsheet size={18} />
              <div>
                <div className={s.expStructName}>Tổng hợp theo nội dung</div>
                <div className={s.expStructDesc}>1 file Excel · mỗi nội dung 1 sheet · mỗi dòng 1 bản ghi</div>
              </div>
            </button>
            <button
              type="button"
              className={`${s.expStructBtn} ${layout === 'per_company' ? s.expStructBtnActive : ''}`}
              onClick={() => setLayout('per_company')}
            >
              <FileArchive size={18} />
              <div>
                <div className={s.expStructName}>Hồ sơ từng công ty (.zip)</div>
                <div className={s.expStructDesc}>Mỗi công ty 1 file Excel, nén lại thành .zip</div>
              </div>
            </button>
          </div>
        </div>

        {/* Nội dung xuất */}
        <div className={s.expBlock}>
          <div className={s.expBlockHead}>
            <div className={s.expBlockTitle}>Nội dung xuất</div>
            <div className={s.expSelectAll}>
              <button type="button" className={s.expLinkBtn} onClick={() => selectAll(true)}>Chọn tất cả</button>
              <span className={s.expDot}>·</span>
              <button type="button" className={s.expLinkBtn} onClick={() => selectAll(false)}>Bỏ chọn</button>
            </div>
          </div>
          <div className={s.expSectionGrid}>
            {EXPORT_SECTIONS.map((sec) => (
              <label key={sec.key} className={`${s.expSectionItem} ${sec.sensitive ? s.expSectionItemSensitive : ''}`}>
                <input
                  type="checkbox"
                  checked={sections.has(sec.key)}
                  onChange={() => toggleSection(sec.key)}
                />
                <span>{sec.label}{sec.sensitive ? ' 🔒' : ''}</span>
              </label>
            ))}
            {customDefs.map((d) => (
              <label key={d.id} className={s.expSectionItem}>
                <input
                  type="checkbox"
                  checked={defIds.has(d.id)}
                  onChange={() => toggleDef(d.id)}
                />
                <span className={s.expSectionGeneric}><Table2 size={12} /> {d.name}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Cảnh báo credentials */}
        {credentialsOn && (
          <div className={`${s.terminateWarn} ${s.terminateWarnDanger}`}>
            <AlertTriangle size={16} className={`${s.warnIconInline} ${s.warnIconDanger}`} />
            <span>
              Bạn đang chọn xuất <strong>Tài khoản hệ thống</strong> — file Excel sẽ chứa
              <strong> mật khẩu dạng văn bản thuần</strong>. Hãy lưu trữ và chia sẻ file hết sức cẩn trọng.
            </span>
          </div>
        )}

        {/* Tiến trình */}
        {exporting && (
          <div className={s.expProgress}>
            <span className={s.expProgressText}>
              <Loader2 size={13} className={s.spin} /> Đang tạo file trên máy chủ…
            </span>
          </div>
        )}

        {error && (
          <div className={s.expError}>
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        <div className={s.modalActions}>
          <button className={s.btnOutline} onClick={onClose} disabled={exporting}>Huỷ</button>
          <button className={s.btnPrimary} onClick={handleExport} disabled={exporting || nothingSelected || companies.length === 0}>
            {exporting
              ? <><Loader2 size={14} className={s.spin} /> Đang xuất…</>
              : <><Download size={14} /> Xuất {companies.length} công ty</>}
          </button>
        </div>
      </div>
    </Modal>
  )
}
