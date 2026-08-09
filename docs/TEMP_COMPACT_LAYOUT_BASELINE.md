# Compact layout baseline (temporary)

Tài liệu tạm dùng làm chuẩn khi đồng bộ các trang còn lại với layout compact của trang danh sách Công ty.

## Typography

- Chữ trong button thao tác: `var(--fs-2xs)` = `11.5px`.
- Chữ tab điều hướng nội dung: `var(--fs-xs)` = `12.5px`.
- Tiêu đề, label và giá trị trong card thông tin compact: `var(--fs-2xs)` = `11.5px`.
- Không dùng `text-transform: uppercase` cho tiêu đề nhóm và label thông tin.

## Color hierarchy

- Page title, hero title, tên thực thể chính và chữ button trung tính dùng
  `--color-text-strong` (`#000000`).
- Nội dung/dữ liệu thật dùng `--color-text` (`#111827`); không dùng `muted` chỉ vì
  dữ liệu nằm ở cột phụ.
- Label và nội dung phụ vẫn cần đọc dùng `--color-text-soft` (`#374151`).
- Metadata dùng `--color-muted` (`#4b5563`) hoặc `--color-muted-soft` (`#6b7280`).
- `--color-muted-subtle` (`#9ca3af`) chỉ dành cho placeholder, disabled, dấu `—`
  và trạng thái không có dữ liệu.
- Primary blue dành cho link, tab active, focus, button chính và thành phần có tương tác;
  không dùng xanh cho title thông thường chỉ để trang trí.
- Không thay màu chữ trắng của button primary/danger/status có nền đặc.

### Page baseline — Companies list

- Toàn bộ dữ liệu thật trong table, gồm tên công ty và các cột đã có giá trị:
  `--color-text-strong` (`#000000`).
- Tiêu đề các cột giữ tông xanh nhưng dùng xanh navy đậm
  `--color-primary-deep` (`#001c6d`) và weight `800`; không dùng xanh nhạt
  hoặc muted cho header của bảng Companies.
- Dữ liệu thường giữa các cột dùng thống nhất `--fw-medium`; không tự tăng riêng
  tên công ty, nhân viên phụ trách hoặc cột số liệu lên `--fw-semibold`.
- Badge trạng thái và badge cảnh báo được phép dùng `--fw-semibold`/`--fw-bold`
  vì đây là thành phần ngữ nghĩa, không phải text dữ liệu thường.
- Bộ lọc danh sách dùng filter popover nổi, không mở thường trực và không đẩy table
  xuống dưới. Nút `Bộ lọc` hiển thị badge số lượng điều kiện đang bật.
- Group enum truy cập nhanh như `Doanh nghiệp | Hộ kinh doanh` luôn hiển thị cạnh
  nút Bộ lọc; không sinh thêm chip text mô tả từng điều kiện đã chọn.
- Click ngoài popover hoặc nhấn `Esc` để đóng. Trên màn hình hẹp, nội dung filter
  chuyển từ lưới 2 cột về 1 cột.
- Nhãn của dải thống kê Companies dùng `--color-text-soft` (`#374151`), không dùng
  `--color-muted-soft`; số liệu trạng thái vẫn giữ semantic color tương ứng.

### Page baseline — Company Detail / Hồ sơ / Tổng quan

- Tiêu đề card/section và tiêu đề nhóm dùng `--color-text-strong` (`#000000`),
  không khai báo lại bằng mã hex cục bộ.
- Label trong section Thông tin khách hàng dùng `--fw-regular`; value dùng
  `--fw-medium`. Riêng value `Tên công ty` dùng `--color-primary-deep`
  (`#001c6d`) cùng `--fw-medium` để tạo điểm nhấn.
- Text phụ ở hero như `Phụ trách`, vai trò nhân viên và tab Hồ sơ inactive dùng
  `--color-text-soft`, không dùng các mã xám hard-code hoặc muted quá nhạt.
- Dữ liệu thường trong bảng `Trụ sở chính / địa điểm kinh doanh` và
  `Hợp đồng dịch vụ` dùng `--color-text-strong` cùng `--fw-medium`.
- Header cột của hai bảng dùng `--color-primary-deep` (`#001c6d`) và weight `800`,
  đồng bộ với header bảng danh sách Companies.
- Dấu `—`, dữ liệu trống và disabled được phép dùng muted; badge trạng thái,
  cảnh báo và action tiếp tục dùng semantic color, không ép về màu đen.
- Dấu `—` và dữ liệu không tồn tại: `--color-muted-subtle`.
- “Chưa phân công” là metadata trạng thái thiếu dữ liệu, được phép dùng muted.
- Button trung tính/outline: chữ `--color-text-strong`; button primary và semantic
  tiếp tục dùng màu nền/chữ theo vai trò hành động.
- Không gắn class `.muted` cho MST, ngày hoặc dữ liệu thật chỉ để tạo phân cấp cột.

## Page and section spacing

- Padding khung nội dung chung (`AppLayout`): `14px 25px`.
- Khoảng cách HeroCard đến tab bar: `12px`.
- Khoảng cách tab bar đến nội dung: `12px`.
- Khoảng cách giữa các card/section cùng cấp: `12px`.

## Hero and tabs

- HeroCard: `padding: 10px 15px`.
- Thành phần trong HeroCard căn giữa theo chiều dọc.
- Button thao tác: cao `36px`, padding ngang `16px`, gap icon/chữ `6px`, font `--fs-2xs`.
- Khoảng cách giữa các button: `8px`.
- Tab nội dung: `padding: 8px 14px`, gap icon/chữ `6px`, font `--fs-xs`.

