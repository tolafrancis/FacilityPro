// Builds the downloadable brochures: public/brochure/FacilityPro-brochure-{en,vi}.pdf
// (linked from the home page, the footer and /resources/brochure).
//
// Usage: npm i --no-save playwright-core && node scripts/brochure/build.mjs
// Set CHROMIUM_PATH if Chromium isn't found automatically.
// Only describe what FacilityPro actually does (same rule as src/marketing/content.ts).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');

const T = {
  en: {
    tagline: 'Maintenance, requests and assets in one place',
    title: 'Run every site from one reliable command centre.',
    lead: 'FacilityPro brings fault reporting, work orders, preventive maintenance, assets and costs into one system that technicians, managers, occupants and vendors all use, on the web and on the phone, in English and Vietnamese.',
    whyTitle: 'Why teams choose FacilityPro',
    why: [
      ['Nothing slips through', 'Every request lands in one list with an owner, a priority and a response target.'],
      ['Planned, not reactive', 'Preventive schedules by calendar or meter create work orders before things break.'],
      ['Clear numbers', 'Response times, overdue work, PM completion and cost per site, ready without spreadsheets.'],
    ],
    featuresTitle: 'Everything your facilities team runs on',
    groups: [
      ['Work & maintenance', ['Issue reporting and QR codes', 'Work orders and checklists', 'Preventive maintenance', 'Permits to work and approvals']],
      ['Assets & inventory', ['Asset register and history', 'Meters and readings', 'Parts and stock', 'Vendors, contracts and documents']],
      ['Occupant services', ['Tenant portal', 'Room, facility and desk booking', 'Surveys and broadcasts', 'Multi-channel inbox']],
      ['Spend & budgets', ['Budgets and expenditure', 'Procurement', 'Vendor invoices', 'Cost tracking']],
      ['Insights & connections', ['Reports and dashboards', 'TV display boards', 'IoT sensors and alerts', 'Integrations']],
      ['AI & automation', ['No-code workflows', 'Scheduled automation', 'Smart assistant', 'Sentiment scoring']],
    ],
    howTitle: 'How it works',
    how: [
      ['Report', 'Occupants scan a QR code, use the public link, email or Zalo. No app or account needed.'],
      ['Assign', 'Workflows route the job to the right technician or vendor and start the SLA clock.'],
      ['Fix', 'Technicians accept, update and close jobs on their phones, with photos, checklists and permits, even offline.'],
      ['Improve', 'Reports and surveys show what is working, and preventive schedules keep assets healthy.'],
    ],
    builtTitle: 'Built for',
    built: ['Commercial buildings', 'Residential', 'Hotels & hospitality', 'Hospitals & healthcare', 'Education', 'Industrial & manufacturing', 'Retail', 'Government', 'Property & facility management companies'],
    connectTitle: 'Connects with',
    connect: 'Email, Zalo and WhatsApp messaging · web push, email and SMS notifications · MQTT, HTTP, LoRaWAN (The Things Network, ChirpStack) and Modbus sensors.',
    trustTitle: 'Secure and ready to roll out',
    trust: [
      'Each organisation’s data is isolated at the database level',
      'Roles for admins, managers, technicians, occupants and vendors',
      'Two-factor sign-in and a full audit trail',
      'Works on any phone from the browser, including offline',
    ],
    pricingTitle: 'Plans',
    tiers: [
      ['Free', '$0', '3 staff users, 1 site, 25 assets. Requests, work orders, mobile app.'],
      ['Starter', '$29 / mo', '6 staff, 2 sites, 150 assets. Adds preventive maintenance, checklists, parts.'],
      ['Professional', '$49 / mo', '25 staff, 5 sites, 1,000 assets. Adds workflows, SLAs, vendors, inbox.'],
      ['Business', '$99 / mo', '75 staff, 20 sites. Adds budgets, permits, bookings, IoT, SMS.'],
      ['Enterprise', 'Custom', 'Unlimited. Adds Modbus, WhatsApp, custom integrations, dedicated support.'],
    ],
    tiersNote: 'Occupants and vendors are free on every plan. Pay yearly and get 2 months free.',
    ctaTitle: 'Start a free trial or book a demo',
    ctaBody: 'No credit card required. Our team can help you plan your pilot, load your data and train your champions.',
    page: 'Page',
  },
  vi: {
    tagline: 'Bảo trì, yêu cầu và tài sản ở cùng một nơi',
    title: 'Điều hành mọi cơ sở từ một trung tâm đáng tin cậy.',
    lead: 'FacilityPro đưa báo cáo sự cố, phiếu công việc, bảo trì phòng ngừa, tài sản và chi phí vào một hệ thống duy nhất mà kỹ thuật viên, quản lý, cư dân và nhà cung cấp cùng sử dụng, trên web và điện thoại, bằng tiếng Việt và tiếng Anh.',
    whyTitle: 'Vì sao các đội chọn FacilityPro',
    why: [
      ['Không việc nào bị sót', 'Mọi yêu cầu vào một danh sách, có người phụ trách, mức ưu tiên và thời hạn phản hồi.'],
      ['Chủ động thay vì chữa cháy', 'Lịch bảo trì theo thời gian hoặc theo chỉ số tự tạo phiếu công việc trước khi thiết bị hỏng.'],
      ['Số liệu rõ ràng', 'Thời gian phản hồi, việc quá hạn, tỷ lệ hoàn thành bảo trì và chi phí theo cơ sở, không cần bảng tính.'],
    ],
    featuresTitle: 'Mọi thứ đội ngũ cơ sở vật chất cần',
    groups: [
      ['Công việc & bảo trì', ['Báo cáo sự cố và mã QR', 'Phiếu công việc và danh sách kiểm tra', 'Bảo trì phòng ngừa', 'Giấy phép làm việc và phê duyệt']],
      ['Tài sản & kho', ['Sổ tài sản và lịch sử', 'Đồng hồ và chỉ số', 'Phụ tùng và tồn kho', 'Nhà cung cấp, hợp đồng và tài liệu']],
      ['Dịch vụ cư dân', ['Cổng thông tin cư dân', 'Đặt phòng, tiện ích và chỗ ngồi', 'Khảo sát và thông báo chung', 'Hộp thư đa kênh']],
      ['Chi tiêu & ngân sách', ['Ngân sách và chi tiêu', 'Mua sắm', 'Hóa đơn nhà cung cấp', 'Theo dõi chi phí']],
      ['Phân tích & kết nối', ['Báo cáo và bảng điều khiển', 'Bảng hiển thị trên TV', 'Cảm biến IoT và cảnh báo', 'Tích hợp']],
      ['AI & tự động hóa', ['Quy trình không cần lập trình', 'Tự động hóa theo lịch', 'Trợ lý thông minh', 'Chấm điểm cảm xúc']],
    ],
    howTitle: 'Cách hoạt động',
    how: [
      ['Báo cáo', 'Cư dân quét mã QR, dùng đường link công khai, email hoặc Zalo. Không cần cài ứng dụng hay tạo tài khoản.'],
      ['Phân công', 'Quy trình tự động chuyển việc đến đúng kỹ thuật viên hoặc nhà cung cấp và bắt đầu tính thời hạn SLA.'],
      ['Xử lý', 'Kỹ thuật viên nhận, cập nhật và hoàn thành việc trên điện thoại, kèm ảnh, danh sách kiểm tra và giấy phép, kể cả khi không có mạng.'],
      ['Cải thiện', 'Báo cáo và khảo sát cho thấy điều gì hiệu quả, lịch bảo trì phòng ngừa giữ tài sản luôn tốt.'],
    ],
    builtTitle: 'Phù hợp với',
    built: ['Tòa nhà thương mại', 'Nhà ở', 'Khách sạn & lưu trú', 'Bệnh viện & y tế', 'Giáo dục', 'Công nghiệp & sản xuất', 'Bán lẻ', 'Cơ quan nhà nước', 'Công ty quản lý bất động sản & cơ sở vật chất'],
    connectTitle: 'Kết nối với',
    connect: 'Nhắn tin qua email, Zalo và WhatsApp · thông báo đẩy, email và SMS · cảm biến MQTT, HTTP, LoRaWAN (The Things Network, ChirpStack) và Modbus.',
    trustTitle: 'An toàn và sẵn sàng triển khai',
    trust: [
      'Dữ liệu của mỗi tổ chức được tách biệt ở cấp cơ sở dữ liệu',
      'Vai trò cho quản trị viên, quản lý, kỹ thuật viên, cư dân và nhà cung cấp',
      'Đăng nhập hai lớp và nhật ký thay đổi đầy đủ',
      'Dùng trên mọi điện thoại qua trình duyệt, kể cả khi ngoại tuyến',
    ],
    pricingTitle: 'Các gói',
    tiers: [
      ['Miễn phí', '$0', '3 nhân sự, 1 cơ sở, 25 tài sản. Yêu cầu, phiếu công việc, ứng dụng di động.'],
      ['Khởi đầu', '$29 / tháng', '6 nhân sự, 2 cơ sở, 150 tài sản. Thêm bảo trì phòng ngừa, danh sách kiểm tra, phụ tùng.'],
      ['Chuyên nghiệp', '$49 / tháng', '25 nhân sự, 5 cơ sở, 1.000 tài sản. Thêm quy trình, SLA, nhà cung cấp, hộp thư.'],
      ['Doanh nghiệp', '$99 / tháng', '75 nhân sự, 20 cơ sở. Thêm ngân sách, giấy phép, đặt chỗ, IoT, SMS.'],
      ['Doanh nghiệp lớn', 'Liên hệ', 'Không giới hạn. Thêm Modbus, WhatsApp, tích hợp riêng, hỗ trợ riêng.'],
    ],
    tiersNote: 'Cư dân và nhà cung cấp được miễn phí ở mọi gói. Thanh toán theo năm được tặng 2 tháng.',
    ctaTitle: 'Dùng thử miễn phí hoặc đặt lịch demo',
    ctaBody: 'Không cần thẻ tín dụng. Đội ngũ của chúng tôi có thể giúp bạn lên kế hoạch thí điểm, nhập dữ liệu và đào tạo nhân sự nòng cốt.',
    page: 'Trang',
  },
};

