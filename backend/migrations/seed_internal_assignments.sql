-- ============================================================
-- Seed: Internal Assignments — T4/2026 (15) + T5/2026 (5)
-- created_by: Hà Văn Thọ (admin)  a3f401bb-e14f-4ee6-b7c9-e43b45cf325f
-- ============================================================

-- ── Internal Assignments ──────────────────────────────────────────────────────

INSERT INTO internal_assignments
  (id, title, description, company_id, priority, deadline_date, status,
   created_by, sent_at, closed_at, created_at, updated_at)
VALUES

-- ── THÁNG 4 — DONE (12 tasks) ─────────────────────────────────────────────

(
  'b1000000-0000-0000-0000-000000000001',
  'Lập báo cáo tài chính Q1/2026 – Minh Phát',
  'Tổng hợp và lập báo cáo tài chính quý 1/2026 cho Công ty TNHH Thương mại Minh Phát: bảng cân đối kế toán, báo cáo kết quả hoạt động kinh doanh, lưu chuyển tiền tệ.',
  'c0000000-0000-0000-0000-000000000001', 'high', '2026-04-05', 'done',
  'a3f401bb-e14f-4ee6-b7c9-e43b45cf325f',
  '2026-04-01 08:30:00', '2026-04-05 16:45:00',
  '2026-04-01 08:00:00', '2026-04-05 16:45:00'
),

(
  'b1000000-0000-0000-0000-000000000002',
  'Kiểm tra hồ sơ khai thuế tháng 3/2026 – Đại Phúc',
  'Rà soát và kiểm tra toàn bộ hồ sơ khai thuế tháng 3/2026 của Công ty CP Xây dựng Đại Phúc, đảm bảo số liệu khớp sổ sách trước khi nộp.',
  'c0000000-0000-0000-0000-000000000002', 'high', '2026-04-10', 'done',
  'a3f401bb-e14f-4ee6-b7c9-e43b45cf325f',
  '2026-04-02 09:00:00', '2026-04-09 17:00:00',
  '2026-04-02 08:30:00', '2026-04-09 17:00:00'
),

(
  'b1000000-0000-0000-0000-000000000003',
  'Nộp tờ khai thuế GTGT tháng 3/2026 – LUXHOME',
  'Hoàn thiện và nộp tờ khai thuế GTGT tháng 3/2026 cho Công ty CP Nội thất LUXHOME qua cổng eTax trước hạn chót ngày 20/4.',
  'c0000000-0000-0000-0000-000000000015', 'urgent', '2026-04-20', 'done',
  'a3f401bb-e14f-4ee6-b7c9-e43b45cf325f',
  '2026-04-03 08:00:00', '2026-04-18 15:30:00',
  '2026-04-03 07:45:00', '2026-04-18 15:30:00'
),

(
  'b1000000-0000-0000-0000-000000000004',
  'Họp nội bộ định kỳ tháng 4/2026',
  'Họp toàn nhóm kế toán: đánh giá kết quả công việc tháng 3, phân công nhiệm vụ tháng 4, rà soát tiến độ các khách hàng trọng điểm.',
  NULL, 'normal', '2026-04-08', 'done',
  'a3f401bb-e14f-4ee6-b7c9-e43b45cf325f',
  '2026-04-03 14:00:00', '2026-04-08 11:30:00',
  '2026-04-03 13:30:00', '2026-04-08 11:30:00'
),

(
  'b1000000-0000-0000-0000-000000000005',
  'Cập nhật sổ sách chi phí Q1/2026 – Tân Bình',
  'Đối chiếu và cập nhật đầy đủ sổ cái chi phí quý 1/2026 cho Công ty TNHH Kỹ thuật Số Tân Bình, bao gồm chi phí lương, vận hành và khấu hao.',
  'c0000000-0000-0000-0000-000000000004', 'normal', '2026-04-12', 'done',
  'a3f401bb-e14f-4ee6-b7c9-e43b45cf325f',
  '2026-04-05 09:30:00', '2026-04-12 16:00:00',
  '2026-04-05 09:00:00', '2026-04-12 16:00:00'
),

