**Yêu cầu** là một báo cáo rằng có gì đó bị hỏng ("máy lạnh ở Suite 1201 không mát"). **Lệnh công việc** là công việc để khắc phục: ai làm, hạn khi nào, đã dùng những gì và kết quả ra sao. Trang này theo dõi một công việc từ đầu đến cuối.

**Ở đâu:** Menu → **Yêu cầu**, **Lệnh công việc**, **Công việc của tôi**, **Phê duyệt**.

## Tổng quan vòng đời một công việc {#the-life-of-a-job-at-a-glance}

1. **Được báo cáo** — cư dân hoặc nhân viên báo một sự cố. Sự cố trở thành một **yêu cầu** (trạng thái *Mới*).
2. **Tạo lệnh công việc** — quản lý bấm **Tạo lệnh công việc**, hoặc hệ thống tự động tạo.
3. **Phân công** — chọn một kỹ thuật viên (hoặc nhà thầu). Trạng thái: **Đã phân công**.
4. **Đang xử lý** — kỹ thuật viên bắt đầu làm, ghi nhận phụ tùng, thời gian và điền danh sách kiểm tra.
5. **Tạm dừng** (không bắt buộc) — công việc tạm ngưng, ví dụ khi đang chờ phụ tùng.
6. **Đã xử lý** — kỹ thuật viên hoàn tất và ghi lại những gì đã làm.
7. **Đã nghiệm thu** — quản lý kiểm tra công việc.
8. **Đã đóng** — công việc hoàn thành. Có thể **mở lại** nếu sự cố tái diễn.

Yêu cầu luôn cập nhật theo lệnh công việc của nó, nên người báo sự cố luôn thấy trạng thái hiện tại.

> **Lưu ý:** Hệ thống chỉ hiển thị các bước được phép tiếp theo. Kỹ thuật viên chuyển công việc của mình từ *Đã phân công* đến *Đã xử lý*. Chỉ quản lý và quản trị viên mới được **nghiệm thu**, **đóng** và **mở lại** công việc đã đóng.

## Bước 1: Báo sự cố {#step-1-a-fault-is-reported}

![Báo sự cố](/help/screens/request-new.webp)

① Tóm tắt · ② Loại sự cố · ③ Mức độ nghiêm trọng · ④ Vị trí · ⑤ Mô tả · ⑥ Ảnh · ⑦ Gửi báo cáo

1. Bấm **Báo sự cố** (cư dân) hoặc **Tạo mới → Báo sự cố** (nhân viên), hoặc **Báo cáo sự cố** trên một tài sản.
2. Viết **Tóm tắt** ① ngắn gọn, ví dụ *Pantry sink leaking under cabinet*.
3. Chọn **Loại sự cố** ② và **Mức độ nghiêm trọng** ③.
4. Chọn **Vị trí** ④. Nhân viên còn có thể chọn **Loại tài sản** và **Tài sản**.
5. Mô tả vấn đề ⑤ và thêm **Ảnh** ⑥ nếu có thể.
6. Bấm **Gửi báo cáo** ⑦.

Sự cố còn có thể đến từ:

