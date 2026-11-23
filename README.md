# Điểm học phần: ứng dụng tính điểm theo trọng số

Ứng dụng chạy trên trình duyệt của bạn. Mặc định **không cần đăng nhập và không gửi dữ liệu đi đâu**; nếu muốn, có thể đăng nhập Google để đồng bộ lên Google Drive riêng của bạn.

## Cách dùng nhanh (không cần cài gì)

1. Mở tệp **`diem-app.html`** bằng Chrome, Edge hoặc Firefox (bấm đúp).
2. Bấm **Thêm môn học**, đặt tên, nhập điểm. Dữ liệu tự lưu trong trình duyệt.
3. Định kỳ bấm **Xuất sao lưu (JSON)** ở thanh bên để giữ một bản dự phòng.

> Dữ liệu nằm trong trình duyệt đang dùng. Xóa dữ liệu trình duyệt, đổi trình duyệt hoặc đổi máy sẽ không thấy dữ liệu, hãy dùng tệp sao lưu JSON để chuyển.

## Các tính năng chính

- **Mỗi môn một bảng thành phần riêng**: bật/tắt từng thành phần, đặt trọng số %, sắp xếp thứ tự, thêm từ thư viện hoặc tự đặt tên, áp dụng mẫu (30/70, 10/20/70, …).
- **Gộp trọng số**: tick “Gộp với dòng trên”: các cột dùng chung một trọng số, chỉ cần nhập ô đầu; nếu nhập thêm các ô sau thì lấy trung bình.
- **Điểm tiến trình**: điểm đã nhân trọng số của mọi thành phần trước cuối kỳ. Khi nhập, các thành phần đó không còn được tính.
  Ví dụ tiến trình 2,5 + cuối kỳ 7 × 70% = **7,4** (thang 10). Nếu cuối kỳ là 10 thì 2,5 + 7 = **9,5**.
- **Điểm thưởng**, bật/tắt theo từng môn hoặc theo cấu hình chung.
- **Mục tiêu điểm**: nhập thang 10, thang 4 hoặc điểm chữ. Ô còn thiếu hiện **chữ đỏ đậm** (điểm cuối kỳ cần đạt, điểm tiến trình cần có, “≥” khi chưa biết, “Đã đạt”, “Không thể”).
- **Thử giả định**: nhập thử điểm cuối kỳ để xem tổng kết mà không sửa dữ liệu thật.
- **Mục tiêu điểm**: bảng điểm mong muốn của mọi học phần (nhập 1 trong 3 thang, tự quy đổi, hiện điểm còn thiếu và tình trạng, ghi rõ khớp học kỳ nào).
- **Tổng quan**: điểm trung bình tích lũy (thang 10 và 4), tín chỉ, ba biểu đồ đường mảnh mô tả tiến trình (điểm từng học phần so với mục tiêu, GPA theo học kỳ, GPA theo năm; đổi thang 10 hoặc 4), bảng các môn; bấm vào chip điểm để nhảy tới đúng ô cần sửa.
- **Cấu hình**: thang điểm, làm tròn, điểm đạt, cấu trúc học kỳ, thư viện thành phần, bảng quy đổi điểm chữ/thang 4.
- Hoàn tác / Làm lại (Ctrl+Z / Ctrl+Y khi không đang gõ), giao diện sáng/tối, xuất JSON, nhập JSON, xuất CSV.

## Đăng nhập Google và đồng bộ

Có sẵn đăng nhập Google. Khi đăng nhập, dữ liệu được lưu thêm vào **thư mục ẩn của ứng dụng trong Google Drive của bạn** (quyền `drive.appdata`, ứng dụng không đọc được tệp nào khác), nên dùng được trên nhiều máy và không sợ mất.

Vì Google yêu cầu mã do chính bạn tạo, cần làm **một lần** (miễn phí, khoảng 5 phút):

1. Đăng nhập https://console.cloud.google.com, tạo dự án mới.
2. Mục APIs & Services: bật **Google Drive API**.
3. Mục OAuth consent screen: chọn External, điền tên ứng dụng và email, thêm tài khoản của bạn vào **Test users**.
4. Mục Credentials: Create credentials, OAuth client ID, loại **Web application**.
5. Ở Authorized JavaScript origins thêm địa chỉ trang của bạn, ví dụ `https://TEN-BAN.github.io` (chỉ phần gốc).
6. Sao chép **Client ID** (dạng `...apps.googleusercontent.com`), dán vào ứng dụng ở mục Cấu hình, Đăng nhập Google, bấm Lưu Client ID, rồi bấm Đăng nhập Google ở thanh bên.

Lưu ý quan trọng:
- Google **chỉ cho đăng nhập khi trang chạy qua địa chỉ https** (hoặc `http://localhost`), không đăng nhập được khi mở tệp trực tiếp bằng bấm đúp. Cách dễ nhất là đăng lên GitHub Pages (xem bên dưới). Mở tệp trực tiếp vẫn dùng bình thường và tự lưu trên máy.
- Ứng dụng luôn **lưu trên máy trước**, rồi mới đẩy lên Drive. Mất mạng hoặc hết phiên đăng nhập không làm mất dữ liệu.
- Nếu Drive và máy có dữ liệu khác nhau (ví dụ sửa trên hai máy), ứng dụng hỏi bạn giữ bản nào, không tự ghi đè.
- Phiên đăng nhập Google hết hạn sau khoảng 1 giờ; ứng dụng tự gia hạn êm khi được, nếu không sẽ hiện nút Đăng nhập lại.
- Đồng bộ đã được kiểm thử bằng Google và Drive giả lập (mã `tests/cloud.test.ts` và kiểm thử trình duyệt). Chưa thử với một Client ID thật vì cần tài khoản Google của bạn, nên lần đầu bạn hãy thử kỹ với dữ liệu nhỏ.

