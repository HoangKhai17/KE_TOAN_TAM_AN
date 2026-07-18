'use strict'
const { query, getClient } = require('../../config/db')

// ── DTO ───────────────────────────────────────────────────────────────────────

function processToDto(row) {
  return {
    id:          row.id,
    companyId:   row.company_id,
    name:        row.name,
    description: row.description ?? null,
    position:    row.position ?? null,
    nodeCount:   row.node_count != null ? parseInt(row.node_count, 10) : undefined,
    createdBy:   row.created_by ?? null,
    updatedBy:   row.updated_by ?? null,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  }
}

function nodeToDto(row) {
  return {
    id:       row.id,
    code:     row.code ?? null,
    title:    row.title,
    nodeType: row.node_type,
    actor:    row.actor ?? null,
    note:     row.note ?? null,
    posX:     Number(row.pos_x),
    posY:     Number(row.pos_y),
    width:    row.width  != null ? Number(row.width)  : null,
    height:   row.height != null ? Number(row.height) : null,
    style:    row.style ?? null,
  }
}

function edgeToDto(row) {
  return {
    id:           row.id,
    fromNodeId:   row.from_node_id,
    toNodeId:     row.to_node_id,
    label:        row.label ?? null,
    edgeKind:     row.edge_kind,
    edgeShape:    row.edge_shape || 'curved',
    dashed:       row.dashed === true,
    sourceHandle: row.source_handle ?? null,
    targetHandle: row.target_handle ?? null,
    position:     row.position ?? null,
  }
}

// ── RBAC ──────────────────────────────────────────────────────────────────────
// Xem: mọi người đã đăng nhập. Sửa: admin HOẶC nhân sự PHỤ TRÁCH công ty đó
// (cùng nguyên tắc với module Tasks — xem staffOwnsOrManagesRow).

async function assertCompanyExists(companyId) {
  const { rows: [c] } = await query('SELECT id, assigned_staff_id FROM companies WHERE id = $1', [companyId])
  if (!c) throw Object.assign(new Error('Không tìm thấy công ty'), { status: 404 })
  return c
}

async function assertCanEdit(companyId, user) {
  const company = await assertCompanyExists(companyId)
  if (user?.role === 'admin') return company
  if (company.assigned_staff_id && company.assigned_staff_id === user?.id) return company
  throw Object.assign(
    new Error('Chỉ Quản trị viên hoặc nhân sự phụ trách công ty này được chỉnh sửa quy trình'),
    { status: 403 },
  )
}

// Quy trình có thuộc đúng công ty không (chặn sửa chéo công ty qua id đoán được)
async function getProcessOrThrow(companyId, processId) {
  const { rows: [p] } = await query(
    'SELECT * FROM company_processes WHERE id = $1 AND company_id = $2',
    [processId, companyId],
  )
  if (!p) throw Object.assign(new Error('Không tìm thấy quy trình'), { status: 404 })
  return p
}

// ── Quy trình (metadata) ──────────────────────────────────────────────────────

async function listProcesses(companyId) {
  await assertCompanyExists(companyId)
  const { rows } = await query(
    `SELECT p.*, (SELECT COUNT(*) FROM company_process_nodes n WHERE n.process_id = p.id) AS node_count
     FROM company_processes p
     WHERE p.company_id = $1
     ORDER BY p.position ASC NULLS LAST, p.created_at ASC`,
    [companyId],
  )
  return rows.map(processToDto)
}

async function createProcess(companyId, data, user) {
  await assertCanEdit(companyId, user)
  const { rows: [posRow] } = await query(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM company_processes WHERE company_id = $1',
    [companyId],
  )
  const { rows: [row] } = await query(
    `INSERT INTO company_processes (company_id, name, description, position, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $5) RETURNING *`,
    [companyId, data.name, data.description ?? null, posRow.next, user.id],
  )
  return processToDto(row)
}

