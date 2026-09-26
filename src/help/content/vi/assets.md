**Danh mục tài sản** liệt kê mọi thiết bị bạn bảo trì: chiller, thang máy, máy bơm, máy phát điện, máy điều hòa và nhiều loại khác. Mỗi tài sản lưu thông tin chi tiết, thông số kỹ thuật, đồng hồ, tài liệu, mã QR và toàn bộ lịch sử sửa chữa.

**Ai có thể dùng:** Mọi nhân viên đều xem được tài sản và báo sự cố trên tài sản. Quản trị viên và Quản lý thêm, sửa và xóa tài sản.

**Ở đâu:** Menu → **Tài sản**.

## Danh sách tài sản {#the-asset-list}

![Danh mục tài sản](/help/screens/assets.webp)

① Thêm tài sản · ② Bộ lọc: loại, vị trí và trạng thái · ③ Một tài sản — nhấn để mở

Dùng bộ lọc ② để chỉ hiện một loại (ví dụ *Chiller*), một vị trí hoặc một trạng thái: **Đang sử dụng**, **Đã ngừng / thanh lý** hoặc **Tất cả**.

## Thêm tài sản {#adding-an-asset}

![Thêm tài sản](/help/screens/asset-new.webp)

1. Nhấn **Thêm tài sản**.
2. Nhập **Tên** bằng tiếng Anh (và có thể thêm Tiếng Việt).
3. Chọn **Loại tài sản**. Nếu loại chưa có trong danh sách, nhập tên mới và chọn **Khác — tạo loại mới**.
4. Chọn **Vị trí** (phòng và khu vực lấy từ [Vị trí](/help/guide/facilities)).
5. Điền **Số sê-ri**, **Hạn bảo hành**, **Nhà sản xuất** và **Kiểu máy** nếu bạn biết.
6. Nhấn **Tạo tài sản**.

> **Mẹo:** Hãy nhập ngày hết bảo hành. Khi đó, báo cáo và quy trình có thể nhắc bạn trước khi hết hạn.

## Trang tài sản {#the-asset-page}

![Chi tiết tài sản](/help/screens/asset-detail.webp)

① Tên và loại · ② Báo cáo sự cố · ③ Sửa / Xóa · ④ Các tab · ⑤ Chi tiết và thông số kỹ thuật

Tab **Chi tiết** hiển thị loại, vị trí, số sê-ri, bảo hành, nhà sản xuất, kiểu máy, ngày mua và giá mua, cùng **Thông số kỹ thuật** (ví dụ *Capacity 350 RT*, *Refrigerant R134a*).

Các tab khác:

- **Lịch sử** — mọi yêu cầu và lệnh công việc liên quan đến tài sản này, mới nhất ở trên.

  ![Tab Lịch sử](/help/screens/asset-history.webp)

- **Đồng hồ** — số giờ chạy, số chuyến, số km… Xem [Đồng hồ](#meters-and-readings).
- **Tài liệu** — sách hướng dẫn, chứng chỉ và báo cáo gắn với tài sản này. Chọn một tài liệu trong **Đính kèm tài liệu có sẵn**.
- **Mã QR** — xem [Mã QR](#qr-codes-on-equipment).

## Báo sự cố trên một tài sản {#reporting-a-fault-on-an-asset}

1. Mở tài sản.
2. Nhấn **Báo cáo sự cố** ②. Biểu mẫu báo sự cố mở ra, đã điền sẵn tài sản và vị trí.
3. Tiếp tục với [Lệnh công việc → Bước 1](/help/guide/work-orders#step-1-a-fault-is-reported).

## Đồng hồ và chỉ số {#meters-and-readings}

![Tab Đồng hồ](/help/screens/asset-meters.webp)

Đồng hồ đếm mức sử dụng, chẳng hạn số giờ chạy của máy phát điện. Đồng hồ có thể kích hoạt [bảo trì theo chỉ số đồng hồ](/help/guide/preventive-maintenance#meter-based-schedules).

1. Mở tài sản và nhấn tab **Đồng hồ**.
2. Nhấn **Thêm đồng hồ**. Nhập tên và đơn vị (VD: *h*, *km*, *chuyến*).
3. Để ghi chỉ số, nhập **Giá trị** và nhấn **Ghi chỉ số**. Giá trị mới nhất và lịch sử chỉ số được hiển thị.

> **Lưu ý:** Thiết bị IoT có thể tự động gửi chỉ số đồng hồ. Xem [IoT](/help/guide/iot).

## Mã QR trên thiết bị {#qr-codes-on-equipment}

![Tab Mã QR](/help/screens/asset-qr.webp)

1. Mở tài sản và nhấn **Mã QR**.
2. In mã và dán lên thiết bị.
3. Khi **nhân viên** quét mã, trang tài sản sẽ mở ra. Khi **người khác** quét, biểu mẫu báo sự cố sẽ mở ra với tài sản này đã được chọn sẵn. Biểu mẫu đó chỉ hoạt động khi đã bật báo sự cố công khai ([Cài đặt → Quy trình](/help/guide/settings#workflows-automation)).

## Sửa, ngừng sử dụng hoặc xóa tài sản {#editing-retiring-or-deleting-an-asset}

- Nhấn **Sửa** ③ để thay đổi bất kỳ trường nào, kể cả **Trạng thái**: *Đang hoạt động*, *Ngừng sử dụng tạm thời*, *Đã ngừng sử dụng* hoặc *Đã thanh lý*.
- Nên chuyển sang ngừng sử dụng thay vì xóa: lịch sử của tài sản vẫn được giữ lại.
- **Xóa** sẽ yêu cầu xác nhận và không thể hoàn tác.
