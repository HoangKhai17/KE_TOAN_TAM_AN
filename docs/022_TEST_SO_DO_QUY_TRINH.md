# 022 — Kịch bản kiểm thử: Sơ đồ quy trình (canvas vẽ tự do)

> Dùng để test tay trên giao diện. Đánh dấu ✅/❌ từng mục.
> Vị trí: **Khách hàng → [công ty] → Hồ sơ → tab Quy trình**

---

## A. Quản lý sơ đồ

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| A1 | Bấm "Thêm quy trình", nhập tên, Tạo | Sơ đồ mới xuất hiện trong danh sách, tự được chọn |
| A2 | Bấm Tạo khi để trống tên | Nút bị mờ, không tạo được |
| A3 | Bấm ✏ đổi tên | Tên đổi trong danh sách |
| A4 | Bấm 🗑 xoá | Hỏi xác nhận → xoá cả sơ đồ và các hình bên trong |
| A5 | Tạo 3 sơ đồ, bấm qua lại | Mỗi sơ đồ giữ đúng hình của nó, không lẫn |
| A6 | Kiểm tra 2 nút "Huỷ / Tạo" trong popup | Canh phải, cách đều, cùng cỡ *(đã sửa lỗi CSS)* |

## B. Vẽ hình (9 loại)

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| B1 | Thêm lần lượt: Chữ nhật, Vuông, Tròn, Tam giác, Bình hành, Thoi, Chữ | Đúng hình dạng, không chồng khít lên nhau |
| B2 | Nhấp đúp vào hình | Con trỏ nhập hiện ra ngay trên hình |
| B3 | Gõ chữ → Enter | Chữ được lưu, thoát chế độ nhập |
| B4 | Gõ chữ → Esc | Huỷ, giữ chữ cũ |
| B5 | Gõ chữ nhiều dòng (Shift+Enter) | Xuống dòng trong hình |
| B6 | **Bấm `Delete` khi đang gõ chữ** | Xoá ký tự, **KHÔNG xoá hình** |
| B7 | Kéo mép hình | Co giãn được, chữ vẫn nằm giữa |
| B8 | Hình "Chữ" (T) | Không khung, không nền — chỉ có chữ |
| B9 | Để hình **trống không gõ chữ** rồi Lưu | **Lưu được** *(lỗi cũ: cả sơ đồ không lưu được)* |

## C. Đường kẻ & mũi tên (hình độc lập)

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
> Từ bản này, đường kẻ / mũi tên là **đường nhiều điểm kéo thả tự do** — không
> còn khung bao + 4 hướng đặt sẵn. Chiều mũi tên do **thứ tự điểm** quyết định.

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| C1 | Thêm "Đường kẻ" | Đường thẳng, 2 chấm tròn ở 2 đầu khi chọn |
| C2 | Thêm "Mũi tên" | Đầu mũi tên nằm ở **điểm cuối** |
| C3 | Kéo chấm đầu / chấm cuối | Đường đi theo con trỏ, **đặt được ở góc bất kỳ** *(lỗi cũ: chỉ 4 hướng cứng)* |
| C4 | Kéo cho mũi tên chỉ **sang trái** | Làm được *(lỗi cũ: chỉ trái→phải)* |
| C5 | Kéo cho mũi tên chỉ **lên trên** | Làm được *(lỗi cũ: chỉ trên→dưới)* |
| C6 | Kéo ở mức phóng to 300% và 15% | Điểm chạy **khớp con trỏ**, không nhanh/chậm hơn |
| C6b | Kéo **chậm, đi đường vòng** rồi mới thả | Điểm bám sát con trỏ suốt quãng đường, **không trôi/bay đi** *(lỗi cũ: dồn khung mỗi frame → trôi ~80px chỉ sau 5 frame)* |
| C6c | Kéo đầu đường ra xa rồi thả | Khung tự nở ôm lấy đường, phần còn lại **đứng yên** |
| C7 | Bấm **"Đảo chiều"** | Đường đứng yên, chỉ đầu mũi tên nhảy sang đầu kia |
| C8 | Dáng **cong** → bấm **"Lật phía"** | Cong lên ↔ cong xuống *(lỗi cũ: chỉ cong một phía)* |
| C9 | Dáng **gấp khúc** → bấm **"Lật phía"** | Bẻ lên ↔ bẻ xuống *(lỗi cũ: chỉ bẻ một kiểu)* |
| C10 | "Lật phía" khi đang dáng **thẳng** | Nút mờ, bấm không được (đúng — thẳng không có phía) |
| C11 | **Nhấp đúp lên đường** | Thêm 1 điểm gãy **đúng đoạn vừa nhấp**, không nhảy chỗ khác |
| C12 | Thêm 3–4 điểm gãy rồi kéo từng điểm | Gấp khúc nhiều đoạn theo ý *(yêu cầu "kéo được nhiều gấp khúc")* |
| C13 | **Nhấp đúp lên 1 chấm giữa** | Xoá điểm đó, đường nối liền lại |
| C14 | Nhấp đúp lên chấm khi chỉ còn **2 điểm** | Không xoá (đường phải còn 2 đầu) |
| C15 | Kéo **thân đường** (không phải chấm) | Di chuyển cả đường, hình dạng giữ nguyên |
| C16 | Đổi độ dày 1/2/3/5px · nét Liền ↔ Đứt · màu | Đúng, đầu mũi tên đổi màu theo |
| C17 | Lưu → **F5** | Giữ nguyên **mọi điểm**, dáng, phía lật, độ dày, nét, màu |
| C18 | Mở sơ đồ vẽ **trước** bản này | Đường cũ hiện **y như cũ**, kéo chấm được ngay |

