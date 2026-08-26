import { useState, useEffect, useRef, useCallback } from 'react'
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import { mergeAttributes, Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { TextStyle, Color, FontFamily, FontSize, LineHeight } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import CharacterCount from '@tiptap/extension-character-count'
import Typography from '@tiptap/extension-typography'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'
import { marked } from 'marked'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, ListChecks, Quote, Code2, Minus, Link2, Unlink, Table as TableIcon,
  ImagePlus, FileCode2, RemoveFormatting, Undo2, Redo2, Rows3, Columns3, Trash2,
  Baseline, Highlighter, PaintBucket, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Subscript as SubIcon, Superscript as SupIcon, IndentIncrease, IndentDecrease, ChevronDown,
  AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  Combine, Split, PanelTop, PanelLeft, CaseSensitive, Sigma, ImageIcon, Upload,
} from 'lucide-react'
import Modal from './Modal'
import { useToastStore } from '../../stores/toastStore'
import { getFileBlobUrl, uploadFile, MAX_FILE_BYTES } from '../../api/attachments'
import './RichTextEditor.css'

// ═══ Extensions dùng chung ══════════════════════════════════════════════════════

// Ảnh: NodeView tải blob theo data-att-id (qua /attachments/download, giữ JWT)
// 8 tay cầm: 4 góc (giữ tỉ lệ) + 4 cạnh (kéo dài ngang/dọc)
const IMG_HANDLES = [
  { dir: 'nw', cursor: 'nwse-resize', style: { top: -5, left: -5 } },
  { dir: 'n',  cursor: 'ns-resize',   style: { top: -5, left: '50%', marginLeft: -5 } },
  { dir: 'ne', cursor: 'nesw-resize', style: { top: -5, right: -5 } },
  { dir: 'e',  cursor: 'ew-resize',   style: { top: '50%', right: -5, marginTop: -5 } },
  { dir: 'se', cursor: 'nwse-resize', style: { bottom: -5, right: -5 } },
  { dir: 's',  cursor: 'ns-resize',   style: { bottom: -5, left: '50%', marginLeft: -5 } },
  { dir: 'sw', cursor: 'nesw-resize', style: { bottom: -5, left: -5 } },
  { dir: 'w',  cursor: 'ew-resize',   style: { top: '50%', left: -5, marginTop: -5 } },
]

function ImageNodeView({ node, selected, updateAttributes, editor }) {
  const { attId, width, height } = node.attrs
  const [url, setUrl] = useState(null)
  const [err, setErr] = useState(false)
  const imgRef = useRef(null)
  useEffect(() => {
    if (!attId) { setUrl(null); return undefined }
    let alive = true, obj = null
    setErr(false); setUrl(null)
    getFileBlobUrl(attId)
      .then((u) => { if (alive) { obj = u; setUrl(u) } else URL.revokeObjectURL(u) })
      .catch(() => { if (alive) setErr(true) })
    return () => { alive = false; if (obj) URL.revokeObjectURL(obj) }
  }, [attId])

  const editable = editor?.isEditable

  function startResize(dir, e) {
    e.preventDefault(); e.stopPropagation()
    const img = imgRef.current
    const startX = e.clientX, startY = e.clientY
    const startW = img?.offsetWidth || width || 300
    const startH = img?.offsetHeight || height || 200
    const corner = dir.length === 2
    const signX = dir.includes('w') ? -1 : 1
    const signY = dir.includes('n') ? -1 : 1
    const onMove = (ev) => {
      const dx = (ev.clientX - startX) * signX
      const dy = (ev.clientY - startY) * signY
      if (corner) {
        // Giữ tỉ lệ: đổi theo chiều lớn hơn, bỏ height (auto)
        const w = Math.max(40, Math.min(1600, startW + dx))
        updateAttributes({ width: Math.round(w), height: null })
      } else if (dir === 'e' || dir === 'w') {
        const w = Math.max(40, Math.min(1600, startW + dx))
        updateAttributes({ width: Math.round(w), height: Math.round(startH) })
      } else {
        const h = Math.max(30, Math.min(2400, startH + dy))
        updateAttributes({ height: Math.round(h), width: Math.round(startW) })
      }
    }
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <NodeViewWrapper as="span" className={`rte-img ${selected ? 'rte-img-selected' : ''}`}
      style={{ position: 'relative', display: 'inline-block', width: width ? `${width}px` : undefined }}>
      {url
        ? <img ref={imgRef} src={url} alt={node.attrs.alt || ''} draggable={false}
            style={{ width: width ? `${width}px` : '100%', height: height ? `${height}px` : 'auto', display: 'block' }} />
        : <span className="rte-img-ph">{err ? '⚠ Lỗi tải ảnh' : 'Đang tải ảnh…'}</span>}
      {editable && selected && url && IMG_HANDLES.map((h) => (
        <span key={h.dir} className="rte-img-handle" style={{ ...h.style, cursor: h.cursor }}
          onMouseDown={(e) => startResize(h.dir, e)} />
      ))}
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
      align: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-align') || null,
        renderHTML: (attrs) => (attrs.align ? { 'data-align': attrs.align } : {}),
      },
      width: {
        default: null,
        parseHTML: (el) => { const w = el.getAttribute('width') || el.style.width; return w ? parseInt(w, 10) : null },
        renderHTML: (attrs) => (attrs.width ? { width: attrs.width } : {}),
      },
      height: {
        default: null,
        parseHTML: (el) => { const h = el.getAttribute('height') || el.style.height; return h ? parseInt(h, 10) : null },
        renderHTML: (attrs) => (attrs.height ? { height: attrs.height } : {}),
      },
    }
  },
  parseHTML() { return [{ tag: 'img[data-att-id]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)]
  },
  addNodeView() { return ReactNodeViewRenderer(ImageNodeView) },
})

