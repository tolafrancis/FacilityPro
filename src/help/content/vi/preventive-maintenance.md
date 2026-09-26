**Bảo trì phòng ngừa (PM)** là công việc được lên kế hoạch và lặp lại, chẳng hạn kiểm tra chiller hằng tháng hoặc chạy thử máy phát điện hằng tuần. FacilityPro tự động tạo lệnh công việc từ mỗi lịch vào đúng thời điểm, để không việc nào bị bỏ sót.

**Ai có thể sử dụng:** Quản trị viên và Quản lý tạo và thay đổi lịch. Mọi nhân viên đều có thể xem.

**Ở đâu:** Menu → **Bảo trì** (lịch bảo trì) và **Danh sách kiểm tra** (mẫu kiểm tra).

## Trang bảo trì {#the-maintenance-page}

![Bảo trì phòng ngừa](/help/screens/maintenance.webp)

① Lịch mới · ② Tạo công việc đến hạn · ③ Lịch · ④ Một lịch quá hạn · ⑤ Phụ tùng cần dùng · ⑥ Tạm dừng / Tiếp tục

- **Lịch** ③ đánh dấu mỗi ngày có việc đến hạn, kèm số lượng.
- Mỗi **thẻ lịch bảo trì** hiển thị tài sản, tần suất lặp lại (**Mỗi 30 ngày** hoặc **Mỗi 250 đơn vị**), mức ưu tiên và ngày đến hạn tiếp theo. Lịch quá hạn ④ hiển thị chữ **Quá hạn** màu đỏ.

## Tạo lịch bảo trì {#creating-a-schedule}

![Lịch bảo trì mới](/help/screens/maintenance-new.webp)

1. Nhấn **Lịch mới** ①.
2. Nhập **Tên** (ví dụ: *Chiller CH-01 monthly inspection*).
3. Chọn **Tài sản**.
4. Chọn **Kích hoạt**:
   - **Theo lịch (ngày)** — sau đó đặt **Lặp lại sau (ngày)** và **Ngày đến hạn đầu tiên**.
   - **Theo mức sử dụng đồng hồ** — xem [Lịch theo đồng hồ](#meter-based-schedules).
5. **Tạo trước bao nhiêu ngày** — số ngày trước ngày đến hạn mà lệnh công việc được tạo. Hạn của lệnh công việc vẫn là ngày đến hạn thực tế.
6. Bạn có thể chọn thêm **Danh sách kiểm tra**, **Giao cho** một kỹ thuật viên và đặt **Mức ưu tiên**.
7. Nhấn **Tạo**.

> **Mẹo:** Thời điểm đến hạn tính theo múi giờ của tổ chức bạn. Biểu mẫu hiển thị múi giờ bên dưới ngày, ví dụ: *Đến hạn lúc 09:00 (Asia/Ho_Chi_Minh)*.

## Cách tạo lệnh công việc {#how-work-orders-are-generated}

- FacilityPro tự động kiểm tra các lịch và tạo lệnh công việc khi một lịch đến hạn (trừ đi số ngày tạo trước).
- Muốn tạo ngay, hãy nhấn **Tạo công việc đến hạn** ②. Một thông báo cho bạn biết số lệnh đã tạo, ví dụ: *"Đã tạo 2 lệnh công việc."*, hoặc *"Hiện không có việc đến hạn."*
- Lệnh công việc liên kết ngược về lịch bảo trì, nhận danh sách kiểm tra của lịch và gợi ý các phụ tùng cần dùng của lịch.
- Ngay khi lệnh công việc được tạo, lịch chuyển sang ngày đến hạn tiếp theo. Việc trễ hạn hiển thị trên lệnh công việc, không phải trên lịch.

## Lịch theo đồng hồ {#meter-based-schedules}

Dùng loại lịch này cho công việc phụ thuộc vào mức sử dụng, không phải thời gian. Ví dụ: *bảo dưỡng máy phát điện sau mỗi 250 giờ chạy*.

1. Trước tiên, hãy thêm đồng hồ cho tài sản ([Tài sản → Đồng hồ](/help/guide/assets#meters-and-readings)).
2. Trong **Lịch mới**, đặt **Kích hoạt** là **Theo mức sử dụng đồng hồ**.
3. Chọn **Đồng hồ** và nhập **Mỗi (đơn vị)**, ví dụ: *250*.
4. Mỗi lần chỉ số vượt qua ngưỡng tiếp theo, một lệnh công việc sẽ được tạo.

## Bộ phụ tùng cần dùng {#required-parts-kits}

1. Trên thẻ lịch bảo trì, nhấn **Phụ tùng cần dùng** ⑤.
2. Thêm các phụ tùng và số lượng công việc cần (ví dụ: *8 × AHU pre-filter G4*).
3. Mỗi lệnh công việc được tạo sẽ hiển thị chúng trong mục **Phụ tùng gợi ý**. Kỹ thuật viên nhấn **Dùng** để ghi nhận. Xem [Kho phụ tùng](/help/guide/inventory).

## Tạm dừng, tiếp tục và chỉnh sửa {#pausing-resuming-and-editing}

- **Tạm dừng** ⑥ ngừng tạo công việc từ lịch (ví dụ: khi thiết bị đang ngừng hoạt động). **Tiếp tục** cho lịch chạy lại.
- **Sửa** thay đổi mọi thiết lập, kể cả **Ngày đến hạn tiếp theo**.

## Danh sách kiểm tra (mẫu kiểm tra) {#checklists-inspection-templates}

![Một mẫu danh sách kiểm tra](/help/screens/checklist-template.webp)

Danh sách kiểm tra là danh sách các mục kiểm tra dùng lại được, gắn vào lịch bảo trì phòng ngừa hoặc vào từng lệnh công việc.

1. Vào **Danh sách kiểm tra** → **Danh sách mới** và đặt tên cho danh sách.
2. Mở danh sách và nhấn **Thêm hạng mục** cho mỗi mục kiểm tra. Chọn **Loại**:
   - **Đạt / Không đạt** — ví dụ: *Không rò rỉ môi chất lạnh*.
   - **Giá trị** — một con số cần ghi lại, ví dụ: *Nhiệt độ nước lạnh (°C)*.
   - **Hình ảnh** — cần có ảnh (thêm ở mục *Ảnh bằng chứng*).
   - **Ghi chú** — văn bản tự do.
3. Đánh dấu **Bắt buộc** cho các mục phải hoàn thành trước khi lệnh công việc có thể được xử lý xong.

> **Cảnh báo:** Lệnh công việc còn mục kiểm tra bắt buộc chưa hoàn thành thì không thể đánh dấu **Đã xử lý**. Kỹ thuật viên sẽ thấy thông báo *"Hãy hoàn tất các mục bắt buộc trong danh sách kiểm tra trước khi đánh dấu đã xử lý."*
