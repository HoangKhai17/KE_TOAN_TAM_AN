-- TÀI LIỆU CÔNG TY: cho phép TẢI FILE LÊN, không chỉ lưu link
--
-- Trước đây `documents.url` là NOT NULL nên mỗi tài liệu bắt buộc phải là một
-- đường dẫn. Nay mỗi tài liệu là LINK **hoặc** FILE — giống cách tài liệu nội bộ
-- (internal_doc_links) đã làm: cột `url` và `attachment_id` cùng cho phép NULL,
-- ràng buộc bắt phải có đúng một trong hai.
--
-- File thật lưu ở bảng dùng chung `attachments` (module = 'company'), nên không
-- phải thêm cột file_name/size/mime vào đây.
--
-- ON DELETE SET NULL: xoá bản ghi file không được làm mất dòng tài liệu — giữ lại
-- để còn thấy tên và lịch sử, giống cách internal_doc_links đang xử lý.

ALTER TABLE documents
  ALTER COLUMN url DROP NOT NULL,
  ADD COLUMN attachment_id UUID REFERENCES attachments(id) ON DELETE SET NULL;

CREATE INDEX idx_documents_attachment ON documents (attachment_id);

-- Dữ liệu cũ đều là link nên thoả sẵn ràng buộc này.
ALTER TABLE documents
  ADD CONSTRAINT documents_url_or_file
  CHECK (
    (url IS NOT NULL AND btrim(url) <> '' AND attachment_id IS NULL)
    OR (attachment_id IS NOT NULL AND url IS NULL)
  );
