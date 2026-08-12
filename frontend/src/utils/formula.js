// ── Engine công thức kiểu Excel — AN TOÀN, KHÔNG dùng eval/Function ──────────────
// Tham chiếu cột bằng token {col_key}. Trả { value, error }.
//   error ∈ #REF (cột không tồn tại) · #NAME (hàm/hằng lạ) · #DIV/0 · #VALUE (sai kiểu)
//          · #CYCLE (vòng lặp tham chiếu — do resolver ném) · #ERR (cú pháp)
//
// Toán tử: + - * / % ^ (luỹ thừa) · & (nối chuỗi) · so sánh = <> < <= > >=
// Hàm: IF AND OR NOT SUM MIN MAX AVG/AVERAGE ROUND ROUNDUP ROUNDDOWN ABS
//      CEILING FLOOR CONCAT LEN TODAY DATEDIFF
// Hằng: TRUE FALSE PI

class FormulaError extends Error {
  constructor(code) { super(code); this.code = code }
}

// ── Tokenizer ─────────────────────────────────────────────────────────────────
function tokenize(src) {
  const s = String(src)
  const tokens = []
  let i = 0
  const isDigit = (c) => c >= '0' && c <= '9'
  const isAlpha = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_'
  while (i < s.length) {
    const c = s[i]
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue }
    if (isDigit(c) || (c === '.' && isDigit(s[i + 1]))) {
      let j = i + 1
      while (j < s.length && (isDigit(s[j]) || s[j] === '.')) j++
      const num = Number(s.slice(i, j))
      if (Number.isNaN(num)) throw new FormulaError('#ERR')
      tokens.push({ type: 'NUM', value: num }); i = j; continue
    }
    if (c === '"' || c === "'") {
      let j = i + 1; let str = ''
      while (j < s.length && s[j] !== c) { str += s[j]; j++ }
      if (j >= s.length) throw new FormulaError('#ERR')  // chuỗi chưa đóng
      tokens.push({ type: 'STR', value: str }); i = j + 1; continue
    }
    if (c === '{') {
      let j = i + 1; let key = ''
      while (j < s.length && s[j] !== '}') { key += s[j]; j++ }
      if (j >= s.length) throw new FormulaError('#ERR')  // {} chưa đóng
      tokens.push({ type: 'COL', value: key.trim() }); i = j + 1; continue
    }
    if (isAlpha(c)) {
      let j = i + 1
      while (j < s.length && (isAlpha(s[j]) || isDigit(s[j]))) j++
      tokens.push({ type: 'IDENT', value: s.slice(i, j) }); i = j; continue
    }
    const two = s.slice(i, i + 2)
    if (two === '<=' || two === '>=' || two === '<>') { tokens.push({ type: 'OP', value: two }); i += 2; continue }
    if (c === '(') { tokens.push({ type: 'LP' }); i++; continue }
    if (c === ')') { tokens.push({ type: 'RP' }); i++; continue }
    if (c === ',') { tokens.push({ type: 'COMMA' }); i++; continue }
    if ('+-*/%^&=<>'.includes(c)) { tokens.push({ type: 'OP', value: c }); i++; continue }
    throw new FormulaError('#ERR')
  }
  return tokens
}