async function updateProcess(companyId, processId, data, user) {
  await assertCanEdit(companyId, user)
  await getProcessOrThrow(companyId, processId)

  const fields = []
  const params = []
  for (const [key, col] of Object.entries({ name: 'name', description: 'description', position: 'position' })) {
    if (data[key] !== undefined) { params.push(data[key]); fields.push(`${col} = $${params.length}`) }
  }
  if (!fields.length) throw Object.assign(new Error('Không có thay đổi nào'), { status: 400 })

  params.push(user.id); fields.push(`updated_by = $${params.length}`)
  fields.push('updated_at = NOW()')
  params.push(processId)

  const { rows: [row] } = await query(
    `UPDATE company_processes SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  )
  return processToDto(row)
}

async function deleteProcess(companyId, processId, user) {
  await assertCanEdit(companyId, user)
  await getProcessOrThrow(companyId, processId)
  await query('DELETE FROM company_processes WHERE id = $1', [processId])   // cascade nút + cạnh
}

// ── Sơ đồ (nút + cạnh) ────────────────────────────────────────────────────────

async function getGraph(companyId, processId) {
  const process = await getProcessOrThrow(companyId, processId)
  const [{ rows: nodes }, { rows: edges }] = await Promise.all([
    query('SELECT * FROM company_process_nodes WHERE process_id = $1 ORDER BY created_at ASC', [processId]),
    query('SELECT * FROM company_process_edges WHERE process_id = $1 ORDER BY position ASC NULLS LAST, created_at ASC', [processId]),
  ])
  return {
    process: processToDto(process),
    nodes:   nodes.map(nodeToDto),
    edges:   edges.map(edgeToDto),
  }
}

// Lưu TOÀN BỘ sơ đồ trong 1 transaction.
// Client gửi trọn nodes+edges (nút mới do client tự sinh UUID) → giữ nguyên id nút cũ
// để sau này còn nối bước ↔ công việc mà không mất liên kết.
async function saveGraph(companyId, processId, { nodes = [], edges = [], expectedUpdatedAt }, user) {
  await assertCanEdit(companyId, user)
  const current = await getProcessOrThrow(companyId, processId)

  // Chống ghi đè khi 2 người cùng sửa: client gửi mốc updated_at nó đang giữ.
  if (expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== new Date(current.updated_at).getTime()) {
    throw Object.assign(
      new Error('Sơ đồ vừa được người khác cập nhật. Vui lòng tải lại trước khi lưu.'),
      { status: 409, code: 'PROCESS_CONFLICT' },
    )
  }

  // Toàn vẹn: mọi cạnh phải trỏ tới nút CÓ trong payload (bắt lỗi sớm, thông báo rõ ràng
  // thay vì để khoá ngoại của DB ném lỗi khó hiểu).
  const nodeIds = new Set(nodes.map((n) => n.id))
  for (const e of edges) {
    if (!nodeIds.has(e.fromNodeId) || !nodeIds.has(e.toNodeId)) {
      throw Object.assign(
        new Error('Sơ đồ không hợp lệ: có mũi tên nối tới bước không tồn tại'),
        { status: 422 },
      )
    }
  }

  const client = await getClient()
  try {
    await client.query('BEGIN')

    // ① Xoá cạnh trước (tránh vướng khoá ngoại khi xoá nút)
    if (edges.length) {
      await client.query(
        'DELETE FROM company_process_edges WHERE process_id = $1 AND NOT (id = ANY($2::uuid[]))',
        [processId, edges.map((e) => e.id)],
      )
    } else {
      await client.query('DELETE FROM company_process_edges WHERE process_id = $1', [processId])
    }

    // ② Xoá nút không còn trong sơ đồ
    if (nodes.length) {
      await client.query(
        'DELETE FROM company_process_nodes WHERE process_id = $1 AND NOT (id = ANY($2::uuid[]))',
        [processId, nodes.map((n) => n.id)],
      )
    } else {
      await client.query('DELETE FROM company_process_nodes WHERE process_id = $1', [processId])
    }

    // ③ Upsert nút
    for (const n of nodes) {
      await client.query(
        `INSERT INTO company_process_nodes
           (id, process_id, code, title, node_type, actor, note, pos_x, pos_y, width, height, style)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO UPDATE SET
           code = EXCLUDED.code, title = EXCLUDED.title, node_type = EXCLUDED.node_type,
           actor = EXCLUDED.actor, note = EXCLUDED.note,
           pos_x = EXCLUDED.pos_x, pos_y = EXCLUDED.pos_y,
           width = EXCLUDED.width, height = EXCLUDED.height,
           style = EXCLUDED.style, updated_at = NOW()`,
        [n.id, processId, n.code ?? null, n.title ?? '', n.nodeType ?? 'rectangle',
         n.actor ?? null, n.note ?? null, n.posX ?? 0, n.posY ?? 0,
         n.width ?? null, n.height ?? null,
         n.style ? JSON.stringify(n.style) : null],
      )
    }

    // ④ Upsert cạnh (sau nút để khoá ngoại luôn thoả)
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i]
      await client.query(
        `INSERT INTO company_process_edges
           (id, process_id, from_node_id, to_node_id, label, edge_kind, edge_shape, dashed,
            source_handle, target_handle, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO UPDATE SET
           from_node_id = EXCLUDED.from_node_id, to_node_id = EXCLUDED.to_node_id,
           label = EXCLUDED.label, edge_kind = EXCLUDED.edge_kind,
           edge_shape = EXCLUDED.edge_shape, dashed = EXCLUDED.dashed,
           source_handle = EXCLUDED.source_handle, target_handle = EXCLUDED.target_handle,
           position = EXCLUDED.position`,
        [e.id, processId, e.fromNodeId, e.toNodeId, e.label ?? null,
         e.edgeKind ?? 'arrow', e.edgeShape ?? 'curved', e.dashed === true,
         e.sourceHandle ?? null, e.targetHandle ?? null, e.position ?? i],
      )
    }

    await client.query(
      'UPDATE company_processes SET updated_by = $1, updated_at = NOW() WHERE id = $2',
      [user.id, processId],
    )

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  return getGraph(companyId, processId)
}

module.exports = {
  listProcesses,
  createProcess,
  updateProcess,
  deleteProcess,
  getGraph,
  saveGraph,
  assertCanEdit,
}
