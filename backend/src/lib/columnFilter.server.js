'use strict'
// ── Header filter phía SERVER — helper DÙNG CHUNG cho mọi trang danh sách ─────────
// Đối xứng với component frontend `ui/ColumnFilterDropdown`: mỗi module chỉ khai báo
// MAP CỘT của mình rồi gọi helper này để có (1) danh sách giá trị + cache version-key,
// (2) dịch colFilters → điều kiện SQL an toàn.
//
// columnMap[colKey] = {
//   text   : biểu thức TEXT cho value-list + so khớp "lọc theo giá trị" (null = không có value-list)
//   filter : biểu thức cho điều kiện range/số/text (date→kiểu date, number→numeric)
//   kind   : 'text' | 'date' | 'number'
//   join   : khoá join cần thêm (tra trong joinsMap) — chỉ thêm khi cột được dùng
// }
const crypto = require('crypto')
const { redis } = require('../config/redis')

function sqlLit(s) { return `'${String(s ?? '').replace(/'/g, "''")}'` }

const TEXT_OP_SQL = {
  contains:    (e, ph) => `${e} ILIKE '%' || ${ph} || '%'`,
  notContains: (e, ph) => `(${e} IS NULL OR ${e} NOT ILIKE '%' || ${ph} || '%')`,
  equals:      (e, ph) => `lower(${e}) = lower(${ph})`,
  notEquals:   (e, ph) => `(${e} IS NULL OR lower(${e}) <> lower(${ph}))`,
  startsWith:  (e, ph) => `${e} ILIKE ${ph} || '%'`,
  endsWith:    (e, ph) => `${e} ILIKE '%' || ${ph}`,
}
const NUM_OP_SQL = { eq: '=', ne: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }

// Dịch colFilters → { conditions:[sql], params:[], joins:Set }. startIdx = số param đã dùng trước.
// colFilters = { [colKey]: array(giá trị) | {conditions:[{op,value}],join} | {from,to} }
function buildColFilterSql(columnMap, colFilters, startIdx) {
  const conditions = []
  const params = []
  const joins = new Set()
  let idx = startIdx
  const ph = () => `$${++idx}`

  for (const [colKey, fv] of Object.entries(colFilters || {})) {
    const cfg = columnMap[colKey]
    if (!cfg || fv == null) continue
    if (cfg.join) joins.add(cfg.join)

    // 1) Lọc theo GIÁ TRỊ (mảng) — so khớp trên biểu thức TEXT
    if (Array.isArray(fv)) {
      if (fv.length === 0 || !cfg.text) continue
      const nonNull = fv.filter((v) => v != null && v !== '')
      const hasBlank = fv.some((v) => v == null || v === '')
      const parts = []
      if (nonNull.length) { params.push(nonNull); parts.push(`${cfg.text} = ANY(${ph()}::text[])`) }
      if (hasBlank) parts.push(`(${cfg.text} IS NULL OR ${cfg.text} = '')`)
      if (parts.length) conditions.push(`(${parts.join(' OR ')})`)
      continue
    }
    // 2) Khoảng ngày { from, to }
    if (cfg.kind === 'date' && (fv.from || fv.to)) {
      if (fv.from) { params.push(fv.from); conditions.push(`${cfg.filter} >= ${ph()}`) }
      if (fv.to)   { params.push(fv.to);   conditions.push(`${cfg.filter} <= ${ph()}`) }
      continue
    }
    // 3) Bộ điều kiện { conditions:[{op,value}], join }
    if (Array.isArray(fv.conditions)) {
      const parts = []
      for (const c of fv.conditions) {
        if (!c || !c.op) continue
        if (cfg.kind === 'number') {
          if (String(c.value).trim() === '' || !(c.op in NUM_OP_SQL)) continue
          params.push(parseFloat(c.value)); parts.push(`${cfg.filter} ${NUM_OP_SQL[c.op]} ${ph()}`)
        } else {
          if (c.op === 'blank')    { parts.push(`(${cfg.filter} IS NULL OR ${cfg.filter} = '')`); continue }
          if (c.op === 'notBlank') { parts.push(`(${cfg.filter} IS NOT NULL AND ${cfg.filter} <> '')`); continue }
          if (String(c.value).trim() === '' || !TEXT_OP_SQL[c.op]) continue
          params.push(String(c.value)); parts.push(TEXT_OP_SQL[c.op](cfg.filter, ph()))
        }
      }
      if (parts.length) conditions.push(`(${parts.join(fv.join === 'or' ? ' OR ' : ' AND ')})`)
    }
  }
  return { conditions, params, joins }
}