// Ô bảng: ĐỔ MÀU NỀN + CĂN DỌC (trên/giữa/dưới) — lưu vào style của <td>/<th>.
const cellAttrs = {
  backgroundColor: {
    default: null,
    parseHTML: (el) => el.style.backgroundColor || null,
    renderHTML: (attrs) => (attrs.backgroundColor ? { style: `background-color: ${attrs.backgroundColor}` } : {}),
  },
  verticalAlign: {
    default: null,
    parseHTML: (el) => el.style.verticalAlign || null,
    renderHTML: (attrs) => (attrs.verticalAlign ? { style: `vertical-align: ${attrs.verticalAlign}` } : {}),
  },
}
const CellWithBg   = TableCell.extend({ addAttributes() { return { ...this.parent?.(), ...cellAttrs } } })
const HeaderWithBg = TableHeader.extend({ addAttributes() { return { ...this.parent?.(), ...cellAttrs } } })

// Chiều cao HÀNG bảng — lưu style height trên <tr> (thư viện bảng chỉ hỗ trợ kéo cột)
const RowWithHeight = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      height: {
        default: null,
        parseHTML: (el) => { const h = el.style.height; return h ? parseInt(h, 10) : null },
        renderHTML: (attrs) => (attrs.height ? { style: `height: ${attrs.height}px` } : {}),
      },
    }
  },
})

