import { useState, useEffect } from 'react'
import {
  Plus, Pencil, ChevronDown, ChevronRight, ChevronLeft, Loader2,
  GripVertical, Trash2, Check, X, Tag, AlignLeft,
  Power, RefreshCw, GitBranch,
} from 'lucide-react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Modal from '../../components/ui/Modal'
import { useDeleteConfirm } from '../../components/ui/DeleteConfirmDialog'
import { useToastStore } from '../../stores/toastStore'
import {
  listTaskTypes, getTaskType, createTaskType, updateTaskType, toggleTaskType, deleteTaskType,
  addChecklistStep, updateChecklistStep, deleteChecklistStep, reorderChecklist,
  addSubtaskTemplate, updateSubtaskTemplate, deleteSubtaskTemplate,
  addSubtaskStep, updateSubtaskStep, deleteSubtaskStep, reorderSubtaskSteps,
  addCustomField, deleteCustomField,
} from '../../api/taskTypes'
import SyncTasksModal from './SyncTasksModal'
import s from './settings.module.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

const DATA_TYPE_LABELS = {
  text:    'Văn bản',
  number:  'Số',
  date:    'Ngày',
  boolean: 'Có/Không',
  select:  'Chọn',
}

const DT_CLASS = {
  text:    s.dtText,
  number:  s.dtNumber,
  date:    s.dtDate,
  boolean: s.dtBoolean,
  select:  s.dtSelect,
}

function toFieldKey(label) {
  const normalized = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    || 'field'
  return /^[a-z]/.test(normalized) ? normalized : `field_${normalized}`
}

// ── Main Section ──────────────────────────────────────────────────────────────

