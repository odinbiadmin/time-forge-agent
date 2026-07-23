# Attendance Agent Desktop (Electron)

Ứng dụng Desktop theo dõi dữ liệu chấm công từ máy ZKTeco, lưu theo ngày và đồng bộ log lên API.

## Tổng quan chức năng

- Kết nối máy chấm công theo Device IP/Port.
- Lấy dữ liệu chấm công theo chu kỳ poll interval.
- Lưu dữ liệu local theo ngày tại thư mục userData/attendance.
- Quản lý user trên máy chấm công (thêm, sửa, xóa, sync).
- Đồng bộ từng bản ghi attendance lên API và theo dõi trạng thái:
  - pending
  - success
  - failed

## Cấu hình chính

Trên giao diện ứng dụng:

- Device IP
- Device Port
- API URL
- API Key
- Secret Key
- Poll Interval
- Auto Start

## Luồng Test

### Test API

- Nút Test API sẽ kiểm tra kết nối thật tới server bằng thông tin vừa nhập.
- Cơ chế test:
  - Gọi endpoint /api/method/ping
  - Header Authorization: token apiKey:secretKey

### Test Device

- Nút Test Device dùng trực tiếp IP/Port đang nhập để kiểm tra kết nối máy chấm công.
- Nếu thành công sẽ hiển thị thông tin thiết bị (name/serial/info).

## Luồng đồng bộ attendance lên API

Sau khi poll được attendance:

1. Gán trạng thái cho từng log.
2. Gửi các log đang pending hoặc failed lên API.
3. Cập nhật lại trạng thái trong file ngày.

Endpoint sử dụng:

- POST /api/method/hrms.hr.doctype.employee_checkin.employee_checkin.add_log_based_on_employee_field

Payload mỗi log:

- employee_field_value: user_id
- timestamp: định dạng YYYY-MM-DD HH:mm:ss.000000
- device_id: serialNumber từ config thiết bị

## Dữ liệu local

- File config:
  - Windows: C:/Users/<User>/AppData/Roaming/attendance-agent-desktop/config.json
- File attendance theo ngày:
  - C:/Users/<User>/AppData/Roaming/attendance-agent-desktop/attendance/YYYY-MM-DD.json
- File user cache:
  - C:/Users/<User>/AppData/Roaming/attendance-agent-desktop/attendance/user.json

## Scripts

- npm install: cài dependencies
- npm run dev: chạy app dev
- npm run dev:mon: chạy app với nodemon
- npm run build:win: build file cài đặt Windows
- npm run clean: xóa dist

## Ghi chú kỹ thuật

- Tên user khi thêm/sửa được chuẩn hóa bỏ dấu tiếng Việt trước khi ghi xuống thiết bị.
- Attendance list trên UI hiển thị status sync của từng record.
- Today card hiển thị ngày + giờ realtime.
