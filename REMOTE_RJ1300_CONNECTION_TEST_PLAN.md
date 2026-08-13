# Quy trình kết nối RJ1300 tại máy từ xa

Mục tiêu: xác nhận profile kết nối đúng và chỉ đọc dữ liệu trước khi thực hiện thay đổi trên thiết bị.

## Chuẩn bị

- Cài bản Attendance Agent đã đóng gói; không cần cài Ronald Jack Software 3.1.
- Có IP, port, profile Licence thiết bị và thông tin mạng cần thiết.
- Đóng mọi phần mềm khác đang mở kết nối tới máy chấm công.
- Kiểm tra đường truyền:

```powershell
Test-NetConnection <IP-RJ1300> -Port 4370
```

`TcpTestSucceeded` phải là `True` trước khi tiếp tục.

## Chọn profile trong Agent

### RJ1300 Licence 3500 (FK623 SDK)

1. Chọn `Ronald Jack RJ1300 — Licence 3500 (FK623 SDK)`.
2. Nhập IP và port.
3. Bấm **Kiểm tra thiết bị**.

Profile này dùng SDK đã đóng gói và có thể thêm/xóa nhân viên sau khi đã kiểm tra đọc dữ liệu thành công.

### RJ1300 Licence 2500 (TCP)

1. Chọn `Ronald Jack RJ1300 — Licence 2500 (TCP)`.
2. Nhập IP và port.
3. Bấm **Kiểm tra thiết bị**.

Profile này không dùng FK623 SDK và hiện là chỉ đọc.

## Kiểm tra an toàn

Sau khi kết nối thành công, thực hiện theo thứ tự:

1. Đọc thông tin thiết bị.
2. Đọc danh sách nhân viên.
3. Đọc dữ liệu chấm công.

Chỉ với profile 3500, nếu cần kiểm tra ghi/xóa nhân viên, dùng một User ID thử nghiệm đã được thống nhất và kiểm tra lại danh sách nhân viên sau mỗi thao tác.

## Xử lý lỗi nhanh

| Hiện tượng | Kiểm tra tiếp theo |
| --- | --- |
| TCP không thông | IP, VLAN/VPN, firewall, port và cấu hình mạng của máy |
| TCP thông nhưng kiểm tra thiết bị thất bại | Chọn lại profile 2500/3500, đóng phần mềm khác, xác nhận firmware/cấu hình với nhà cung cấp |
| Profile 3500 báo lỗi FK623 | Lưu toàn bộ thông báo lỗi; xác nhận DLL đã nằm trong thư mục cài Agent và thông tin SDK từ nhà cung cấp |

Cần giữ lại ảnh lỗi, thời điểm kiểm tra và kết quả `Test-NetConnection` khi bàn giao cho đội kỹ thuật.
