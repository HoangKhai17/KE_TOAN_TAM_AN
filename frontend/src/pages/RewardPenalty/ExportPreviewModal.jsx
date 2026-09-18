// ExportPreviewModal — flow Xuất Excel CHUẨN của hệ thống: click → popup chọn cột +
// xem trước → Xuất (dùng exportXlsx chuẩn). Dùng chung cho 3 bảng Điểm thưởng.
//
// Props:
//   title, filename, sheetName
//   columns : [{ key, label, width?, type?:'number'|'date'|'text', thousands?, total?, value(row) }]
//   data    : mảng dòng (đã lọc / đã chọn)
//   totalLabel? : nhãn dòng tổng (nếu có cột total)
//   onClose
import { useState } from 'react'
import { Loader2, Download } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { exportXlsx } from '../../utils/exportXlsx'
import { useToastStore } from '../../stores/toastStore'
import s from './rewardPenalty.module.css'

export default function ExportPreviewModal({ title, filename, sheetName = 'Dữ liệu', columns, data, totalLabel, onClose }) {
  const addToast = useToastStore((st) => st.toast)
  const [sel, setSel] = useState(() => new Set(columns.map((c) => c.key)))
  const [exporting, setExporting] = useState(false)
  const toggle = (k) => setSel((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n })
  const outCols = columns.filter((c) => sel.has(c.key))

  const cellText = (c, r) => { const v = c.value(r); return v == null || v === '' ? '—' : String(v) }

  async function doExport() {
    if (outCols.length === 0) { addToast('Chọn ít nhất 1 cột', 'error'); return }
    setExporting(true)
    try {
      const columnsSpec = [
        { label: 'STT', type: 'number', align: 'center', width: 6 },
        ...outCols.map((c) => ({ label: c.label, type: c.type || 'text', thousands: !!c.thousands, width: c.width })),
      ]
      const rowsSpec = data.map((r, i) => [i + 1, ...outCols.map((c) => c.value(r))])
      const hasTotal = outCols.some((c) => c.total)
      const totalRow = hasTotal
        ? ['', ...outCols.map((c, idx) => (idx === 0 ? (totalLabel || 'Tổng') : (c.total ? data.reduce((a, r) => a + (Number(c.value(r)) || 0), 0) : '')))]
        : null
      await exportXlsx({ filename, sheets: [{ name: sheetName.slice(0, 31), columns: columnsSpec, rows: rowsSpec, totalRow, totalPosition: 'bottom' }] })
      onClose()
    } catch (e) { addToast(e.response?.data?.error?.message ?? 'Xuất Excel thất bại', 'error') }
    finally { setExporting(false) }
  }

  const previewRows = data.slice(0, 8)
  return (
    <Modal title={title} onClose={onClose} width="min(900px, calc(100vw - 40px))">
      <div className={s.expBody}>
        <div className={s.expSide}>
          <div className={s.expSideTitle}>Chọn cột xuất</div>
          {columns.map((c) => (
            <label key={c.key} className={s.expField}>
              <input type="checkbox" checked={sel.has(c.key)} onChange={() => toggle(c.key)} />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
        <div className={s.expPreview}>
          <div className={s.expPreviewTitle}>Xem trước ({Math.min(8, data.length)} / {data.length} dòng)</div>
          <div className={s.expPreviewWrap}>
            {outCols.length === 0 || data.length === 0 ? (
              <div className={s.expEmpty}>{outCols.length === 0 ? 'Chưa chọn cột nào' : 'Không có dữ liệu'}</div>
            ) : (
              <table className={s.expTable}>
                <thead><tr><th>STT</th>{outCols.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr key={i}><td>{i + 1}</td>{outCols.map((c) => <td key={c.key}>{cellText(c, r)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
      <div className={s.expFoot}>
        <button className={s.btnSecondary} onClick={onClose} disabled={exporting}>Huỷ</button>
        <button className={s.btnPrimary} onClick={doExport} disabled={exporting || outCols.length === 0 || data.length === 0}>
          {exporting ? <Loader2 size={13} className={s.spin} /> : <Download size={14} />} Xuất Excel
        </button>
      </div>
    </Modal>
  )
}
