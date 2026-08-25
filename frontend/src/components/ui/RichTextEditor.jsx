import { useState, useEffect, useRef, useCallback } from 'react'
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import { mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { TextStyle, Color } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'
import { marked } from 'marked'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Code2, Minus, Link2, Unlink, Table as TableIcon,
  ImagePlus, FileCode2, RemoveFormatting, Undo2, Redo2, Rows3, Columns3, Trash2,
  Baseline, Highlighter, PaintBucket,
} from 'lucide-react'
import Modal from './Modal'
import { useToastStore } from '../../stores/toastStore'
import { getFileBlobUrl, uploadFile, MAX_FILE_BYTES } from '../../api/attachments'
import './RichTextEditor.css'

// ═══ Extensions dùng chung ══════════════════════════════════════════════════════

// Ảnh: NodeView tải blob theo data-att-id (qua /attachments/download, giữ JWT)
function ImageNodeView({ node, selected }) {
  const attId = node.attrs.attId
  const [url, setUrl] = useState(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    if (!attId) { setUrl(null); return undefined }
    let alive = true, obj = null
    setErr(false); setUrl(null)
    getFileBlobUrl(attId)
      .then((u) => { if (alive) { obj = u; setUrl(u) } else URL.revokeObjectURL(u) })
      .catch(() => { if (alive) setErr(true) })
    return () => { alive = false; if (obj) URL.revokeObjectURL(obj) }
  }, [attId])
  return (
    <NodeViewWrapper as="span" className={`rte-img ${selected ? 'rte-img-selected' : ''}`}>
      {url
        ? <img src={url} alt={node.attrs.alt || ''} draggable={false} />
        : <span className="rte-img-ph">{err ? '⚠ Lỗi tải ảnh' : 'Đang tải ảnh…'}</span>}
    </NodeViewWrapper>
  )
}

// Ảnh CHỈ lưu tham chiếu attachments (thẻ <img data-att-id="...">), KHÔNG nhúng base64.
const AttachmentImage = Image.extend({
  name: 'image',
  addAttributes() {
    return {
      attId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-att-id'),
        renderHTML: (attrs) => (attrs.attId ? { 'data-att-id': attrs.attId } : {}),
      },
      alt: { default: null },
    }
  },
  parseHTML() { return [{ tag: 'img[data-att-id]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)]
  },
  addNodeView() { return ReactNodeViewRenderer(ImageNodeView) },
})

// Ô bảng có thể ĐỔ MÀU NỀN — thêm thuộc tính backgroundColor lưu vào style của <td>/<th>.
const cellBgAttr = {
  backgroundColor: {
    default: null,
    parseHTML: (el) => el.style.backgroundColor || null,
    renderHTML: (attrs) => (attrs.backgroundColor ? { style: `background-color: ${attrs.backgroundColor}` } : {}),
  },
}
const CellWithBg   = TableCell.extend({ addAttributes() { return { ...this.parent?.(), ...cellBgAttr } } })
const HeaderWithBg = TableHeader.extend({ addAttributes() { return { ...this.parent?.(), ...cellBgAttr } } })

function buildExtensions(placeholder) {
  return [
    StarterKit,
    AttachmentImage,
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    Placeholder.configure({ placeholder: placeholder || 'Nhập nội dung…' }),
    Table.configure({ resizable: true }),
    TableRow, HeaderWithBg, CellWithBg,
  ]
}

// ═══ Thanh công cụ ══════════════════════════════════════════════════════════════

function useEditorTick(editor) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!editor) return undefined
    const cb = () => setTick((t) => t + 1)
    editor.on('transaction', cb)
    return () => { editor.off('transaction', cb) }
  }, [editor])
}

function TB({ onClick, active, disabled, title, children }) {
  return (
    <button type="button" className={`rte-btn ${active ? 'rte-active' : ''}`}
      onMouseDown={(e) => e.preventDefault()} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  )
}
const Sep = () => <span className="rte-sep" />

