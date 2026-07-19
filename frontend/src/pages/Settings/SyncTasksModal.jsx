import { useState, useEffect } from 'react'
import { Loader2, RefreshCw, AlertTriangle, Check, Lock, ChevronDown, ChevronRight } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { useToastStore } from '../../stores/toastStore'
import { previewSyncTasks, applySyncTasks } from '../../api/taskTypes'
import s from './settings.module.css'

// Đồng bộ công việc ĐÃ PHÁT SINH theo mẫu hiện tại.
// Luôn XEM TRƯỚC rồi mới cho bấm thực hiện — thao tác này đụng hàng trăm dòng
// dữ liệu thật nên người dùng phải thấy rõ từng thay đổi trước khi đồng ý.

const St = ({ children, tone }) => (
  <span className={`${s.syncStat} ${tone ? s[`syncStat_${tone}`] : ''}`}>{children}</span>
)

// Một công việc "có việc cần làm" khi: đổi tiêu đề, sửa bước, thêm bước,
// HOẶC cần tick bổ sung (việc đã hoàn thành mà checklist chưa đủ 100%).
// Trước đây quên vế tick bổ sung nên task đã xong bị khoá, không chọn lại được.
// Đồng bộ luôn xoá & nạp lại nên công việc nào cũng có việc để làm.
const canLam = () => true