(
  'b1000000-0000-0000-0000-000000000006',
  'Rà soát công nợ phải thu – Hoàng Long',
  'Lập danh sách công nợ phải thu còn tồn đọng của Doanh nghiệp Vận tải Hoàng Long, phân loại theo thời hạn và đề xuất phương án xử lý.',
  'c0000000-0000-0000-0000-000000000006', 'normal', '2026-04-18', 'done',
  'a3f401bb-e14f-4ee6-b7c9-e43b45cf325f',
  '2026-04-07 08:30:00', '2026-04-18 14:00:00',
  '2026-04-07 08:00:00', '2026-04-18 14:00:00'
),

(
  'b1000000-0000-0000-0000-000000000007',
  'Kiểm tra nghĩa vụ BHXH tháng 3/2026 – Thiên Ngân',
  'Kiểm tra và đối chiếu danh sách đóng BHXH, BHYT, BHTN tháng 3/2026 cho Công ty CP Bất động sản Thiên Ngân, xử lý chênh lệch nếu có.',
  'c0000000-0000-0000-0000-000000000008', 'high', '2026-04-20', 'done',
  'a3f401bb-e14f-4ee6-b7c9-e43b45cf325f',
  '2026-04-08 09:00:00', '2026-04-19 17:30:00',
  '2026-04-08 08:45:00', '2026-04-19 17:30:00'
),

(
  'b1000000-0000-0000-0000-000000000008',
  'Chuẩn bị hồ sơ quyết toán thuế TNCN – Hoa Thảo',
  'Thu thập, tổng hợp và chuẩn bị đầy đủ hồ sơ quyết toán thuế thu nhập cá nhân năm 2025 cho Hộ kinh doanh Cafe & Trà sữa Hoa Thảo.',
  'c0000000-0000-0000-0000-000000000011', 'high', '2026-04-22', 'done',
  'a3f401bb-e14f-4ee6-b7c9-e43b45cf325f',
  '2026-04-10 08:00:00', '2026-04-22 16:30:00',
  '2026-04-10 07:30:00', '2026-04-22 16:30:00'
),

(
  'b1000000-0000-0000-0000-000000000009',
  'Tổng hợp chi phí hoạt động Q1/2026 – Tương Lai',
  'Tổng hợp toàn bộ chi phí hoạt động quý 1/2026 của Công ty TNHH Giáo dục Tương Lai, lập bảng phân tích so sánh với kế hoạch và cùng kỳ năm trước.',
  'c0000000-0000-0000-0000-000000000012', 'normal', '2026-04-15', 'done',
  'a3f401bb-e14f-4ee6-b7c9-e43b45cf325f',
  '2026-04-07 10:00:00', '2026-04-14 17:00:00',
  '2026-04-07 09:30:00', '2026-04-14 17:00:00'
),

(
  'b1000000-0000-0000-0000-000000000010',
  'Nộp báo cáo tài chính năm 2025 – Nam Hải',
  'Hoàn thiện và nộp báo cáo tài chính năm 2025 cho Công ty CP Xuất nhập khẩu Nam Hải lên cơ quan thuế và cổng thông tin doanh nghiệp theo đúng quy định.',
  'c0000000-0000-0000-0000-000000000013', 'urgent', '2026-04-30', 'done',
  'a3f401bb-e14f-4ee6-b7c9-e43b45cf325f',
  '2026-04-10 09:00:00', '2026-04-28 15:00:00',
  '2026-04-10 08:30:00', '2026-04-28 15:00:00'
),

