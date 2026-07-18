-- Kiểu ĐƯỜNG của mũi tên nối 2 hình:
--   straight = đường thẳng · curved = đường cong (mặc định) · elbow = gấp khúc vuông góc
-- Mặc định 'curved' để các mũi tên đã vẽ giữ nguyên hình dạng hiện tại (React Flow
-- vốn đang vẽ kiểu bezier cong), không làm xáo trộn sơ đồ cũ.
ALTER TABLE company_process_edges
  ADD COLUMN IF NOT EXISTS edge_shape TEXT NOT NULL DEFAULT 'curved';
