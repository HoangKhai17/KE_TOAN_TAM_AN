import { useState, useEffect } from 'react'
import { Loader2, Wand2, AlertTriangle, Check } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { useToastStore } from '../../stores/toastStore'
import { previewRenameTitles, applyRenameTitles } from '../../api/taskTypes'
import s from './settings.module.css'

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  MÀN HÌNH TẠM THỜI — XOÁ SAU KHI CHẠY XONG TRÊN SERVER                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 * Dọn một lần tiêu đề công việc tự sinh cũ (bỏ tên công ty ở đuôi).
 * Có vì trên server không gõ được lệnh docker để chạy script.
 * Xoá kèm: nút gọi nó trong TaskTypesSection.jsx, 2 hàm TEMP trong api/taskTypes.js,
 * và phía backend là renameAutoTitles.TEMP.service.js + 2 route/controller TEMP.
 */
export default function RenameTitlesModal({ onClose }) {
  const addToast = useToastStore((st) => st.toast)
  const [loading, setLoading]   = useState(true)
  const [running, setRunning]   = useState(false)
  const [data, setData]         = useState(null)
  const [xong, setXong]         = useState(false)

  useEffect(() => {
    let huy = false
    previewRenameTitles()
      .then((r) => { if (!huy) setData(r) })
      .catch((err) => {
        if (!huy) addToast(err.response?.data?.error?.message ?? 'Không xem trước được', 'error')
      })
      .finally(() => { if (!huy) setLoading(false) })
    return () => { huy = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function chay() {
    setRunning(true)
    try {
      const r = await applyRenameTitles()
      setData(r)
      setXong(true)
      addToast(`Đã đổi tên ${r.daGhi} công việc`, 'success', 6000)
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không chạy được', 'error', 6000)
    } finally { setRunning(false) }
  }

  const tk = data?.tongKet

  return (
    <Modal title="Dọn tiêu đề công việc tự sinh cũ" onClose={onClose} wide>
      {loading ? (
        <div className={s.syncLoading}><Loader2 size={16} className={s.spin} /> Đang rà soát…</div>
      ) : !data ? null : (
        <>
          <div className={s.syncSummary}>
            <div className={s.syncSummaryRow}>
              Bỏ tên công ty ở đuôi tiêu đề của công việc tự sinh đã tạo trước đây.
            </div>
            <div className={s.syncStats}>
              <span className={s.syncStat}>Tìm thấy: <b>{tk.timThay}</b></span>
              <span className={`${s.syncStat} ${s.syncStat_green}`}>
                {xong ? 'Đã đổi' : 'Sẽ đổi'}: <b>{xong ? data.daGhi : tk.seDoi}</b>
              </span>
              {tk.boQua > 0 && (
                <span className={`${s.syncStat} ${s.syncStat_amber}`}>Bỏ qua: <b>{tk.boQua}</b></span>
              )}
            </div>
          </div>

          {xong ? (
            <div className={s.syncEmpty}>
              <Check size={16} /> Đã chạy xong. Có thể đóng cửa sổ này.
            </div>
          ) : (
            <div className={s.syncSafety}>
              <Check size={13} />
              <div>
                Chỉ cắt phần đuôi khi nó <b>trùng khớp tên công ty</b> của chính công việc đó.
                Kỳ và tên mẫu giữ nguyên. Chạy trong một giao dịch — lỗi giữa chừng hoàn tác hết.
              </div>
            </div>
          )}

          {data.boQua?.length > 0 && (
            <div className={s.syncBlock}>
              <div className={s.syncBlockTitle}>
                {data.boQua.length} công việc BỎ QUA — cần xem lại bằng tay
              </div>
              {data.boQua.map((b, i) => (
                <div key={i} className={s.syncRowKeep}>
                  <AlertTriangle size={10} /> {b.tieuDe}
                  <i style={{ marginLeft: 6, opacity: 0.75 }}>({b.lyDo})</i>
                </div>
              ))}
            </div>
          )}

          {data.doi?.length > 0 && (
            <>
              <div className={s.syncListHead}>
                <span>{xong ? 'Đã đổi' : 'Sẽ đổi'} {data.doi.length} tiêu đề</span>
              </div>
              <div className={s.syncList}>
                {data.doi.map((d, i) => (
                  <div key={i} className={s.syncItem}>
                    <div className={s.syncItemBody} style={{ paddingLeft: 10 }}>
                      <div className={s.syncDiffOld}>− {d.cu}</div>
                      <div className={s.syncDiffNew}>+ {d.moi}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className={s.modalActions}>
            <button className={s.btnOutline} onClick={onClose} disabled={running}>
              {xong ? 'Đóng' : 'Huỷ'}
            </button>
            {!xong && (
              <button className={s.btnSave} onClick={chay} disabled={running || !tk.seDoi}>
                {running
                  ? <><Loader2 size={13} className={s.spin} /> Đang chạy…</>
                  : <><Wand2 size={13} /> Chạy đổi {tk.seDoi} tiêu đề</>}
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}