const TEXT_SWATCHES = ['#0f172a', '#dc2626', '#ea580c', '#d97706', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777', '#64748b']
const HL_SWATCHES   = ['#fef08a', '#fed7aa', '#fecaca', '#bbf7d0', '#bfdbfe', '#e9d5ff', '#fbcfe8', '#e2e8f0']
const CELL_SWATCHES = ['#f1f5f9', '#fee2e2', '#ffedd5', '#fef9c3', '#dcfce7', '#dbeafe', '#f3e8ff', '#fce7f3', '#e0f2fe', '#ffffff']

const COLOR_META = {
  text:      { icon: Baseline,    title: 'Màu chữ',        def: '#0f172a', swatches: TEXT_SWATCHES },
  highlight: { icon: Highlighter, title: 'Màu nền chữ',    def: '#fef08a', swatches: HL_SWATCHES },
  cell:      { icon: PaintBucket, title: 'Đổ màu ô bảng',  def: '#dbeafe', swatches: CELL_SWATCHES },
}

// Menu tô màu (chữ / nền chữ / nền ô) — popover swatch + tự chọn + bỏ màu
function ColorMenu({ editor, mode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const meta = COLOR_META[mode]
  const Icon = meta.icon
  const swatches = meta.swatches
  const current =
    mode === 'text'      ? editor.getAttributes('textStyle').color :
    mode === 'highlight' ? editor.getAttributes('highlight').color :
    (editor.getAttributes('tableCell').backgroundColor || editor.getAttributes('tableHeader').backgroundColor)
  const apply = (c) => {
    if (mode === 'text')      editor.chain().focus().setColor(c).run()
    else if (mode === 'highlight') editor.chain().focus().setHighlight({ color: c }).run()
    else editor.chain().focus().setCellAttribute('backgroundColor', c).run()
    setOpen(false)
  }
  const clear = () => {
    if (mode === 'text')      editor.chain().focus().unsetColor().run()
    else if (mode === 'highlight') editor.chain().focus().unsetHighlight().run()
    else editor.chain().focus().setCellAttribute('backgroundColor', null).run()
    setOpen(false)
  }

  return (
    <span className="rte-colorwrap" ref={ref}>
      <button type="button" className={`rte-btn ${current ? 'rte-active' : ''}`}
        onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((v) => !v)} title={meta.title}>
        <Icon size={15} />
        <span className="rte-colorbar" style={{ background: current || meta.def }} />
      </button>
      {open && (
        <div className="rte-colormenu" onMouseDown={(e) => e.preventDefault()}>
          <div className="rte-swatches">
            {swatches.map((c) => (
              <button key={c} type="button" className="rte-swatch" style={{ background: c }}
                title={c} onClick={() => apply(c)} />
            ))}
          </div>
          <div className="rte-colormenu-row">
            <label className="rte-colorpick" title="Tự chọn màu">
              <input type="color" defaultValue={current || meta.def} onChange={(e) => apply(e.target.value)} />
              Tự chọn…
            </label>
            <button type="button" className="rte-colorclear" onClick={clear}>Bỏ màu</button>
          </div>
        </div>
      )}
    </span>
  )
}

function Toolbar({ editor, onInsertImage, onOpenMarkdown, allowImage }) {
  useEditorTick(editor)
  if (!editor) return null
  const inTable = editor.isActive('table')
  return (
    <div className="rte-toolbar">
      <TB title="Hoàn tác" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}><Undo2 size={15} /></TB>
      <TB title="Làm lại" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}><Redo2 size={15} /></TB>
      <Sep />
      <TB title="Đậm" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={15} /></TB>
      <TB title="Nghiêng" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={15} /></TB>
      <TB title="Gạch chân" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon size={15} /></TB>
      <TB title="Gạch ngang" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={15} /></TB>
      <Sep />
      <TB title="Tiêu đề 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={15} /></TB>
      <TB title="Tiêu đề 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={15} /></TB>
      <TB title="Tiêu đề 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={15} /></TB>
      <Sep />
      <ColorMenu editor={editor} mode="text" />
      <ColorMenu editor={editor} mode="highlight" />
      <Sep />
      <TB title="Danh sách chấm" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={15} /></TB>
      <TB title="Danh sách số" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={15} /></TB>
      <TB title="Trích dẫn" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={15} /></TB>
      <TB title="Khối mã" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code2 size={15} /></TB>
      <TB title="Đường kẻ ngang" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus size={15} /></TB>
      <Sep />
      <TB title="Chèn / sửa liên kết" active={editor.isActive('link')} onClick={() => {
        const prev = editor.getAttributes('link').href || ''
        const url = window.prompt('Địa chỉ liên kết:', prev)
        if (url === null) return
        if (url === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return }
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
      }}><Link2 size={15} /></TB>
      <TB title="Bỏ liên kết" disabled={!editor.isActive('link')} onClick={() => editor.chain().focus().unsetLink().run()}><Unlink size={15} /></TB>
      <Sep />
      <TB title="Chèn bảng 3×3" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon size={15} /></TB>
      {inTable && <>
        <TB title="Thêm hàng dưới" onClick={() => editor.chain().focus().addRowAfter().run()}><Rows3 size={15} /></TB>
        <TB title="Thêm cột phải" onClick={() => editor.chain().focus().addColumnAfter().run()}><Columns3 size={15} /></TB>
        <TB title="Xoá hàng" onClick={() => editor.chain().focus().deleteRow().run()}>−<Rows3 size={13} /></TB>
        <TB title="Xoá cột" onClick={() => editor.chain().focus().deleteColumn().run()}>−<Columns3 size={13} /></TB>
        <ColorMenu editor={editor} mode="cell" />
        <TB title="Xoá bảng" onClick={() => editor.chain().focus().deleteTable().run()}><Trash2 size={15} /></TB>
      </>}
      {(allowImage || onOpenMarkdown) && <Sep />}
      {allowImage && <TB title="Chèn ảnh" onClick={onInsertImage}><ImagePlus size={15} /></TB>}
      <TB title="Dán Markdown" onClick={onOpenMarkdown}><FileCode2 size={15} /></TB>
      <TB title="Xoá định dạng" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><RemoveFormatting size={15} /></TB>
    </div>
  )
}

