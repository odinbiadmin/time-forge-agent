# Hướng dẫn Build và cài Attendance Agent trên Windows

Tài liệu này dùng cho phiên bản Attendance Agent hiện tại (không còn Store/Printer flow).

## 1) Yêu cầu hệ thống

- Windows 10/11
- Node.js 18 trở lên
- npm đi kèm Node.js

## 2) Chuẩn bị source

Mở Command Prompt hoặc PowerShell tại thư mục dự án:

```cmd
cd D:\demo\NewAppAtt
```

## 3) Cài dependencies

```cmd
npm install
```

Lưu ý:

- Nếu bạn đã xóa node_modules thì bắt buộc chạy lại npm install trước khi run/build.

## 4) Chạy thử local

```cmd
npm run dev
```

Hoặc chạy với nodemon:

```cmd
npm run dev:mon
```

## 5) Build file cài đặt Windows

```cmd
npm run build:win
```

File build nằm trong thư mục dist của dự án.

## 6) Cấu hình sau khi cài đặt

Mở ứng dụng và nhập:

- Device IP
- Device Port
- API URL
- API Key
- Secret Key
- Poll Interval

Sau đó:

1. Bấm Test API để xác nhận kết nối API bằng token apiKey:secretKey.
2. Bấm Test Device để xác nhận kết nối máy chấm công.
3. Bấm Save Changes để lưu cấu hình.
4. Bấm Start để bắt đầu polling attendance.

## 7) Dữ liệu runtime trên Windows

- Config:
  - C:/Users/<User>/AppData/Roaming/attendance-agent-desktop/config.json
- Attendance theo ngày:
  - C:/Users/<User>/AppData/Roaming/attendance-agent-desktop/attendance/YYYY-MM-DD.json
- User cache:
  - C:/Users/<User>/AppData/Roaming/attendance-agent-desktop/attendance/user.json

## 8) Troubleshooting nhanh

- Test API thất bại:
  - Kiểm tra API URL đúng domain/protocol.
  - Kiểm tra API Key và Secret Key.
  - Kiểm tra endpoint /api/method/ping có truy cập được từ máy client.

- Test Device thất bại:
  - Kiểm tra IP/Port của máy chấm công.
  - Kiểm tra firewall, mạng nội bộ và quyền truy cập thiết bị.

- Attendance không lên API:
  - Mở file attendance ngày hiện tại, kiểm tra field status của từng log (pending/success/failed).
  - Kiểm tra sync_error trong record failed để biết lý do.

- Build Windows báo lỗi `Cannot create symbolic link` khi giải nén `winCodeSign`:
  - Nguyên nhân: Windows hiện tại không có quyền tạo symbolic link cho tiến trình build.
  - Dự án đã cấu hình sẵn `npm run build:win` với `-c.win.signAndEditExecutable=false` để tránh bước gây lỗi này.
  - Nếu vẫn cần bật lại bước sign/edit executable, cần chạy terminal với quyền Administrator hoặc bật Developer Mode trên Windows.

## 9) Auto update qua GitHub Releases

App đã có cơ chế tự kiểm tra phiên bản mới khi chạy bản đã cài đặt. Với repo public, nên dùng GitHub Releases thay vì trỏ vào source code của repo.

Điều kiện để auto update hoạt động:

- Tăng `version` trong `package.json` trước mỗi bản phát hành mới.
- Build app bằng `npm run build:win`.
- Tạo GitHub Release có tag đúng version, ví dụ `v1.0.6`.
- Upload các file trong `dist` lên release assets, tối thiểu cần:
  - `latest.yml`
  - file installer `Attendance Agent Desktop-Setup-x.y.z.exe`
  - file `.blockmap` nếu có.

Trên máy chạy app, cấu hình một trong hai biến môi trường sau:

```cmd
setx ATTENDANCE_UPDATE_GITHUB_REPO "odinbiadmin/time-forge-agent"
```

Hoặc:

```cmd
setx ATTENDANCE_UPDATE_URL "https://github.com/odinbiadmin/time-forge-agent"
```

Sau khi mở lại app, chương trình sẽ tự kiểm tra update sau khoảng 5 giây và lặp lại mỗi 6 giờ. Khi tải xong bản mới, app sẽ hỏi người dùng cài và khởi động lại ngay hoặc để lần sau.
