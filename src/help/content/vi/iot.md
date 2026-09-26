**IoT (Internet vạn vật)** kết nối cảm biến và đồng hồ đo với FacilityPro: nhiệt độ, áp suất, điện năng, rò rỉ nước, chất lượng không khí và nhiều thông số khác. Bạn xem được số liệu trực tiếp và lịch sử, nhận cảnh báo khi có thông số vượt ngưỡng, và có thể tự động tạo lệnh công việc.

**Ai có thể sử dụng:** Quản trị viên và Quản lý thêm thiết bị và đặt quy tắc. Kỹ thuật viên xem dữ liệu trực tiếp, lịch sử và cảnh báo, đồng thời xác nhận và xử lý cảnh báo.

**Ở đâu:** Menu → **Thiết bị**.

## Trang thiết bị {#the-devices-page}

![Thiết bị IoT](/help/screens/devices.webp)

① Thêm thiết bị · ② Tổng quan thiết bị · ③ Một thiết bị

- Phần **tổng quan** ② đếm số thiết bị **Tổng**, **Trực tuyến**, **Mất kết nối**, **Cảnh báo**, **Nghiêm trọng** và **Pin yếu**.
- Các tab chuyển giữa **Thiết bị**, **Cảnh báo** (mọi cảnh báo đang mở) và **Gateway**.
- Lọc theo tòa nhà, danh mục, nhà sản xuất hoặc giao thức, hoặc tìm theo tên.
- Mỗi thiết bị hiển thị chấm xanh (trực tuyến) hoặc đỏ (mất kết nối), vị trí, lần gửi dữ liệu gần nhất, cảnh báo đang mở (nếu có) và giao thức (ví dụ: *Modbus TCP*, *MQTT*, *LoRaWAN*).

## Trang của một thiết bị {#a-devices-page}

![Trang thiết bị](/help/screens/device-detail.webp)

① Các tab · ② Dữ liệu trực tiếp và lịch sử

- **Tổng quan** — thông tin thiết bị, tài sản được liên kết, **Dữ liệu trực tiếp** (giá trị mới nhất của từng chỉ số) và biểu đồ **Lịch sử** (**1 giờ**, **24 giờ**, **7 ngày**, **30 ngày** hoặc **Tùy chọn**). Nhấn vào một chỉ số để vẽ biểu đồ.
- **Cảnh báo** — các cảnh báo của thiết bị này.
- **Điều khiển** — gửi lệnh điều khiển (với thiết bị hỗ trợ).
- **Điểm dữ liệu** — thiết bị gửi những chỉ số nào và chúng được đặt tên ra sao.
- **Quy tắc** — các ngưỡng phát sinh cảnh báo.
- **Bảo trì** — công việc trên tài sản được liên kết.
- **Kết nối** — khóa thiết bị và thông tin kết nối (dành cho quản lý).

## Thêm thiết bị {#adding-a-device}

1. Nhấn **Thêm thiết bị** ①.
2. Làm theo các bước: chọn loại và model thiết bị (hoặc *Khác / không có trong danh sách*), đặt **Tên**, chọn **Vị trí** và **Tài sản** (không bắt buộc), rồi chọn **giao thức**.
3. Ở bước cuối, sao chép **khóa thiết bị** và thông tin kết nối vào thiết bị hoặc gateway của bạn.
4. Thiết bị hiển thị **Trực tuyến** khi nhận được số liệu đầu tiên.

> **Cảnh báo:** Hãy giữ khóa thiết bị như mật khẩu. Nếu khóa bị lộ, mở **Kết nối** và nhấn **Đổi khóa**.

## Cảnh báo {#alerts}

![Cảnh báo thiết bị](/help/screens/device-alerts.webp)

Cảnh báo có mức độ nghiêm trọng (**Thông tin**, **Cảnh báo**, **Nghiêm trọng**, **Khẩn cấp**) và trạng thái:

1. **Mới** — vừa phát sinh. Nhấn **Xác nhận** để cho biết bạn đang xử lý.
2. **Đã xác nhận** — đã có người phụ trách.
3. **Đã xử lý** — nhấn **Đã xử lý** và mô tả những gì đã làm.

Thiết bị ngừng gửi dữ liệu sẽ phát sinh cảnh báo **Mất kết nối** sau khoảng thời gian được đặt cho thiết bị đó (ví dụ: *sau 15 phút*).

## Quy tắc ngưỡng {#threshold-rules}

![Quy tắc thiết bị](/help/screens/device-rules.webp)

1. Mở thiết bị → **Quy tắc** → **Thêm quy tắc**.
2. Chọn **chỉ số** (ví dụ: *áp suất*), **Điều kiện** (ví dụ: *lớn hơn*) và **Ngưỡng** (ví dụ: *11*).
3. Chọn **Hành động**:
   - **Chỉ cảnh báo**,
   - **Thông báo** — gửi thêm thông báo đến các vai trò bạn chọn,
   - **Lệnh công việc** — tự động tạo yêu cầu công việc,
   - **Thông báo + lệnh công việc**.
4. Đặt **Mức độ**, **Thời gian chờ (phút)** để các số liệu lặp lại không gây quá nhiều cảnh báo, và có thể đặt **Chuyển cấp nếu chưa xác nhận (phút)**.

Trong bản demo, quy tắc *Condenser pressure high* trên CH-01 đã phát sinh một cảnh báo nghiêm trọng. Cảnh báo đó trở thành lệnh công việc *Chiller CH-01 high condenser pressure*.

## Năng lượng và đồng hồ đo {#energy-and-meters}

Đồng hồ điện và đồng hồ năng lượng (ví dụ: *Main energy meter (MSB-01)*) hiển thị như mọi thiết bị khác, với phụ tải trực tiếp và lịch sử. Thiết bị cũng có thể **Ghi vào đồng hồ**: số liệu của thiết bị được đưa vào đồng hồ của tài sản, từ đó có thể kích hoạt [bảo trì theo đồng hồ](/help/guide/preventive-maintenance#meter-based-schedules).