// Modal dán Markdown
function MarkdownModal({ onInsert, onClose }) {
  const [text, setText] = useState('')
  return (
    <Modal title="Dán nội dung Markdown" onClose={onClose} wide>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-soft)' }}>
          Dán văn bản Markdown (ví dụ từ ChatGPT). Hệ thống sẽ chuyển thành định dạng và chèn vào vị trí con trỏ.
        </p>
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)}
          placeholder={'# Tiêu đề\n- Bước 1\n- Bước 2\n\n| Cột A | Cột B |\n|-------|-------|\n| ...   | ...   |'}
          style={{ width: '100%', minHeight: 240, fontFamily: 'monospace', fontSize: 13, padding: 10,
            border: '1px solid var(--color-border)', borderRadius: 8, resize: 'vertical' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="rte-btn" style={{ border: '1px solid var(--color-border)', height: 34, padding: '0 14px' }} onClick={onClose}>Huỷ</button>
          <button className="rte-btn rte-active" style={{ height: 34, padding: '0 16px' }}
            disabled={!text.trim()} onClick={() => { onInsert(text); onClose() }}>Chèn</button>
        </div>
      </div>
    </Modal>
  )
}

// ═══ RichTextEditor — bề mặt soạn thảo controlled (value / onChange) ═════════════
export default function RichTextEditor({
  value, onChange, editable = true, companyId, placeholder,
  autoFocus = false, showToolbar = true, minHeight = 180, className = '',
}) {
  const addToast = useToastStore((st) => st.toast)
  const [showMarkdown, setShowMarkdown] = useState(false)
  const fileRef = useRef(null)

  const editor = useEditor({
    editable,
    extensions: buildExtensions(placeholder),
    content: value || '',
    autofocus: autoFocus,
    onUpdate: ({ editor: ed }) => onChange?.(ed.getHTML()),
  })

  useEffect(() => { if (editor) editor.setEditable(editable) }, [editor, editable])

  // Đồng bộ value từ ngoài vào editor (reset/huỷ) — không ghi đè khi đang gõ
  useEffect(() => {
    if (!editor) return
    if (value !== undefined && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', false)
    }
  }, [value, editor]) // eslint-disable-line react-hooks/exhaustive-deps

  const uploadAndInsert = useCallback(async (file) => {
    if (!editor || !file || !file.type?.startsWith('image/')) return
    if (!companyId) { addToast('Không thể tải ảnh ở khung này', 'error'); return }
    if (file.size > MAX_FILE_BYTES) { addToast('Ảnh vượt quá 5MB', 'error'); return }
    try {
      const att = await uploadFile('company', companyId, file)
      editor.chain().focus().insertContent({ type: 'image', attrs: { attId: att.id } }).run()
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không tải được ảnh', 'error')
    }
  }, [editor, companyId, addToast])

  useEffect(() => {
    if (!editor) return undefined
    const dom = editor.view.dom
    const onPaste = (e) => {
      const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'))
      if (files.length) { e.preventDefault(); files.forEach(uploadAndInsert) }
    }
    const onDrop = (e) => {
      const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'))
      if (files.length) { e.preventDefault(); files.forEach(uploadAndInsert) }
    }
    dom.addEventListener('paste', onPaste)
    dom.addEventListener('drop', onDrop)
    return () => { dom.removeEventListener('paste', onPaste); dom.removeEventListener('drop', onDrop) }
  }, [editor, uploadAndInsert])

  function insertMarkdown(text) {
    if (!editor) return
    const html = marked.parse(text, { async: false, breaks: true })
    editor.chain().focus().insertContent(html).run()
  }

  return (
    <div className={`rte ${className}`}>
      {editable && showToolbar && (
        <Toolbar
          editor={editor}
          allowImage={Boolean(companyId)}
          onInsertImage={() => fileRef.current?.click()}
          onOpenMarkdown={() => setShowMarkdown(true)}
        />
      )}
      <div className="rte-content rte-doc" style={{ '--rte-min-h': typeof minHeight === 'number' ? `${minHeight}px` : minHeight }}>
        <EditorContent editor={editor} />
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAndInsert(f); e.target.value = '' }} />
      {showMarkdown && <MarkdownModal onInsert={insertMarkdown} onClose={() => setShowMarkdown(false)} />}
    </div>
  )
}
