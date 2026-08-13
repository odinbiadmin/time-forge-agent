# Attendance Agent Desktop

Ứng dụng Windows dùng để kết nối máy chấm công, đọc nhân viên và dữ liệu chấm công qua giao diện desktop/API cục bộ.

## Thiết bị hỗ trợ

| Nhóm thiết bị | Lựa chọn trên UI | Cách kết nối | Khả năng |
| --- | --- | --- | --- |
| ZKTeco tương thích | `ZKTeco / tương thích` | `zkteco-js` | Đọc dữ liệu theo khả năng giao thức |
| Ronald Jack RJ1300, Licence 3500 | `Ronald Jack RJ1300 — Licence 3500 (FK623 SDK)` | FK623 SDK, bridge PowerShell 32-bit | Đọc thiết bị, nhân viên, chấm công; thêm/xóa nhân viên |
| Ronald Jack RJ1300, Licence 2500 | `Ronald Jack RJ1300 — Licence 2500 (TCP)` | Giao thức TCP riêng | Chỉ đọc thiết bị, nhân viên và chấm công |

Hai lựa chọn RJ1300 là cùng dòng máy. Chúng khác profile/giao thức kết nối, không phải hai model phần cứng khác nhau.

## Chạy phát triển

```powershell
npm install
npm run dev
```

Trong giao diện, chọn đúng profile thiết bị, nhập IP/port và bấm **Kiểm tra thiết bị** trước khi đọc hoặc đồng bộ dữ liệu. Các tham số kết nối nội bộ của RJ1300 được chọn tự động theo profile.

## Lưu ý vận hành

- Port phổ biến của máy chấm công là `4370`; hãy kiểm tra mạng trước bằng `Test-NetConnection <IP> -Port 4370`.
- Đóng phần mềm Ronald Jack khác đang giữ kết nối với máy trước khi chẩn đoán.
- Chức năng thêm/xóa nhân viên chỉ bật cho profile RJ1300 Licence 3500. Luôn dùng một mã nhân viên thử nghiệm riêng trước khi thao tác dữ liệu thật.
- Không cần cài `C:\RonaldJackSoftwarev3.1` trên máy chạy Agent. SDK cần thiết được đóng gói cùng ứng dụng.

Xem [hướng dẫn đóng gói Windows](README_BUILD_WINDOWS.md) và [quy trình chẩn đoán/kết nối RJ1300](REMOTE_RJ1300_CONNECTION_TEST_PLAN.md).
