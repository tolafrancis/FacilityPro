**Kho phụ tùng** theo dõi phụ tùng thay thế và vật tư tiêu hao của bạn: còn bao nhiêu, được dùng ở đâu và khi nào cần đặt thêm. **Mua sắm** (trong mục Tài chính) giúp bạn đi từ yêu cầu báo giá đến khi phụ tùng về kho.

**Ai có thể dùng:** Mọi nhân viên đều xem được tồn kho, và kỹ thuật viên ghi nhận phụ tùng trên lệnh công việc. Quản trị viên và Quản lý thêm phụ tùng, nhập kho và quản lý mua sắm.

**Tìm ở đâu:** Menu → **Phụ tùng** và **Tài chính**.

## Danh sách phụ tùng {#the-parts-list}

![Phụ tùng & kho](/help/screens/parts.webp)

① Phụ tùng mới · ② Bộ lọc danh mục · ③ Sắp hết · ④ Số lượng cần nhập · ⑤ Nhập thêm · ⑥ Lịch sử giao dịch

Mỗi dòng hiển thị phụ tùng, nhà cung cấp và danh mục, **Mã SKU**, **Tồn kho**, **Mức đặt lại** và **Đơn giá**. Phụ tùng có tồn kho bằng hoặc thấp hơn mức đặt lại sẽ hiện **Sắp hết** ③.

## Thêm phụ tùng {#adding-a-part}

1. Nhấn **Phụ tùng mới** ①.
2. Nhập **Tên**, **Mã SKU (tùy chọn)** và **Đơn vị** (vd: *cái*, *L*, *kg*).
3. Nhập **Tồn kho ban đầu**, **Mức đặt lại** và **Đơn giá**.
4. Chọn **Danh mục** (hoặc **Tạo danh mục mới**) và **Nhà cung cấp ưu tiên**.
5. Lưu.

## Nhập kho {#restocking}

1. Tìm phụ tùng.
2. Nhập số lượng đã nhận vào ô ④.
3. Nhấn **Nhập thêm** ⑤. Tồn kho tăng lên và một dòng *Nhập kho* được thêm vào lịch sử.

## Dùng phụ tùng trên lệnh công việc {#using-parts-on-a-work-order}

Kỹ thuật viên ghi nhận phụ tùng trên lệnh công việc trong mục **Phụ tùng đã dùng** ([Lệnh công việc → Bước 4](/help/guide/work-orders#step-4-doing-the-work-technician)). Tồn kho giảm ngay lập tức và chi phí phụ tùng được cộng vào công việc.

Với bảo trì có kế hoạch, **Phụ tùng cần dùng** của lịch bảo trì sẽ hiện thành **Phụ tùng gợi ý** trên lệnh công việc; nhấn **Dùng** để điền sẵn.

## Lịch sử giao dịch {#transaction-history}

![Lịch sử giao dịch](/help/screens/parts-history.webp)

Nhấn mũi tên ⑥ trên một dòng để xem mọi biến động tồn kho: **Xuất kho** (dùng cho lệnh công việc), **Nhập kho**, **Điều chỉnh** và **Kiểm kê**, kèm ngày và số lượng.

> **Mẹo:** Thiết lập quy trình *Số lượng phụ tùng* để gửi email cho thủ kho khi một phụ tùng sắp hết ([Quy trình](/help/guide/settings#workflows-automation)).

## Đơn đặt hàng {#purchase-orders}

![Mua sắm](/help/screens/financial.webp)

① Ngân sách, chi tiêu đã cam kết và đơn đặt hàng đang mở · ② PO mới · ③ Số PO · ④ Trạng thái

Đơn đặt hàng (PO) nằm trong **Tài chính → Mua sắm**. Mỗi đơn đi qua các bước **RFQ** (yêu cầu báo giá) → **PO** → **Đã duyệt** → **Đã nhận**.

1. Nhấn **PO mới** ②. Nhập tiêu đề, chọn nhà cung cấp và trung tâm chi phí, rồi thêm các dòng (phụ tùng hoặc mô tả, số lượng, đơn giá).
2. Lưu. Số đơn như *PO-2026-0102* được cấp khi phiếu trở thành đơn đặt hàng ③.
3. Mở đơn và chuyển sang bước tiếp theo khi đã có báo giá, đã đặt hàng và đã được duyệt.
4. Khi hàng về, ghi nhận **phiếu nhận hàng**, với số lượng nhận được cho từng dòng. Tồn kho phụ tùng tự động tăng lên.

![Một đơn đặt hàng](/help/screens/financial-po.webp)

> **Lưu ý:** Hóa đơn và khoản thanh toán cũng được ghi nhận trong mục Tài chính. Xem [Báo cáo → Tài chính](/help/guide/reports#financial-overview).