// KÉO MÉP DƯỚI của hàng để đổi chiều cao (giống kéo mép cột của bảng).
// Rê chuột tới sát mép dưới 1 hàng → con trỏ ↕; kéo → cập nhật style height của <tr>,
// thả ra thì ghi vào thuộc tính height của node hàng (lưu được).
const RowResize = Extension.create({
  name: 'rowResize',
  addProseMirrorPlugins() {
    const ZONE = 6 // px: vùng bắt được mép hàng
    return [new Plugin({
      key: new PluginKey('rowResize'),
      view(view) {
        let drag = null   // { rowPos, startY, startH }
        const rowInfo = (e) => {
          const el = e.target
          const trEl = el && el.closest ? el.closest('tr') : null
          if (!trEl || !view.dom.contains(trEl)) return null
          return { trEl, rect: trEl.getBoundingClientRect() }
        }
        const nearBottom = (e, rect) => Math.abs(e.clientY - rect.bottom) <= ZONE
        const findRowPos = (trEl) => {
          try {
            const $p = view.state.doc.resolve(view.posAtDOM(trEl, 0))
            for (let d = $p.depth; d > 0; d -= 1) {
              if ($p.node(d).type.name === 'tableRow') return $p.before(d)
            }
          } catch { /* ignore */ }
          return null
        }
        const applyHeight = (rowPos, h, record) => {
          const node = view.state.doc.nodeAt(rowPos)
          if (!node) return
          const tr = view.state.tr.setNodeMarkup(rowPos, undefined, { ...node.attrs, height: h })
          if (!record) tr.setMeta('addToHistory', false)
          view.dispatch(tr)
        }
        const onMove = (e) => {
          if (drag) {
            const h = Math.max(20, Math.round(drag.startH + (e.clientY - drag.startY)))
            applyHeight(drag.rowPos, h, false)   // cập nhật LIVE qua ProseMirror
            return
          }
          if (!view.editable) return
          const info = rowInfo(e)
          view.dom.style.cursor = (info && nearBottom(e, info.rect)) ? 'row-resize' : ''
        }
        const onUp = () => {
          if (!drag) return
          const node = view.state.doc.nodeAt(drag.rowPos)
          if (node && node.attrs.height) applyHeight(drag.rowPos, node.attrs.height, true) // ghi 1 bước hoàn tác
          drag = null
          view.dom.style.cursor = ''
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
        }
        const onDown = (e) => {
          if (!view.editable) return
          const info = rowInfo(e)
          if (!info || !nearBottom(e, info.rect)) return
          const rowPos = findRowPos(info.trEl)
          if (rowPos == null) return
          e.preventDefault()
          e.stopPropagation()   // chặn ProseMirror bắt đầu bôi-chọn-ô
          drag = { rowPos, startY: e.clientY, startH: info.rect.height }
          window.addEventListener('mousemove', onMove)
          window.addEventListener('mouseup', onUp)
        }
        view.dom.addEventListener('mousemove', onMove)
        view.dom.addEventListener('mousedown', onDown, true)   // capture: chạy TRƯỚC ProseMirror
        return {
          destroy() {
            view.dom.removeEventListener('mousemove', onMove)
            view.dom.removeEventListener('mousedown', onDown, true)
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
          },
        }
      },
    })]
  },
})

// Kiểu đánh số cho danh sách có thứ tự (1. / a. / i. / A. …) — thêm attribute vào
// node orderedList sẵn có (không cần thay thế extension của StarterKit).
const OrderedListStyle = Extension.create({
  name: 'orderedListStyle',
  addGlobalAttributes() {
    return [{
      types: ['orderedList'],
      attributes: {
        listStyleType: {
          default: null,
          parseHTML: (el) => el.style.listStyleType || null,
          renderHTML: (attrs) => (attrs.listStyleType ? { style: `list-style-type: ${attrs.listStyleType}` } : {}),
        },
        // Đánh số nhiều cấp kiểu 1 / 1.1 / 1.1.1 (dùng CSS counter — xem .css)
        multilevel: {
          default: false,
          parseHTML: (el) => el.getAttribute('data-multilevel') === 'true',
          renderHTML: (attrs) => (attrs.multilevel ? { 'data-multilevel': 'true' } : {}),
        },
      },
    }]
  },
})

// Thụt lề ĐOẠN VĂN (không phải danh sách) — lưu data-indent + margin-left.
const ParagraphIndent = Extension.create({
  name: 'paragraphIndent',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading'],
      attributes: {
        indent: {
          default: 0,
          parseHTML: (el) => parseInt(el.getAttribute('data-indent'), 10) || 0,
          renderHTML: (attrs) => (attrs.indent
            ? { 'data-indent': attrs.indent, style: `margin-left: ${attrs.indent * 2.2}em` }
            : {}),
        },
      },
    }]
  },
  addCommands() {
    const step = (delta) => ({ state, dispatch }) => {
      const { from, to } = state.selection
      const tr = state.tr
      let changed = false
      state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type.name === 'paragraph' || node.type.name === 'heading') {
          const cur = node.attrs.indent || 0
          const next = Math.min(10, Math.max(0, cur + delta))
          if (next !== cur) { tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next }); changed = true }
        }
      })
      if (changed && dispatch) dispatch(tr)
      return changed
    }
    return { indentBlock: () => step(1), outdentBlock: () => step(-1) }
  },
})