// ── Parser (đệ quy xuống → AST) ────────────────────────────────────────────────
function parse(tokens) {
  let pos = 0
  const peek = () => tokens[pos]
  const nextTok = () => tokens[pos++]
  const eat = (pred) => { const t = nextTok(); if (!pred(t)) throw new FormulaError('#ERR'); return t }
  const isOp = (v) => { const t = peek(); return t && t.type === 'OP' && (v ? (Array.isArray(v) ? v.includes(t.value) : t.value === v) : true) }

  function parseExpr() { return parseCompare() }
  function parseCompare() {
    let left = parseConcat()
    while (isOp(['=', '<>', '<', '<=', '>', '>='])) { const op = nextTok().value; left = { kind: 'bin', op, left, right: parseConcat() } }
    return left
  }
  function parseConcat() {
    let left = parseAdd()
    while (isOp('&')) { nextTok(); left = { kind: 'bin', op: '&', left, right: parseAdd() } }
    return left
  }
  function parseAdd() {
    let left = parseMul()
    while (isOp(['+', '-'])) { const op = nextTok().value; left = { kind: 'bin', op, left, right: parseMul() } }
    return left
  }
  function parseMul() {
    let left = parseUnary()
    while (isOp(['*', '/', '%'])) { const op = nextTok().value; left = { kind: 'bin', op, left, right: parseUnary() } }
    return left
  }
  function parseUnary() {
    if (isOp(['-', '+'])) { const op = nextTok().value; return { kind: 'unary', op, operand: parseUnary() } }
    return parsePower()
  }
  function parsePower() {
    const base = parsePrimary()
    if (isOp('^')) { nextTok(); return { kind: 'bin', op: '^', left: base, right: parseUnary() } }  // right-assoc
    return base
  }
  function parsePrimary() {
    const t = peek()
    if (!t) throw new FormulaError('#ERR')
    if (t.type === 'NUM') { nextTok(); return { kind: 'num', value: t.value } }
    if (t.type === 'STR') { nextTok(); return { kind: 'str', value: t.value } }
    if (t.type === 'COL') { nextTok(); return { kind: 'col', key: t.value } }
    if (t.type === 'LP') { nextTok(); const e = parseExpr(); eat((x) => x && x.type === 'RP'); return e }
    if (t.type === 'IDENT') {
      nextTok()
      const up = t.value.toUpperCase()
      if (peek() && peek().type === 'LP') {
        nextTok()  // (
        const args = []
        if (!(peek() && peek().type === 'RP')) {
          args.push(parseExpr())
          while (peek() && peek().type === 'COMMA') { nextTok(); args.push(parseExpr()) }
        }
        eat((x) => x && x.type === 'RP')
        return { kind: 'call', name: up, args }
      }
      if (up === 'TRUE')  return { kind: 'bool', value: true }
      if (up === 'FALSE') return { kind: 'bool', value: false }
      if (up === 'PI')    return { kind: 'num', value: Math.PI }
      throw new FormulaError('#NAME')
    }
    throw new FormulaError('#ERR')
  }

  const ast = parseExpr()
  if (pos < tokens.length) throw new FormulaError('#ERR')  // token thừa
  return ast
}

// ── Coercion ──────────────────────────────────────────────────────────────────
function toNum(v) {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  const n = Number(v)
  if (Number.isNaN(n)) throw new FormulaError('#VALUE')
  return n
}
function toStr(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return String(v)
}
function toBool(v) {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (v === null || v === undefined || v === '') return false
  const sv = String(v).trim().toUpperCase()
  if (sv === 'TRUE') return true
  if (sv === 'FALSE') return false
  return true
}
function isNumeric(v) {
  return typeof v === 'number' || typeof v === 'boolean'
    || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)))
}
function looseEq(l, r) { return isNumeric(l) && isNumeric(r) ? toNum(l) === toNum(r) : toStr(l) === toStr(r) }
function cmp(l, r) {
  if (isNumeric(l) && isNumeric(r)) { const a = toNum(l), b = toNum(r); return a < b ? -1 : a > b ? 1 : 0 }
  const a = toStr(l), b = toStr(r); return a < b ? -1 : a > b ? 1 : 0
}
function todayISO() { return new Date().toISOString().slice(0, 10) }
function dateDiff(a, b) {
  const da = new Date(String(a).slice(0, 10)), db = new Date(String(b).slice(0, 10))
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) throw new FormulaError('#VALUE')
  return Math.round((db - da) / 86_400_000)
}

// ── Helpers cho aggregate + hàm điều kiện / liên bảng ───────────────────────────
// Token liên bảng {def!col} resolve thành MẢNG (cả cột bảng kia). Các helper dưới
// cho phép hàm nhận cả mảng lẫn vô hướng.
function toArr(v) { return Array.isArray(v) ? v : (v == null ? [] : [v]) }
function flat1(a) { const out = []; for (const x of a) { if (Array.isArray(x)) out.push(...x); else out.push(x) } return out }
function numOr0(x) { return isNumeric(x) ? toNum(x) : 0 }   // bỏ qua ô rỗng/không phải số
// Tiêu chí kiểu Excel: số/chuỗi khớp đúng; hoặc chuỗi mở đầu bằng toán tử >,>=,<,<=,<>,=
function makeCriterion(crit) {
  if (typeof crit === 'string') {
    const m = crit.match(/^\s*(<=|>=|<>|=|<|>)\s*(.*)$/)
    if (m) {
      const op = m[1], rhs = m[2].trim()
      return (cell) => {
        switch (op) {
          case '=':  return looseEq(cell, rhs)
          case '<>': return !looseEq(cell, rhs)
          case '<':  return cmp(cell, rhs) < 0
          case '<=': return cmp(cell, rhs) <= 0
          case '>':  return cmp(cell, rhs) > 0
          case '>=': return cmp(cell, rhs) >= 0
          default:   return false
        }
      }
    }
  }
  return (cell) => looseEq(cell, crit)   // khớp đúng
}

