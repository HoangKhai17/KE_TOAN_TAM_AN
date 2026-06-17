-- Migration 077: gỡ tab "HS lưu trữ khi QT" (bespoke) — admin sẽ dựng lại bằng
-- Generic Company Tables. Dữ liệu archive KHÔNG được migrate (cấu trúc lưới 12 tháng
-- khác hẳn) — xóa hẳn theo yêu cầu.
DROP TABLE IF EXISTS company_archive_docs;
DROP TABLE IF EXISTS company_archive_years;
