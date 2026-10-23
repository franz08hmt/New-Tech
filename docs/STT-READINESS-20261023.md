# Kiểm STT và các điểm Thắng phản hồi — 23/10/2026

Theo yêu cầu mới của Tài: **chưa chốt toàn dự án, chưa dựng lại report/PDF**.
Tài tự quay demo sau khi thử trực tiếp; agent chỉ hướng dẫn quay khi được yêu cầu.

## Đã sửa và bật trên bản demo

- Whisper inference: mặc định và trần cấu hình **120 giây**.
- Request STT: **150 giây**, gồm admission/upload/media/inference; vẫn hủy worker
  và giữ slot cho tới khi native work kết thúc. Cleanup nhả admission một lần.
- Frontend: chỉ `/api/speech/transcriptions` chờ **180 giây**; API khác giữ 60 giây.
- Nginx: read timeout riêng cho STT **180 giây**; không tăng toàn bộ API.
- Đã tải model `onnx-community/whisper-small` đúng revision
  `dc93399f6d0d35f7eddcb1b3f029d8684f4dfc12`, q8, 241,7 MiB;
  checksum và nạp worker CPU thật đạt. Model ở artifacts bị Git ignore,
  mount read-only vào API Docker, không nhúng weights vào image/Git.
- `.env` riêng và container demo đã bật STT local, dùng key Gemini mới do Tài
  cung cấp. Không ghi key vào tài liệu/log/Git. Google model-list trả 200,
  có model Flash và embedding đang dùng; **không phải kiểm generation**.

Demo hiện tại: `http://127.0.0.1:8080`, Compose project
`examate-final-live-20261023`, API healthy. Không migrate/đổi quyền cloud trong
lượt STT này. Trên Windows host nạp ONNX đã đạt nhưng chưa có ffmpeg/ffprobe
trên PATH; **đường đã kiểm là Docker**, nơi hai công cụ đã cài sẵn.

## Đối chiếu ảnh phản hồi

| Điểm                                           | Kết quả đối chiếu                                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gemini: usage, chi phí, admission, timeout/hủy | Đã có `gemini.service.ts`, `ai-usage.service.ts`, pricing/admission; giữ nguyên, suite hồi quy đạt. Chi phí là ước tính, không phải hóa đơn.           |
| SSE chậm/ngắt                                  | `assistant.controller.ts` đã có backpressure/drain timeout 15 giây, abort và cleanup; tests slow/disconnect đạt.                                       |
| RAG không phát delta chưa kiểm                 | `streamDocumentChat` giữ output private cho tới validator và fresh receipt authorization; general vẫn phát delta qua SSE. Không xóa SSE.               |
| Lưu/mở lại hội thoại                           | Đã có conversation controller/service và `use-assistant.ts`; suite lifecycle/context/frontend đạt. Lượt này không gọi Gemini lại để tạo hội thoại thử. |
| Prompt/citation/quyền RAG                      | Prompt registry riêng, kiểm marker/catalog và workspace/document authorization đã có; không nới validator để làm demo xanh.                            |
| Chia audio dài, FFmpeg/ffprobe                 | Source đã có chunk 30 giây/overlap 5 giây và native-process cancellation. Media thật và mẫu có câu sau giây 35 đạt.                                    |
| Timeout STT lệch                               | Đã sửa 120/150/180, cả nginx và tài liệu setup.                                                                                                        |
| Search/phân trang Documents/Tasks              | Backend/frontend hiện có module search/pagination; không thêm bản trùng. Suite hồi quy đạt.                                                            |

## Bằng chứng mới của lượt này

- `npm test`: **2.324 PASS** = API Vitest 460 + API Node 1.317 + Web 547;
  lượt cuối exit 0. Lượt đầu chạy trùng build bị lỗi, không được tính là đạt.
- Typecheck/build/format: exit 0; nginx config test đạt.
- Native media trong API container: **5/5 PASS**, WAV, streamed WebM, MP4/AAC,
  vượt thời lượng, im lặng, truncated input và hủy xử lý.
- HTTP thật qua nginx + Supabase Auth + media + Whisper: mẫu tiếng Anh tổng hợp
  ngắn trả 200 trong 3.951 ms; mẫu 31 giây trả 200 trong 6.264 ms.
- Mẫu riêng có câu “purple lantern” bắt đầu **sau giây 35** được nhận đúng,
  HTTP 200 trong 7.416 ms. Không dùng một câu lặp lại để chứng minh nhận đủ đuôi.
- Browser thật: hiện `Model Whisper local đã sẵn sàng`, nút ghi âm enabled;
  desktop, 375×812 và 375×520 không tràn ngang; console không có warn/error.
- Artifacts/log/screenshot ở `artifacts/stt-check-20261023/` (Git ignored).
  Không lưu transcript trong app DB/Storage; mẫu tổng hợp là fixture, không
  phải giọng người dùng. Không có gọi Gemini generation trong lượt này.

## Chưa được suy ra từ các kết quả trên

- Chưa kiểm microphone vật lý, accent Việt, Việt–Anh, tiếng ồn hoặc máy Thắng.
  Các số tốc độ trên chỉ là mẫu tiếng Anh tổng hợp trên máy hiện tại.
- Chưa có đánh giá độ chính xác STT bằng corpus/transcript chuẩn; không tuyên bố
  Whisper chính xác tuyệt đối hoặc an toàn với audio im lặng/noisy bất kỳ.
- Nạp model/status ready không chứng minh Google chat/quota hiện hoạt động.
  Ngân sách evaluation cũ chưa được tăng; không tự gọi thêm campaign.
- Không nâng dependencies hoặc chạy audit fix tự động. Các advisory đã ghi
  trong context và cảnh báo bundle lớn vẫn chưa được giải quyết trong lượt này.
- Không sửa migration, dữ liệu học tập, provider billing, report/PDF/PPTX hay video.

## Tài thử trước khi chốt quay

1. Mở demo 8080 và đăng nhập, mở Assistant; chờ Whisper báo sẵn sàng.
2. Chọn **Tiếng Việt**, bấm **Ghi âm câu hỏi**, tự cấp mic, nói một câu 5–10 giây.
3. Bấm dừng, nghe/đối chiếu và sửa transcript; chọn **Chèn vào câu hỏi**.
   Chưa gửi tự động; người dùng tự bấm gửi.
4. Lặp lại với **English** và **Tự động** cho Việt–Anh, rồi một bản dài 35–60 giây
   có ý riêng ở cuối. Kiểm cả ý cuối, tên riêng và thời gian phản hồi.
5. Thử hủy khi đang xử lý; ghi lại mã lỗi/Request ID nếu có, không gửi audio riêng,
   key hoặc cookie vào chat. Chỉ chốt kịch bản/video sau khi các câu demo đạt.
