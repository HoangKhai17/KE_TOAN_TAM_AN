-- Phục hồi năm 2 chữ số → 4 chữ số (giả định thế kỷ 20xx).
UPDATE tasks
SET period_label = regexp_replace(period_label, '(\d{2})$', '20\1'),
    title        = regexp_replace(title,        '(\d{2})\]', '20\1]')
WHERE period_label IS NOT NULL
  AND period_label ~ '\d{2}$'
  AND period_label !~ '\d{4}$';