(
  'b1000000-0000-0000-0000-000000000011',
  'Cập nhật và kiểm tra phần mềm kế toán nội bộ',
  'Cài đặt bản cập nhật mới cho phần mềm kế toán, kiểm tra tính năng, đối chiếu dữ liệu trước và sau cập nhật, lập biên bản xác nhận hoàn thành.',
  NULL, 'low', '2026-04-20', 'done',
  'a3f401bb-e14f-4ee6-b7c9-e43b45cf325f',
  '2026-04-12 09:00:00', '2026-04-20 16:00:00',
  '2026-04-12 08:30:00', '2026-04-20 16:00:00'
),

(
  'b1000000-0000-0000-0000-000000000012',
  'Kiểm tra và đối soát bảng lương tháng 3/2026',
  'Đối soát bảng lương toàn bộ nhân viên tháng 3/2026: kiểm tra số ngày công, phụ cấp, khấu trừ BHXH và thuế TNCN, phát hiện và xử lý sai sót trước khi thanh toán.',
  NULL, 'high', '2026-04-05', 'done',
  'a3f401bb-e14f-4ee6-b7c9-e43b45cf325f',
  '2026-04-01 09:00:00', '2026-04-04 17:30:00',
  '2026-04-01 08:45:00', '2026-04-04 17:30:00'
),

-- ── THÁNG 4 — ACTIVE (3 tasks) ────────────────────────────────────────────

(
  'b1000000-0000-0000-0000-000000000013',
  'Lập kế hoạch phân công công việc tháng 5/2026',
  'Lập kế hoạch chi tiết phân công nhiệm vụ cho toàn bộ nhân sự tháng 5/2026: xác định danh sách khách hàng, thời hạn khai thuế, ưu tiên công việc.',
  NULL, 'normal', '2026-04-28', 'active',
  'a3f401bb-e14f-4ee6-b7c9-e43b45cf325f',
  '2026-04-20 09:00:00', NULL,
  '2026-04-20 08:30:00', '2026-04-20 09:00:00'
),

(
  'b1000000-0000-0000-0000-000000000014',
  'Rà soát và cập nhật hợp đồng lao động nhân viên',
  'Rà soát toàn bộ hợp đồng lao động hiện hành: kiểm tra hiệu lực, điều khoản lương thưởng, phát hiện hợp đồng sắp hết hạn và chuẩn bị hồ sơ gia hạn.',
  NULL, 'normal', '2026-04-30', 'active',
  'a3f401bb-e14f-4ee6-b7c9-e43b45cf325f',
  '2026-04-22 10:00:00', NULL,
  '2026-04-22 09:30:00', '2026-04-22 10:00:00'
),

(
  'b1000000-0000-0000-0000-000000000015',
  'Đào tạo nghiệp vụ kế toán thuế cho nhân sự',
  'Tổ chức buổi đào tạo nội bộ về cập nhật chính sách thuế mới năm 2026, hướng dẫn quy trình xử lý khai thuế điện tử và các vướng mắc thường gặp.',
  NULL, 'high', '2026-04-30', 'active',
  'a3f401bb-e14f-4ee6-b7c9-e43b45cf325f',
  '2026-04-23 08:30:00', NULL,
  '2026-04-22 17:00:00', '2026-04-23 08:30:00'
),

-- ── THÁNG 5 — ACTIVE (3 tasks) ────────────────────────────────────────────

(
  'b1000000-0000-0000-0000-000000000016',
  'Khai và nộp thuế GTGT tháng 4/2026 – Minh Phát',
  'Lập tờ khai thuế GTGT tháng 4/2026, đối chiếu hoá đơn đầu vào đầu ra, nộp qua cổng eTax và lưu hồ sơ đúng quy định.',
  'c0000000-0000-0000-0000-000000000001', 'urgent', '2026-05-20', 'active',
  'a3f401bb-e14f-4ee6-b7c9-e43b45cf325f',
  '2026-05-02 08:30:00', NULL,
  '2026-05-01 17:00:00', '2026-05-02 08:30:00'
),