## D. Định dạng chữ & màu

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| D1 | Đổi cỡ chữ (11 → 100px) | Chữ to/nhỏ theo, có đủ 17 mức |
| D2 | Bấm nút **B** / **I** | Đậm / nghiêng |
| D3 | **Ctrl+B / Ctrl+I** | Tương đương nút bấm |
| D4 | Chọn nhiều hình (Shift) → Ctrl+B | **Áp cho tất cả** hình đã chọn |
| D5 | Tất cả đang đậm → Ctrl+B | Bỏ đậm tất cả |
| D6 | Ctrl+B **khi đang gõ chữ** | Vẫn áp được cho hình |
| D7 | Đổi màu chữ / nền / viền | Đúng màu đã chọn |
| D8 | Chọn nền "trong suốt" (ô caro) | Hình trong suốt, thấy nền canvas |
| D9 | Lưu → F5 | Giữ nguyên mọi định dạng |

## E. Nối các hình (mũi tên liên kết)

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| E1 | Kéo từ chấm tròn mép hình này sang hình kia | Tạo mũi tên nối |
| E2 | Nối 3 nhánh ra từ 1 hình | Cả 3 nhánh đều hiện |
| E3 | Nối vòng ngược về hình trước đó | Nối được (đồ thị cho phép vòng lặp) |
| E4 | Click mũi tên → nhập nhãn | Nhãn hiện trên mũi tên, có nền trắng |
| E5 | Đổi kiểu `→ 1 chiều` / `↔ 2 chiều` / `— không mũi tên` | Đúng kiểu |
| E6 | Bấm **"Đổi chiều mũi tên"** | A→B thành B→A |
| E7 | Tick "Nét đứt" | Mũi tên nét đứt |
| E8 | **Xoá 1 hình đang có mũi tên nối** | Mũi tên liên quan **tự xoá theo**, không để lại mũi tên mồ côi |
| E9 | Chọn đường → **Dáng đường: thẳng** | Nối thẳng trực tiếp A→B |
| E10 | Chọn đường → **Dáng đường: cong** | Đường bezier cong (mặc định) |
| E11 | Chọn đường → **Dáng đường: gấp khúc** | Bẻ góc vuông kiểu ống |
| E12 | Đổi dáng rồi **Lưu → F5** | Giữ đúng dáng đã chọn |
| E13 | Kết hợp dáng + `↔ 2 chiều` + nét đứt | 3 thuộc tính độc lập, không đè nhau |
| E14 | Sơ đồ vẽ **trước** khi có tính năng này | Hiện dạng **cong** như cũ, không đổi hình |

