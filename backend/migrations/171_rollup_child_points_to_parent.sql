-- GOM ĐIỂM mục con → mục cha (đổi mô hình: điểm chỉ ở mục cha, con = 0).
-- Giữ TỔNG điểm mỗi nhóm: cha_mới = cha_cũ + Σ(điểm các con cùng nhóm); rồi con = 0.
-- grp_no = đếm dồn số mục cha theo thứ tự → mỗi cha + các con theo sau chung 1 nhóm.
-- An toàn chạy lại (idempotent): lần 2 con đã = 0 nên không cộng thêm.
-- Áp cho: mẫu loại CV, mẫu việc con, checklist lịch, checklist việc con của lịch, và checklist task đã sinh.

-- 1) task_type_checklist_templates (owner = task_type_id)
WITH ord AS (
  SELECT id, task_type_id AS owner, points, level, step_order,
         SUM(CASE WHEN level=0 THEN 1 ELSE 0 END) OVER (PARTITION BY task_type_id ORDER BY step_order, id ROWS UNBOUNDED PRECEDING) AS grp_no
  FROM task_type_checklist_templates),
childsum AS (SELECT owner, grp_no, COALESCE(SUM(points),0) AS cp FROM ord WHERE level=1 GROUP BY owner, grp_no),
parent AS (SELECT id AS pid, owner, grp_no FROM ord WHERE level=0)
UPDATE task_type_checklist_templates t SET points = t.points + cs.cp
FROM parent p JOIN childsum cs ON cs.owner=p.owner AND cs.grp_no=p.grp_no
WHERE t.id=p.pid AND cs.cp > 0;
UPDATE task_type_checklist_templates SET points = 0 WHERE level = 1 AND points <> 0;

-- 2) task_type_subtask_steps (owner = subtask_template_id)
WITH ord AS (
  SELECT id, subtask_template_id AS owner, points, level, step_order,
         SUM(CASE WHEN level=0 THEN 1 ELSE 0 END) OVER (PARTITION BY subtask_template_id ORDER BY step_order, id ROWS UNBOUNDED PRECEDING) AS grp_no
  FROM task_type_subtask_steps),
childsum AS (SELECT owner, grp_no, COALESCE(SUM(points),0) AS cp FROM ord WHERE level=1 GROUP BY owner, grp_no),
parent AS (SELECT id AS pid, owner, grp_no FROM ord WHERE level=0)
UPDATE task_type_subtask_steps t SET points = t.points + cs.cp
FROM parent p JOIN childsum cs ON cs.owner=p.owner AND cs.grp_no=p.grp_no
WHERE t.id=p.pid AND cs.cp > 0;
UPDATE task_type_subtask_steps SET points = 0 WHERE level = 1 AND points <> 0;

-- 3) schedule_checklist_items (owner = schedule_id)
WITH ord AS (
  SELECT id, schedule_id AS owner, points, level, step_order,
         SUM(CASE WHEN level=0 THEN 1 ELSE 0 END) OVER (PARTITION BY schedule_id ORDER BY step_order, id ROWS UNBOUNDED PRECEDING) AS grp_no
  FROM schedule_checklist_items),
childsum AS (SELECT owner, grp_no, COALESCE(SUM(points),0) AS cp FROM ord WHERE level=1 GROUP BY owner, grp_no),
parent AS (SELECT id AS pid, owner, grp_no FROM ord WHERE level=0)
UPDATE schedule_checklist_items t SET points = t.points + cs.cp
FROM parent p JOIN childsum cs ON cs.owner=p.owner AND cs.grp_no=p.grp_no
WHERE t.id=p.pid AND cs.cp > 0;
UPDATE schedule_checklist_items SET points = 0 WHERE level = 1 AND points <> 0;

-- 4) schedule_subtask_items (owner = schedule_subtask_id)
WITH ord AS (
  SELECT id, schedule_subtask_id AS owner, points, level, step_order,
         SUM(CASE WHEN level=0 THEN 1 ELSE 0 END) OVER (PARTITION BY schedule_subtask_id ORDER BY step_order, id ROWS UNBOUNDED PRECEDING) AS grp_no
  FROM schedule_subtask_items),
childsum AS (SELECT owner, grp_no, COALESCE(SUM(points),0) AS cp FROM ord WHERE level=1 GROUP BY owner, grp_no),
parent AS (SELECT id AS pid, owner, grp_no FROM ord WHERE level=0)
UPDATE schedule_subtask_items t SET points = t.points + cs.cp
FROM parent p JOIN childsum cs ON cs.owner=p.owner AND cs.grp_no=p.grp_no
WHERE t.id=p.pid AND cs.cp > 0;
UPDATE schedule_subtask_items SET points = 0 WHERE level = 1 AND points <> 0;

-- 5) task_checklist_items (owner = task_id) — task đã sinh. Tháng ĐÃ CHỐT đã có snapshot KPI
--    (kpi_monthly_results) nên KPI lịch sử KHÔNG đổi; chỉ đồng bộ điểm hiển thị + KPI live.
WITH ord AS (
  SELECT id, task_id AS owner, COALESCE(points,0) AS points, level, step_order,
         SUM(CASE WHEN level=0 THEN 1 ELSE 0 END) OVER (PARTITION BY task_id ORDER BY step_order, id ROWS UNBOUNDED PRECEDING) AS grp_no
  FROM task_checklist_items),
childsum AS (SELECT owner, grp_no, COALESCE(SUM(points),0) AS cp FROM ord WHERE level=1 GROUP BY owner, grp_no),
parent AS (SELECT id AS pid, owner, grp_no FROM ord WHERE level=0)
UPDATE task_checklist_items t SET points = COALESCE(t.points,0) + cs.cp
FROM parent p JOIN childsum cs ON cs.owner=p.owner AND cs.grp_no=p.grp_no
WHERE t.id=p.pid AND cs.cp > 0;
UPDATE task_checklist_items SET points = 0 WHERE level = 1 AND COALESCE(points,0) <> 0;