(
  'b1000000-0000-0000-0000-000000000017',
  'Nộp báo cáo BHXH tháng 4/2026 – Thiên Ngân',
  'Lập và nộp báo cáo đóng BHXH, BHYT, BHTN tháng 4/2026 cho Công ty CP Bất động sản Thiên Ngân, xử lý điều chỉnh nếu có biến động nhân sự.',
  'c0000000-0000-0000-0000-000000000008', 'high', '2026-05-15', 'active',
  'a3f401bb-e14f-4ee6-b7c9-e43b45cf325f',
  '2026-05-03 09:00:00', NULL,
  '2026-05-02 16:00:00', '2026-05-03 09:00:00'
),

(
  'b1000000-0000-0000-0000-000000000018',
  'Rà soát công nợ phải thu tháng 4/2026 – Tân Bình',
  'Lập bảng tổng hợp công nợ phải thu tháng 4/2026 của Công ty Tân Bình, phân loại theo thời hạn quá hạn, gửi thông báo nhắc nợ các khoản trên 30 ngày.',
  'c0000000-0000-0000-0000-000000000004', 'normal', '2026-05-10', 'active',
  'a3f401bb-e14f-4ee6-b7c9-e43b45cf325f',
  '2026-05-03 10:30:00', NULL,
  '2026-05-03 10:00:00', '2026-05-03 10:30:00'
),

-- ── THÁNG 5 — DRAFT (2 tasks) ─────────────────────────────────────────────

(
  'b1000000-0000-0000-0000-000000000019',
  'Lập báo cáo tổng hợp hoạt động tháng 4/2026',
  'Tổng hợp toàn bộ kết quả công việc tháng 4/2026: số lượng hồ sơ xử lý, tiến độ khai thuế, vướng mắc phát sinh, đề xuất cải tiến quy trình.',
  NULL, 'normal', '2026-05-30', 'draft',
  'a3f401bb-e14f-4ee6-b7c9-e43b45cf325f',
  NULL, NULL,
  '2026-05-05 09:00:00', '2026-05-05 09:00:00'
),

(
  'b1000000-0000-0000-0000-000000000020',
  'Họp kiểm điểm và đánh giá nhân sự tháng 4/2026',
  'Tổ chức cuộc họp đánh giá hiệu quả làm việc tháng 4/2026 toàn bộ nhân sự kế toán, ghi nhận kết quả, bình bầu nhân viên tiêu biểu và lên kế hoạch cải thiện.',
  NULL, 'normal', '2026-05-28', 'draft',
  'a3f401bb-e14f-4ee6-b7c9-e43b45cf325f',
  NULL, NULL,
  '2026-05-08 10:00:00', '2026-05-08 10:00:00'
);

-- ── Assignees ─────────────────────────────────────────────────────────────────
-- Lan: a1000000-0000-0000-0000-000000000001
-- Minh: a1000000-0000-0000-0000-000000000002
-- Hoa: a1000000-0000-0000-0000-000000000003
-- Bảo Phúc: 81e35ff6-38d6-45bf-b66a-ad2269e1c50e

INSERT INTO internal_assignment_assignees
  (assignment_id, user_id, status, accepted_at, completed_at, note)
VALUES

