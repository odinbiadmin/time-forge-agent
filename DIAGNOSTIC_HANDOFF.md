# RJ1300 – ghi chú bàn giao kỹ thuật

## Kiến trúc hiện tại

RJ1300 được tổ chức thành một dòng máy với hai profile kết nối:

| Profile | Model nội bộ | Thư mục mã nguồn | Cơ chế |
| --- | --- | --- | --- |
| Licence 3500 | `RJ1300-3500` | `core/models/rj1300/licence3500` | FK623 SDK qua bridge PowerShell 32-bit |
| Licence 2500 | `RJ1300-2500` | `core/models/rj1300/licence2500` | TCP protocol riêng |

`core/models/registry.js` vẫn ánh xạ tên cũ `RJ1300` sang profile 3500 và `SK2500` sang profile 2500 để không làm hỏng cấu hình cũ. UI chỉ hiển thị tên hai profile RJ1300 mới.

## Profile Licence 3500

- Adapter: `RonaldJackRj1300Licence3500Adapter`.
- Bridge: `core/models/rj1300/licence3500/rj1300_bridge.ps1`.
- SDK được đóng gói trong `assets/rj1300-sdk` và khi build nằm tại `resources/rj1300-sdk`.
- Hỗ trợ đọc metadata, nhân viên, chấm công; thêm và xóa nhân viên.
- Bridge dùng hằng số SDK nội bộ của profile 3500 (`MachineNumber = 1`, `product code = 1261`). Chúng không hiển thị hoặc cấu hình trên UI, và không đồng nghĩa trực tiếp với các nhãn Licence trong phần mềm Ronald Jack.

## Profile Licence 2500

- Adapter: `RonaldJackRj1300Licence2500Adapter`.
- Không dùng FK623 DLL hoặc trường product code.
- TCP client dùng Device No. cố định `1` theo profile.
- Hiện hỗ trợ đọc metadata, nhân viên và chấm công. Thêm/xóa nhân viên chưa được triển khai cho profile này.

## Nguyên tắc chẩn đoán

1. Xác nhận TCP đến `IP:port` trước.
2. Đóng ứng dụng khác đang kết nối máy.
3. Chọn đúng profile trên UI rồi chạy **Kiểm tra thiết bị**.
4. Đọc metadata trước, sau đó mới đọc nhân viên/chấm công.
5. Chỉ thao tác thêm/xóa với mã nhân viên thử nghiệm đã được phê duyệt.

Khi profile 3500 không kết nối dù TCP thông, thu thập thông báo lỗi, firmware/model hiển thị trên máy và cấu hình mạng để đối chiếu với nhà cung cấp SDK.

Quy trình thực hiện tại máy từ xa: [REMOTE_RJ1300_CONNECTION_TEST_PLAN.md](REMOTE_RJ1300_CONNECTION_TEST_PLAN.md).