## Tự động lưu

Mọi thay đổi tự lưu sau khoảng 0,3 giây, và được ghi gấp khi đóng hoặc ẩn tab. Không có nút Lưu. Có thêm một bản sao lưu gần nhất để khôi phục nếu bản chính hỏng.

## Xuất Excel

Nút **Xuất Excel (.xlsx)** tạo tệp có 5 sheet, định dạng sẵn (tiêu đề, viền, màu theo trạng thái, độ rộng cột, cố định hàng đầu, bộ lọc, in ngang): Tổng quan (kèm 2 biểu đồ đường GPA theo học kỳ và theo năm), Bảng điểm, Chi tiết thành phần, Mục tiêu điểm, Cấu hình. Giá trị là kết quả đã tính sẵn (không phải công thức). Để làm việc tiếp, hãy dùng xuất JSON.

## Đăng lên GitHub Pages

1. Tạo kho mã (repository) trên GitHub, đẩy toàn bộ thư mục này lên nhánh `main`.
2. Vào Settings, Pages, Source chọn **GitHub Actions**.
3. Mỗi lần đẩy mã, tệp `.github/workflows/pages.yml` tự kiểm thử, đóng gói và đăng ra `https://TEN-BAN.github.io/TEN-KHO/`.
4. Dùng địa chỉ gốc `https://TEN-BAN.github.io` làm Authorized JavaScript origin ở bước 5 phần đăng nhập Google.

## Chạy từ mã nguồn (dành cho người có Node.js 20+)

```bash
npm install
npm run dev            # chạy thử với Vite
npm run build          # kiểm tra kiểu + đóng gói Vite
npm run build:single   # tạo lại diem-app.html (một tệp)
npm test               # chạy kiểm thử phần tính điểm
```

Ghi chú trung thực: `diem-app.html` đã được tạo bằng esbuild và kiểm thử trên Chromium (thêm môn, bật/tắt, tiến trình, gợi ý, lưu/tải lại, xuất/nhập). Cấu hình Vite (`vite.config.ts`, `npm run dev/build`) và kiểm tra kiểu `tsc` toàn dự án **chưa chạy được** trong môi trường tạo ra ứng dụng (không có mạng để cài Vite và `@types/react`), nên hãy chạy `npm install && npm run build` một lần trên máy bạn.

## Cấu trúc mã

```
src/core/      Logic thuần (không phụ thuộc giao diện): compute, targets, stats, schema, storage, exporters,
               xlsx + excelExport (xuất Excel), google + drive + cloudSync (đăng nhập và đồng bộ Drive)
src/state/     store.tsx: trạng thái, hoàn tác/làm lại, tự lưu
src/ui/        Các màn hình React + styles.css
tests/         Kiểm thử phần tính điểm (node:test)
scripts/       build-single.mjs: đóng gói một tệp HTML
```

## Bảo mật và xử lý dữ liệu

- **Kiểm tra đầu vào**: ô số chỉ nhận số hợp lệ trong khoảng cho phép (chấp nhận dấu phẩy); chữ có giới hạn độ dài.
- **Làm sạch dữ liệu nạp vào** (`src/core/schema.ts`): mọi dữ liệu từ localStorage hoặc tệp JSON bị ép kiểu, cắt khoảng, giới hạn số lượng (≤ 500 môn, ≤ 12 thành phần/môn), tạo lại mã trùng; tệp nhập tối đa 2 MB.
- **Đầu ra**: React tự thoát ký tự, không dùng `innerHTML`/`dangerouslySetInnerHTML`. CSV vô hiệu hóa công thức độc hại (ô bắt đầu bằng `= + - @` được thêm dấu `'`).
- **Content-Security-Policy** chỉ cho phép đúng đoạn mã đã đóng gói (băm SHA-256), dịch vụ đăng nhập của Google và Google Drive API (`www.googleapis.com`). Không có kết nối tới nơi nào khác. Nếu không đăng nhập Google, ứng dụng không gửi yêu cầu mạng nào.
- **Token Google** chỉ giữ trong bộ nhớ của tab (không ghi vào ổ đĩa); chỉ xin quyền thư mục ẩn của ứng dụng, tên và email.
- **Tệp Excel xuất ra**: mọi chuỗi ghi dạng văn bản (không bao giờ thành công thức), ký tự XML được thoát.
- Dữ liệu lưu trong localStorage kèm một bản sao lưu gần nhất; nếu bản chính hỏng sẽ tự khôi phục từ bản sao.

## Tài liệu tham khảo

- React: https://react.dev
- Vite: https://vite.dev
- Content-Security-Policy (MDN): https://developer.mozilla.org/docs/Web/HTTP/CSP
- OWASP Cheat Sheet Series (Input Validation, XSS Prevention, CSV Injection): https://cheatsheetseries.owasp.org