function buildExtensions(placeholder) {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
    AttachmentImage.configure({ inline: true }),   // inline → nhiều ảnh chảy cạnh nhau (như Docs)
    ParagraphIndent,
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    LineHeight.configure({ types: ['paragraph', 'heading'] }),
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Subscript,
    Superscript,
    TaskList,
    TaskItem.configure({ nested: true }),
    Typography,
    CharacterCount,
    OrderedListStyle,
    Placeholder.configure({ placeholder: placeholder || 'Nhập nội dung…' }),
    Table.configure({ resizable: true }),
    RowWithHeight, HeaderWithBg, CellWithBg,
    RowResize,
  ]
}

// Danh mục font + cỡ chữ + giãn dòng cho các dropdown
const FONT_FAMILIES = [
  { label: 'Mặc định', value: '' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  { label: 'Calibri', value: 'Calibri, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Tahoma', value: 'Tahoma, sans-serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
]
const FONT_SIZES = ['', '11', '12', '13', '14', '16', '18', '20', '24', '28', '32']
const LINE_HEIGHTS = [
  { label: 'Giãn dòng', value: '' },
  { label: '1.0', value: '1' },
  { label: '1.15', value: '1.15' },
  { label: '1.5', value: '1.5' },
  { label: '2.0', value: '2' },
]
// Danh mục kiểu đoạn (Tiêu đề) cho ô xổ xuống
const HEADING_OPTIONS = [
  { value: 'p',  label: 'Văn bản thường' },
  { value: '1',  label: 'Tiêu đề 1' },
  { value: '2',  label: 'Tiêu đề 2' },
  { value: '3',  label: 'Tiêu đề 3' },
  { value: '4',  label: 'Tiêu đề 4' },
  { value: '5',  label: 'Tiêu đề 5' },
  { value: '6',  label: 'Tiêu đề 6' },
]

// Thư viện danh sách (giống Numbering Library của Word)
const LIST_OPTIONS = [
  { key: 'none',        label: 'Không đánh dấu', preview: '—' },
  { key: 'bullet',      label: 'Chấm tròn',      preview: '•' },
  { key: 'task',        label: 'Checklist',      preview: '☑' },
  { key: 'decimal',     label: '1.  2.  3.',     preview: '1.' },
  { key: 'lower-alpha', label: 'a.  b.  c.',     preview: 'a.' },
  { key: 'upper-alpha', label: 'A.  B.  C.',     preview: 'A.' },
  { key: 'lower-roman', label: 'i.  ii.  iii.',  preview: 'i.' },
  { key: 'upper-roman', label: 'I.  II.  III.',  preview: 'I.' },
  { key: 'multi',       label: 'Nhiều cấp (1.1.1)', preview: '1.1' },
]

const CASE_OPTIONS = [
  { key: 'upper', label: 'IN HOA' },
  { key: 'lower', label: 'in thường' },
  { key: 'title', label: 'Viết Hoa Đầu Từ' },
]
const SYMBOLS = ['©', '®', '™', '§', '¶', '•', '–', '—', '…', '→', '←', '↔', '⇒', '✓', '✗', '★', '☆',
  '°', '±', '×', '÷', '≤', '≥', '≠', '≈', '∞', 'µ', 'Ω', '€', '₫', '½', '¼', '¾', '℃', '№', '±']

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

// Select gọn cho thanh công cụ (font, cỡ chữ, giãn dòng, kiểu số)
function RteSelect({ value, onChange, title, width, children }) {
  return (
    <select className="rte-select" style={width ? { width } : undefined}
      value={value} onChange={(e) => onChange(e.target.value)}
      onMouseDown={(e) => e.stopPropagation()} title={title}>
      {children}
    </select>
  )
}

// Ô CỠ CHỮ tự nhập (gõ số bất kỳ 6–200) + gợi ý nhanh. Áp dụng ngay khi gõ,
// KHÔNG lấy focus khỏi ô (để người dùng gõ tiếp); Enter thì trả focus về editor.
function FontSizeInput({ editor, value }) {
  const [v, setV] = useState(value)
  useEffect(() => { setV(value) }, [value])
  const applyNumber = (raw, focus) => {
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n) || n < 6 || n > 200) return
    const chain = focus ? editor.chain().focus() : editor.chain()
    chain.setFontSize(`${n}px`).run()
  }
  return (
    <span className="rte-sizewrap">
      <input
        type="number" min={6} max={200} step={1} list="rte-size-presets"
        className="rte-sizeinput" title="Cỡ chữ (tự nhập, 6–200)" placeholder="Cỡ"
        value={v}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => { setV(e.target.value); applyNumber(e.target.value, false) }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyNumber(e.target.value, true) } }}
        onBlur={(e) => { if (e.target.value === '') editor.chain().unsetFontSize().run(); else applyNumber(e.target.value, false) }}
      />
      <datalist id="rte-size-presets">
        {FONT_SIZES.filter(Boolean).map((sz) => <option key={sz} value={sz} />)}
      </datalist>
    </span>
  )
}