## F. Chọn, chép, dán, xoá

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| F1 | Click 1 hình | Được chọn, hiện bảng định dạng |
| F2 | **Shift + kéo** trên nền | Khoanh chọn nhiều hình |
| F3 | Nút ↖ "Chọn" → kéo | Khoanh chọn (không di chuyển canvas) |
| F4 | `Delete` / `Backspace` | Xoá hình / mũi tên đang chọn |
| F5 | `Ctrl+C` → `Ctrl+V` | Dán bản sao lệch 40px, **giữ nguyên màu, cỡ chữ, kích thước** |
| F6 | Chọn 2 hình **có mũi tên nối nhau** → chép → dán | **Mũi tên giữa chúng cũng được dán** *(lỗi cũ: mất mũi tên)* |
| F7 | Dán 3 lần liên tiếp | 3 bản, **lệch dần** không chồng khít *(lỗi cũ: chồng lên nhau)* |
| F8 | Chép khi chưa chọn gì | Báo "Chưa chọn hình nào" |

## G. Hoàn tác (Ctrl+Z) — *đã viết lại toàn bộ*

Mỗi mục: thực hiện thao tác → `Ctrl+Z` → phải quay lại trạng thái trước đó.

| # | Thao tác cần hoàn tác được | |
|---|---|---|
| G1 | Thêm hình | ☐ |
| G2 | **Di chuyển hình** | ☐ *(lỗi cũ: không hoàn tác được)* |
| G3 | **Kéo giãn hình** | ☐ *(lỗi cũ)* |
| G4 | **Xoá bằng phím Delete** | ☐ *(lỗi cũ)* |
| G5 | **Sửa chữ trong hình** | ☐ *(lỗi cũ)* |
| G6 | **Đổi màu / cỡ chữ / đậm nghiêng** | ☐ *(lỗi cũ)* |
| G7 | **Thêm/xoá đường kẻ, mũi tên** | ☐ *(lỗi cũ)* |
| G8 | Nối mũi tên giữa 2 hình | ☐ |
| G9 | Dán khối | ☐ |
| G10 | Bấm nút "Hoàn tác" trên thanh công cụ | Tương đương Ctrl+Z |
| G11 | Ctrl+Z liên tục nhiều lần | Lùi từng bước, tối đa 50 bước |
| G12 | Ctrl+Z khi không còn gì | Báo "Không còn thao tác để hoàn tác" |
| G13 | **Kéo điểm của mũi tên** | ☐ |
| G14 | **Thêm / xoá điểm gãy** | ☐ |

## G'. Cờ "có thay đổi" — nút Lưu phải sáng lên

Lỗi cũ: nút Lưu vẫn **xám** và `Ctrl+S` **im lặng** sau khi chỉ sửa chữ hoặc chỉ
kéo giãn hình → người dùng tưởng đã lưu, thoát ra là mất trắng.

| # | Chỉ làm đúng 1 thao tác này rồi nhìn nút Lưu | |
|---|---|---|
| G'1 | **Sửa chữ trong hình** (nhấp đúp) | Nút Lưu **sáng** ☐ *(lỗi cũ: xám)* |
| G'2 | **Kéo giãn kích thước hình** | Nút Lưu **sáng** ☐ *(lỗi cũ: xám)* |
| G'3 | **Kéo điểm của mũi tên** | Nút Lưu **sáng** ☐ |
| G'4 | Di chuyển hình | Nút Lưu sáng ☐ |
| G'5 | Đổi màu / cỡ chữ | Nút Lưu sáng ☐ |
| G'6 | **Mở sơ đồ lên, không đụng gì** | Nút Lưu vẫn **xám** ☐ (không được tự coi là đang sửa dở) |
| G'7 | **Chỉ click chọn / bỏ chọn hình** | Nút Lưu vẫn **xám** ☐ |
| G'8 | Sau khi Lưu xong | Nút Lưu **xám** trở lại ☐ |

