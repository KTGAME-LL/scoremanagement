# Điểm học phần: ứng dụng tính điểm theo trọng số

Ứng dụng chạy trên trình duyệt, **không có máy chủ và không gửi dữ liệu đi đâu**. Đăng nhập bằng **tên đăng nhập và mật khẩu** do bạn tự tạo.

## Cách dùng nhanh (không cần cài gì)

1. Mở tệp `diem-app.html` bằng Chrome, Edge hoặc Firefox (bấm đúp).
2. Lần đầu: chọn **Tạo tài khoản**, nhập tên đăng nhập và mật khẩu. Lần sau: **Đăng nhập**.
3. Dữ liệu tự lưu liên tục, không cần bấm lưu. Cần bản xem hoặc in thì bấm **Xuất Excel**.

> Tài khoản và dữ liệu nằm trong trình duyệt đang dùng. Xóa dữ liệu trình duyệt, đổi trình duyệt hoặc đổi máy sẽ không thấy lại. **Không có chức năng quên mật khẩu**: mất mật khẩu là không mở lại được dữ liệu.

## Các tính năng chính

Lấy tệp Excel gốc làm chuẩn, web có đủ các phần và làm tốt hơn:

- **Tổng quan**: điểm TB tích lũy (thang 10 và 4), tín chỉ đạt, thống kê từng học kỳ và từng năm, cảnh báo lỗi/cần xem lại/học kỳ chưa kích hoạt, biểu đồ đường tiến trình điểm, bảng môn theo học kỳ.
- **Môn học**: bật/tắt thành phần, trọng số, gộp nhóm chung trọng số, điểm tiến trình, điểm cộng, môn chỉ cần Đạt, điểm chữ, thang 4, xếp loại, trạng thái.
- **Mục tiêu điểm**: điểm mong muốn từng môn, điểm cần đạt ở thành phần còn lại.
- **Chương trình đào tạo**: danh sách môn theo học kỳ (mã, tên, tín chỉ, giảng viên, hình thức kiểm tra, ghi chú), thêm nhanh vào bảng điểm, không thêm trùng.
- **Cấu hình**: thông tin sinh viên, thang điểm, làm tròn, số học kỳ và số năm, ký hiệu Đạt/Không đạt, thư viện thành phần, bảng quy đổi điểm.
- **Hướng dẫn** ngay trong ứng dụng.
- Hoàn tác / Làm lại (Ctrl+Z / Ctrl+Y), giao diện sáng/tối, xuất Excel, xuất CSV, đổi mật khẩu, xóa tài khoản.

## Tài khoản và bảo mật

- **Kiểm tra đầu vào**: tên 3 đến 32 ký tự (chữ, số, `.` `_` `-`); mật khẩu 8 đến 128 ký tự, có chữ và số, không quá đơn giản, không chứa tên đăng nhập, không nằm trong danh sách mật khẩu phổ biến.
- Mật khẩu không được lưu. Từ mật khẩu, ứng dụng dẫn xuất khóa bằng PBKDF2-SHA256 (600.000 vòng, muối ngẫu nhiên), dùng khóa đó mở một khóa dữ liệu ngẫu nhiên 256 bit; dữ liệu mã hóa AES-GCM trước khi ghi vào trình duyệt.
- Sai mật khẩu 5 lần sẽ bị khóa tạm, thời gian tăng dần. Thông báo lỗi không tiết lộ tên có tồn tại hay không.
- Tối đa 20 tài khoản mỗi trình duyệt. Tùy chọn “giữ đăng nhập trong tab” chỉ có hiệu lực đến khi đóng tab.
- Giới hạn trung thực: ai có quyền chạy mã trên máy bạn (phần mềm độc hại, tiện ích trình duyệt xấu) vẫn có thể lấy được dữ liệu khi bạn đang đăng nhập. Mã hóa bảo vệ dữ liệu lưu trên đĩa, không thay thế bảo mật máy.
- Dữ liệu cũ lưu trước khi có đăng nhập có thể được chuyển vào tài khoản mới (hộp chọn khi tạo tài khoản).

## Tự động lưu

Mọi thay đổi được lưu sau khoảng 0,3 giây và lưu ngay khi đóng hoặc ẩn tab. Có bản dự phòng tự động; thanh bên hiện trạng thái lưu.

## Xuất Excel

Nút **Xuất Excel (.xlsx)** tạo tệp 6 sheet, định dạng sẵn (tiêu đề, viền, màu theo trạng thái, độ rộng cột, cố định hàng đầu, bộ lọc, in ngang): Tổng quan (kèm biểu đồ đường GPA), Bảng điểm, Chi tiết thành phần, Mục tiêu điểm, Cấu hình, Thông tin ngành học. Giá trị là kết quả đã tính sẵn (không phải công thức). Tệp này để xem, in, nộp; ứng dụng không nhập lại từ Excel.

## Đăng lên GitHub Pages

1. Tạo kho mã (repository) trên GitHub, đẩy toàn bộ thư mục này lên nhánh `main`.
2. Vào Settings, Pages, Source chọn **GitHub Actions**.
3. Mỗi lần đẩy mã, tệp `.github/workflows/pages.yml` tự kiểm thử, đóng gói và đăng ra `https://TEN-BAN.github.io/TEN-KHO/`.


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
               xlsx + excelExport (xuất Excel), auth + secureStorage (tài khoản, mã hóa dữ liệu)
src/state/     store.tsx: trạng thái, hoàn tác/làm lại, tự lưu
src/ui/        Các màn hình React + styles.css
tests/         Kiểm thử phần tính điểm (node:test)
scripts/       build-single.mjs: đóng gói một tệp HTML
```


## Bảo mật và xử lý dữ liệu

- **Làm sạch dữ liệu nạp vào** (`src/core/schema.ts`): mọi dữ liệu đọc ra bị ép kiểu, cắt khoảng, giới hạn số lượng (≤ 500 môn, ≤ 300 môn chương trình, ≤ 12 thành phần/môn), tạo lại mã trùng.
- **Content-Security-Policy** chỉ cho phép đúng đoạn mã đã đóng gói (băm SHA-256), `connect-src 'none'`: ứng dụng không thể gửi yêu cầu mạng.
- Tệp Excel xuất ra chỉ chứa văn bản, không công thức, nên không có rủi ro chèn công thức.
- Không dùng dấu gạch ngang dài trong mã và tài liệu; có kiểm thử giữ quy tắc này.

## Tài liệu tham khảo

- React: https://react.dev
- Vite: https://vite.dev
- Content-Security-Policy (MDN): https://developer.mozilla.org/docs/Web/HTTP/CSP
- OWASP Cheat Sheet Series (Input Validation, XSS Prevention, CSV Injection): https://cheatsheetseries.owasp.org

