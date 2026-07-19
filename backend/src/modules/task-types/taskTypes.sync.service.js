'use strict'
/**
 * ĐỒNG BỘ CÔNG VIỆC ĐÃ PHÁT SINH THEO MẪU
 *
 * Tiêu đề và checklist của công việc tự sinh bị ĐÓNG BĂNG lúc phát sinh. Mẫu sửa
 * về sau (đổi tên, sửa chữ, thêm/bớt bước) thì công việc cũ không đổi theo, dẫn
 * tới mỗi kỳ một kiểu. Hàm này nạp lại cho khớp mẫu hiện hành.
 *
 * ══ CÁCH LÀM (giống nhau cho MỌI công việc) ══
 *   1. Xoá sạch checklist đang có
 *   2. Nạp lại đúng các bước của mẫu — trừ bước mà lịch của khách đó loại ra
 *   3. Khôi phục trạng thái tick:
 *        · Công việc ĐÃ HOÀN THÀNH → tick đủ 100%, khỏi cần dò
 *        · Công việc CHƯA XONG     → dò xem bước nào trước đã tick thì tick lại
 *
 * Kết quả: checklist luôn ĐÚNG BẰNG mẫu, không còn bước cũ thừa ra.
 *
 * ══ DÒ TICK CHO CÔNG VIỆC CHƯA XONG ══
 * Ghép bước mẫu ↔ mục cũ theo 3 tầng, khớp tầng nào thì dừng ở đó:
 *   1. `source_step_id` — liên kết đóng băng lúc tạo, chuẩn nhất, đúng cả khi
 *      bước mẫu đã đổi chữ
 *   2. Trùng NGUYÊN VĂN nội dung — cho công việc cũ chưa có liên kết
 *   3. GẦN ĐÚNG theo tỉ lệ từ chung — bắt bước mẫu bị sửa vài chữ
 * Nhờ vậy tick nằm đúng bước của nó, không nhảy lung tung.
 *
 * ══ RANH GIỚI AN TOÀN ══
 * Xoá chỉ xảy ra khi người dùng CHỦ ĐỘNG bấm đồng bộ. Xoá một bước khỏi MẪU thì
 * KHÔNG BAO GIỜ tự động đụng vào dữ liệu công việc — hai thứ đó tách rời.
 */
const { query, getClient } = require('../../config/db')
const audit = require('../../lib/audit')

const TRANG_THAI_DA_XONG = ['completed']

// ── So khớp gần đúng ─────────────────────────────────────────────────────────

