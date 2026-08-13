# RJ1300 Licence 3500 SDK bundle

Thư mục này chứa SDK FK623 được đóng gói cùng Attendance Agent cho profile **Ronald Jack RJ1300 — Licence 3500 (FK623 SDK)**.

Khi build, nội dung được chép vào `resources/rj1300-sdk`; bridge tại `core/models/rj1300/licence3500/rj1300_bridge.ps1` nạp DLL từ vị trí đó. Vì vậy Agent không phụ thuộc vào thư mục cài đặt `C:\RonaldJackSoftwarev3.1`.

Các thành phần chính gồm `FK623Attend.dll`, `FKModelDic.ini` và DLL phụ thuộc. Bridge phải chạy PowerShell 32-bit vì SDK là x86.

Profile **RJ1300 Licence 2500 (TCP)** không dùng các file trong thư mục này.

Xem [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) để biết ghi nhận thành phần bên thứ ba.
