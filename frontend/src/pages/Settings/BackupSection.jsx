import { useState, useEffect } from 'react'
import { Loader2, Download, Trash2, Play, Save, CheckCircle2, AlertCircle, Database } from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'
import { getBackupOverview, runBackup, updateBackupConfig, deleteBackup, downloadBackup } from '../../api/backup'

const C = {
  border: '#e2e8f0', soft: '#f8fafc', text: '#0f172a', muted: '#64748b',
  teal: '#0f766e', primary: '#2563eb', danger: '#dc2626', green: '#059669',
}
const card = { border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 16, background: '#fff' }
const cardTitle = { fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }
const label = { fontSize: 12, color: C.muted, marginBottom: 6, display: 'block' }
const input = { border: `1px solid #cbd5e1`, borderRadius: 8, padding: '8px 11px', fontSize: 14, color: C.text, boxSizing: 'border-box' }
const btn = (bg) => ({ display: 'inline-flex', alignItems: 'center', gap: 7, background: bg, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' })
const iconBtn = (color) => ({ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', color, border: `1px solid ${C.border}`, borderRadius: 7, padding: '5px 10px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' })

function fmtSize(b) {
  if (b == null) return '—'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}
function fmtDate(iso) { return iso ? new Date(iso).toLocaleString('vi-VN') : '—' }

export default function BackupSection() {
  const addToast = useToastStore((st) => st.toast)
  const [config, setConfig]   = useState(null)
  const [backups, setBackups] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [running, setRunning] = useState(false)
  const [deleting, setDeleting] = useState(null)

  const [enabled, setEnabled]     = useState(true)
  const [time, setTime]           = useState('02:00')
  const [retention, setRetention] = useState(10)

  async function load() {
    setLoading(true)
    try {
      const data = await getBackupOverview()
      setConfig(data.config); setBackups(data.backups || [])
      setEnabled(data.config.enabled); setTime(data.config.time); setRetention(data.config.retention)
    } catch { addToast('Không tải được cấu hình sao lưu', 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    setSaving(true)
    try {
      const cfg = await updateBackupConfig({ enabled, time, retention: Number(retention) })
      setConfig(cfg)
      addToast('Đã lưu cấu hình sao lưu', 'success')
    } catch (err) { addToast(err.response?.data?.error?.message ?? 'Lưu cấu hình thất bại', 'error') }
    finally { setSaving(false) }
  }

  async function handleRun() {
    setRunning(true)
    try {
      await runBackup()
      addToast('Sao lưu thành công!', 'success')
      await load()
    } catch (err) { addToast(err.response?.data?.error?.message ?? 'Sao lưu thất bại', 'error') }
    finally { setRunning(false) }
  }

  async function handleDelete(name) {
    if (!window.confirm(`Xoá bản sao lưu "${name}"?`)) return
    setDeleting(name)
    try {
      await deleteBackup(name)
      setBackups((p) => p.filter((b) => b.name !== name))
      addToast('Đã xoá bản sao lưu', 'success')
    } catch { addToast('Xoá thất bại', 'error') }
    finally { setDeleting(null) }
  }

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.muted, padding: 24 }}><Loader2 className="spin" size={18} style={{ animation: 'app-spin 0.8s linear infinite' }} /> Đang tải...</div>
  }

  const ok = config?.lastStatus === 'success'

  return (
    <div>
      <p style={{ fontSize: 13, color: C.muted, margin: '0 0 18px' }}>
        Sao lưu cơ sở dữ liệu (định dạng <code>pg_dump -Fc</code>) vào thư mục <code>./backup</code> trên máy chủ. Giữ tối đa số bản gần nhất, bản cũ tự xoá.
      </p>

      {/* Tự động sao lưu */}
      <div style={card}>
        <div style={cardTitle}>Tự động sao lưu hằng ngày</div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: C.text }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ width: 16, height: 16 }} />
            Bật sao lưu tự động
          </label>
          <div>
            <label style={label}>Giờ chạy hằng ngày (VN)</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ ...input, width: 120 }} />
          </div>
          <div>
            <label style={label}>Số bản giữ lại</label>
            <input type="number" min={1} max={50} value={retention} onChange={(e) => setRetention(e.target.value)} style={{ ...input, width: 90 }} />
          </div>
          <button onClick={handleSave} disabled={saving} style={{ ...btn(C.primary), opacity: saving ? 0.6 : 1 }}>
            {saving ? <Loader2 size={14} style={{ animation: 'app-spin 0.8s linear infinite' }} /> : <Save size={14} />} Lưu cấu hình
          </button>
        </div>
        <div style={{ marginTop: 14, fontSize: 12.5, color: C.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
          Lần chạy gần nhất: <strong style={{ color: C.text }}>{fmtDate(config?.lastRunAt)}</strong>
          {config?.lastStatus && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: ok ? C.green : C.danger }}>
              {ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
              {ok ? 'Thành công' : config.lastStatus}
            </span>
          )}
        </div>
      </div>

      {/* Sao lưu thủ công */}
      <div style={card}>
        <div style={cardTitle}>Sao lưu thủ công</div>
        <button onClick={handleRun} disabled={running} style={{ ...btn(C.teal), opacity: running ? 0.6 : 1 }}>
          {running ? <Loader2 size={14} style={{ animation: 'app-spin 0.8s linear infinite' }} /> : <Play size={14} />}
          {running ? 'Đang sao lưu...' : 'Sao lưu ngay'}
        </button>
      </div>

      {/* Danh sách */}
      <div style={card}>
        <div style={cardTitle}>Danh sách bản sao lưu ({backups.length})</div>
        {backups.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.muted, fontSize: 13, padding: '16px 0' }}>
            <Database size={16} /> Chưa có bản sao lưu nào.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: C.muted, fontSize: 12 }}>
                <th style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>Tên file</th>
                <th style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>Dung lượng</th>
                <th style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>Thời gian</th>
                <th style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.name}>
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.soft}`, fontFamily: 'monospace', color: C.text }}>{b.name}</td>
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.soft}`, color: C.muted }}>{fmtSize(b.size)}</td>
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.soft}`, color: C.muted }}>{fmtDate(b.createdAt)}</td>
                  <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.soft}`, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => downloadBackup(b.name).catch(() => addToast('Tải về thất bại', 'error'))} style={{ ...iconBtn(C.primary), marginRight: 6 }}>
                      <Download size={13} /> Tải về
                    </button>
                    <button onClick={() => handleDelete(b.name)} disabled={deleting === b.name} style={iconBtn(C.danger)}>
                      {deleting === b.name ? <Loader2 size={13} style={{ animation: 'app-spin 0.8s linear infinite' }} /> : <Trash2 size={13} />} Xoá
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
