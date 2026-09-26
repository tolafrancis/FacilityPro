import type { PageHelpText } from './pageHelp';

// Vietnamese "? Help" panel text: one entry per PAGE_HELP entry, in the same order (see pageHelpData.ts).
export const PAGE_HELP_VI: PageHelpText[] = [
  // Home (occupant)
  {
    title: 'Trang chủ',
    what: 'Nơi bắt đầu của bạn: báo sự cố trong tòa nhà và theo dõi tiến độ các yêu cầu của bạn.',
    canDo: ['Báo sự cố kèm ảnh', 'Xem các yêu cầu mới nhất và trạng thái của chúng', 'Đọc thông báo từ ban quản lý tòa nhà'],
    fields: [['Báo sự cố', 'Mở biểu mẫu báo sự cố.'], ['Yêu cầu của tôi', 'Mọi sự cố bạn đã báo, mới nhất trước.'], ['Thông báo', 'Tin tức như lịch cắt nước hoặc cắt điện theo kế hoạch.']],
  },
  // Dashboard
  {
    title: 'Bảng điều khiển',
    what: 'Tổng quan toàn bộ công việc bảo trì: khối lượng, việc quá hạn, xu hướng trong tuần và hoạt động gần nhất.',
    canDo: ['Tạo mọi thứ từ nút Tạo mới', 'Tìm yêu cầu', 'Mở các yêu cầu gần đây', 'Hoàn tất Việc cần làm để thiết lập'],
    fields: [['Số công việc', 'Tất cả lệnh công việc.'], ['Công việc đang chờ', 'Lệnh công việc chưa được xử lý.'], ['Số tài sản', 'Tài sản đang sử dụng.'], ['Công việc hoàn thành gần đây', 'Công việc đã xong trong 30 ngày qua.'], ['Trong tuần', 'Số sự cố được báo so với đã xử lý mỗi ngày, trong 7 ngày qua.'], ['Danh mục', 'Sự cố theo loại, trong 30 ngày qua.']],
    tip: 'Dải màu đỏ phía trên các con số nghĩa là có công việc đã quá hạn.',
  },
  // Report a fault
  {
    title: 'Báo cáo sự cố',
    what: 'Cho đội bảo trì biết điều gì đang hỏng và ở đâu.',
    canDo: ['Mô tả sự cố', 'Chọn vị trí và thiết bị liên quan', 'Đính kèm ảnh'],
    fields: [['Tóm tắt', 'Tiêu đề ngắn, ví dụ “Bồn rửa pantry bị rò nước”.'], ['Loại sự cố', 'Loại vấn đề; quyết định mức ưu tiên mặc định.'], ['Mức độ nghiêm trọng', 'Mức độ nghiêm trọng: Thấp, Trung bình, Cao hoặc Nghiêm trọng.'], ['Vị trí', 'Phòng hoặc khu vực.'], ['Tài sản', 'Thiết bị liên quan, nếu bạn biết (nhân viên).'], ['Mô tả', 'Bất cứ thông tin nào giúp ích cho kỹ thuật viên.'], ['Ảnh', 'Không bắt buộc nhưng rất hữu ích.']],
  },
  // Your request (occupant)
  {
    title: 'Yêu cầu của bạn',
    what: 'Chi tiết và trạng thái hiện tại của sự cố bạn đã báo.',
    canDo: ['Kiểm tra trạng thái', 'Xem lại nội dung bạn đã báo'],
    fields: [['Trạng thái', 'Mới → Đã phân công → Đang xử lý → Đã xử lý → Đã đóng. Tạm dừng nghĩa là đang chờ; Từ chối nghĩa là đây không phải việc bảo trì.']],
  },
  // Request details
  {
    title: 'Chi tiết yêu cầu',
    what: 'Một sự cố được báo: nội dung, vị trí, người báo và kênh gửi đến.',
    canDo: ['Tạo lệnh công việc từ yêu cầu này', 'Đổi trạng thái (ví dụ Từ chối)', 'Mở lệnh công việc liên kết'],
    fields: [['Kênh', 'Cách yêu cầu được gửi đến: web, mã QR, email, Zalo…'], ['Báo cáo bằng', 'Ngôn ngữ dùng để viết yêu cầu.'], ['Lệnh công việc liên kết', 'Công việc được tạo từ yêu cầu này.']],
  },
  // Requests
  {
    title: 'Yêu cầu',
    what: 'Mọi sự cố và yêu cầu dịch vụ đã được báo, mới nhất trước.',
    canDo: ['Báo sự cố mới', 'Tìm theo tiêu đề hoặc mô tả', 'Lọc theo trạng thái và vị trí', 'Mở một yêu cầu'],
    fields: [['Trạng thái', 'Mới, Đã phân loại, Đã phân công, Đang xử lý, Tạm dừng, Đã xử lý, Đã đóng hoặc Từ chối.'], ['Loại sự cố', 'Loại được chọn khi báo sự cố.']],
  },
  // Work order
  {
    title: 'Lệnh công việc',
    what: 'Một công việc bảo trì từ đầu đến cuối: ai làm, hạn khi nào, danh sách kiểm tra, phụ tùng, nhân công, ảnh và kết quả.',
    canDo: ['Chuyển sang trạng thái tiếp theo', 'Giao cho kỹ thuật viên hoặc nhà thầu', 'Điền danh sách kiểm tra', 'Ghi nhận phụ tùng và nhân công', 'Thêm ảnh trước/sau', 'Yêu cầu phê duyệt', 'In phiếu công việc'],
    fields: [['Trạng thái', 'Chỉ hiện các bước tiếp theo được phép. Quản lý nghiệm thu, đóng và mở lại.'], ['Người phụ trách', 'Kỹ thuật viên chịu trách nhiệm; khi giao việc, trạng thái chuyển thành Đã phân công.'], ['Nhà thầu', 'Nhà thầu bên ngoài, hoặc Nội bộ.'], ['Hạn hoàn thành', 'Được đặt theo mục tiêu SLA của mức ưu tiên.'], ['Chi phí', 'Nhân công cộng phụ tùng, tự động cập nhật.'], ['Nguyên nhân hỏng / Mã hoàn thành', 'Cần có trước khi đánh dấu đã xử lý.'], ['Thời gian ngừng hoạt động (phút)', 'Thiết bị đã ngừng sử dụng trong bao lâu.']],
    tip: 'Để đánh dấu đã xử lý, cần có mã hoàn thành và mọi mục bắt buộc trong danh sách kiểm tra đã xong.',
  },
  // Work orders
  {
    title: 'Lệnh công việc',
    what: 'Tất cả công việc bảo trì, kèm người phụ trách, mức ưu tiên, trạng thái và hạn.',
    canDo: ['Tìm theo tiêu đề hoặc hướng dẫn', 'Lọc theo trạng thái, vị trí, người phụ trách và mức ưu tiên', 'Mở một công việc', 'Thiết lập màn hình TV'],
    fields: [['Mở (chưa phân công)', 'Chưa giao cho ai.'], ['Hạn', 'Thời điểm phải xử lý xong (theo mục tiêu SLA).']],
  },
  // My work
  {
    title: 'Công việc của tôi',
    what: 'Các lệnh công việc được giao cho bạn.',
    canDo: ['Mở một công việc và bắt đầu làm', 'Ghi nhận phụ tùng, nhân công, danh sách kiểm tra và ảnh', 'Đánh dấu đã xử lý khi xong'],
    fields: [['Ưu tiên', 'Khẩn cấp và Cao được xếp trước.'], ['Trạng thái', 'Đã phân công, Đang xử lý, Tạm dừng…'], ['Hạn', 'Thời điểm phải hoàn thành.']],
    tip: 'Mất sóng? Cứ tiếp tục làm — thay đổi sẽ được gửi khi bạn có mạng trở lại.',
  },
  // Preventive maintenance
  {
    title: 'Bảo trì phòng ngừa',
    what: 'Công việc định kỳ theo kế hoạch. Mỗi lịch tự động tạo lệnh công việc khi đến hạn.',
    canDo: ['Tạo lịch theo lịch ngày hoặc theo đồng hồ', 'Tạo ngay các công việc đến hạn', 'Tạm dừng hoặc tiếp tục một lịch', 'Đặt bộ phụ tùng cần dùng'],
    fields: [['Mỗi N ngày / đơn vị', 'Tần suất lặp lại công việc.'], ['Hạn tiếp theo', 'Thời điểm lệnh công việc tiếp theo đến hạn.'], ['Tạo trước bao nhiêu ngày', 'Thời gian chuẩn bị: lệnh công việc được tạo trước hạn bấy nhiêu ngày.'], ['Phụ tùng cần dùng', 'Phụ tùng được gợi ý trên mỗi lệnh công việc được tạo.']],
  },
  // Checklists
  {
    title: 'Danh sách kiểm tra',
    what: 'Mẫu kiểm tra dùng lại được trên lệnh công việc và lịch bảo trì.',
    canDo: ['Tạo danh sách kiểm tra', 'Thêm mục Đạt / Không đạt, Giá trị, Hình ảnh và Ghi chú', 'Đánh dấu mục bắt buộc'],
    fields: [['Loại', 'Đạt / Không đạt, Giá trị (một con số), Hình ảnh hoặc Ghi chú.'], ['Bắt buộc', 'Phải hoàn thành trước khi lệnh công việc được đánh dấu đã xử lý.']],
  },
  // Asset
  {
    title: 'Tài sản',
    what: 'Mọi thông tin về một thiết bị: chi tiết, thông số, lịch sử sửa chữa, đồng hồ, tài liệu và mã QR.',
    canDo: ['Báo sự cố cho tài sản này', 'Sửa hoặc ngừng sử dụng (quản lý)', 'Thêm đồng hồ và ghi chỉ số', 'Đính kèm tài liệu', 'In mã QR'],
    fields: [['Bảo hành đến', 'Ngày hết bảo hành của nhà sản xuất.'], ['Thông số kỹ thuật', 'Dữ liệu kỹ thuật như công suất và môi chất lạnh.'], ['Lịch sử', 'Mọi yêu cầu và lệnh công việc của tài sản này.'], ['Mã QR', 'Nhân viên quét mã sẽ mở trang này; người khác có thể báo sự cố.']],
  },
  // Assets
  {
    title: 'Tài sản',
    what: 'Danh sách tất cả thiết bị bạn bảo trì.',
    canDo: ['Thêm tài sản', 'Lọc theo loại, vị trí và trạng thái', 'Mở một tài sản'],
    fields: [['Trạng thái', 'Đang sử dụng, hoặc Đã ngừng / thanh lý.'], ['Số sê-ri', 'Số sê-ri của nhà sản xuất.']],
  },
  // Parts & inventory
  {
    title: 'Phụ tùng & kho',
    what: 'Phụ tùng thay thế và vật tư tiêu hao cùng mức tồn kho.',
    canDo: ['Thêm phụ tùng', 'Nhập thêm', 'Lọc theo danh mục', 'Xem lịch sử giao dịch của từng phụ tùng'],
    fields: [['Tồn kho', 'Số lượng hiện có.'], ['Mức đặt lại', 'Khi bằng hoặc thấp hơn mức này, phụ tùng hiện Sắp hết.'], ['Đơn giá', 'Dùng để tính chi phí phụ tùng trên lệnh công việc.']],
  },
  // Vendors & contracts
  {
    title: 'Nhà cung cấp & hợp đồng',
    what: 'Nhà thầu và nhà cung cấp, hợp đồng của họ, cùng giấy phép và chứng chỉ của bạn kèm theo dõi hết hạn.',
    canDo: ['Thêm nhà cung cấp', 'Thêm hợp đồng kèm nhắc nhở', 'Thêm giấy phép và chứng chỉ'],
    fields: [['Sắp hết hạn', 'Đang trong thời gian nhắc nhở.'], ['Đã hết hạn', 'Đã qua ngày hết hạn.'], ['Đường dẫn tài liệu', 'Liên kết đến tài liệu đã ký.']],
  },
  // Locations
  {
    title: 'Vị trí',
    what: 'Cây vị trí: khu vực → tòa nhà → tầng → phòng/khu. Mọi dữ liệu khác đều gắn với các vị trí này.',
    canDo: ['Thêm khu vực', 'Thêm tòa nhà, tầng, phòng và khu', 'Đổi tên hoặc xóa'],
    fields: [['Phòng', 'Không gian kín, ví dụ phòng máy.'], ['Khu', 'Khu vực mở, ví dụ sảnh hoặc bãi đỗ xe.']],
  },
  // Workflows
  {
    title: 'Quy trình',
    what: 'Tự động hóa: điều phối và giao việc, gửi nhắc nhở, email và khảo sát, và chuyển yêu cầu thành lệnh công việc.',
    canDo: ['Cho phép báo cáo sự cố công khai', 'Tự động tạo lệnh công việc', 'Tạo quy trình từ một điều kiện kích hoạt và các hành động', 'Tắt hoặc xóa một quy trình'],
    fields: [['Kích hoạt', 'Sự kiện khởi động quy trình, ví dụ Work Order Created (lệnh công việc được tạo).'], ['Cài đặt kích hoạt', 'Thu hẹp điều kiện, ví dụ loại sự cố, mức ưu tiên hoặc số phút đang chờ.'], ['Thời gian chờ', 'Khoảng cách tối thiểu giữa hai lần chạy.'], ['Hành động', 'Việc sẽ xảy ra, ví dụ Assign To (giao cho) hoặc Send Email (gửi email).']],
  },
  // Approvals
  {
    title: 'Phê duyệt',
    what: 'Các lệnh công việc đang chờ quyết định.',
    canDo: ['Phê duyệt', 'Từ chối'],
    fields: [['Yêu cầu bởi', 'Người đề nghị phê duyệt, kèm ghi chú của họ.']],
    tip: 'Phê duyệt chỉ ghi lại quyết định; nó không khóa lệnh công việc.',
  },
  // Inbox
  {
    title: 'Hộp thư',
    what: 'Hội thoại với cư dân và liên hệ qua Zalo, WhatsApp, LINE, email và web.',
    canDo: ['Đọc và trả lời', 'Chuyển tin nhắn thành lệnh công việc', 'Bắt đầu hội thoại mới'],
    fields: [['Trạng thái gửi', 'đang gửi…, đã gửi, đã nhận, đã xem hoặc Chưa gửi được.']],
  },
  // Device
  {
    title: 'Thiết bị',
    what: 'Một cảm biến hoặc đồng hồ: số liệu trực tiếp, lịch sử, cảnh báo, quy tắc và kết nối.',
    canDo: ['Vẽ biểu đồ bất kỳ số liệu nào theo thời gian', 'Xác nhận và xử lý cảnh báo', 'Thêm quy tắc ngưỡng (quản lý)', 'Gửi lệnh điều khiển', 'Đổi khóa thiết bị (quản lý)'],
    fields: [['Dữ liệu trực tiếp', 'Giá trị mới nhất của từng số liệu; nếu bị cũ nghĩa là thiết bị chưa gửi dữ liệu gần đây.'], ['Quy tắc', 'Các ngưỡng tạo cảnh báo hoặc tạo lệnh công việc.'], ['Kết nối', 'Khóa thiết bị và địa chỉ kết nối — cần giữ bí mật.']],
  },
  // Devices
  {
    title: 'Thiết bị',
    what: 'Tất cả cảm biến, đồng hồ và gateway đã kết nối, cùng các cảnh báo của chúng.',
    canDo: ['Thêm thiết bị', 'Lọc theo tòa nhà, nhóm, nhà sản xuất, giao thức', 'Xem tất cả cảnh báo đang mở'],
    fields: [['Trực tuyến / Mất kết nối', 'Thiết bị có gửi dữ liệu gần đây hay không.'], ['Cảnh báo / Nghiêm trọng', 'Các thiết bị có cảnh báo đang mở ở mức độ đó.']],
  },
  // Desks
  {
    title: 'Bàn làm việc',
    what: 'Các bàn làm việc linh hoạt có thể đặt chỗ, nhóm theo khu.',
    canDo: ['Thêm bàn', 'Đặt bàn cho một ngày', 'Xem các lượt đặt gần đây'],
    fields: [['Khu', 'Khu vực đặt bàn (lấy từ Vị trí).']],
  },
  // Facilities
  {
    title: 'Cơ sở vật chất',
    what: 'Tiện ích dùng chung như phòng họp, phòng gym hoặc khu BBQ, cùng các lượt đặt.',
    canDo: ['Thêm tiện ích', 'Đặt tiện ích cho một ngày', 'Xem các lượt đặt gần đây'],
    fields: [['Số chỗ', 'Sức chứa tối đa.']],
  },
  // Reports
  {
    title: 'Báo cáo',
    what: 'Chỉ số vận hành và chi phí, xuất dữ liệu và nhật ký hoạt động.',
    canDo: ['Lọc theo ngày, vị trí, kỹ thuật viên và mức ưu tiên', 'Xuất yêu cầu hoặc lệnh công việc ra CSV', 'Xem ai đã thay đổi gì'],
    fields: [['TB xử lý (giờ)', 'Số giờ trung bình từ lúc tạo đến lúc xử lý xong.'], ['Bảo trì hoàn thành đúng hạn', 'Tỷ lệ công việc theo kế hoạch hoàn thành trước hạn.'], ['Bảo trì có kế hoạch so với đột xuất', 'Tỷ lệ chi phí thuộc công việc theo kế hoạch.'], ['Thời gian trung bình giữa các lần hỏng', 'Số ngày trung bình giữa hai lần hỏng hóc.']],
  },
  // Financial operations
  {
    title: 'Vận hành tài chính',
    what: 'Mua hàng, ngân sách, chi tiêu, thanh toán, đơn giá, khách hàng và trung tâm chi phí.',
    canDo: ['Tạo và nhận đơn mua hàng', 'Ghi nhận chi tiêu và thanh toán', 'Đặt ngân sách và trung tâm chi phí'],
    fields: [['Chi tiêu đã cam kết', 'Số tiền đã cam kết trên đơn mua hàng và các khoản chi.'], ['Trạng thái PO', 'RFQ → PO → Đã duyệt → Đã nhận.'], ['Trung tâm chi phí', 'Tòa nhà hoặc ngân sách mà khoản chi thuộc về.']],
  },
  // Documents
  {
    title: 'Tài liệu',
    what: 'Sổ tay hướng dẫn, quy trình vận hành chuẩn (SOP), chứng chỉ và báo cáo ở cùng một nơi.',
    canDo: ['Thêm liên kết hoặc tải tệp lên', 'Liên kết với tài sản, nhà cung cấp hoặc lệnh công việc', 'Chọn ai được xem'],
    fields: [['Ai được xem', 'Chỉ nhân viên, hoặc mọi người kể cả cư dân.']],
  },
  // Permits to work
  {
    title: 'Giấy phép làm việc',
    what: 'Phê duyệt cho công việc có rủi ro trước khi bắt đầu.',
    canDo: ['Tạo giấy phép', 'Đặt trạng thái', 'Xem tất cả giấy phép'],
    fields: [['Trạng thái', 'Nháp, Đã gửi, Đã duyệt hoặc Từ chối.'], ['Ghi chú', 'Nội dung công việc, mối nguy và biện pháp an toàn.']],
    tip: 'Chỉ bắt đầu làm khi giấy phép đã được duyệt.',
  },
  // Technician attendance
  {
    title: 'Chấm công',
    what: 'Nhật ký vào ca và ra ca để giám sát biết ai đang có mặt tại công trường.',
    canDo: ['Ghi nhận vào ca hoặc ra ca', 'Xem các lượt ghi mới nhất'],
    fields: [['Hành động', 'Đã vào ca hoặc Đã ra ca.'], ['Khu vực / vị trí', 'Nơi kỹ thuật viên đang có mặt.']],
  },
  // Tenant experience
  {
    title: 'Trải nghiệm khách thuê',
    what: 'Thông báo hiển thị trên trang chủ của mọi cư dân.',
    canDo: ['Đăng thông báo mới', 'Xem các thông báo trước đây'],
    fields: [['Đối tượng', 'Chỉ là nhãn; thông báo đã đăng được gửi đến tất cả cư dân.'], ['Nháp', 'Chưa hiển thị cho cư dân.']],
  },
  // Surveys
  {
    title: 'Khảo sát',
    what: 'Bảng câu hỏi lấy ý kiến cư dân.',
    canDo: ['Tạo khảo sát', 'Bật hoặc tắt khảo sát', 'Gửi khảo sát bằng quy trình'],
    fields: [],
  },
  // Security
  {
    title: 'Bảo mật',
    what: 'Bảo vệ tài khoản và chọn cách bạn nhận thông báo.',
    canDo: ['Bật xác thực hai lớp', 'Bật hoặc tắt thông báo qua email, SMS hoặc thông báo đẩy'],
    fields: [['Xác thực hai lớp', 'Yêu cầu nhập mã từ ứng dụng xác thực khi đăng nhập.'], ['Số di động', 'Nhập kèm mã quốc gia, ví dụ +84…']],
  },
  // Settings
  {
    title: 'Cài đặt',
    what: 'Cách FacilityPro hoạt động cho tổ chức của bạn.',
    canDo: ['Chung: tên, ngôn ngữ, múi giờ, tiền tệ', 'Danh mục: loại sự cố và loại tài sản', 'SLA: mục tiêu thời gian xử lý', 'Đội ngũ & vai trò: thành viên và lời mời', 'Màn hình TV', 'Tích hợp'],
    fields: [['Múi giờ', 'Dùng cho hạn hoàn thành và lịch.'], ['Tiền tệ', 'Mã ba chữ cái, ví dụ VND.'], ['Số giờ xử lý', 'Đặt hạn hoàn thành cho mỗi lệnh công việc mới theo mức ưu tiên.']],
  },
  // Billing
  {
    title: 'Thanh toán',
    what: 'Gói FacilityPro, mức sử dụng và thanh toán của bạn.',
    canDo: ['Xem gói và giới hạn của bạn', 'Nâng cấp hoặc quản lý thanh toán'],
    fields: [],
  },
  // Help Center
  {
    title: 'Trung tâm trợ giúp',
    what: 'Hướng dẫn từng bước kèm ảnh chụp màn hình, danh mục tính năng có thể tìm kiếm và hướng dẫn nhanh cho từng vai trò.',
    canDo: ['Tìm trong toàn bộ trợ giúp', 'Đọc một phần hướng dẫn', 'Duyệt danh mục tính năng', 'Xem hướng dẫn nhanh'],
    fields: [],
  },
];