const FUNCS = {
  IF:        (a) => { if (a.length < 2) throw new FormulaError('#ERR'); return toBool(a[0]) ? a[1] : (a.length >= 3 ? a[2] : false) },
  AND:       (a) => a.every(toBool),
  OR:        (a) => a.some(toBool),
  NOT:       (a) => !toBool(a[0]),
  SUM:       (a) => flat1(a).reduce((s, x) => s + toNum(x), 0),
  MIN:       (a) => Math.min(...flat1(a).map(toNum)),
  MAX:       (a) => Math.max(...flat1(a).map(toNum)),
  AVG:       (a) => { const f = flat1(a); return f.length ? f.reduce((s, x) => s + toNum(x), 0) / f.length : 0 },
  AVERAGE:   (a) => FUNCS.AVG(a),
  COUNT:     (a) => flat1(a).filter(isNumeric).length,
  // ── Điều kiện + liên bảng ──
  // SUMIF(vùng, tiêu_chí, [vùng_tổng]) — cộng vùng_tổng tại các dòng vùng khớp tiêu chí.
  SUMIF:     (a) => { const rng = toArr(a[0]), sum = a.length >= 3 ? toArr(a[2]) : toArr(a[0]); const p = makeCriterion(a[1]); let s = 0; for (let i = 0; i < rng.length; i++) if (p(rng[i])) s += numOr0(sum[i]); return s },
  COUNTIF:   (a) => { const rng = toArr(a[0]); const p = makeCriterion(a[1]); let c = 0; for (const x of rng) if (p(x)) c++; return c },
  AVERAGEIF: (a) => { const rng = toArr(a[0]), av = a.length >= 3 ? toArr(a[2]) : toArr(a[0]); const p = makeCriterion(a[1]); let s = 0, c = 0; for (let i = 0; i < rng.length; i++) if (p(rng[i]) && isNumeric(av[i])) { s += toNum(av[i]); c++ } return c ? s / c : 0 },
  // SUMIFS(vùng_tổng, vùng1, tiêu_chí1, vùng2, tiêu_chí2, …)
  SUMIFS:    (a) => { const sum = toArr(a[0]); const pairs = []; for (let i = 1; i + 1 < a.length; i += 2) pairs.push([toArr(a[i]), makeCriterion(a[i + 1])]); let s = 0; for (let i = 0; i < sum.length; i++) { let ok = true; for (const [rng, p] of pairs) if (!p(rng[i])) { ok = false; break } if (ok) s += numOr0(sum[i]) } return s },
  // LOOKUP/VLOOKUP(giá_trị, vùng_khoá, vùng_trả) — khớp ĐÚNG đầu tiên → giá trị cùng dòng; không thấy → '' .
  LOOKUP:    (a) => { const key = a[0], look = toArr(a[1]), res = a.length >= 3 ? toArr(a[2]) : toArr(a[1]); for (let i = 0; i < look.length; i++) if (looseEq(look[i], key)) return res[i] ?? ''; return '' },
  VLOOKUP:   (a) => FUNCS.LOOKUP(a),
  ROUND:     (a) => { const f = Math.pow(10, a.length > 1 ? toNum(a[1]) : 0); return Math.round(toNum(a[0]) * f) / f },
  ROUNDUP:   (a) => { const f = Math.pow(10, a.length > 1 ? toNum(a[1]) : 0); return Math.ceil(toNum(a[0]) * f) / f },
  ROUNDDOWN: (a) => { const f = Math.pow(10, a.length > 1 ? toNum(a[1]) : 0); return Math.floor(toNum(a[0]) * f) / f },
  ABS:       (a) => Math.abs(toNum(a[0])),
  CEILING:   (a) => Math.ceil(toNum(a[0])),
  FLOOR:     (a) => Math.floor(toNum(a[0])),
  CONCAT:    (a) => a.map(toStr).join(''),
  LEN:       (a) => toStr(a[0]).length,
  TODAY:     () => todayISO(),
  DATEDIFF:  (a) => dateDiff(a[0], a[1]),
}

