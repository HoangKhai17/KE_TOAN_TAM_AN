import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeClipboardGrid, parseClipboardDate, parseClipboardGrid } from '../src/utils/clipboardGrid.js'

test('parse ngày Việt Nam và ISO', () => {
  assert.equal(parseClipboardDate('09/08/2026'), '2026-08-09')
  assert.equal(parseClipboardDate('9-8-2026'), '2026-08-09')
  assert.equal(parseClipboardDate('2026-08-09'), '2026-08-09')
})

test('không đảo dd/mm thành mm/dd và từ chối ngày sai', () => {
  assert.equal(parseClipboardDate('08/09/2026'), '2026-09-08')
  assert.equal(parseClipboardDate('31/02/2026'), null)
  assert.equal(parseClipboardDate('08/31/2026'), null)
})

test('đọc Excel serial date', () => {
  assert.equal(parseClipboardDate('1'), '1900-01-01')
  assert.equal(parseClipboardDate('46243'), '2026-08-09')
  assert.equal(parseClipboardDate('46243.75'), '2026-08-09')
})

test('đọc vùng TSV và ô có xuống dòng', () => {
  assert.deepEqual(parseClipboardGrid('A\t09/08/2026\nB\t10/08/2026'), [['A', '09/08/2026'], ['B', '10/08/2026']])
  assert.deepEqual(parseClipboardGrid('"A\nB"\t1'), [['A\nB', '1']])
})

test('chuẩn hóa grid theo kiểu cột và báo lỗi theo tọa độ', () => {
  const columns = [{ label: 'Tên', dataType: 'text' }, { label: 'Ngày', dataType: 'date' }]
  const valid = normalizeClipboardGrid([['A', '09/08/2026']], columns)
  assert.deepEqual(valid.values, [['A', '2026-08-09']])
  assert.deepEqual(valid.errors, [])
  assert.equal(normalizeClipboardGrid([['A', '31/02/2026']], columns).errors.length, 1)
})