-- Task 1: Lan + Minh → done
('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'done',  '2026-04-01 09:00:00', '2026-04-05 15:30:00', NULL),
('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'done',  '2026-04-01 09:15:00', '2026-04-05 16:00:00', NULL),

-- Task 2: Hoa → done
('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000003', 'done',  '2026-04-02 09:30:00', '2026-04-09 16:45:00', NULL),

-- Task 3: Lan → done
('b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'done',  '2026-04-03 08:30:00', '2026-04-18 14:00:00', 'Đã nộp qua eTax, có biên lai xác nhận'),

-- Task 4: Tất cả nhân sự → done (họp nội bộ)
('b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'done',  '2026-04-03 14:30:00', '2026-04-08 11:00:00', NULL),
('b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000002', 'done',  '2026-04-03 14:30:00', '2026-04-08 11:00:00', NULL),
('b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000003', 'done',  '2026-04-03 14:30:00', '2026-04-08 11:00:00', NULL),
('b1000000-0000-0000-0000-000000000004', '81e35ff6-38d6-45bf-b66a-ad2269e1c50e', 'done',  '2026-04-03 14:30:00', '2026-04-08 11:00:00', NULL),

-- Task 5: Bảo Phúc → done
('b1000000-0000-0000-0000-000000000005', '81e35ff6-38d6-45bf-b66a-ad2269e1c50e', 'done',  '2026-04-05 10:00:00', '2026-04-12 15:30:00', NULL),

-- Task 6: Minh → done
('b1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000002', 'done',  '2026-04-07 09:00:00', '2026-04-18 13:30:00', 'Đã lập danh sách 12 khoản công nợ tồn đọng'),

-- Task 7: Lan + Hoa → done
('b1000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000001', 'done',  '2026-04-08 09:30:00', '2026-04-19 16:00:00', NULL),
('b1000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000003', 'done',  '2026-04-08 09:30:00', '2026-04-19 17:00:00', 'Phát hiện chênh lệch 2 nhân viên, đã xử lý'),

-- Task 8: Minh → done
('b1000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000002', 'done',  '2026-04-10 08:30:00', '2026-04-22 16:00:00', NULL),

-- Task 9: Hoa → done
('b1000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000003', 'done',  '2026-04-07 10:30:00', '2026-04-14 16:30:00', NULL),

-- Task 10: Lan + Minh → done
('b1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000001', 'done',  '2026-04-10 09:30:00', '2026-04-28 14:00:00', NULL),
('b1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000002', 'done',  '2026-04-10 09:30:00', '2026-04-28 14:30:00', 'Đã nộp bản cứng và điện tử'),

-- Task 11: Bảo Phúc → done
('b1000000-0000-0000-0000-000000000011', '81e35ff6-38d6-45bf-b66a-ad2269e1c50e', 'done',  '2026-04-12 09:30:00', '2026-04-20 15:00:00', 'Cập nhật lên phiên bản 4.2.1, không phát sinh lỗi'),

-- Task 12: Hoa → done
('b1000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000003', 'done',  '2026-04-01 09:30:00', '2026-04-04 17:00:00', 'Phát hiện và sửa sai số ngày công của 1 nhân viên'),

-- Task 13: Lan → in_progress (active)
('b1000000-0000-0000-0000-000000000013', 'a1000000-0000-0000-0000-000000000001', 'in_progress', '2026-04-20 10:00:00', NULL, NULL),

-- Task 14: Minh → accepted (active)
('b1000000-0000-0000-0000-000000000014', 'a1000000-0000-0000-0000-000000000002', 'accepted',    '2026-04-22 11:00:00', NULL, NULL),

-- Task 15: Hoa (in_progress) + Bảo Phúc (accepted) (active)
('b1000000-0000-0000-0000-000000000015', 'a1000000-0000-0000-0000-000000000003', 'in_progress', '2026-04-23 09:00:00', NULL, 'Đang chuẩn bị tài liệu đào tạo'),
('b1000000-0000-0000-0000-000000000015', '81e35ff6-38d6-45bf-b66a-ad2269e1c50e', 'accepted',    '2026-04-23 09:30:00', NULL, NULL),

-- Task 16: Lan → in_progress (active, May)
('b1000000-0000-0000-0000-000000000016', 'a1000000-0000-0000-0000-000000000001', 'in_progress', '2026-05-02 09:00:00', NULL, NULL),

-- Task 17: Minh → accepted (active, May)
('b1000000-0000-0000-0000-000000000017', 'a1000000-0000-0000-0000-000000000002', 'accepted',    '2026-05-03 09:30:00', NULL, NULL),

-- Task 18: Bảo Phúc → in_progress (active, May)
('b1000000-0000-0000-0000-000000000018', '81e35ff6-38d6-45bf-b66a-ad2269e1c50e', 'in_progress', '2026-05-03 11:00:00', NULL, NULL);

-- Task 19, 20: draft — no assignees yet