## H. Di chuyển & phóng to (điều hướng canvas)

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| H1 | **Kéo nền bằng chuột trái** | Canvas di chuyển *(lỗi cũ: phải dùng chuột giữa/phải)* |
| H2 | Giữ **Space** + kéo | Tạm di chuyển, dòng gợi ý đổi thành "✋ Đang giữ Space" |
| H3 | Nút ✋ Bàn tay / ↖ Chọn | Đổi chế độ đúng |
| H4 | Cuộn chuột | Phóng to / thu nhỏ (giới hạn 15%–300%) |
| H5 | Bấm / kéo trên **minimap** | Nhảy tới vùng tương ứng |
| H6 | Nút **"Vừa khung"** | Thu toàn bộ sơ đồ vừa màn hình, có hiệu ứng mượt |
| H7 | Nút **"Toàn màn hình"** → `Esc` | Vào/thoát toàn màn hình |
| H8 | Nhấp đúp lên nền trống | **Không** phóng to (tránh vô tình) |

## I. Lưới căn hình

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| I1 | Chế độ **xem** | **Nền trắng trơn**, không lưới |
| I2 | Chế độ **sửa** | Có lưới 2 lớp (nhạt 16px, đậm 80px) |
| I3 | Kéo hình khi bật lưới | Hình **hít vào lưới**, các hình tự thẳng hàng |
| I4 | Nút ▦ tắt lưới → kéo hình | Di chuyển tự do từng pixel |
| I5 | Tắt lưới → thoát → mở lại | **Nhớ** lựa chọn |

## J. Lưu & tải lại

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| J1 | Vẽ → bấm **Lưu** | Báo "Đã lưu sơ đồ", **vẫn ở chế độ sửa** *(lỗi cũ: tự thoát ra)* |
| J2 | Nút Lưu khi chưa đổi gì | Nút mờ, không bấm được |
| J3 | Lưu → **F5** | Sơ đồ y nguyên: vị trí, kích thước, màu, chữ, mũi tên |
| J4 | Sửa → bấm **Huỷ** | Quay về trạng thái đã lưu gần nhất |
| J5 | Vẽ nhiều → Lưu → vẽ tiếp → Lưu | Lần lưu sau không mất dữ liệu lần trước |
| J6 | Chuyển sang sơ đồ khác rồi quay lại | Đúng dữ liệu từng sơ đồ |

## K. Phân quyền

| # | Người dùng | Kết quả mong đợi |
|---|---|---|
| K1 | **Admin** | Thấy nút "Chỉnh sửa" ở mọi công ty |
| K2 | **Nhân viên phụ trách** công ty đó | Thấy nút "Chỉnh sửa" |
| K3 | **Nhân viên KHÁC** | **Chỉ xem**, không có nút Chỉnh sửa / Thêm / Xoá |
| K4 | Nhân viên khác gọi API sửa trực tiếp | Bị chặn 403 *(đã test tự động)* |

## L. Trường hợp đặc biệt

| # | Tình huống | Kết quả mong đợi |
|---|---|---|
| L1 | **2 người cùng sửa 1 sơ đồ**, cùng bấm Lưu | Người sau nhận cảnh báo *"Sơ đồ vừa được người khác cập nhật…"*, **không ghi đè** |
| L2 | Sơ đồ rỗng (xoá hết hình) → Lưu | Lưu được, sơ đồ trống |
| L3 | Vẽ ~50 hình | Vẫn mượt, không giật |
| L4 | Chữ cỡ 100px trong hình nhỏ | Chữ tràn — cần kéo hình to ra (hành vi mong đợi) |
| L5 | Mở tab Quy trình lần đầu | Hiện "Đang tải trình vẽ…" rồi hiện canvas (lazy load) |
| L6 | **Trên server (HTTP)** — bấm Thêm hình | Hoạt động bình thường *(đã xử lý `crypto.randomUUID` chỉ chạy trên HTTPS/localhost)* |

---

## Ghi chú kỹ thuật

- **Hiệu năng**: trình vẽ (~196 kB) **chỉ tải khi mở tab Quy trình**. Người không dùng không tốn thêm băng thông.
- **Lưu nguyên khối**: mỗi lần Lưu gửi toàn bộ sơ đồ trong 1 transaction — hoặc thành công hết, hoặc không đổi gì.
- **Giữ ID**: sửa đi sửa lại không sinh lại ID hình → sau này nối bước ↔ công việc vẫn giữ được liên kết.
- **Kiểm thử tự động backend**: 3 bộ (`process_test`, `shapes_test`, format test) — 40+ khẳng định, chạy lại sau mỗi thay đổi.
