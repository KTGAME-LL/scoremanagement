export function HelpView() {
  return (
    <div className="stack help">
      <h1>Hướng dẫn</h1>

      <section className="card">
        <h2>Tổng quan</h2>
        <p>Ứng dụng tính điểm học phần theo trọng số các thành phần, điểm trung bình tích lũy (thang 10 và thang 4), số tín chỉ đạt và điểm cần có để đạt mục tiêu. Dữ liệu tự lưu liên tục, mã hóa theo tài khoản, trên chính trình duyệt này.</p>
      </section>

      <section className="card">
        <h2>Bắt đầu nhanh</h2>
        <ol>
          <li>Vào <b>Cấu hình</b>: nhập thông tin sinh viên, số học kỳ, thang điểm và bảng quy đổi theo trường.</li>
          <li>Vào <b>Chương trình đào tạo</b> (tùy chọn): nhập danh sách môn từng học kỳ rồi bấm “Thêm vào bảng điểm”.</li>
          <li>Hoặc bấm <b>Thêm môn</b> ở thanh bên để tạo môn mới.</li>
          <li>Trong <b>Môn học</b>: bật các thành phần có tính điểm, đặt trọng số (%), nhập điểm.</li>
          <li>Xem kết quả ở <b>Tổng quan</b> và điểm cần đạt ở <b>Mục tiêu điểm</b>.</li>
          <li>Bấm <b>Xuất Excel</b> ở thanh bên để lấy bảng điểm đã định dạng.</li>
        </ol>
      </section>

      <section className="card">
        <h2>Ý nghĩa các cột</h2>
        <ul>
          <li><b>TC</b>: số tín chỉ của môn, dùng làm trọng số khi tính điểm trung bình.</li>
          <li><b>Thành phần</b>: các đầu điểm như chuyên cần, giữa kỳ, cuối kỳ. Tắt thành phần nếu môn không có.</li>
          <li><b>Tổng kết</b>: điểm môn sau khi cộng trọng số, điểm thưởng và làm tròn.</li>
          <li><b>Điểm chữ, thang 4, xếp loại</b>: tra từ bảng quy đổi trong Cấu hình.</li>
          <li><b>Trạng thái</b>: Hợp lệ, Chưa đủ (còn thiếu điểm hoặc trọng số), Cần xem lại, Có lỗi.</li>
        </ul>
      </section>

      <section className="card">
        <h2>Quy tắc tính</h2>
        <ul>
          <li><b>Trọng số</b>: nhập theo %. Tổng các thành phần đang bật nên bằng 100%.</li>
          <li><b>Gộp nhóm</b>: các thành phần gộp chung một trọng số, điểm của nhóm là trung bình cộng. Ví dụ 3 bài kiểm tra chung 30%.</li>
          <li><b>Điểm tiến trình</b>: khi bật, điểm tiến trình thay cho các thành phần trước đó (đã nhân sẵn trọng số).</li>
          <li><b>Điểm cộng</b>: cộng vào tổng rồi làm tròn, không vượt thang điểm tối đa.</li>
          <li><b>Làm tròn</b>: làm tròn lên khi phần lẻ từ 0,5, theo số chữ số lẻ trong Cấu hình.</li>
          <li><b>Điểm trung bình</b>: Σ(điểm × tín chỉ) / Σ tín chỉ của các môn được tính.</li>
          <li><b>Học lại</b>: thêm môn học lại thành một dòng riêng và tắt “tính vào điểm trung bình” ở lần không dùng.</li>
          <li><b>Môn chỉ cần Đạt</b>: hiển thị ký hiệu Đạt/Không đạt (đặt trong Cấu hình), không tính vào điểm trung bình.</li>
        </ul>
      </section>

      <section className="card">
        <h2>Thêm, sửa, xóa</h2>
        <ul>
          <li>Mọi ô đều sửa trực tiếp và tự lưu. Dùng <b>Hoàn tác</b> hoặc Ctrl+Z nếu nhập nhầm.</li>
          <li>Xóa môn ở màn hình môn học, có hỏi xác nhận.</li>
          <li>Học kỳ ngoài số học kỳ đã cấu hình sẽ bị cảnh báo và không vào thống kê. Tăng số học kỳ trong Cấu hình để kích hoạt.</li>
        </ul>
      </section>

      <section className="card">
        <h2>Tài khoản và bảo mật</h2>
        <ul>
          <li>Tài khoản (tên và mật khẩu) chỉ nằm trong trình duyệt này, không có máy chủ. Dữ liệu được mã hóa AES-GCM bằng khóa dẫn xuất từ mật khẩu.</li>
          <li><b>Không có chức năng quên mật khẩu.</b> Mất mật khẩu thì không đọc lại được dữ liệu.</li>
          <li>Dùng trình duyệt khác hoặc xóa dữ liệu trình duyệt sẽ không thấy tài khoản. Hãy xuất Excel để lưu bản xem.</li>
          <li>Đăng nhập sai quá 5 lần sẽ bị khóa tạm thời.</li>
        </ul>
      </section>

      <section className="card">
        <h2>Xử lý sự cố</h2>
        <ul>
          <li>Không thấy dữ liệu: kiểm tra đúng tên đăng nhập và đúng trình duyệt.</li>
          <li>Tổng trọng số khác 100%: mở môn đó, chỉnh trọng số theo đề cương.</li>
          <li>Điểm lệch so với trường: kiểm tra bảng quy đổi, số lẻ và cách làm tròn trong Cấu hình.</li>
        </ul>
      </section>
    </div>
  );
}
