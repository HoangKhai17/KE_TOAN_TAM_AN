import { useState, useRef, useCallback } from 'react'
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, Download, X, ChevronRight } from 'lucide-react'
import Modal from './Modal'
import { parseImportFile, downloadImportTemplate } from '../../utils/excelImport'
import s from './ExcelImportModal.module.css'

// ── ExcelImportModal ───────────────────────────────────────────────────────────
//
// Props:
//   title        — modal title string
//   entityLabel  — e.g. "hợp đồng", "dòng nợ", "chứng từ"
//   fixedCols    — Array<{key, label, required, type:'text'|'number'|'integer'|'date', example}>
//   dynCols      — Array<{colName, colType}> (custom columns, appended to template)
//   templateName — downloaded .xlsx filename
//   sheetName    — Excel sheet name in template
//   onImport     — async (validRows) => { inserted, failed, errors: [{row, message}] }
//   onClose      — () => void
//
export default function ExcelImportModal({
  title,
  entityLabel = 'bản ghi',
  fixedCols,
  dynCols = [],
  templateName = 'import_template.xlsx',
  sheetName = 'Dữ liệu',
  onImport,
  onClose,
}) {
  const [step,        setStep]        = useState('select')  // select | preview | result
  const [rows,        setRows]        = useState([])
  const [parseErrors, setParseErrors] = useState([])
  const [importing,   setImporting]   = useState(false)
  const [result,      setResult]      = useState(null)
  const [dragOver,    setDragOver]    = useState(false)
  const fileRef = useRef(null)

  const validRows   = rows.filter((r) => r._valid)
  const invalidRows = rows.filter((r) => !r._valid)

  // ── Template download ────────────────────────────────────────────────────────
  function handleDownloadTemplate() {
    downloadImportTemplate(fixedCols, dynCols, templateName, sheetName)
  }

  // ── File processing ──────────────────────────────────────────────────────────
  async function processFile(file) {
    if (!file) return
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setParseErrors(['Vui lòng chọn file .xlsx, .xls hoặc .csv'])
      return
    }
    try {
      const { rows: parsed, parseErrors: errs } = await parseImportFile(file, fixedCols, dynCols)
      setRows(parsed)
      setParseErrors(errs)
      setStep('preview')
    } catch {
      setParseErrors(['Không thể đọc file. Hãy đảm bảo đúng định dạng .xlsx'])
    }
  }

  function handleFileChange(e) { processFile(e.target.files[0]) }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    processFile(e.dataTransfer.files[0])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Import ───────────────────────────────────────────────────────────────────
  async function handleImport() {
    if (validRows.length === 0) return
    setImporting(true)
    try {
      const res = await onImport(validRows)
      setResult(res)
      setStep('result')
    } catch (err) {
      setResult({ inserted: 0, failed: validRows.length, errors: [{ row: 0, message: err.response?.data?.error?.message ?? 'Lỗi không xác định' }] })
      setStep('result')
    } finally {
      setImporting(false)
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────────
  const displayCols = fixedCols.slice(0, 6) // Show first 6 fixed cols in preview

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className={s.root}>

        {/* ── Breadcrumb ── */}
        <div className={s.breadcrumb}>
          <span className={step === 'select' ? s.stepActive : s.stepDone}>1. Chọn file</span>
          <ChevronRight size={12} className={s.stepArrow} />
          <span className={step === 'preview' ? s.stepActive : step === 'result' ? s.stepDone : s.stepIdle}>2. Xem trước</span>
          <ChevronRight size={12} className={s.stepArrow} />
          <span className={step === 'result' ? s.stepActive : s.stepIdle}>3. Kết quả</span>
        </div>

        {/* ══ STEP 1: SELECT FILE ══════════════════════════════════════════════ */}
        {step === 'select' && (
          <div className={s.selectStep}>
            <button className={s.templateBtn} onClick={handleDownloadTemplate}>
              <Download size={14} /> Tải mẫu Excel
            </button>
            <p className={s.templateHint}>
              Tải mẫu → điền dữ liệu → chọn file để import
            </p>

            <div
              className={`${s.dropZone} ${dragOver ? s.dropZoneOver : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <FileSpreadsheet size={36} className={s.dropIcon} />
              <p className={s.dropTitle}>Kéo thả file vào đây hoặc click để chọn</p>
              <p className={s.dropSub}>.xlsx · .xls · .csv</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={handleFileChange} />
            </div>

            {parseErrors.length > 0 && (
              <div className={s.errorBox}>
                <AlertCircle size={14} />
                {parseErrors[0]}
              </div>
            )}
          </div>
        )}

        {/* ══ STEP 2: PREVIEW ══════════════════════════════════════════════════ */}
        {step === 'preview' && (
          <div className={s.previewStep}>
            <div className={s.previewStats}>
              <span className={s.statValid}>
                <CheckCircle2 size={13} /> {validRows.length} dòng hợp lệ
              </span>
              {invalidRows.length > 0 && (
                <span className={s.statInvalid}>
                  <AlertCircle size={13} /> {invalidRows.length} dòng lỗi (sẽ bỏ qua)
                </span>
              )}
              <button className={s.reSelectBtn} onClick={() => { setStep('select'); setRows([]); setParseErrors([]) }}>
                Chọn lại file
              </button>
            </div>

            {/* Validation errors summary */}
            {parseErrors.length > 0 && (
              <div className={s.errorList}>
                {parseErrors.slice(0, 5).map((e, i) => (
                  <div key={i} className={s.errorItem}><AlertCircle size={11} /> {e}</div>
                ))}
                {parseErrors.length > 5 && <div className={s.errorItem}>...và {parseErrors.length - 5} lỗi khác</div>}
              </div>
            )}

            {/* Preview table */}
            <div className={s.previewTableWrap}>
              <table className={s.previewTable}>
                <thead>
                  <tr>
                    <th>#</th>
                    {displayCols.map((c) => <th key={c.key}>{c.label}</th>)}
                    {dynCols.slice(0, 2).map((c) => <th key={c.colName}>{c.colName}</th>)}
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((row, i) => (
                    <tr key={i} className={row._valid ? '' : s.rowInvalid}>
                      <td className={s.tdRowNum}>{row._rowNum}</td>
                      {displayCols.map((c) => (
                        <td key={c.key} className={s.tdCell}>
                          {row[c.key] !== null && row[c.key] !== undefined ? String(row[c.key]) : <span className={s.empty}>—</span>}
                        </td>
                      ))}
                      {dynCols.slice(0, 2).map((c) => (
                        <td key={c.colName} className={s.tdCell}>
                          {row[`dyn__${c.colName}`] ?? <span className={s.empty}>—</span>}
                        </td>
                      ))}
                      <td>
                        {row._valid
                          ? <span className={s.validBadge}>✓</span>
                          : <span className={s.invalidBadge}>Lỗi</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 20 && (
                <p className={s.truncNote}>Hiển thị 20 / {rows.length} dòng</p>
              )}
            </div>

            <div className={s.previewFooter}>
              <button className={s.btnOutline} onClick={onClose} disabled={importing}>Huỷ</button>
              <button
                className={s.btnImport}
                onClick={handleImport}
                disabled={importing || validRows.length === 0}
              >
                {importing
                  ? <><Loader2 size={13} className={s.spin} /> Đang nhập...</>
                  : <><Upload size={13} /> Nhập {validRows.length} {entityLabel}</>}
              </button>
            </div>
          </div>
        )}

        {/* ══ STEP 3: RESULT ═══════════════════════════════════════════════════ */}
        {step === 'result' && result && (
          <div className={s.resultStep}>
            {result.inserted > 0 && (
              <div className={s.resultSuccess}>
                <CheckCircle2 size={28} />
                <span>Đã nhập thành công <strong>{result.inserted}</strong> {entityLabel}</span>
              </div>
            )}
            {result.failed > 0 && (
              <div className={s.resultFailed}>
                <AlertCircle size={20} />
                <span><strong>{result.failed}</strong> dòng không nhập được</span>
              </div>
            )}
            {result.errors?.length > 0 && (
              <div className={s.resultErrors}>
                {result.errors.slice(0, 8).map((e, i) => (
                  <div key={i} className={s.resultErrorItem}>
                    {e.row > 0 && <span className={s.resultErrorRow}>Dòng {e.row}</span>}
                    {e.message}
                  </div>
                ))}
                {result.errors.length > 8 && <div className={s.resultErrorItem}>...và {result.errors.length - 8} lỗi khác</div>}
              </div>
            )}
            <div className={s.resultFooter}>
              <button className={s.btnImport} onClick={onClose}>Đóng</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