function chuanHoa(t) {
  return (t || '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[(),.:;+\-–—/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Hệ số Dice trên tập TỪ: đủ nhạy để nhận ra bước chỉ thêm/bớt vài chữ,
// vẫn phân biệt được hai bước nghiệp vụ khác hẳn nhau.
function doGiongNhau(a, b) {
  const A = new Set(chuanHoa(a).split(' ').filter(Boolean))
  const B = new Set(chuanHoa(b).split(' ').filter(Boolean))
  if (!A.size || !B.size) return 0
  let chung = 0
  for (const w of A) if (B.has(w)) chung += 1
  return (2 * chung) / (A.size + B.size)
}

// Giới hạn cần biết: chuỗi càng NGẮN thì thêm một từ càng làm tỉ lệ tụt mạnh.
// Bước mẫu tên ngắn mà bị đổi chữ có thể không ghép được → coi như bước mới.
const NGUONG_GIONG = 0.7

function buildTitle(periodLabel, taskTypeName) {
  return periodLabel ? `[${periodLabel}] ${taskTypeName}` : taskTypeName
}

// Giữ nguyên phần [Kỳ] đang có trong tiêu đề — KHÔNG tính lại từ period_label,
// vì dữ liệu thật có trường hợp hai chỗ này lệch nhau, và phần hiển thị mới là
// thứ người dùng đang dùng để đối chiếu.
function extractPeriod(title) {
  const m = /^\[([^\]]+)\]/.exec(title || '')
  return m ? m[1] : null
}

/**
 * @param {string}   taskTypeId
 * @param {object}   opts
 * @param {boolean}  opts.dryRun            true = chỉ tính toán, không ghi
 * @param {boolean}  opts.includeCompleted  có đụng công việc đã hoàn thành không
 * @param {string[]} [opts.taskIds]         chỉ đồng bộ đúng những công việc này
 * @param {boolean}  opts.theoLoaiTru        true  = tôn trọng bước lịch của khách loại trừ
 *                                           false = NẠP ĐỦ mọi bước của mẫu (mặc định)
 */
async function syncTasksFromTemplate(taskTypeId, opts = {}) {
  const { dryRun = true, includeCompleted = true, taskIds: chonLoc = null, theoLoaiTru = false } = opts

  const { rows: [tt] } = await query('SELECT id, name FROM task_types WHERE id = $1', [taskTypeId])
  if (!tt) throw Object.assign(new Error('Không tìm thấy loại công việc'), { status: 404 })

  const { rows: mauSteps } = await query(
    `SELECT id, step_order, step_text, level
       FROM task_type_checklist_templates
      WHERE task_type_id = $1
      ORDER BY step_order, id`,
    [taskTypeId]
  )

  const { rows: tasks } = await query(
    `SELECT t.id, t.title, t.status, t.period_label,
            c.name AS company_name,
            COALESCE(cs.excluded_step_ids, '[]'::jsonb) AS excluded_step_ids
       FROM tasks t
       JOIN companies c ON c.id = t.company_id
       LEFT JOIN customer_task_schedules cs ON cs.id = t.customer_task_schedule_id
      WHERE t.task_type_id = $1
        AND t.source = 'auto'
        AND ($2::uuid[] IS NULL OR t.id = ANY($2::uuid[]))
        ${includeCompleted ? '' : "AND t.status <> 'completed'"}
      ORDER BY c.name, t.period_label DESC`,
    [taskTypeId, chonLoc && chonLoc.length ? chonLoc : null]
  )

  const taskIdList = tasks.map((t) => t.id)
  const { rows: allItems } = taskIdList.length
    ? await query(
      `SELECT id, task_id, step_text, level, is_completed, source_step_id
         FROM task_checklist_items
        WHERE task_id = ANY($1::uuid[])
        ORDER BY step_order, id`,
      [taskIdList]
    )
    : { rows: [] }

  const itemsByTask = new Map()
  for (const it of allItems) {
    if (!itemsByTask.has(it.task_id)) itemsByTask.set(it.task_id, [])
    itemsByTask.get(it.task_id).push(it)
  }

  const chiTiet = []
  const keHoach = []
  const doiTitles = []
  let soXoa = 0
  let soNap = 0
  let soGiuTick = 0
  let soMatTick = 0

  for (const task of tasks) {
    const items = itemsByTask.get(task.id) ?? []
    const daXong = TRANG_THAI_DA_XONG.includes(task.status)
    // Mặc định NẠP ĐỦ mọi bước của mẫu — mục đích của đồng bộ là làm công việc cũ
    // khớp đúng quy trình hiện hành. Bật `theoLoaiTru` thì mới bỏ những bước mà
    // lịch định kỳ của khách đó đã loại ra.
    const excluded = new Set((task.excluded_step_ids || []).map(String))
    const stepsApDung = theoLoaiTru
      ? mauSteps.filter((s) => !excluded.has(String(s.id)))
      : mauSteps

    const daDung = new Set()
    const napMoi = []
    const rowNap = []

    // ── Ghép bước mẫu ↔ mục cũ ────────────────────────────────────────────────
    // Chạy cho MỌI công việc, kể cả đã hoàn thành. Với việc đã xong thì kết quả
    // ghép không dùng để quyết định tick (đã tick hết rồi), nhưng vẫn cần để biết
    // mục cũ nào thực sự KHÔNG có trong mẫu — nếu bỏ qua thì phần xem trước sẽ
    // báo nhầm là "toàn bộ checklist sẽ mất", trong khi thực tế được nạp lại y nguyên.
    const ghep = new Map()   // step.id → { cu, ghepBang, doGiong }

    // Tầng 1 + 2: khớp chắc chắn, làm trước để "xí chỗ"
    for (const step of stepsApDung) {
      let cu = items.find((x) => x.source_step_id === step.id && !daDung.has(x.id))
      let bang = 'liên kết'
      if (!cu) {
        cu = items.find((x) => !x.source_step_id && x.step_text === step.step_text && !daDung.has(x.id))
        bang = 'nội dung'
      }
      if (cu) { daDung.add(cu.id); ghep.set(step.id, { cu, ghepBang: bang, doGiong: null }) }
    }

    // Tầng 3 — GẦN ĐÚNG, xét TOÀN CỤC: gom mọi cặp còn lại rồi ghép cặp giống
    // nhau nhất trước. Nếu duyệt tuần tự thì bước đứng trước có thể giành mất
    // mục vốn khớp hơn với bước đứng sau (vd 80% cướp chỗ của 94%).
    {
      const stepCon = stepsApDung.filter((s) => !ghep.has(s.id))
      const mucCon  = items.filter((x) => !x.source_step_id && !daDung.has(x.id))
      const cacCap = []
      for (const s2 of stepCon) {
        for (const x of mucCon) {
          const d = doGiongNhau(x.step_text, s2.step_text)
          if (d >= NGUONG_GIONG) cacCap.push({ stepId: s2.id, x, d })
        }
      }
      cacCap.sort((a, b) => b.d - a.d)
      for (const cap of cacCap) {
        if (ghep.has(cap.stepId) || daDung.has(cap.x.id)) continue
        daDung.add(cap.x.id)
        ghep.set(cap.stepId, { cu: cap.x, ghepBang: 'gần đúng', doGiong: Math.round(cap.d * 100) })
      }
    }

    for (const [i, step] of stepsApDung.entries()) {
      const g = ghep.get(step.id)
      const tick = daXong ? true : !!g?.cu.is_completed
      if (!daXong && tick) soGiuTick += 1

      napMoi.push({
        step_text: step.step_text, level: step.level,
        is_completed: tick, source_step_id: step.id, thuTu: i + 1,
      })
      rowNap.push({
        noiDung: step.step_text, level: step.level,
        tick, ghepBang: g?.ghepBang ?? null, doGiong: g?.doGiong ?? null,
        buocMoi: !g && !daXong,
      })
    }

    // Mục cũ bị xoá mà KHÔNG tái tạo được từ mẫu — phải cho người dùng thấy trước
    // khi đồng ý: có thể là mục tự thêm tay, hoặc bước đã bị gỡ khỏi mẫu.
    const matDi = items
      .filter((x) => !daDung.has(x.id))
      .map((x) => ({ noiDung: x.step_text, dangTick: x.is_completed }))
    if (!daXong) soMatTick += matDi.filter((m) => m.dangTick).length

    soXoa += items.length
    soNap += napMoi.length

    const titleMoi = buildTitle(extractPeriod(task.title), tt.name)
    const doiTitle = titleMoi !== task.title
    if (doiTitle) doiTitles.push({ id: task.id, title: titleMoi })

    keHoach.push({ taskId: task.id, napMoi })
    chiTiet.push({
      taskId: task.id,
      congTy: task.company_name,
      ky: task.period_label,
      trangThai: task.status,
      daXong,
      tieuDeCu: task.title,
      tieuDeMoi: titleMoi,
      doiTieuDe: doiTitle,
      soBuocLoaiTru: theoLoaiTru ? excluded.size : 0,
      soBuocBoQuaLoaiTru: theoLoaiTru ? 0 : excluded.size,
      soMucCu: items.length,
      nap: rowNap,
      matDi,
    })
  }

  const tongKet = {
    tenMau: tt.name,
    soBuocTrongMau: mauSteps.length,
    theoLoaiTru,
    soCongViec: tasks.length,
    doiTieuDe: doiTitles.length,
    xoaMucCu: soXoa,
    napBuocMoi: soNap,
    giuLaiTick: soGiuTick,
    mucKhongTaiTaoDuoc: chiTiet.reduce((n, c) => n + c.matDi.length, 0),
    matTick: soMatTick,
  }

  if (dryRun) return { dryRun: true, tongKet, chiTiet }

  const client = await getClient()
  try {
    await client.query('BEGIN')

    for (const t of doiTitles) {
      await client.query('UPDATE tasks SET title = $1, updated_at = NOW() WHERE id = $2', [t.title, t.id])
    }

    for (const k of keHoach) {
      // Xoá sạch rồi nạp lại — nhờ vậy không còn bước cũ thừa, thứ tự luôn đúng
      // mẫu, và khỏi phải né ràng buộc UNIQUE(task_id, step_order).
      await client.query('DELETE FROM task_checklist_items WHERE task_id = $1', [k.taskId])
      for (const it of k.napMoi) {
        await client.query(
          `INSERT INTO task_checklist_items
             (task_id, step_order, step_text, level, is_completed, completed_at, source_step_id)
           VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 THEN NOW() ELSE NULL END, $6)`,
          [k.taskId, it.thuTu, it.step_text, it.level, it.is_completed, it.source_step_id]
        )
      }
    }

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  return { dryRun: false, tongKet, chiTiet }
}

async function syncAndAudit(taskTypeId, opts, actorId, ipAddress, userAgent) {
  const res = await syncTasksFromTemplate(taskTypeId, { ...opts, dryRun: false })
  await audit.log({
    userId: actorId,
    action: 'task_type.synced_tasks',
    targetType: 'task_type',
    targetId: taskTypeId,
    meta: res.tongKet,
    ipAddress,
    userAgent,
  })
  return res
}

module.exports = { syncTasksFromTemplate, syncAndAudit }