// Bảng chọn số dòng × số cột (kéo/di chuột) khi chèn bảng
function TablePicker({ onPick }) {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState({ r: 0, c: 0 })
  const ref = useRef(null)
  const MAX = 8
  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  return (
    <span className="rte-colorwrap" ref={ref}>
      <button type="button" className="rte-btn" title="Chèn bảng"
        onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((v) => !v)}>
        <TableIcon size={15} /><ChevronDown size={11} />
      </button>
      {open && (
        <div className="rte-tablepick" onMouseDown={(e) => e.preventDefault()}>
          <div className="rte-tablegrid" onMouseLeave={() => setHover({ r: 0, c: 0 })}>
            {Array.from({ length: MAX }).map((_, ri) => (
              <div key={ri} className="rte-tablerow">
                {Array.from({ length: MAX }).map((_, ci) => {
                  const on = ri < hover.r && ci < hover.c
                  return (
                    <span key={ci} className={`rte-tablecellpick ${on ? 'on' : ''}`}
                      onMouseEnter={() => setHover({ r: ri + 1, c: ci + 1 })}
                      onClick={() => { onPick(hover.r || ri + 1, hover.c || ci + 1); setOpen(false) }} />
                  )
                })}
              </div>
            ))}
          </div>
          <div className="rte-tablepicklabel">{hover.r || 0} × {hover.c || 0}</div>
        </div>
      )}
    </span>
  )
}

