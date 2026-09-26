Đây là những thiếu sót được phát hiện khi kiểm thử mọi màn hình của FacilityPro với tổ chức demo. Mỗi mục được đánh dấu **Tính năng cần lưu ý**. Các lỗi đã phát hiện và đã sửa được liệt kê trong báo cáo kiểm định.

## Quyền truy cập và vai trò {#access-and-roles}

**Tính năng cần lưu ý — vai trò Nhà cung cấp thấy dữ liệu của nhân viên.** Tài khoản Nhà cung cấp thấy menu và dữ liệu giống kỹ thuật viên, bao gồm mọi lệnh công việc, tài sản, phụ tùng và vị trí. Hiện chưa có cổng riêng cho nhà cung cấp, chỉ giới hạn trong công việc của chính họ. Nhà cung cấp cũng không thể đổi trạng thái công việc trừ khi công việc được giao cho chính họ. *Cách xử lý tạm thời:* chỉ cấp vai trò Nhà cung cấp cho nhà thầu đáng tin cậy, và để quản lý cập nhật công việc của họ.

**Tính năng cần lưu ý — người dùng được hiển thị bằng địa chỉ email.** Thành viên, người được giao, dòng nhân công và chấm công hiển thị địa chỉ email thay vì tên. Hồ sơ hiện chưa có trường tên hiển thị.

## Ngôn ngữ {#language}

**Tính năng cần lưu ý — một số màn hình chỉ có tiếng Anh.** Khi ứng dụng được đặt sang Tiếng Việt, một phần các trang sau vẫn hiển thị tiếng Anh: **Cài đặt** (tên các tab và một số mục), **Quy trình**, **Tài chính**, **Trải nghiệm khách thuê**, **Tài liệu**, **Giấy phép làm việc**, **Chấm công**, **Bàn làm việc**, **Cơ sở vật chất**, trường **Loại tài sản** và các hộp thoại "tạo mới" trên biểu mẫu báo sự cố, cùng các danh sách tìm kiếm (*No matches*, *Create new*).

**Tính năng cần lưu ý — Trung tâm trợ giúp bằng tiếng Anh.** Hướng dẫn, danh mục tính năng và trợ giúp theo trang được viết bằng tiếng Anh. Các nút, phần hướng dẫn nhanh (tour) và tiêu đề của bảng "? Trợ giúp" đã được dịch.

## Công việc và phê duyệt {#work-and-approvals}

**Tính năng cần lưu ý — phê duyệt không chặn công việc.** **Yêu cầu phê duyệt** ghi lại quyết định, nhưng lệnh công việc vẫn có thể được bắt đầu hoặc đóng trước khi được phê duyệt. *Cách xử lý tạm thời:* thống nhất trong nhóm là chờ phê duyệt.

**Tính năng cần lưu ý — đối tượng nhận thông báo là văn bản tự do.** Trường **Đối tượng** trong *Trải nghiệm khách thuê* chỉ là một nhãn. Mọi thông báo đã đăng đều hiển thị cho tất cả cư dân trong tổ chức.

## Chi tiết hiển thị {#display-details}

**Tính năng cần lưu ý — một số ngày chưa được định dạng.** *Recent bookings* (Bàn làm việc, Cơ sở vật chất) và hạn của giấy phép hiển thị ngày dạng *2026-09-27* thay vì dạng thông thường *27 thg 9, 2026*.

**Tính năng cần lưu ý — bố cục thẻ chấm công.** Khi địa chỉ email dài, nhãn *Checked in* trên thẻ Chấm công bị đẩy xuống dưới tên.

## Chưa kiểm chứng trong môi trường thử nghiệm {#not-verified-in-the-test-environment}

Các tính năng này cần dịch vụ bên ngoài mà môi trường thử nghiệm không kết nối được. Các màn hình đã được kiểm tra, nhưng chưa kiểm tra việc gửi nhận từ đầu đến cuối:

- gửi thông báo qua **email, SMS và thông báo đẩy**,
- trả lời trên **Zalo** và **WhatsApp**,
- các tính năng **AI**: Trợ lý thông minh, bản nháp blog bằng AI và chấm điểm cảm xúc trong hộp thư,
- **thanh toán trực tuyến** trên trang Thanh toán,
- chỉ số gửi về từ **thiết bị và gateway IoT thực** (bản demo dùng chỉ số đã lưu sẵn).