- **mã QR** trên thiết bị hoặc **liên kết báo cáo công khai** (không cần đăng nhập; bật trong [Quy trình](/help/guide/settings#workflows-automation)),
- các cuộc trò chuyện qua **Zalo, WhatsApp hoặc email** trong [Hộp thư](/help/guide/notifications#inbox-conversations-with-tenants),
- **cảnh báo IoT** từ cảm biến ([IoT](/help/guide/iot#alerts)).

## Bước 2: Chuyển yêu cầu thành lệnh công việc {#step-2-turning-a-request-into-a-work-order}

![Danh sách yêu cầu](/help/screens/requests.webp)

① Yêu cầu mới · ② Tìm kiếm · ③ Lọc theo trạng thái hoặc vị trí · ④ Một yêu cầu

1. Mở **Yêu cầu** và bấm vào yêu cầu cần xử lý.
2. Kiểm tra thông tin và bấm **Tạo lệnh công việc**.
3. Lệnh công việc mở ra với tiêu đề, vị trí, tài sản, loại sự cố và mức ưu tiên được sao chép sang. **Hạn chót** được đặt theo [mục tiêu SLA](/help/guide/settings#sla-targets) của bạn.

> **Mẹo:** Khi bật **Tự động tạo lệnh công việc** ([Quy trình](/help/guide/settings#workflows-automation)), mọi yêu cầu mới sẽ trở thành lệnh công việc ngay lập tức, và các quy tắc điều phối có thể tự phân công. Trong bản demo, rò rỉ nước được giao thẳng cho Kenji (Plumbing).

Quản lý cũng có thể đổi trực tiếp trạng thái của yêu cầu, ví dụ sang **Từ chối** nếu đó không phải việc bảo trì.

## Bước 3: Phân công công việc {#step-3-assigning-the-work}

![Phần đầu lệnh công việc](/help/screens/wo-detail-top.webp)

① Trạng thái · ② Người phụ trách · ③ Nhà thầu · ④ In phiếu công việc · ⑤ Dòng thời gian

1. Mở lệnh công việc.
2. Chọn kỹ thuật viên ở **Người phụ trách** ②. Trạng thái chuyển sang **Đã phân công** và kỹ thuật viên nhận được thông báo.
3. Nếu nhà thầu thực hiện, hãy chọn họ ở **Nhà thầu** ③ (hoặc để **Nội bộ**). Các hợp đồng đang hiệu lực của nhà thầu được liệt kê bên dưới.
4. Có thể đặt thêm **Trung tâm chi phí**.

> **Mẹo:** Bấm **In phiếu công việc** ④ để có một phiếu in gồm thông tin, hướng dẫn, chi tiết đóng lệnh, phụ tùng, nhân công và các dòng ký tên. Dùng **In / Lưu PDF** trên trang đó. Phiếu này rất tiện khi làm việc với nhà thầu.

## Bước 4: Thực hiện công việc (kỹ thuật viên) {#step-4-doing-the-work-technician}

Kỹ thuật viên xem công việc của mình tại **Công việc của tôi**.

![Công việc của tôi](/help/screens/my-work.webp)

1. Mở công việc và đổi **Trạng thái** ① sang **→ Đang xử lý**. Thời điểm bắt đầu được ghi vào dòng thời gian ⑤.
2. Cuộn xuống để ghi nhận công việc:

![Ghi nhận công việc](/help/screens/wo-detail-work.webp)

① Chi tiết đóng lệnh · ② Phê duyệt · ③ Danh sách kiểm tra · ④ Phụ tùng đã dùng · ⑤ Nhân công

3. **Danh sách kiểm tra** ③ — đánh dấu Đạt/Không đạt, nhập giá trị và ghi chú, rồi bấm **Lưu danh sách**. Nếu chưa có danh sách kiểm tra nào, quản lý có thể chọn một danh sách tại **Đính kèm danh sách kiểm tra…**.
4. **Phụ tùng đã dùng** ④ — chọn phụ tùng, nhập **Số lượng** và bấm **Ghi nhận**. Tồn kho tự động giảm ([Kho](/help/guide/inventory)).
5. **Nhân công** ⑤ — nhập **Số phút** đã làm và bấm **Ghi nhận nhân công**. Đơn giá theo giờ của kỹ thuật viên được điền sẵn; chi phí được tự động tính.
6. **Ảnh bằng chứng** — thêm ảnh **Trước** và **Sau**.

> **Lưu ý:** **Chi phí** của lệnh công việc bằng chi phí nhân công cộng với phụ tùng đã dùng.

### Tạm dừng công việc {#putting-work-on-hold}

Chọn **→ Tạm dừng**. Bạn sẽ được hỏi lý do (ví dụ *Waiting for run capacitor, PO sent*). Lý do này hiển thị trên lệnh công việc. Chọn **→ Đang xử lý** để tiếp tục.

## Bước 5: Hoàn tất xử lý {#step-5-resolving-the-work}

1. Trong **Chi tiết đóng lệnh** ①, chọn **Nguyên nhân hỏng** (*Hao mòn, Sử dụng sai, Lỗi sản xuất, Nguyên nhân bên ngoài, Không rõ*) và **Mã hoàn thành** (*Đã sửa chữa, Đã thay thế, Không phát hiện lỗi, Hoãn lại*).
2. Nhập **Thời gian ngừng hoạt động (phút)** nếu thiết bị đã phải ngừng sử dụng.
3. Đổi **Trạng thái** sang **→ Đã xử lý**.

> **Cảnh báo:** Bạn không thể đánh dấu đã xử lý khi chưa có **mã hoàn thành**, hoặc khi các mục bắt buộc trong danh sách kiểm tra chưa xong. Trang sẽ cho bạn biết còn thiếu gì.

## Bước 6: Nghiệm thu và đóng (quản lý) {#step-6-verifying-and-closing-manager}

1. Mở lệnh công việc đã xử lý và kiểm tra danh sách kiểm tra, ảnh, phụ tùng và nhân công.
2. Chọn **→ Đã nghiệm thu**, rồi **→ Đã đóng**. (Bạn có thể đóng thẳng từ *Đã xử lý*.)
3. Nếu sự cố tái diễn, chọn **↺ Mở lại**. Lệnh công việc quay về *Đang xử lý* và số lần mở lại tăng lên.

![Một lệnh công việc đã đóng](/help/screens/wo-closed.webp)

## Phê duyệt cho công việc chi phí cao {#approvals-for-expensive-work}

1. Trên lệnh công việc, bấm **Yêu cầu phê duyệt** ② và thêm ghi chú (ví dụ báo giá).
2. Quản trị viên và quản lý sẽ thấy yêu cầu này trong **Phê duyệt**, với nút **Phê duyệt** và **Từ chối**.

![Phê duyệt](/help/screens/approvals.webp)

① Phê duyệt · ② Từ chối

> **Lưu ý:** Phê duyệt chỉ ghi lại quyết định. Nó không ngăn ai thay đổi trạng thái lệnh công việc, vì vậy hãy thống nhất trong nhóm rằng không ai bắt đầu trước khi được duyệt.

## Tìm lệnh công việc {#finding-work-orders}

![Danh sách lệnh công việc](/help/screens/work-orders.webp)

① Tìm kiếm · ② Bộ lọc · ③ Màn hình TV · ④ Một lệnh công việc

- **Tìm kiếm** ① tìm trong tiêu đề và hướng dẫn.
- **Bộ lọc** ② thu hẹp danh sách theo **Trạng thái**, **Vị trí**, **Người phụ trách** và **Ưu tiên**.
- **Màn hình TV** ③ thiết lập một màn hình treo tường hiển thị trạng thái công việc theo thời gian thực ([Cài đặt → Màn hình TV](/help/guide/settings#tv-displays)).
- Danh sách hiển thị 25 công việc mỗi trang. Dùng **Trước** / **Sau** ở cuối trang.