// Thư viện danh sách xổ xuống (bullet / checklist / kiểu số / nhiều cấp)
function ListMenu({ editor }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  const active = editor.isActive('bulletList') || editor.isActive('orderedList') || editor.isActive('taskList')
  const curKey =
    editor.isActive('taskList') ? 'task'
    : editor.isActive('bulletList') ? 'bullet'
    : editor.isActive('orderedList')
      ? (editor.getAttributes('orderedList').multilevel ? 'multi' : (editor.getAttributes('orderedList').listStyleType || 'decimal'))
      : 'none'
  function apply(key) {
    setOpen(false)
    if (key === 'none') {
      const c = editor.chain().focus()
      if (editor.isActive('orderedList')) c.toggleOrderedList()
      else if (editor.isActive('bulletList')) c.toggleBulletList()
      else if (editor.isActive('taskList')) c.toggleTaskList()
      c.run(); return
    }
    if (key === 'bullet') { if (!editor.isActive('bulletList')) editor.chain().focus().toggleBulletList().run(); return }
    if (key === 'task')   { if (!editor.isActive('taskList'))   editor.chain().focus().toggleTaskList().run();   return }
    // Các kiểu số: đảm bảo là danh sách số rồi đặt kiểu / nhiều cấp
    if (!editor.isActive('orderedList')) editor.chain().focus().toggleOrderedList().run()
    editor.chain().focus().updateAttributes('orderedList', {
      listStyleType: key === 'multi' ? null : key,
      multilevel: key === 'multi',
    }).run()
  }
  return (
    <span className="rte-colorwrap" ref={ref}>
      <button type="button" className={`rte-btn ${active ? 'rte-active' : ''}`}
        onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((v) => !v)} title="Danh sách / Đánh số">
        <ListOrdered size={15} /><ChevronDown size={11} />
      </button>
      {open && (
        <div className="rte-listmenu" onMouseDown={(e) => e.preventDefault()}>
          {LIST_OPTIONS.map((o) => (
            <button key={o.key} type="button"
              className={`rte-listitem ${curKey === o.key ? 'on' : ''}`} onClick={() => apply(o.key)}>
              <span className="rte-listprev">{o.preview}</span>
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  )
}

// Đổi hoa/thường cho đoạn bôi chọn (thay text thô — giữ vị trí, không giữ định dạng cũ)
function changeCase(editor, mode) {
  const { from, to, empty } = editor.state.selection
  if (empty) return
  const text = editor.state.doc.textBetween(from, to, '\n', '\n')
  if (!text) return
  let out = text
  if (mode === 'upper') out = text.toLocaleUpperCase('vi')
  else if (mode === 'lower') out = text.toLocaleLowerCase('vi')
  else out = text.replace(/\S+/g, (w) => w.charAt(0).toLocaleUpperCase('vi') + w.slice(1).toLocaleLowerCase('vi'))
  editor.chain().focus().insertContentAt({ from, to }, out).run()
}

// Menu đổi hoa/thường
function CaseMenu({ editor }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  return (
    <span className="rte-colorwrap" ref={ref}>
      <button type="button" className="rte-btn" title="Đổi hoa / thường"
        onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((v) => !v)}>
        <CaseSensitive size={15} /><ChevronDown size={11} />
      </button>
      {open && (
        <div className="rte-listmenu" onMouseDown={(e) => e.preventDefault()}>
          {CASE_OPTIONS.map((o) => (
            <button key={o.key} type="button" className="rte-listitem"
              onClick={() => { changeCase(editor, o.key); setOpen(false) }}>{o.label}</button>
          ))}
        </div>
      )}
    </span>
  )
}

// Menu chèn ký hiệu đặc biệt
function SymbolMenu({ editor }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  return (
    <span className="rte-colorwrap" ref={ref}>
      <button type="button" className="rte-btn" title="Chèn ký hiệu"
        onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((v) => !v)}>
        <Sigma size={15} />
      </button>
      {open && (
        <div className="rte-symbolmenu" onMouseDown={(e) => e.preventDefault()}>
          {SYMBOLS.map((sym, i) => (
            <button key={`${sym}-${i}`} type="button" className="rte-symbol"
              onClick={() => { editor.chain().focus().insertContent(sym).run(); setOpen(false) }}>{sym}</button>
          ))}
        </div>
      )}
    </span>
  )
}

function Toolbar({ editor, onInsertImage, onOpenMarkdown, onImportWord, allowImage }) {
  useEditorTick(editor)
  if (!editor) return null
  const inTable = editor.isActive('table')
  const curFont = editor.getAttributes('textStyle').fontFamily || ''
  const curSize = (editor.getAttributes('textStyle').fontSize || '').replace('px', '')
  const curLh   = editor.getAttributes('paragraph').lineHeight || editor.getAttributes('heading').lineHeight || ''
  const curHeading = [1, 2, 3, 4, 5, 6].find((n) => editor.isActive('heading', { level: n }))
  const headingVal = curHeading ? String(curHeading) : 'p'
  return (
    <div className="rte-toolbar">
      <TB title="Hoàn tác" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}><Undo2 size={15} /></TB>
      <TB title="Làm lại" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}><Redo2 size={15} /></TB>
      <Sep />
      <TB title="Đậm" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={15} /></TB>
      <TB title="Nghiêng" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={15} /></TB>
      <TB title="Gạch chân" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon size={15} /></TB>
      <TB title="Gạch ngang" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={15} /></TB>
      <TB title="Chỉ số dưới" active={editor.isActive('subscript')} onClick={() => editor.chain().focus().toggleSubscript().run()}><SubIcon size={15} /></TB>
      <TB title="Chỉ số trên" active={editor.isActive('superscript')} onClick={() => editor.chain().focus().toggleSuperscript().run()}><SupIcon size={15} /></TB>
      <Sep />
      <RteSelect title="Font chữ" width={122} value={curFont}
        onChange={(v) => v ? editor.chain().focus().setFontFamily(v).run() : editor.chain().focus().unsetFontFamily().run()}>
        {FONT_FAMILIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
      </RteSelect>
      <FontSizeInput editor={editor} value={curSize} />
      <RteSelect title="Giãn dòng" width={92} value={curLh}
        onChange={(v) => v ? editor.chain().focus().setLineHeight(v).run() : editor.chain().focus().unsetLineHeight().run()}>
        {LINE_HEIGHTS.map((lh) => <option key={lh.value} value={lh.value}>{lh.label}</option>)}
      </RteSelect>
      <Sep />
      <RteSelect title="Kiểu đoạn / Tiêu đề" width={132} value={headingVal}
        onChange={(v) => v === 'p'
          ? editor.chain().focus().setParagraph().run()
          : editor.chain().focus().setHeading({ level: Number(v) }).run()}>
        {HEADING_OPTIONS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
      </RteSelect>
      <Sep />
      <ColorMenu editor={editor} mode="text" />
      <ColorMenu editor={editor} mode="highlight" />
      <Sep />
      <TB title="Căn trái" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}><AlignLeft size={15} /></TB>
      <TB title="Căn giữa" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenter size={15} /></TB>
      <TB title="Căn phải" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}><AlignRight size={15} /></TB>
      <TB title="Căn đều" active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}><AlignJustify size={15} /></TB>
      <Sep />
      <TB title="Danh sách chấm" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={15} /></TB>
      <ListMenu editor={editor} />
      <TB title="Danh sách công việc (checkbox)" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()}><ListChecks size={15} /></TB>
      <TB title="Giảm lề / giảm cấp" onClick={() => {
        if (editor.isActive('taskItem')) editor.chain().focus().liftListItem('taskItem').run()
        else if (editor.isActive('listItem')) editor.chain().focus().liftListItem('listItem').run()
        else editor.chain().focus().outdentBlock().run()
      }}><IndentDecrease size={15} /></TB>
      <TB title="Tăng lề / tăng cấp" onClick={() => {
        if (editor.isActive('taskItem')) editor.chain().focus().sinkListItem('taskItem').run()
        else if (editor.isActive('listItem')) editor.chain().focus().sinkListItem('listItem').run()
        else editor.chain().focus().indentBlock().run()
      }}><IndentIncrease size={15} /></TB>
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
      <TablePicker onPick={(rows, cols) => editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()} />
      {inTable && <>
        <TB title="Thêm hàng dưới" onClick={() => editor.chain().focus().addRowAfter().run()}><Rows3 size={15} /></TB>
        <TB title="Thêm cột phải" onClick={() => editor.chain().focus().addColumnAfter().run()}><Columns3 size={15} /></TB>
        <TB title="Xoá hàng" onClick={() => editor.chain().focus().deleteRow().run()}>−<Rows3 size={13} /></TB>
        <TB title="Xoá cột" onClick={() => editor.chain().focus().deleteColumn().run()}>−<Columns3 size={13} /></TB>
        <ColorMenu editor={editor} mode="cell" />
        <TB title="Căn trên" onClick={() => editor.chain().focus().setCellAttribute('verticalAlign', 'top').run()}><AlignVerticalJustifyStart size={15} /></TB>
        <TB title="Căn giữa (dọc)" onClick={() => editor.chain().focus().setCellAttribute('verticalAlign', 'middle').run()}><AlignVerticalJustifyCenter size={15} /></TB>
        <TB title="Căn dưới" onClick={() => editor.chain().focus().setCellAttribute('verticalAlign', 'bottom').run()}><AlignVerticalJustifyEnd size={15} /></TB>
        <TB title="Gộp các ô đã chọn" onClick={() => editor.chain().focus().mergeCells().run()}><Combine size={15} /></TB>
        <TB title="Tách ô" onClick={() => editor.chain().focus().splitCell().run()}><Split size={15} /></TB>
        <TB title="Bật/tắt hàng tiêu đề" onClick={() => editor.chain().focus().toggleHeaderRow().run()}><PanelTop size={15} /></TB>
        <TB title="Bật/tắt cột tiêu đề" onClick={() => editor.chain().focus().toggleHeaderColumn().run()}><PanelLeft size={15} /></TB>
        <TB title="Xoá bảng" onClick={() => editor.chain().focus().deleteTable().run()}><Trash2 size={15} /></TB>
      </>}
      {editor.isActive('image') && <>
        <Sep />
        <TB title="Ảnh về cỡ gốc" onClick={() => editor.chain().focus().updateAttributes('image', { width: null, height: null }).run()}><ImageIcon size={15} /></TB>
      </>}
      <Sep />
      <CaseMenu editor={editor} />
      <SymbolMenu editor={editor} />
      {allowImage && <TB title="Chèn ảnh" onClick={onInsertImage}><ImagePlus size={15} /></TB>}
      <TB title="Nhập file Word (.docx)" onClick={onImportWord}><Upload size={15} /></TB>
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

