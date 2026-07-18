-- Chuyển sơ đồ quy trình từ "các bước nghiệp vụ cố định" sang CÔNG CỤ VẼ TỰ DO.
-- Người dùng chọn hình hình học (tròn/vuông/tam giác/bình hành/chữ nhật/thoi/chữ)
-- và tự do co giãn, thay vì bị bó trong 5 loại bước định sẵn.

-- ① Kích thước hình (cho phép kéo giãn). NULL = dùng kích thước mặc định theo hình.
ALTER TABLE company_process_nodes
  ADD COLUMN IF NOT EXISTS width  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS height DOUBLE PRECISION;

-- ② Nét đứt cho mũi tên — tách khỏi edge_kind để edge_kind chỉ còn lo KIỂU MŨI TÊN
ALTER TABLE company_process_edges
  ADD COLUMN IF NOT EXISTS dashed BOOLEAN NOT NULL DEFAULT FALSE;

-- ③ Chuyển dữ liệu ĐANG CÓ sang tên hình mới (không để mất sơ đồ đã vẽ)
UPDATE company_process_nodes SET node_type = 'circle'        WHERE node_type IN ('start', 'end');
UPDATE company_process_nodes SET node_type = 'rectangle'     WHERE node_type = 'step';
UPDATE company_process_nodes SET node_type = 'diamond'       WHERE node_type = 'decision';
UPDATE company_process_nodes SET node_type = 'parallelogram' WHERE node_type = 'document';

-- ④ Mũi tên: 'normal' → 'arrow'; 'back' (quay ngược) → mũi tên nét đứt
UPDATE company_process_edges SET dashed = TRUE WHERE edge_kind = 'back';
UPDATE company_process_edges SET edge_kind = 'arrow' WHERE edge_kind IN ('normal', 'back');
