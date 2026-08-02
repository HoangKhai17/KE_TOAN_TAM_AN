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

## Scope note

Đây là baseline tạm, không phải design-system contract cuối cùng. Khi cập nhật page mới, ưu tiên token trong `frontend/src/styles/tokens.css` và ghi nhận ngoại lệ có lý do.
