-- Chuyển "Quy trình" từ SƠ ĐỒ CANVAS (nút + cạnh) sang TÀI LIỆU rich-text.
-- Khách hàng không chuyên công nghệ → quen soạn thảo dạng văn phòng + nhờ AI,
-- không quen thao tác vẽ canvas. Vì vậy mỗi quy trình giờ là MỘT TÀI LIỆU HTML
-- (giống Google Docs thu nhỏ) thay cho đồ thị nút/cạnh.

-- ① Nội dung tài liệu (HTML do trình soạn thảo TipTap sinh ra).
--    Ảnh KHÔNG nhúng base64 mà lưu qua attachments (thẻ <img data-att-id="...">).
ALTER TABLE company_processes ADD COLUMN IF NOT EXISTS content TEXT;

-- ② Bỏ hẳn mô hình canvas cũ (dữ liệu chỉ là vài nút thử nghiệm, không cần chuyển).
--    Xoá cạnh trước (khoá ngoại trỏ về nút) rồi mới xoá nút.
DROP TABLE IF EXISTS company_process_edges;
DROP TABLE IF EXISTS company_process_nodes;