// base64 → Blob (để upload ảnh trong file Word lên kho attachments)
function base64ToBlob(b64, type) {
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: type || 'image/png' })
}

// Thanh đếm số từ / ký tự ở chân editor
function CharCountBar({ editor }) {
  useEditorTick(editor)
  if (!editor?.storage?.characterCount) return null
  const words = editor.storage.characterCount.words()
  const chars = editor.storage.characterCount.characters()
  return <div className="rte-countbar">{words} từ · {chars} ký tự</div>
}

// ═══ RichTextEditor — bề mặt soạn thảo controlled (value / onChange) ═════════════
export default function RichTextEditor({
  value, onChange, editable = true, companyId, placeholder,
  autoFocus = false, showToolbar = true, minHeight = 180, className = '',
}) {
  const addToast = useToastStore((st) => st.toast)
  const [showMarkdown, setShowMarkdown] = useState(false)
  const fileRef = useRef(null)
  const docxRef = useRef(null)

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

  // Nhập file Word (.docx): mammoth chuyển sang HTML; ảnh trong file → upload attachments
  const handleImportWord = useCallback(async (file) => {
    if (!editor || !file) return
    if (!/\.docx$/i.test(file.name)) { addToast('Chỉ hỗ trợ file Word .docx', 'error'); return }
    addToast('Đang chuyển đổi file Word…', 'info')
    try {
      const mammoth = (await import('mammoth')).default   // tải thư viện khi cần
      const arrayBuffer = await file.arrayBuffer()
      const convertImage = mammoth.images.imgElement(async (image) => {
        if (!companyId) return {}   // không có nơi lưu ảnh → bỏ ảnh
        try {
          const b64 = await image.read('base64')
          const blob = base64ToBlob(b64, image.contentType)
          if (blob.size > MAX_FILE_BYTES) return {}
          const imgFile = new File([blob], 'word-image', { type: image.contentType || 'image/png' })
          const att = await uploadFile('company', companyId, imgFile)
          return { 'data-att-id': att.id }
        } catch { return {} }
      })
      const result = await mammoth.convertToHtml({ arrayBuffer }, { convertImage })
      const html = (result?.value || '').trim()
      if (!html) { addToast('File Word rỗng hoặc không đọc được', 'error'); return }
      editor.chain().focus().insertContent(html).run()
      addToast('Đã nhập nội dung từ Word', 'success')
    } catch {
      addToast('Không đọc được file Word', 'error')
    }
  }, [editor, companyId, addToast])

  return (
    <div className={`rte ${className}`}>
      {editable && showToolbar && (
        <Toolbar
          editor={editor}
          allowImage={Boolean(companyId)}
          onInsertImage={() => fileRef.current?.click()}
          onOpenMarkdown={() => setShowMarkdown(true)}
          onImportWord={() => docxRef.current?.click()}
        />
      )}
      <div className="rte-content rte-doc" style={{ '--rte-min-h': typeof minHeight === 'number' ? `${minHeight}px` : minHeight }}>
        <EditorContent editor={editor} />
      </div>
      {editable && showToolbar && <CharCountBar editor={editor} />}
      <input ref={fileRef} type="file" accept="image/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAndInsert(f); e.target.value = '' }} />
      <input ref={docxRef} type="file" accept=".docx" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportWord(f); e.target.value = '' }} />
      {showMarkdown && <MarkdownModal onInsert={insertMarkdown} onClose={() => setShowMarkdown(false)} />}
    </div>
  )
}