const font = (subset, w) =>
  `url(data:font/woff2;base64,${readFileSync(join(here, 'fonts', `be-vietnam-pro-${subset}-${w}-normal.woff2`)).toString('base64')}) format('woff2')`;
const fontFaces = [400, 600, 700].flatMap((w) => [
  `@font-face{font-family:BVP;font-weight:${w};src:${font('latin', w)};unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;}`,
  `@font-face{font-family:BVP;font-weight:${w};src:${font('vietnamese', w)};unicode-range:U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB;}`,
]).join('\n');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function html(lang) {
  const t = T[lang];
  const logo = `<div class="logo"><span class="mark">F</span><span>Facility<b>Pro</b></span></div>`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
${fontFaces}
@page{size:A4;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:BVP,sans-serif;color:#1F2937;font-size:10.5pt;line-height:1.5}
.page{width:210mm;height:297mm;padding:16mm 16mm 12mm;position:relative;page-break-after:always;overflow:hidden}
.page:last-child{page-break-after:auto}
.logo{display:flex;align-items:center;gap:8px;font-size:17pt;font-weight:600}
.logo b{color:#E8552D;font-weight:600}
.mark{display:grid;place-items:center;width:30px;height:30px;border-radius:8px;background:#E8552D;color:#fff;font-weight:700;font-size:14pt}
.hero{margin:-16mm -16mm 0;padding:16mm 16mm 12mm;background:#FDEDE8}
.eyebrow{margin-top:10mm;color:#E8552D;font-weight:600;font-size:9pt;letter-spacing:.12em;text-transform:uppercase}
h1{font-size:25pt;line-height:1.2;margin-top:3mm;font-weight:700;max-width:160mm}
.lead{margin-top:4mm;font-size:11.5pt;color:#4B5563;max-width:165mm}
h2{font-size:13pt;font-weight:700;margin:5mm 0 2mm}
.why{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}
.card{border:1px solid #E5E7EB;border-radius:10px;padding:4mm;background:#fff}
.card b{display:block;font-weight:600;margin-bottom:1mm}
.card p{color:#4B5563;font-size:9.5pt}
.groups{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}
.groups .card b{color:#E8552D}
ul{list-style:none}
li{position:relative;padding-left:4mm;font-size:9.5pt;color:#374151;margin-top:1mm}
li:before{content:"";position:absolute;left:0;top:2.2mm;width:1.6mm;height:1.6mm;border-radius:50%;background:#E8552D}
.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm}
.steps p{font-size:9pt}
.num{display:grid;place-items:center;width:8mm;height:8mm;border-radius:50%;background:#E8552D;color:#fff;font-weight:700;margin-bottom:2mm}
.chips{display:flex;flex-wrap:wrap;gap:2mm}
.chip{border:1px solid #E5E7EB;border-radius:999px;padding:0.8mm 3mm;font-size:8.5pt}
.two{display:grid;grid-template-columns:1fr 1fr;gap:6mm}
.tiers{display:grid;grid-template-columns:repeat(5,1fr);gap:2.5mm}
.tiers .card{padding:3mm}
.tiers p{font-size:8.5pt}
.note{margin-top:2mm;font-size:8.5pt;color:#6B7280}
.price{font-size:12pt;font-weight:700;margin:1mm 0}
.cta{margin-top:5mm;background:#E8552D;color:#fff;border-radius:14px;padding:5mm 7mm}
.cta{display:flex;align-items:center;justify-content:space-between;gap:6mm}
.cta h3{font-size:16pt;font-weight:700}
.cta p{margin-top:1.5mm;opacity:.92}
.cta .url{font-weight:700;font-size:13pt;white-space:nowrap}
.foot{position:absolute;left:16mm;right:16mm;bottom:8mm;display:flex;justify-content:space-between;font-size:8pt;color:#9CA3AF}
</style></head><body>
<section class="page">
  <div class="hero">
    ${logo}
    <p class="eyebrow">${esc(t.tagline)}</p>
    <h1>${esc(t.title)}</h1>
    <p class="lead">${esc(t.lead)}</p>
  </div>
  <h2>${esc(t.whyTitle)}</h2>
  <div class="why">${t.why.map(([h, p]) => `<div class="card"><b>${esc(h)}</b><p>${esc(p)}</p></div>`).join('')}</div>
  <h2>${esc(t.featuresTitle)}</h2>
  <div class="groups">${t.groups.map(([h, items]) => `<div class="card"><b>${esc(h)}</b><ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('')}</div>
  <div class="foot"><span>facilitypro.tech</span><span>${t.page} 1 / 2</span></div>
</section>
<section class="page">
  <h2 style="margin-top:0">${esc(t.howTitle)}</h2>
  <div class="steps">${t.how.map(([h, p], i) => `<div class="card"><div class="num">${i + 1}</div><b>${esc(h)}</b><p>${esc(p)}</p></div>`).join('')}</div>
  <h2>${esc(t.builtTitle)}</h2>
  <div class="chips">${t.built.map((b) => `<span class="chip">${esc(b)}</span>`).join('')}</div>
  <div class="two">
    <div><h2>${esc(t.connectTitle)}</h2><p style="color:#4B5563">${esc(t.connect)}</p></div>
    <div><h2>${esc(t.trustTitle)}</h2><ul>${t.trust.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
  </div>
  <h2>${esc(t.pricingTitle)}</h2>
  <div class="tiers">${t.tiers.map(([n, p, d]) => `<div class="card"><b>${esc(n)}</b><div class="price">${esc(p)}</div><p>${esc(d)}</p></div>`).join('')}</div>
  <p class="note">${esc(t.tiersNote)}</p>
  <div class="cta"><div><h3>${esc(t.ctaTitle)}</h3><p>${esc(t.ctaBody)}</p></div><p class="url">facilitypro.tech</p></div>
  <div class="foot"><span>© ${new Date().getFullYear()} FacilityPro</span><span>${t.page} 2 / 2</span></div>
</section>
</body></html>`;
}

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
for (const lang of Object.keys(T)) {
  await page.setContent(html(lang), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  // Each page is a fixed A4 box: fail rather than print content under the footer.
  const overflow = await page.evaluate(() => [...document.querySelectorAll('.page')].map((p) => {
    const foot = p.querySelector('.foot').getBoundingClientRect().top;
    return Math.max(...[...p.children].filter((c) => !c.classList.contains('foot')).map((c) => c.getBoundingClientRect().bottom)) > foot - 4;
  }));
  if (overflow.some(Boolean)) throw new Error(`${lang}: content overflows page ${overflow.indexOf(true) + 1}`);
  const out = join(root, 'public/brochure', `FacilityPro-brochure-${lang}.pdf`);
  writeFileSync(out, await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }));
  console.log(`wrote ${out}`);
}
await browser.close();