// Parse colFilters/colSort có thể là chuỗi JSON (từ query string) → object.
function parseJson(v) {
  if (typeof v !== 'string') return v
  try { return JSON.parse(v) } catch { return null }
}

// ── Cache version-key theo namespace ─────────────────────────────────────────────
async function getVersion(ns) {
  try { return (await redis.get(`${ns}:ver`)) || '0' } catch { return '0' }
}
// Bump khi có thay đổi dữ liệu → mọi cache key cũ thành rác, request sau tự tươi.
async function bumpVersion(ns) {
  try { await redis.incr(`${ns}:ver`) } catch { /* redis lỗi → coi như không cache */ }
}

// Danh sách GIÁ TRỊ theo cột + cache. `query` là hàm truy vấn DB của module (tránh vòng import).
//   opts = { ns, tableExpr, columnMap, joinsMap, column, search, whereSql, params, hashKey, limit, ttl }
async function getColumnValues(query, opts) {
  const {
    ns, tableExpr, columnMap, joinsMap = {}, column, search,
    whereSql, params, hashKey, limit = 1000, ttl = 60,
  } = opts
  const cfg = columnMap[column]
  if (!cfg || !cfg.text) { const e = new Error('Cột không hỗ trợ lọc theo giá trị'); e.status = 400; throw e }

  const ver = await getVersion(ns)
  const normSearch = (search && search.trim()) ? search.trim().toLowerCase() : ''
  const hash = crypto.createHash('sha1')
    .update(JSON.stringify({ h: hashKey ?? null, s: normSearch }))
    .digest('hex').slice(0, 16)
  const cacheKey = `${ns}:${ver}:${column}:${hash}`

  try { const c = await redis.get(cacheKey); if (c) return JSON.parse(c) } catch { /* redis lỗi */ }

  const p = [...params]
  const joinSql = cfg.join ? (joinsMap[cfg.join] || '') : ''
  let extra = ''
  if (normSearch) { p.push(`%${normSearch}%`); extra = ` AND ${cfg.text} ILIKE $${p.length}` }
  const sql = `
    SELECT ${cfg.text} AS value, COUNT(*)::int AS count
    FROM ${tableExpr} ${joinSql}
    WHERE ${whereSql}${extra}
    GROUP BY ${cfg.text}
    ORDER BY count DESC, value ASC
    LIMIT ${limit}`
  const { rows } = await query(sql, p)
  const values = rows.map((r) => ({ value: r.value, count: r.count }))

  try { await redis.set(cacheKey, JSON.stringify(values), 'EX', ttl) } catch { /* redis lỗi */ }
  return values
}

// Dựng ORDER BY cho 1 cột (có collation vi cho cột chữ/nhãn). enumCaseExpr: chuỗi CASE
// map mã→nhãn (nếu cột là enum, module tự dựng vì cần tra nhãn async), else null.
function buildColSortOrder(columnMap, colSortObj, { enumCaseExpr = null, tieBreak = '' } = {}) {
  const meta = colSortObj && colSortObj.col ? columnMap[colSortObj.col] : null
  if (!meta) return null
  const dir = colSortObj.dir === 'desc' ? 'DESC' : 'ASC'
  const expr = enumCaseExpr || meta.filter
  const textLike = Boolean(enumCaseExpr) || meta.kind === 'text'
  const coll = textLike ? ' COLLATE "vi-VN-x-icu"' : ''
  return `${expr}${coll} ${dir} NULLS LAST${tieBreak ? `, ${tieBreak}` : ''}`
}

module.exports = {
  sqlLit, TEXT_OP_SQL, NUM_OP_SQL,
  buildColFilterSql, parseJson, getVersion, bumpVersion, getColumnValues, buildColSortOrder,
}
