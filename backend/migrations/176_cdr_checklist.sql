-- Checklist (danh sách giấy tờ/bước cần thu) cho Yêu cầu KH — bản gọn, 1 cấp, không điểm.
CREATE TABLE IF NOT EXISTS client_request_checklist_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   UUID NOT NULL REFERENCES client_document_requests(id) ON DELETE CASCADE,
  step_order   INTEGER NOT NULL,
  step_text    TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMP,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cdr_checklist_request ON client_request_checklist_items(request_id);