export default function TaskTypesSection() {
  const confirmDelete = useDeleteConfirm()
  const addToast              = useToastStore((st) => st.toast)
  const [grouped, setGrouped] = useState({})
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal]     = useState(false)
  const [editing, setEditing]         = useState(null)
  const [expandedId, setExpandedId]   = useState(null)
  const [detailCache, setDetailCache] = useState({})
  const [detailLoading, setDetailLoading] = useState({})
  const [collapsedGroups, setCollapsedGroups] = useState({})

  const load = async () => {
    setLoading(true)
    try {
      const result = await listTaskTypes()
      setGrouped(result.grouped || {})
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function refreshDetail(id) {
    setDetailLoading((p) => ({ ...p, [id]: true }))
    try {
      const tt = await getTaskType(id)
      setDetailCache((p) => ({
        ...p,
        [id]: { checklist: tt.checklist ?? [], customFields: tt.customFields ?? [], subtaskTemplates: tt.subtaskTemplates ?? [] },
      }))
    } catch { /* ignore */ }
    finally { setDetailLoading((p) => ({ ...p, [id]: false })) }
  }

  async function handleExpand(id) {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    if (!detailCache[id]) await refreshDetail(id)
  }

  async function handleToggle(tt) {
    try {
      await toggleTaskType(tt.id)
      // Invalidate detail cache so re-expand shows fresh data
      setDetailCache((p) => { const n = { ...p }; delete n[tt.id]; return n })
      load()
      addToast(
        `${tt.isActive ? 'Tắt' : 'Kích hoạt'} loại công việc "${tt.name}"`,
        tt.isActive ? 'warning' : 'success',
      )
    } catch {
      addToast('Không thể cập nhật trạng thái loại công việc', 'error')
    }
  }

  async function handleDelete(tt) {
    if (!(await confirmDelete({ title: 'Xóa loại công việc', message: <>Bạn có chắc chắn muốn xóa loại công việc <strong>“{tt.name}”</strong>?</>, warning: 'Chỉ có thể xóa nếu chưa có công việc hoặc lịch nào đang sử dụng.' }))) return
    try {
      await deleteTaskType(tt.id)
      setDetailCache((p) => { const n = { ...p }; delete n[tt.id]; return n })
      load()
      addToast(`Đã xóa loại công việc "${tt.name}"`, 'success')
    } catch (err) {
      // Backend trả 409 kèm lý do (đã có công việc/lịch dùng) → hiện nguyên message
      addToast(err.response?.data?.error?.message ?? 'Không thể xóa loại công việc', 'error')
    }
  }

  function toggleGroup(group) {
    setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }))
  }

  return (
    <div>
      <div className={s.taskTypeHeader}>
        <p className={s.taskTypeDescription}>
          Định nghĩa loại công việc, nhóm, checklist mẫu và trường tùy chỉnh.
        </p>
        <button className={s.btnAddSmall} onClick={() => { setEditing(null); setShowModal(true) }}>
          <Plus size={13} /> Thêm loại
        </button>
      </div>

      {loading ? (
        <div className={s.skeletonStack}>
          {[1, 2, 3].map((i) => <div key={i} className={s.skeletonLine} />)}
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <p className={s.emptyState}>Chưa có loại công việc nào.</p>
      ) : (
        <div className={s.groupList}>
          {Object.entries(grouped).map(([group, types]) => {
            const isCollapsed   = collapsedGroups[group]
            const activeCount   = types.filter((t) => t.isActive).length
            return (
              <div key={group} className={s.taskGroup}>
                <button onClick={() => toggleGroup(group)} className={s.taskGroupButton}>
                  <span>{group}</span>
                  <span className={s.taskGroupMeta}>
                    <span className={s.taskGroupCount}>
                      {types.length} loại · {activeCount} hoạt động
                    </span>
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className={s.ttList}>
                    {types.map((tt) => (
                      <TaskTypeRow
                        key={tt.id}
                        tt={tt}
                        isExpanded={expandedId === tt.id}
                        isDetailLoading={!!detailLoading[tt.id]}
                        detail={detailCache[tt.id]}
                        onExpand={() => handleExpand(tt.id)}
                        onEdit={() => { setEditing(tt); setShowModal(true) }}
                        onToggle={() => handleToggle(tt)}
                        onDelete={() => handleDelete(tt)}
                        onDetailRefresh={() => refreshDetail(tt.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <TaskTypeModal
          taskType={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}

    </div>
  )
}

// ── Task Type Row ─────────────────────────────────────────────────────────────

function TaskTypeRow({ tt, isExpanded, isDetailLoading, detail, onExpand, onEdit, onToggle, onDelete, onDetailRefresh }) {
  const [showSync, setShowSync] = useState(false)
  return (
    <div className={`${s.ttRow} ${isExpanded ? s.ttRowExpanded : ''}`}>
      {/* Row header */}
      <div className={s.ttRowHeader}>
        <button className={s.ttExpandBtn} onClick={onExpand} title={isExpanded ? 'Thu gọn' : 'Mở rộng chi tiết'}>
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <div className={s.ttNameGroup}>
          <span className={s.ttNameText}>{tt.name}</span>
          {tt.description && <span className={s.ttDescText}>{tt.description}</span>}
        </div>

        <div className={s.ttMeta}>
          <span className={s.ttSlaTag} title="SLA mặc định">{tt.defaultSlaDays}d</span>
          <span className={tt.isActive ? s.badgeActive : s.badgeInactive}>
            <span className={s.badgeDot} />
            {tt.isActive ? 'Hoạt động' : 'Tắt'}
          </span>
        </div>

        <div className={s.ttActions}>
          <button className={s.iconBtn} title="Chỉnh sửa thông tin" onClick={onEdit}>
            <Pencil size={13} />
          </button>
          <button
            className={`${s.iconBtn} ${tt.isActive ? s.iconBtnSuspend : s.iconBtnActivate}`}
            title={tt.isActive ? 'Tắt loại công việc' : 'Kích hoạt'}
            onClick={onToggle}
          >
            <Power size={13} />
          </button>
          <button
            className={`${s.iconBtn} ${s.cfDeleteBtn}`}
            title="Xóa loại công việc (chỉ khi chưa được dùng)"
            onClick={onDelete}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className={s.ttDetailPanel}>
          {isDetailLoading && !detail ? (
            <div className={s.ttDetailLoading}>
              <Loader2 size={14} className={s.spin} /> Đang tải…
            </div>
          ) : detail ? (
            <>
            {/* Mẫu đổi tên / sửa bước thì công việc ĐÃ phát sinh không tự đổi theo
                (tiêu đề và checklist bị đóng băng lúc tạo). Nút này quét lại cho khớp. */}
            <div className={s.ttSyncBar}>
              <button className={s.btnOutline} onClick={() => setShowSync(true)}>
                <RefreshCw size={13} /> Đồng bộ công việc đã phát sinh theo mẫu này
              </button>
              <span className={s.ttSyncHint}>
                Cập nhật tiêu đề &amp; checklist của công việc cũ · xem trước trước khi ghi
              </span>
            </div>
            <div className={s.ttDetailSplit}>
              <ChecklistPanel
                taskTypeId={tt.id}
                checklist={detail.checklist}
                onRefresh={onDetailRefresh}
              />
              <CustomFieldsPanel
                taskTypeId={tt.id}
                customFields={detail.customFields}
                onRefresh={onDetailRefresh}
              />
            </div>
            <SubtaskTemplatePanel
              taskTypeId={tt.id}
              subtasks={detail.subtaskTemplates ?? []}
              onRefresh={onDetailRefresh}
            />
            </>
          ) : null}
        </div>
      )}

      {showSync && (
        <SyncTasksModal
          taskType={tt}
          onClose={() => setShowSync(false)}
          onDone={onDetailRefresh}
        />
      )}
    </div>
  )
}

// ── Checklist Panel ───────────────────────────────────────────────────────────

function SortableStep({ step, isEditing, editText, setEditText, onStartEdit, onSave, onCancel, onDelete, onToggleLevel }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: step.id })

  const isChild = step.level === 1
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 10 : 'auto',
    position: 'relative',
  }

  return (
    <div ref={setNodeRef} style={style} className={`${s.clItem} ${isChild ? s.clItemChild : ''}`}>
      <button className={s.clDragHandle} {...attributes} {...listeners} title="Kéo để sắp xếp">
        <GripVertical size={14} />
      </button>
      <button
        className={s.clIndentBtn}
        onClick={onToggleLevel}
        title={isChild ? 'Đưa lên mục chính' : 'Thụt thành mục phụ'}
      >
        {isChild ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
      </button>
      <span className={`${s.clStepOrder} ${isChild ? s.clStepOrderChild : ''}`}>{isChild ? '•' : `${step.stepOrder}.`}</span>

      {isEditing ? (
        <>
          <textarea
            autoFocus
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.altKey && !e.shiftKey) { e.preventDefault(); onSave() }
              if (e.key === 'Escape') onCancel()
            }}
            className={s.clStepInput}
            maxLength={2000}
            rows={2}
            style={{ resize: 'vertical', whiteSpace: 'pre-wrap' }}
          />
          <button className={`${s.clActionBtn} ${s.clSaveBtn}`} onClick={onSave} title="Lưu"><Check size={12} /></button>
          <button className={s.clActionBtn} onClick={onCancel} title="Huỷ"><X size={12} /></button>
        </>
      ) : (
        <>
          <span className={s.clStepText} onClick={onStartEdit} title="Nhấp để chỉnh sửa" style={{ whiteSpace: 'pre-wrap' }}>
            {step.stepText}
          </span>
          <button className={`${s.clActionBtn} ${s.clDeleteBtn}`} onClick={onDelete} title="Xóa bước">
            <Trash2 size={12} />
          </button>
        </>
      )}
    </div>
  )
}

// api mặc định của checklist cha; truyền `api` khác để tái dùng cho checklist việc con.
const DEFAULT_CL_API = {
  add: (tid, text) => addChecklistStep(tid, text),
  update: (tid, stepId, body) => updateChecklistStep(tid, stepId, body),
  del: (tid, stepId) => deleteChecklistStep(tid, stepId),
  reorder: (tid, steps) => reorderChecklist(tid, steps),
}

function ChecklistPanel({ taskTypeId, checklist, onRefresh, api, title, bare, addPlaceholder }) {
  const A = api ?? DEFAULT_CL_API
  const addToast = useToastStore((st) => st.toast)
  const [items, setItems]       = useState(checklist)
  const [saving, setSaving]     = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [addText, setAddText]   = useState('')
  const [adding, setAdding]     = useState(false)

  useEffect(() => { setItems(checklist) }, [checklist])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx  = items.findIndex((i) => i.id === active.id)
    const newIdx  = items.findIndex((i) => i.id === over.id)
    const reordered = arrayMove(items, oldIdx, newIdx)
    setItems(reordered)   // optimistic
    setSaving(true)
    try {
      await A.reorder(taskTypeId, reordered.map((item, idx) => ({ id: item.id, stepOrder: idx + 1 })))
      onRefresh()
    } catch { setItems(checklist); addToast('Không thể sắp xếp checklist', 'error') }
    setSaving(false)
  }

  async function handleSaveEdit() {
    if (!editText.trim()) { setEditingId(null); return }
    setSaving(true)
    try { await A.update(taskTypeId, editingId, { stepText: editText.trim() }); setEditingId(null); onRefresh() }
    catch { addToast('Không thể cập nhật bước', 'error') }
    setSaving(false)
  }

  async function handleDelete(stepId) {
    setSaving(true)
    try { await A.del(taskTypeId, stepId); onRefresh() }
    catch { addToast('Không thể xóa bước', 'error') }
    setSaving(false)
  }

  async function handleToggleLevel(step) {
    setSaving(true)
    try { await A.update(taskTypeId, step.id, { level: step.level === 1 ? 0 : 1 }); onRefresh() }
    catch { addToast('Không thể đổi cấp', 'error') }
    setSaving(false)
  }

  async function handleAdd() {
    const text = addText.trim()
    if (!text) return
    setAdding(true)
    try { await A.add(taskTypeId, text); setAddText(''); onRefresh() }
    catch { addToast('Không thể thêm bước', 'error') }
    setAdding(false)
  }

  const inner = (
    <>
      {items.length === 0 && <p className={s.ttPanelEmpty}>Chưa có bước nào.</p>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {items.map((step) => (
            <SortableStep
              key={step.id}
              step={step}
              isEditing={editingId === step.id}
              editText={editingId === step.id ? editText : step.stepText}
              setEditText={setEditText}
              onStartEdit={() => { setEditingId(step.id); setEditText(step.stepText) }}
              onSave={handleSaveEdit}
              onCancel={() => setEditingId(null)}
              onDelete={() => handleDelete(step.id)}
              onToggleLevel={() => handleToggleLevel(step)}
            />
          ))}
        </SortableContext>
      </DndContext>

      <div className={s.clAddRow}>
        <textarea
          placeholder={addPlaceholder ?? 'Thêm bước mới… (Enter để thêm · Alt/Shift+Enter xuống dòng)'}
          value={addText}
          onChange={(e) => setAddText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.altKey && !e.shiftKey) { e.preventDefault(); handleAdd() } }}
          className={s.clAddInput}
          maxLength={300}
          rows={2}
          style={{ resize: 'vertical' }}
        />
        <button onClick={handleAdd} disabled={!addText.trim() || adding} className={s.clAddBtn} title="Thêm bước">
          {adding ? <Loader2 size={12} className={s.spin} /> : <Plus size={12} />}
        </button>
      </div>
    </>
  )

  if (bare) return inner

  return (
    <div className={s.ttPanelSection}>
      <div className={s.ttPanelTitle}>
        <AlignLeft size={13} />
        {title ?? 'Checklist mẫu'}
        {saving && <Loader2 size={12} className={`${s.spin} ${s.ttPanelSaving}`} />}
      </div>
      {inner}
    </div>
  )
}

// ── Việc con định kỳ Panel ────────────────────────────────────────────────────
// Tách RIÊNG khỏi checklist (đúng logic Tasks). Mỗi việc con là 1 THẺ mở rộng,
// có tiêu đề + hạn (offset) + CHECKLIST RIÊNG của nó.

const SS = {
  offsetBox:  { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--fs-2xs)', color: 'var(--color-muted)', flexShrink: 0, whiteSpace: 'nowrap' },
  offsetInput:{ width: 52, boxSizing: 'border-box', padding: '3px 6px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-2xs)' },
  titleInput: { flex: '1 1 180px', minWidth: 0, boxSizing: 'border-box', padding: '5px 8px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-xs)', fontFamily: 'inherit' },
  card:       { border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', marginBottom: 8 },
  head:       { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 10px' },
  body:       { padding: '4px 10px 10px 34px', borderTop: '1px dashed var(--color-border-soft)' },
  stepRow:    { display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' },
  stepInput:  { flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '4px 8px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-2xs)', fontFamily: 'inherit' },
  count:      { fontSize: 'var(--fs-3xs)', color: 'var(--color-muted)', flexShrink: 0 },
}

function SubtaskCard({ taskTypeId, subtask, expanded, onToggle, onRefresh }) {
  const addToast = useToastStore((st) => st.toast)
  const [title, setTitle]   = useState(subtask.title)
  useEffect(() => { setTitle(subtask.title) }, [subtask.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const steps = subtask.steps ?? []
  // api checklist của việc con — bind vào subtask.id để tái dùng ChecklistPanel (drag/indent/edit).
  const stepApi = {
    add:     (tid, text)        => addSubtaskStep(tid, subtask.id, { stepText: text }),
    update:  (tid, stepId, body) => updateSubtaskStep(tid, subtask.id, stepId, body),
    del:     (tid, stepId)      => deleteSubtaskStep(tid, subtask.id, stepId),
    reorder: (tid, list)        => reorderSubtaskSteps(tid, subtask.id, list),
  }

  async function saveTitle() {
    const t = title.trim()
    if (!t || t === subtask.title) { setTitle(subtask.title); return }
    try { await updateSubtaskTemplate(taskTypeId, subtask.id, { title: t }); onRefresh() }
    catch { addToast('Không thể cập nhật tiêu đề', 'error') }
  }
  async function del() {
    try { await deleteSubtaskTemplate(taskTypeId, subtask.id); onRefresh() }
    catch { addToast('Không thể xóa việc con', 'error') }
  }

  return (
    <div style={SS.card}>
      <div style={SS.head}>
        <button
          type="button"
          onClick={onToggle}
          title={expanded ? 'Thu gọn checklist' : 'Mở để thêm checklist'}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26, flexShrink: 0, cursor: 'pointer',
            border: '1px solid var(--color-primary-ring)', borderRadius: 'var(--radius-sm)',
            background: expanded ? 'var(--color-primary)' : 'var(--color-primary-bg)',
            color: expanded ? '#fff' : 'var(--color-primary-dark)',
          }}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle}
          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }} maxLength={300} placeholder="Tên việc con" style={SS.titleInput} />
        <span style={SS.count}>{steps.length} bước</span>
        <button className={`${s.clActionBtn} ${s.clDeleteBtn}`} onClick={del} title="Xóa việc con" style={{ flexShrink: 0 }}><Trash2 size={13} /></button>
      </div>
      {expanded && (
        <div style={SS.body}>
          <div style={{ fontSize: 'var(--fs-3xs)', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '.3px', margin: '4px 0 6px' }}>
            Checklist của việc con này
          </div>
          {/* Tái dùng ChecklistPanel (drag/indent 2 cấp/sửa tại chỗ) — đồng bộ với checklist cha */}
          <ChecklistPanel
            taskTypeId={taskTypeId}
            checklist={steps}
            onRefresh={onRefresh}
            api={stepApi}
            bare
            addPlaceholder="Thêm bước checklist…"
          />
        </div>
      )}
    </div>
  )
}

function SubtaskTemplatePanel({ taskTypeId, subtasks, onRefresh }) {
  const addToast = useToastStore((st) => st.toast)
  const [expandedId, setExpandedId] = useState(null)
  const [newTitle, setNewTitle]   = useState('')
  const list = subtasks ?? []

  async function addNew() {
    const title = newTitle.trim()
    if (!title) return
    try {
      const created = await addSubtaskTemplate(taskTypeId, { title })
      setNewTitle('')
      onRefresh()
      if (created?.id) setExpandedId(created.id)   // mở luôn để thêm checklist
    } catch { addToast('Không thể thêm việc con', 'error') }
  }

  return (
    <div className={s.ttPanelSection} style={{ marginTop: 12 }}>
      <div className={s.ttPanelTitle}><GitBranch size={13} /> Việc con liên kết</div>
      <p style={{ fontSize: 'var(--fs-2xs)', color: 'var(--color-muted)', margin: '0 0 10px' }}>
        Mỗi thẻ là một việc con sẽ sinh kèm công việc cha — có <strong>checklist riêng</strong> của nó (mở thẻ để thêm bước). Hạn của việc con đặt ở <strong>Lịch định kỳ</strong> của từng công ty.
      </p>

      {list.length === 0 && <p className={s.ttPanelEmpty}>Chưa có việc con liên kết.</p>}

      {list.map((sub) => (
        <SubtaskCard key={sub.id} taskTypeId={taskTypeId} subtask={sub}
          expanded={expandedId === sub.id}
          onToggle={() => setExpandedId(expandedId === sub.id ? null : sub.id)}
          onRefresh={onRefresh} />
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4, paddingTop: 8, borderTop: '1px dashed var(--color-border-soft)' }}>
        <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNew() } }}
          placeholder="Tên việc con mới…" maxLength={300} style={SS.titleInput} />
        <button type="button" className={s.subAddBtn} onClick={addNew}>
          <Plus size={12} /> Thêm việc con
        </button>
      </div>
    </div>
  )
}