function evalNode(node, resolve) {
  switch (node.kind) {
    case 'num': return node.value
    case 'str': return node.value
    case 'bool': return node.value
    case 'col': {
      const v = resolve(node.key)   // resolver có thể ném (vòng lặp) — để lan lên
      if (v === undefined) throw new FormulaError('#REF')
      return v
    }
    case 'unary': { const v = toNum(evalNode(node.operand, resolve)); return node.op === '-' ? -v : v }
    case 'bin': return evalBin(node, resolve)
    case 'call': {
      const fn = FUNCS[node.name]
      if (!fn) throw new FormulaError('#NAME')
      return fn(node.args.map((a) => evalNode(a, resolve)))
    }
    default: throw new FormulaError('#ERR')
  }
}
function evalBin(node, resolve) {
  const l = evalNode(node.left, resolve)
  const r = evalNode(node.right, resolve)
  switch (node.op) {
    case '+': return toNum(l) + toNum(r)
    case '-': return toNum(l) - toNum(r)
    case '*': return toNum(l) * toNum(r)
    case '/': { const d = toNum(r); if (d === 0) throw new FormulaError('#DIV/0'); return toNum(l) / d }
    case '%': { const d = toNum(r); if (d === 0) throw new FormulaError('#DIV/0'); return toNum(l) % d }
    case '^': return Math.pow(toNum(l), toNum(r))
    case '&': return toStr(l) + toStr(r)
    case '=':  return looseEq(l, r)
    case '<>': return !looseEq(l, r)
    case '<':  return cmp(l, r) < 0
    case '<=': return cmp(l, r) <= 0
    case '>':  return cmp(l, r) > 0
    case '>=': return cmp(l, r) >= 0
    default: throw new FormulaError('#ERR')
  }
}

// AST cache theo chuỗi biểu thức → sort/filter gọi lại không phải parse lại
const _astCache = new Map()
function getAst(expression) {
  if (_astCache.has(expression)) return _astCache.get(expression)
  const ast = parse(tokenize(expression))
  if (_astCache.size > 500) _astCache.clear()
  _astCache.set(expression, ast)
  return ast
}

// resolve(colKey) → giá trị (number|string|null) nếu cột tồn tại; undefined nếu KHÔNG có cột.
// resolve được phép ném lỗi có thuộc tính __formulaError (vd '#CYCLE') để báo lỗi riêng.
export function evaluateFormula(expression, resolve) {
  try {
    if (expression == null || String(expression).trim() === '') return { value: null, error: null }
    const value = evalNode(getAst(String(expression)), resolve)
    return { value, error: null }
  } catch (e) {
    if (e instanceof FormulaError) return { value: null, error: e.code }
    if (e && e.__formulaError) return { value: null, error: e.__formulaError }
    return { value: null, error: '#ERR' }
  }
}

// Tách token tham chiếu: "defId!col" → { table:'defId', col:'col' }; "col" → { table:null, col:'col' }.
// Dùng cho token LIÊN BẢNG {defId!col_key}. Tách theo dấu '!' ĐẦU TIÊN.
export function splitRef(key) {
  const k = String(key ?? '')
  const i = k.indexOf('!')
  return i === -1 ? { table: null, col: k } : { table: k.slice(0, i), col: k.slice(i + 1) }
}

// Danh sách col_key được tham chiếu — dùng cho builder (kiểm cột lạ) & phát hiện phụ thuộc.
export function extractRefs(expression) {
  const set = new Set()
  try { for (const t of tokenize(String(expression ?? ''))) if (t.type === 'COL') set.add(t.value) }
  catch { /* biểu thức lỗi cú pháp → trả những gì đọc được */ }
  return [...set]
}

// Kiểm cú pháp nhanh cho builder (không cần dữ liệu). Trả { ok, error }.
export function checkSyntax(expression) {
  try {
    if (expression == null || String(expression).trim() === '') return { ok: true, error: null }
    getAst(String(expression))
    return { ok: true, error: null }
  } catch (e) {
    return { ok: false, error: e instanceof FormulaError ? e.code : '#ERR' }
  }
}
