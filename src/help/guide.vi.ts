import type { Role } from '../lib/database.types';
import gettingStarted from './content/vi/getting-started.md?raw';
import dashboard from './content/vi/dashboard.md?raw';
import facilities from './content/vi/facilities.md?raw';
import assets from './content/vi/assets.md?raw';
import preventiveMaintenance from './content/vi/preventive-maintenance.md?raw';
import workOrders from './content/vi/work-orders.md?raw';
import techniciansTeams from './content/vi/technicians-teams.md?raw';
import vendors from './content/vi/vendors.md?raw';
import inventory from './content/vi/inventory.md?raw';
import iot from './content/vi/iot.md?raw';
import notifications from './content/vi/notifications.md?raw';
import reports from './content/vi/reports.md?raw';
import userManagement from './content/vi/user-management.md?raw';
import settings from './content/vi/settings.md?raw';
import qsOrgAdmin from './content/vi/qs-org_admin.md?raw';
import qsManager from './content/vi/qs-manager.md?raw';
import qsTechnician from './content/vi/qs-technician.md?raw';
import qsOccupant from './content/vi/qs-occupant.md?raw';
import qsVendor from './content/vi/qs-vendor.md?raw';
import knownIssues from './content/vi/known-issues.md?raw';

// Vietnamese User guide (src/help/content/vi). Headings carry {#id} with the
// English anchor, so links and search results work in both languages.

type Text = { title: string; summary: string; body: string };

export const GUIDE_VI: Record<string, Text> = {
  'getting-started': { title: 'Bắt đầu', summary: 'Đăng nhập, thiết lập tổ chức và làm quen với ứng dụng.', body: gettingStarted },
  dashboard: { title: 'Bảng điều khiển', summary: 'Số liệu chính, biểu đồ, hoạt động gần đây và menu Tạo mới.', body: dashboard },
  facilities: { title: 'Cơ sở & vị trí', summary: 'Cơ sở, tòa nhà, tầng, phòng và khu vực; đặt bàn và phòng.', body: facilities },
  assets: { title: 'Quản lý tài sản', summary: 'Danh sách tài sản, thông số, đồng hồ, tài liệu và mã QR.', body: assets },
  'preventive-maintenance': { title: 'Bảo trì phòng ngừa', summary: 'Lịch định kỳ, kế hoạch theo chỉ số, bộ phụ tùng và danh sách kiểm tra.', body: preventiveMaintenance },
  'work-orders': { title: 'Lệnh công việc', summary: 'Từ sự cố được báo đến công việc hoàn tất: toàn bộ quy trình.', body: workOrders },
  'technicians-teams': { title: 'Kỹ thuật viên & nhóm', summary: 'Công việc của tôi, hồ sơ, phân việc cho nhóm, quyền truy cập cơ sở và chấm công.', body: techniciansTeams },
  vendors: { title: 'Nhà cung cấp & hợp đồng', summary: 'Nhà thầu, hợp đồng, giấy phép, giấy phép làm việc và tài liệu.', body: vendors },
  inventory: { title: 'Kho & mua hàng', summary: 'Phụ tùng, mức tồn kho, bổ sung hàng và đơn mua hàng.', body: inventory },
  iot: { title: 'IoT & cảm biến', summary: 'Thiết bị, số đo trực tiếp, lịch sử, cảnh báo và quy tắc ngưỡng.', body: iot },
  notifications: { title: 'Thông báo & liên lạc', summary: 'Chuông thông báo, email/SMS/đẩy, Hộp thư, thông báo chung và khảo sát.', body: notifications },
  reports: { title: 'Báo cáo & tài chính', summary: 'Chỉ số, chi phí và chi tiêu, xuất CSV và nhật ký hoạt động.', body: reports },
  'user-management': { title: 'Quản lý người dùng', summary: 'Vai trò, mời thành viên, liên kết tham gia, quyền truy cập cơ sở và 2FA.', body: userManagement },
  settings: { title: 'Cài đặt & tự động hóa', summary: 'Chung, danh mục, SLA, màn hình TV, tích hợp, quy trình và thanh toán.', body: settings },
};

export const QUICK_STARTS_VI: Partial<Record<Role, Text>> = {
  org_admin: { title: 'Quản trị viên', summary: 'Thiết lập tổ chức trong giờ đầu tiên.', body: qsOrgAdmin },
  manager: { title: 'Quản lý', summary: 'Công việc hằng ngày và hằng tuần.', body: qsManager },
  technician: { title: 'Kỹ thuật viên', summary: 'Từ “được giao” đến “đã xử lý”, từng bước một.', body: qsTechnician },
  occupant: { title: 'Cư dân (người thuê)', summary: 'Báo sự cố và theo dõi xử lý.', body: qsOccupant },
  vendor: { title: 'Nhà cung cấp (nhà thầu)', summary: 'Xem và ghi nhận các công việc bạn thực hiện.', body: qsVendor },
};

export const KNOWN_ISSUES_VI = knownIssues;