// ── Custom Fields Panel ───────────────────────────────────────────────────────

const EMPTY_CF_FORM = {
  label:       '',
  fieldKey:    '',
  dataType:    'text',
  isRequired:  false,
  optionsText: '',
}

function CustomFieldsPanel({ taskTypeId, customFields, onRefresh }) {
  const confirmDelete = useDeleteConfirm()
  const addToast = useToastStore((st) => st.toast)
  const [saving, setSaving]       = useState(false)
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState(EMPTY_CF_FORM)
  const [formError, setFormError] = useState(null)

  function setField(key) {
    return (e) => {
      const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
      setForm((p) => {
        const next = { ...p, [key]: val }
        if (key === 'label') next.fieldKey = toFieldKey(val)
        return next
      })
    }
  }

  function validateForm(f) {
    if (!f.label.trim())    return 'Label không được để trống'
    if (!f.fieldKey.trim()) return 'Field key không được để trống'
    if (!/^[a-z][a-z0-9_]*$/.test(f.fieldKey)) return 'Field key phải là snake_case bắt đầu bằng chữ (VD: so_to_khai)'
    if (f.dataType === 'select') {
      const opts = f.optionsText.split(/[\n,]/).map((o) => o.trim()).filter(Boolean)
      if (opts.length < 2) return 'Loại "Chọn" cần ít nhất 2 options'
    }
    return null
  }

  async function handleAdd() {
    const err = validateForm(form)
    if (err) { setFormError(err); return }
    setFormError(null)
    setSaving(true)
    try {
      const options = form.dataType === 'select'
        ? form.optionsText.split(/[\n,]/).map((o) => o.trim()).filter(Boolean)
        : null
      await addCustomField(taskTypeId, {
        fieldKey:     form.fieldKey.trim(),
        label:        form.label.trim(),
        dataType:     form.dataType,
        isRequired:   form.isRequired,
        options,
        displayOrder: customFields.length,
      })
      setForm(EMPTY_CF_FORM)
      setShowForm(false)
      onRefresh()
      addToast('Đã thêm trường tùy chỉnh', 'success')
    } catch (err) {
      setFormError(err.response?.data?.error?.message || 'Không thể thêm trường')
    }
    setSaving(false)
  }

  async function handleDelete(fieldId) {
    if (!(await confirmDelete({ title: 'Xóa trường tùy chỉnh', message: 'Bạn có chắc chắn muốn xóa trường tùy chỉnh này?' }))) return
    setSaving(true)
    try {
      await deleteCustomField(taskTypeId, fieldId)
      onRefresh()
      addToast('Đã xóa trường tùy chỉnh', 'success')
    } catch {
      addToast('Không thể xóa trường', 'error')
    }
    setSaving(false)
  }

  return (
    <div className={s.ttPanelSection}>
      <div className={s.ttPanelTitle}>
        <Tag size={13} />
        Trường tùy chỉnh
        {saving && <Loader2 size={12} className={`${s.spin} ${s.ttPanelSaving}`} />}
      </div>

      {customFields.length === 0 && !showForm && (
        <p className={s.ttPanelEmpty}>Chưa có trường tùy chỉnh.</p>
      )}

      {customFields.map((field) => (
        <div key={field.id} className={s.cfItem}>
          <div className={s.cfItemMain}>
            <span className={s.cfLabel}>{field.label}</span>
            <code className={s.cfKey}>{field.fieldKey}</code>
          </div>
          <div className={s.cfItemMeta}>
            <span className={`${s.dtBadge} ${DT_CLASS[field.dataType] || ''}`}>
              {DATA_TYPE_LABELS[field.dataType]}
            </span>
            {field.isRequired && <span className={s.cfRequired}>Bắt buộc</span>}
            {field.options && field.options.length > 0 && (
              <span className={s.cfOptionsPill} title={field.options.join(', ')}>
                {field.options.slice(0, 3).join(' · ')}{field.options.length > 3 ? '…' : ''}
              </span>
            )}
          </div>
          <button
            className={`${s.iconBtn} ${s.cfDeleteBtn}`}
            onClick={() => handleDelete(field.id)}
            title="Xóa trường"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}

      {showForm ? (
        <div className={s.cfAddPanel}>
          {formError && <div className={s.cfFormError}>{formError}</div>}

          <div className={s.cfFormGrid}>
            <div>
              <label className={s.cfFormLabel}>Label *</label>
              <input
                autoFocus
                value={form.label}
                onChange={setField('label')}
                className={s.cfFormInput}
                placeholder="VD: Số tờ khai"
              />
            </div>
            <div>
              <label className={s.cfFormLabel}>Field key *</label>
              <input
                value={form.fieldKey}
                onChange={(e) => setForm((p) => ({
                  ...p,
                  fieldKey: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                }))}
                className={s.cfFormInput}
                placeholder="so_to_khai"
              />
            </div>
            <div>
              <label className={s.cfFormLabel}>Kiểu dữ liệu</label>
              <select value={form.dataType} onChange={setField('dataType')} className={`${s.cfFormInput} ${s.settingsSelect}`}>
                {Object.entries(DATA_TYPE_LABELS).map(([val, lbl]) => (
                  <option key={val} value={val}>{lbl}</option>
                ))}
              </select>
            </div>
            <div className={s.cfRequiredWrap}>
              <label className={s.cfCheckLabel}>
                <input type="checkbox" checked={form.isRequired} onChange={setField('isRequired')} />
                Bắt buộc nhập
              </label>
            </div>
          </div>

          {form.dataType === 'select' && (
            <div>
              <label className={s.cfFormLabel}>Options * (mỗi dòng hoặc phân cách bằng dấu phẩy)</label>
              <textarea
                value={form.optionsText}
                onChange={setField('optionsText')}
                className={s.cfOptionsTextarea}
                placeholder={'Lựa chọn 1\nLựa chọn 2\nLựa chọn 3'}
                rows={3}
              />
            </div>
          )}

          <div className={s.cfFormActions}>
            <button
              type="button"
              onClick={() => { setShowForm(false); setFormError(null); setForm(EMPTY_CF_FORM) }}
              className={s.btnOutline}
              style={{ height: 30, padding: '0 12px', fontSize: 12 }}
            >
              Huỷ
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving}
              className={s.btnSave}
              style={{ height: 30, padding: '0 12px', fontSize: 12 }}
            >
              {saving ? <Loader2 size={11} className={s.spin} /> : <Plus size={11} />}
              Thêm trường
            </button>
          </div>
        </div>
      ) : (
        <button className={s.cfAddTrigger} onClick={() => setShowForm(true)}>
          <Plus size={12} /> Thêm trường
        </button>
      )}
    </div>
  )
}

// ── Task Type Modal ───────────────────────────────────────────────────────────

function TaskTypeModal({ taskType, onClose, onSaved }) {
  const isEdit   = !!taskType
  const addToast = useToastStore((st) => st.toast)
  const [form, setForm] = useState({
    name:           taskType?.name           ?? '',
    groupName:      taskType?.groupName      ?? '',
    description:    taskType?.description    ?? '',
    defaultSlaDays: taskType?.defaultSlaDays ?? 7,
  })
  const [steps, setSteps]   = useState([''])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  function set(field) { return (e) => setForm((p) => ({ ...p, [field]: e.target.value })) }

  function addStep()            { setSteps((p) => [...p, '']) }
  function removeStep(i)        { setSteps((p) => p.filter((_, idx) => idx !== i)) }
  function setStep(i, val)      { setSteps((p) => p.map((v, idx) => idx === i ? val : v)) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Tên không được để trống'); return }
    const sla = Number(form.defaultSlaDays)
    if (!sla || sla < 1 || sla > 365) { setError('SLA phải từ 1 đến 365 ngày'); return }

    if (!isEdit) {
      for (const step of steps.filter((v) => v.trim())) {
        if (step.trim().length > 2000) { setError('Bước checklist không được quá 2000 ký tự'); return }
      }
    }

    setSaving(true); setError(null)
    try {
      const body = {
        name:           form.name.trim(),
        groupName:      form.groupName.trim()   || null,
        description:    form.description.trim() || null,
        defaultSlaDays: sla,
      }

      if (isEdit) {
        await updateTaskType(taskType.id, body)
        addToast(`Đã cập nhật "${body.name}"`, 'success')
      } else {
        const created = await createTaskType(body)
        const nonEmpty = steps.filter((v) => v.trim())
        for (const stepText of nonEmpty) {
          await addChecklistStep(created.id, stepText.trim())
        }
        const extra = nonEmpty.length ? ` với ${nonEmpty.length} bước checklist` : ''
        addToast(`Đã tạo "${body.name}"${extra}`, 'success')
      }
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Đã xảy ra lỗi')
      setSaving(false)
    }
  }

  return (
    <Modal title={isEdit ? 'Chỉnh sửa loại công việc' : 'Thêm loại công việc'} onClose={onClose}>
      <form onSubmit={handleSubmit} className={s.modalForm}>
        {error && <div className={s.errorBox}>{error}</div>}

        <div className={s.formGrid2}>
          <div>
            <label className={s.settingsLabel}>Tên loại công việc *</label>
            <input
              autoFocus
              type="text"
              value={form.name}
              onChange={set('name')}
              placeholder="VD: Khai thuế GTGT"
              className={s.settingsInput}
            />
          </div>
          <div>
            <label className={s.settingsLabel}>Nhóm</label>
            <input
              type="text"
              value={form.groupName}
              onChange={set('groupName')}
              placeholder="VD: Khai thuế"
              className={s.settingsInput}
            />
          </div>
        </div>

        <div>
          <label className={s.settingsLabel}>Mô tả</label>
          <input
            type="text"
            value={form.description}
            onChange={set('description')}
            placeholder="Mô tả ngắn về loại công việc này…"
            className={s.settingsInput}
          />
        </div>

        <div>
          <label className={s.settingsLabel}>SLA mặc định (ngày)</label>
          <input
            type="number"
            min={1}
            max={365}
            value={form.defaultSlaDays}
            onChange={set('defaultSlaDays')}
            className={`${s.settingsInput} ${s.slaInput}`}
          />
        </div>

        {!isEdit && (
          <div>
            <div className={s.ttModalStepsHeader}>
              <label className={s.settingsLabel} style={{ margin: 0 }}>Checklist mẫu ban đầu</label>
              <button type="button" onClick={addStep} className={s.ttModalAddStepBtn}>
                <Plus size={11} /> Thêm bước
              </button>
            </div>
            <div className={s.ttModalStepList}>
              {steps.map((step, i) => (
                <div key={i} className={s.ttModalStepRow}>
                  <span className={s.ttModalStepNum}>{i + 1}.</span>
                  <textarea
                    value={step}
                    onChange={(e) => setStep(i, e.target.value)}
                    placeholder={`Bước ${i + 1}… (có thể xuống dòng)`}
                    className={s.settingsInput}
                    maxLength={2000}
                    rows={2}
                    style={{ flex: 1, resize: 'vertical' }}
                  />
                  {steps.length > 1 && (
                    <button type="button" onClick={() => removeStep(i)} className={s.ttModalRemoveStepBtn} title="Xóa bước">
                      <X size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className={s.settingsHint}>Có thể để trống — checklist quản lý được sau khi tạo.</p>
          </div>
        )}

        {isEdit && (
          <div className={s.confirmWarn} style={{ fontSize: 12, padding: '8px 12px' }}>
            Checklist và trường tùy chỉnh quản lý bằng cách mở rộng loại công việc trong danh sách.
          </div>
        )}

        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className={s.btnOutline}>Huỷ</button>
          <button type="submit" disabled={saving} className={s.btnSave}>
            {saving && <Loader2 size={13} className={s.spin} />}
            {isEdit ? 'Lưu thay đổi' : 'Tạo mới'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
