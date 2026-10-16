# Nghiệm thu triển khai STT local — 15/10/2026

MVP nhập câu hỏi bằng giọng nói đã được chuyển sang hướng chạy Whisper trên
máy của dự án: ghi âm → nhận bản chép → xem/sửa → chèn vào ô câu hỏi. Người
dùng vẫn tự bấm gửi. NestJS gọi một worker Node/ONNX local; không cần API key
cho inference và API không tải model lúc khởi động.

Model đã cấu hình là `onnx-community/whisper-small`, revision
`dc93399f6d0d35f7eddcb1b3f029d8684f4dfc12`, Transformers.js `3.8.1`, CPU `q8`.
Đây là cấu hình ban đầu để benchmark trên máy 16 GB; chưa có kết quả đo tốc độ
hoặc chất lượng trên audio thật.

## Kiểm tra đã chạy

| Kiểm tra                      |      Kết quả |
| ----------------------------- | -----------: |
| API Vitest                    | 216/216 pass |
| API HTTP/runtime `node:test`  | 608/608 pass |
| Test riêng phần giao diện STT |   17/17 pass |
| Typecheck tất cả workspace    |         pass |
| Build API và web              |         pass |
| Prettier `format:check`       |         pass |
| `git diff --check`            |         pass |

Lượt test web toàn bộ có 274/275 test pass. Test còn lại là
`pilot-auth.test.tsx`: nó chờ `role="alert"`, trong khi trạng thái đăng nhập
hiện trả về `role="status"`. Test này nằm ngoài thay đổi STT.

Test media thật cần `ffmpeg` và `ffprobe`, nhưng hai chương trình này không có
trên PATH của môi trường kiểm tra. Vì vậy năm test giải mã/chuẩn hóa WAV,
WebM, MP4/AAC, duration, silence và cancellation chưa được xác nhận ở lượt này.
Hướng dẫn cài đặt và cấu hình đường dẫn nằm trong
[hướng dẫn STT](STT-SETUP-VI.md).

## Chưa nghiệm thu

- Chưa tải weights; thư mục `artifacts/stt-models/onnx-community/whisper-small`
  chưa được tạo.
- Chưa chạy `stt:verify`, inference bằng model thật, benchmark RAM/tốc độ hoặc
  đo CER/WER cho tiếng Việt xen tiếng Anh.
- Chưa kiểm tra microphone trên trình duyệt thật.
- Cần cài `ffmpeg`/`ffprobe`, chủ động tải weights bằng lệnh `stt:prepare`, rồi
  chạy verify và benchmark theo hướng dẫn trước khi demo.

Các test API và web dùng worker/provider giả; không gọi dịch vụ hosted hay
Gemini, không tải model và không xử lý giọng nói của người dùng.
