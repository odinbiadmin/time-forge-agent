# Đóng gói Attendance Agent cho Windows

## Yêu cầu

- Windows 10/11 64-bit.
- Node.js và npm phù hợp với dự án.
- Cài dependencies: `npm install`.

SDK FK623 của profile **RJ1300 Licence 3500** đã nằm trong `assets/rj1300-sdk` và sẽ được chép vào thư mục resources của ứng dụng. Máy cài Agent không cần cài Ronald Jack Software 3.1.

## Build

```powershell
npm run build:win
```

File cài đặt được tạo trong `dist`, theo tên `Attendance-Agent-Desktop-Setup-<version>.exe`.

## Kiểm tra sau khi cài

1. Mở ứng dụng và chọn đúng profile RJ1300 hoặc ZKTeco.
2. Nhập IP và port theo cấu hình thiết bị.
3. Bấm **Kiểm tra thiết bị**.
4. Chỉ sau khi kết nối thành công mới đọc/chỉnh sửa dữ liệu.

Với RJ1300 Licence 3500, ứng dụng gọi FK623 qua PowerShell 32-bit và dùng DLL được đóng gói tại `resources/rj1300-sdk`. Với RJ1300 Licence 2500, ứng dụng dùng TCP riêng và không dùng DLL FK623.

Chi tiết chẩn đoán kết nối: [REMOTE_RJ1300_CONNECTION_TEST_PLAN.md](REMOTE_RJ1300_CONNECTION_TEST_PLAN.md).