## Compact cards

- Card header: `padding: 8px 14px`.
- Card body: `padding: 10px 14px`.
- Khoảng cách các cột thông tin: `16px`.
- Tiêu đề cột: padding dưới `6px`, margin dưới `4px`.
- Dòng thông tin: padding dọc `2px`.
- Giữ border radius card hiện tại là `12px` trừ khi page có yêu cầu riêng.

### Dense information forms

- Ưu tiên 2 cột bằng nhau: `repeat(2, minmax(0, 1fr))`; gap giữa cột `16px`.
- Mỗi dòng dùng bố cục ngang `label | value`.
- Tỷ lệ dòng: label `minmax(120px, 34%)`, value `minmax(0, 1fr)`; gap `10px`.
- Label và value dùng `--fs-2xs` (`11.5px`), không tự động in hoa.
- Dưới `820px`, khung thông tin chuyển thành 1 cột.
- Dưới `560px`, mỗi dòng chuyển về `label` trên và `value` dưới.
- Nội dung textarea khi xem dùng `white-space: pre-wrap` và cho phép ngắt từ dài.

## Compact tables

- Header cell: `padding: 7px 8px`, font `--fs-2xs`.
- Body cell: `padding: 7px 8px`, font bảng `--fs-xs` hoặc nhỏ hơn theo mật độ dữ liệu.
- Button nhỏ trong bảng: cao khoảng `26px`–`28px`.

### Inline editing kiểu bảng tính

Áp dụng cho các bảng cho phép nhấp trực tiếp vào cell để chỉnh sửa.

- Khi mở ô `input` hoặc `textarea`, gọi `focus()` rồi đặt caret ở cuối bằng
  `setSelectionRange(value.length, value.length)`. Không dùng `select()` vì thao tác này
  bôi xanh toàn bộ nội dung và khiến người dùng dễ ghi đè dữ liệu ngoài ý muốn.
- Chỉ áp dụng `setSelectionRange` cho kiểu text/textarea; không áp dụng cho select,
  date picker hoặc control không hỗ trợ text selection.
- Với textarea, dùng `wrap="soft"`, `white-space: pre-wrap`,
  `overflow-wrap: anywhere` và `word-break: break-word` để chế độ xem và chế độ sửa
  xuống dòng giống nhau theo đúng chiều rộng cell.
- Khi textarea được mở hoặc thay đổi, đặt tạm `height: 0`, sau đó cập nhật chiều cao
  bằng `scrollHeight`. Nhờ vậy caret cuối chuỗi vẫn nằm trong vùng nhìn thấy dù nội dung
  xuống dòng do wrap, không chỉ do ký tự xuống dòng thủ công.
- Nên giới hạn `max-height` (chuẩn hiện tại khoảng `108px`) và dùng `overflow-y: auto`
  để dữ liệu dài không làm hàng phình quá mức; luôn ẩn cuộn ngang.
- Editor nằm phẳng trong cell: `width: 100%`, `border: 0`, `box-shadow: none`,
  `background: transparent`, `resize: none`. Cell active chỉ nên có chỉ báo nhẹ như
  đường màu primary mảnh phía dưới, tránh viền kép làm thay đổi kích thước layout.
- Khi `blur`, phải lưu dữ liệu rồi đóng trạng thái edit. Khi nhấp ra ngoài card/table,
  cũng đóng active cell; nếu dùng sự kiện `pointerdown` toàn cục thì trì hoãn đóng một
  nhịp để `onBlur` kịp commit dữ liệu.
- Giữ điều hướng bàn phím thống nhất: `Enter`/`Tab` sang ô kế tiếp,
  `Shift + Tab` quay lại, `Escape` hủy; textarea dùng `Shift + Enter` hoặc
  `Alt + Enter` nếu cần xuống dòng thủ công.

## Footer và pagination cấp trang

- `AppLayout` hỗ trợ footer slot: không truyền `footer` thì dùng footer hệ thống mặc định;
  truyền `PaginationFooter` thì thay bằng pagination cấp trang; truyền `null` chỉ dùng khi
  trang có lý do rõ ràng để ẩn hoàn toàn footer.
- Chỉ dùng pagination footer cho trang danh sách có đúng một nguồn phân trang cấp cao nhất.
  Dashboard, Settings, Báo cáo và trang không phân trang tiếp tục dùng footer mặc định.
- Trang chi tiết có nhiều tab/bảng giữ pagination bên trong card/tab tương ứng, tránh footer
  điều khiển nhầm bảng không active.
- `PaginationFooter` là controlled/presentational component: nhận `page`, `pageSize`, `total`,
  `totalPages`, `from`, `to` và callback; tuyệt đối không tạo state pagination hoặc gọi API/query.
- State và query vẫn thuộc page. `onPageChange` chỉ gọi setter/handler hiện có; khi đổi page size,
  page phải reset về `1` tại page trước khi query chạy lại.
- Chuẩn bố cục footer: bên trái là khoảng dữ liệu/tổng số, giữa là số dòng mỗi trang, bên phải
  là điều hướng trang. Font dùng `--fs-2xs`; control cao khoảng `26px`.
- Component chuẩn: `frontend/src/components/layout/PaginationFooter.jsx`.

## Scope note

Đây là baseline tạm, không phải design-system contract cuối cùng. Khi cập nhật page mới, ưu tiên token trong `frontend/src/styles/tokens.css` và ghi nhận ngoại lệ có lý do.