export default function SyncTasksModal({ taskType, onClose, onDone }) {
  const addToast = useToastStore((st) => st.toast)
  const [loading, setLoading]   = useState(true)
  const [applying, setApplying] = useState(false)
  const [data, setData]         = useState(null)
  const [includeCompleted, setIncludeCompleted] = useState(true)
  // Mặc định NẠP ĐỦ mọi bước của mẫu; bật lên thì mới bỏ bước lịch khách loại trừ
  const [theoLoaiTru, setTheoLoaiTru] = useState(false)
  const [moRong, setMoRong]     = useState(new Set())
  // Chọn từng công việc để chạy thử vài cái trước rồi mới làm hàng loạt
  const [chon, setChon]         = useState(new Set())

  useEffect(() => {
    let huy = false
    setLoading(true)
    previewSyncTasks(taskType.id, { includeCompleted, theoLoaiTru })
      .then((r) => {
        if (huy) return
        setData(r)
        setChon(new Set(r.chiTiet.filter(canLam).map((c) => c.taskId)))
      })
      .catch((err) => {
        if (!huy) addToast(err.response?.data?.error?.message ?? 'Không xem trước được', 'error')
      })
      .finally(() => { if (!huy) setLoading(false) })
    return () => { huy = true }
  }, [taskType.id, includeCompleted, theoLoaiTru]) // eslint-disable-line react-hooks/exhaustive-deps

  async function thucHien() {
    setApplying(true)
    try {
      const r = await applySyncTasks(taskType.id, { includeCompleted, theoLoaiTru, taskIds: [...chon] })
      const k = r.tongKet
      addToast(
        `Đã đồng bộ ${k.soCongViec} công việc — nạp ${k.napBuocMoi} bước theo mẫu, `
        + `khôi phục ${k.giuLaiTick} tick`
        + (k.doiTieuDe ? `, đổi ${k.doiTieuDe} tiêu đề` : '')
        + (k.mucKhongTaiTaoDuoc ? `, ${k.mucKhongTaiTaoDuoc} mục ngoài mẫu đã bỏ` : ''),
        'success', 6000,
      )
      onDone?.()
      onClose()
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không đồng bộ được', 'error', 6000)
    } finally { setApplying(false) }
  }

  const tk = data?.tongKet
  // Tổng kết hiển thị tính trên phần ĐANG CHỌN, không phải toàn bộ
  const dsChon = (data?.chiTiet ?? []).filter((c) => chon.has(c.taskId))
  const tkChon = {
    soCongViec: dsChon.length,
    doiTieuDe:  dsChon.filter((c) => c.doiTieuDe).length,
    xoaMucCu:   dsChon.reduce((n, c) => n + c.soMucCu, 0),
    napBuoc:    dsChon.reduce((n, c) => n + c.nap.length, 0),
    giuTick:    dsChon.reduce((n, c) => n + c.nap.filter((x) => x.tick).length, 0),
    matDi:      dsChon.reduce((n, c) => n + c.matDi.length, 0),
    matTick:    dsChon.reduce((n, c) => n + c.matDi.filter((x) => x.dangTick).length, 0),
  }
  const coThayDoi = (data?.chiTiet ?? []).some(canLam)
  const khongCoGiDoi = data && !coThayDoi

  function toggleChon(id) {
    setChon((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }
  function chonTatCa() {
    setChon(new Set((data?.chiTiet ?? []).map((c) => c.taskId)))
  }
  function chonCanLam() {
    setChon(new Set((data?.chiTiet ?? []).filter(canLam).map((c) => c.taskId)))
  }
  function boChonTatCa() { setChon(new Set()) }

  function toggle(id) {
    setMoRong((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  return (
    <Modal onClose={onClose} title={`Đồng bộ công việc theo mẫu — ${taskType.name}`} wide>
      {loading ? (
        <div className={s.syncLoading}><Loader2 size={16} className={s.spin} /> Đang tính toán thay đổi…</div>
      ) : !data ? null : (
        <>
          {/* ── Tổng kết ── */}
          <div className={s.syncSummary}>
            <div className={s.syncSummaryRow}>
              <span>
                Mẫu có <b>{tk.soBuocTrongMau}</b> bước · tìm thấy <b>{tk.soCongViec}</b> công việc ·
                {' '}đang chọn <b>{tkChon.soCongViec}</b>
              </span>
            </div>
            <div className={s.syncStats}>
              <St tone="blue">Đổi tiêu đề: <b>{tkChon.doiTieuDe}</b></St>
              <St tone="amber">Xoá checklist cũ: <b>{tkChon.xoaMucCu}</b> mục</St>
              <St tone="green">Nạp lại theo mẫu: <b>{tkChon.napBuoc}</b> bước</St>
              <St tone="green">Khôi phục tick: <b>{tkChon.giuTick}</b></St>
              {tkChon.matDi > 0 && (
                <St tone="amber">Mục không có trong mẫu sẽ mất: <b>{tkChon.matDi}</b>
                  {tkChon.matTick > 0 ? ` (${tkChon.matTick} đang tick)` : ''}</St>
              )}
            </div>
          </div>

          {/* ── Cam kết an toàn ── */}
          <div className={s.syncSafety}>
            <Lock size={13} />
            <div>
              <b>Checklist sẽ được thay bằng đúng mẫu hiện tại.</b> Công việc <b>đã hoàn thành</b>
              nạp xong tick đủ 100%; công việc <b>chưa xong</b> thì dò lại để tick đúng những bước
              trước đó đã tick. Bước bị lịch của khách loại trừ vẫn không nạp.
            </div>
          </div>

          <label className={s.syncOption}>
            <input
              type="checkbox"
              checked={includeCompleted}
              onChange={(e) => setIncludeCompleted(e.target.checked)}
            />
            <span>
              Đồng bộ cả công việc <b>đã hoàn thành</b> — nạp lại checklist theo mẫu và tick đủ 100%
            </span>
          </label>

          <label className={s.syncOption}>
            <input type="checkbox" checked={theoLoaiTru} onChange={(e) => setTheoLoaiTru(e.target.checked)} />
            <span>
              Bỏ những bước mà <b>lịch định kỳ của khách</b> đã loại trừ.
              {' '}Không bật thì <b>nạp đủ toàn bộ {tk?.soBuocTrongMau ?? ''} bước</b> của mẫu.
            </span>
          </label>

          {khongCoGiDoi ? (
            <div className={s.syncEmpty}>
              <Check size={16} /> Mọi công việc đã khớp mẫu, không có gì cần đồng bộ.
            </div>
          ) : (
            <>
              <div className={s.syncListHead}>
                <span>Chọn công việc muốn đồng bộ — bấm vào tên để xem chi tiết</span>
                <span className={s.syncPickBtns}>
                  <button type="button" onClick={chonTatCa}>Chọn tất cả</button>
                  <button type="button" onClick={chonCanLam}>Chỉ cái cần sửa</button>
                  <button type="button" onClick={boChonTatCa}>Bỏ chọn</button>
                </span>
              </div>
              <div className={s.syncList}>
                {data.chiTiet.map((c) => {
                  const mo = moRong.has(c.taskId)
                  const coDoi = canLam(c)
                  return (
                    <div key={c.taskId} className={s.syncItem}>
                      <div className={s.syncItemRow}>
                        <input
                          type="checkbox"
                          className={s.syncCheck}
                          checked={chon.has(c.taskId)}
                          title={coDoi ? 'Chọn công việc này để đồng bộ' : 'Đã khớp mẫu — chạy lại cũng không đổi gì'}
                          onChange={() => toggleChon(c.taskId)}
                        />
                      <button className={s.syncItemHead} onClick={() => toggle(c.taskId)}>
                        {mo ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        <span className={s.syncItemCty}>{c.congTy}</span>
                        <span className={s.syncItemKy}>{c.ky}</span>
                        {c.daXong && <span className={s.syncTagDone}>đã xong</span>}
                        <span className={s.syncItemCounts}>
                          <em>{c.soMucCu} → {c.nap.length} bước</em>
                          <em className={s.syncAdd}>{c.nap.filter((x) => x.tick).length} tick</em>
                          {c.matDi.length > 0 && <em className={s.syncKeep}>{c.matDi.length} mất</em>}
                        </span>
                      </button>
                      </div>

                      {mo && (
                        <div className={s.syncItemBody}>
                          {c.doiTieuDe && (
                            <div className={s.syncBlock}>
                              <div className={s.syncBlockTitle}>Tiêu đề</div>
                              <div className={s.syncDiffOld}>− {c.tieuDeCu}</div>
                              <div className={s.syncDiffNew}>+ {c.tieuDeMoi}</div>
                            </div>
                          )}

                          {c.soBuocLoaiTru > 0 && (
                            <div className={s.syncNote}>
                              Lịch của khách hàng này loại trừ <b>{c.soBuocLoaiTru}</b> bước — không nạp.
                            </div>
                          )}

                          <div className={s.syncBlock}>
                            <div className={s.syncBlockTitle}>
                              Checklist sau khi đồng bộ — {c.nap.length} bước
                              {c.daXong ? ' (việc đã xong → tick đủ)' : ''}
                            </div>
                            {c.nap.map((x, i) => (
                              <div key={i} className={s.syncRow}>
                                <div className={x.tick ? s.syncDiffNew : s.syncRowPlain}>
                                  {x.tick ? <Check size={10} /> : <span className={s.syncDot}>○</span>}
                                  {' '}{' '.repeat(x.level * 4)}{x.noiDung}
                                </div>
                                <div className={s.syncRowMeta}>
                                  {c.daXong
                                    ? <span className={s.syncTicked}>tick vì việc đã hoàn thành</span>
                                    : x.buocMoi
                                      ? <span className={s.syncUnticked}>bước mới — chưa tick</span>
                                      : <span className={s.syncMatch}>
                                          giữ tick cũ · ghép theo {x.ghepBang}
                                          {x.doGiong ? ` (${x.doGiong}%)` : ''}
                                        </span>}
                                </div>
                              </div>
                            ))}
                          </div>

                          {c.matDi.length > 0 && (
                            <div className={s.syncBlock}>
                              <div className={s.syncBlockTitle}>
                                {c.matDi.length} mục sẽ MẤT — không có trong mẫu nên không nạp lại được
                              </div>
                              {c.matDi.map((x, i) => (
                                <div key={i} className={s.syncRowKeep}>
                                  {x.dangTick ? <Check size={10} /> : <span className={s.syncDot}>○</span>}
                                  {x.noiDung}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          <div className={s.modalActions}>
            <button className={s.btnOutline} onClick={onClose} disabled={applying}>Huỷ</button>
            <button
              className={s.btnSave}
              onClick={thucHien}
              disabled={applying || tkChon.soCongViec === 0}
            >
              {applying
                ? <><Loader2 size={13} className={s.spin} /> Đang đồng bộ…</>
                : <><RefreshCw size={13} /> Đồng bộ {tkChon.soCongViec} công việc đã chọn</>}
            </button>
          </div>

          {!khongCoGiDoi && (
            <div className={s.syncWarn}>
              <AlertTriangle size={12} /> Thao tác chạy trong một giao dịch — lỗi giữa chừng sẽ hoàn tác toàn bộ.
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
