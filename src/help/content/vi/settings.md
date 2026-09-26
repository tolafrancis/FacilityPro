Cài đặt quyết định cách FacilityPro vận hành cho tổ chức của bạn: hồ sơ, các danh sách để mọi người chọn, mục tiêu phản hồi, tự động hóa, tích hợp, màn hình TV và gói dịch vụ.

**Ai có thể dùng:** Quản trị viên và Quản lý (tab **Nhóm & vai trò** chỉ dành cho Quản trị viên).

**Ở đâu:** Menu → **Cài đặt**, **Quy trình** và **Thanh toán**.

## Chung {#general}

![Cài đặt chung](/help/screens/settings-general.webp)

- **Tên** — tên tổ chức của bạn, hiển thị ở đầu mọi trang.
- **Ngôn ngữ mặc định** — ngôn ngữ cho thành viên mới (mỗi người có thể tự chuyển EN / VI).
- **Múi giờ** — dùng cho hạn chót và lịch bảo trì, ví dụ *Asia/Ho_Chi_Minh*.
- **Tiền tệ** — mã ba chữ cái như *VND* hoặc *USD*, dùng cho mọi số tiền.
- **Chấm điểm cảm xúc tin nhắn hộp thư bằng AI** — mặc định tắt. Khi bật, tin nhắn đến từ cư dân sẽ được phân tích để phát hiện khách hàng không hài lòng.

Bấm **Lưu** sau khi thay đổi.

## Danh mục {#catalogs}

![Danh mục](/help/screens/settings-catalogs.webp)

Các danh sách mọi người chọn khi báo sự cố và ghi nhận công việc.

- **Loại sự cố** — ví dụ *Water leak*, mỗi loại có một mức ưu tiên mặc định (từ *Thấp* đến *Khẩn cấp*). Yêu cầu mới thuộc loại đó sẽ nhận mức ưu tiên này.
- **Loại tài sản** — ví dụ *Chiller*, *Lift / elevator*.
- Dùng **+ Thêm** để thêm, biểu tượng **bút chì** để sửa, biểu tượng **nguồn** để tắt hoặc bật một loại (loại đã tắt sẽ biến mất khỏi biểu mẫu nhưng vẫn còn trên các bản ghi cũ), và **thùng rác** để xóa.
- **Tải các loại mặc định** thêm một danh sách khởi đầu chuẩn.

## Mục tiêu SLA {#sla-targets}

![Mục tiêu SLA](/help/screens/settings-sla.webp)

Đặt **Số giờ xử lý** cho từng mức ưu tiên, ví dụ *Khẩn cấp 4*, *Cao 24*, *Trung bình 72*, *Thấp 168*. Lệnh công việc mới sẽ tự động có hạn chót dựa trên các giá trị này. Bấm **Lưu** trên từng dòng.

## Nhóm & vai trò {#team-roles}

Xem [Quản lý người dùng](/help/guide/user-management#team-roles).

## Màn hình TV {#tv-displays}

![Màn hình TV](/help/screens/settings-displays.webp)

Bảng hiển thị TV cho thấy các lệnh công việc theo thời gian thực (trạng thái, mức ưu tiên, ngày, vị trí, người phụ trách) trên bất kỳ màn hình nào, chẳng hạn smart TV trong phòng điều khiển, mà không cần đăng nhập.

1. Vào **Cài đặt → Màn hình TV** và bấm **Màn hình mới**.
2. Đặt **Tên** (ví dụ *Lobby TV*) và chọn **Địa điểm** (hoặc **Tất cả địa điểm**).
3. Chọn **Các cột hiển thị** (Mới, Đang làm, Tạm dừng, Hoàn tất), thời gian **Giữ việc đã hoàn thành trên màn hình**, các **Mức ưu tiên**, và **Thông tin trên mỗi việc** (mức ưu tiên, hạn chót & quá hạn, vị trí, tên người phụ trách, tài sản, thời điểm mở).
4. Chọn **Bố cục** (*Cột theo trạng thái* hoặc *Danh sách*), **Màu** (*Tối* hoặc *Sáng*) và **Ngôn ngữ màn hình**, rồi bấm **Tạo màn hình**.
5. Sao chép liên kết, mở nó trên trình duyệt của TV, rồi bấm **Toàn màn hình**. Bảng tự cập nhật và tự chuyển trang khi có nhiều công việc.
6. Nếu liên kết bị lộ, hãy tạo liên kết mới cho bảng; liên kết cũ sẽ ngừng hoạt động ngay lập tức.

## Tích hợp {#integrations}

![Tích hợp](/help/screens/settings-integrations.webp)

- **IoT & cảm biến** — quản lý thiết bị từ [trang Thiết bị](/help/guide/iot).
- **WhatsApp** và **Zalo** — cho biết tài khoản doanh nghiệp của bạn đã được kết nối chưa. Liên hệ bộ phận hỗ trợ FacilityPro để kết nối.
- **Gửi email, SMS & thông báo đẩy** — cho biết cách tin nhắn được gửi đi, kèm công tắc **Gửi email thông báo cho tôi** của riêng bạn.

## Quy trình (tự động hóa) {#workflows-automation}

![Quy trình](/help/screens/workflows.webp)

Vào **Quy trình** trong menu.

**Tự động hóa** (ở phía trên):

- **Cho phép báo cáo sự cố công khai** — bất kỳ ai có mã QR hoặc liên kết đều có thể báo sự cố mà không cần đăng nhập. **Liên kết báo cáo công khai** hiển thị ngay bên dưới.
- **Tự động tạo lệnh công việc** — mọi yêu cầu mới trở thành lệnh công việc ngay lập tức. Sau đó các quy trình điều phối và mục tiêu SLA sẽ được áp dụng.

**Tạo quy trình**:

1. Chọn một **Kích hoạt**, ví dụ *Service Request*, *Fault Report*, *Work Order Created*, *Parts Quantity*, *Meter Reading*, *Sensor Integration*, *Desk Booking* hoặc *Asset Field (warranty / useful life)*.
2. Điền **Cài đặt kích hoạt**, ví dụ *When pending too long: 60 minutes*, hoặc một loại sự cố hay mức ưu tiên.
3. Có thể đặt **Thời gian chờ (phút)** và **Bộ lọc bổ sung**.
4. Thêm **Hành động**: *Send Email*, *Send SMS*, *Send Push*, *Assign To*, *Create Request*, *Alert Account*, *Send Survey*, *Create Expenditure* hoặc *Send Approval Email*.
5. Lưu lại. Quy trình sẽ xuất hiện trong **Thư viện quy trình** cùng số lần chạy và lần chạy gần nhất. Dùng **Tắt** để tạm dừng.

> **Mẹo:** Hãy bắt đầu từ các **mẫu** trong thư viện, chẳng hạn *Auto-assign work orders*, *Email when warranty expiry is near* hoặc *Survey after request completion*.

## Thanh toán {#billing}

![Thanh toán](/help/screens/billing.webp)

**Thanh toán** (Quản trị viên) hiển thị gói của bạn (*Miễn phí*, *Pro* hoặc *Doanh nghiệp*), những gì được bao gồm và mức sử dụng hiện tại, cùng các tùy chọn nâng cấp hoặc quản lý thanh toán.
