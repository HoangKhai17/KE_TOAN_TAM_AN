# Compact layout baseline (temporary)

Tài liệu tạm dùng làm chuẩn khi đồng bộ các trang còn lại với layout compact của trang danh sách Công ty.

## Typography

- Chữ trong button thao tác: `var(--fs-2xs)` = `11.5px`.
- Chữ tab điều hướng nội dung: `var(--fs-xs)` = `12.5px`.
- Tiêu đề, label và giá trị trong card thông tin compact: `var(--fs-2xs)` = `11.5px`.
- Không dùng `text-transform: uppercase` cho tiêu đề nhóm và label thông tin.

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
