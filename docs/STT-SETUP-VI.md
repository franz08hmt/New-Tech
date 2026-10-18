# Nhập câu hỏi bằng giọng nói — STT local

> **Tích hợp 18/10/2026:** cài bằng `npm ci --ignore-scripts`; Docker cũng bỏ
> lifecycle scripts để không tự tải CUDA. STT vẫn mặc định tắt. Runtime audit
> còn advisory chưa xử lý; đọc [context và giới hạn](PROJECT-CONTEXT.md)
> trước khi bật cho pilot. Native imports/media đã kiểm, không đồng nghĩa đã
> benchmark nhận dạng giọng nói thật.

Assistant nhận bản ghi ngắn, chuyển thành chữ, cho người dùng xem và sửa rồi
chèn vào ô câu hỏi. Người dùng vẫn tự bấm gửi. Model được chạy local bằng
NestJS/Node và ONNX Runtime; không cần API key cho inference, không cần Python,
không train/fine-tune và không gọi dịch vụ Whisper hosted.

Model được chọn là `onnx-community/whisper-small`, bản ONNX đa ngôn ngữ, chạy
CPU với `q8`. Transformers.js được pin ở `3.8.1`; revision model cố định là
`dc93399f6d0d35f7eddcb1b3f029d8684f4dfc12`. Giao diện cho phép chọn Tự động,
Tiếng Việt hoặc English. Tự động là mặc định và để Whisper tự nhận diện ngôn ngữ;
hai lựa chọn còn lại truyền `language: "vietnamese"` hoặc `language: "english"`
để gợi ý ngôn ngữ nguồn. Cả ba chế độ đều dùng `task: "transcribe"`, không dịch
sang ngôn ngữ khác. Đây là cấu hình để bắt đầu benchmark trên laptop 16 GB; tốc
độ và độ chính xác tiếng Việt xen tiếng Anh cần được kiểm tra bằng audio thật.

Bản tích hợp truyền cửa sổ 30 giây với overlap 5 giây cho Whisper để bản ghi
31–60 giây không bị feature extractor mặc định bỏ phần cuối. Đây là cấu hình
long-audio đã kiểm bằng contract test, chưa chứng minh chất lượng nối transcript
hoặc tốc độ CPU thật. Timeout inference vẫn áp dụng: cho phép ghi tối đa 60 giây
không đảm bảo mọi máy xử lý xong trong timeout mặc định 30 giây.

## Chuẩn bị model

Các bước này không chạy khi cài dependency hay build ứng dụng. File model được
tải vào `artifacts/stt-models/`, thư mục đã bị Git ignore; API không tự tải
weights khi khởi động hoặc khi nhận audio.

1. Dùng Node 24.15 trở lên thuộc nhánh 24. Cài dependencies theo hướng dẫn gốc
   của dự án. Cần `ffmpeg` và `ffprobe` trên PATH; trên Windows có thể cấu hình
   đường dẫn `.exe` tuyệt đối bằng `STT_FFMPEG_PATH` và `STT_FFPROBE_PATH`.
2. Sau khi chủ động quyết định tải model, chạy:

   ```powershell
   npm run stt:prepare --workspace @examate/api
   ```

   Lệnh tải đúng tokenizer/config và hai file ONNX q8 cần thiết từ revision đã
   ghim, khoảng 250 MB tổng. Không có Hugging Face token và không tải các bản
   fp32/fp16 hoặc các biến thể ONNX còn lại. Lệnh kiểm tra file đã hoàn chỉnh,
   ghi manifest SHA-256, không ghi đè thư mục model có sẵn nhưng không rõ nguồn.
   Nếu bị ngắt giữa chừng, chạy lại lệnh để dọn thư mục tạm do chính lệnh tạo và
   tải lại.

3. Kiểm tra checksum, phiên bản runtime và nạp model thật bằng CPU:

   ```powershell
   npm run stt:verify --workspace @examate/api
   ```

   Lệnh build API rồi thử nạp worker local; thiếu weights, ONNX Runtime native
   hoặc file Visual C++ Runtime cần thiết trên Windows sẽ báo lỗi rõ ràng.

4. Mở `.env` ở máy của bạn bằng editor và thay các dòng cấu hình STT hosted cũ
   bằng block local dưới đây. Không cần thêm `HF_TOKEN`:

   ```dotenv
   STT_ENABLED=true
   STT_PROVIDER=local
   STT_MODEL=onnx-community/whisper-small
   STT_DEVICE=cpu
   STT_DTYPE=q8
   STT_MODEL_DIR=artifacts/stt-models
   STT_MAX_AUDIO_BYTES=5242880
   STT_MAX_DURATION_MS=60000
   STT_TIMEOUT_MS=30000
   STT_MODEL_LOAD_TIMEOUT_MS=180000
   STT_MAX_REQUESTS_PER_MINUTE=5
   STT_MAX_CONCURRENT_REQUESTS=1
   STT_FFMPEG_PATH=ffmpeg
   STT_FFPROBE_PATH=ffprobe
   ```

   File `.env.example` chỉ là mẫu; hướng dẫn này không sửa `.env` thật của bạn.
   Nếu đặt `STT_MODEL_DIR` khác mặc định, truyền cùng đường dẫn qua biến môi
   trường `STT_MODEL_DIR` khi chạy `stt:prepare`, `stt:verify` và benchmark.

5. Chạy lại API và web. Mở Assistant → **Ghi âm câu hỏi** → cấp quyền mic → nói
   → **Dừng ghi âm** → xem/sửa bản chép → **Chèn vào câu hỏi** → tự bấm **Send
   question**. Lần đầu API nạp model sẽ hiện trạng thái đang nạp; giao diện tự
   kiểm tra lại cho tới khi model sẵn sàng.

Để đo tốc độ trên một bản WAV của bạn, chuyển audio thành mono, 16 kHz,
PCM 16-bit rồi chạy benchmark. File âm thanh không được tải lên hoặc in nội dung
bản chép ra terminal:

```powershell
ffmpeg -i .\input.m4a -ac 1 -ar 16000 -c:a pcm_s16le .\artifacts\stt-sample.wav
npm run stt:benchmark --workspace @examate/api -- .\artifacts\stt-sample.wav 3
```

Benchmark báo thời gian nạp lần đầu, các lượt chạy sau, thời lượng audio, hệ số
thời gian thực và RSS của tiến trình Node cùng worker ONNX. RSS tính cả vùng nhớ
native ONNX; đây là phép đo trên máy đang chạy, không phải cam kết tốc độ cho
máy khác. Dùng audio người có quyền sử dụng; transcript không được lưu.

## Cách chạy trong Docker

API image dùng Node Debian slim và `ffmpeg` để tương thích thư viện ONNX native.
Model không nằm trong image. Compose gắn thư mục local
`./artifacts/stt-models` vào `/app/artifacts/stt-models` ở chế độ chỉ đọc.
Chạy `stt:prepare` trên máy host trước khi bật STT trong container. Nếu chưa có
model, API báo `model_missing`; không coi trạng thái container khỏe là bằng
chứng STT đã chạy được.

## API và bảo vệ dữ liệu

- `GET /api/speech/status` yêu cầu đăng nhập và báo `not_configured`, `loading`,
  `model_missing`, `model_error`, `media_unavailable` hoặc `ready`. `ready` chỉ
  được trả sau khi worker nạp thành công cả model và runtime.
- `POST /api/speech/transcriptions` nhận đúng một multipart field `file`, qua
  Auth/CSRF/membership đang có. API kiểm signature/container, giới hạn kích cỡ
  và thời lượng, rồi dùng ffmpeg chuẩn hóa sang WAV mono 16 kHz PCM16.
- API truyền WAV tới một tiến trình Node con. Worker nạp một model và dùng ONNX
  CPU với tối đa hai luồng inference. Worker chỉ đọc model local; Transformers.js
  tắt remote models và request được đánh dấu local-only. Hủy hoặc hết giờ sẽ dừng
  tiến trình worker trước khi giải phóng admission slot.
- Mỗi API process chỉ cho một inference chạy tại một thời điểm. Yêu cầu song
  song bị từ chối có giới hạn; không xếp hàng vô hạn. Bộ đếm rate/concurrency
  dùng memory theo process và reset khi restart.
- Audio tạm được ghi trong thư mục hệ điều hành, xóa khi xử lý xong; không ghi
  audio hoặc transcript vào database, Supabase Storage, RAG, localStorage hay
  IndexedDB. Log chỉ ghi metadata vận hành.
- STT local không cần Internet sau khi đã có weights. Các phần khác của ứng dụng
  như đăng nhập Supabase, Gemini chat và RAG vẫn có thể cần Internet/API key.

Giới hạn mặc định: upload tối đa 5 MiB, audio tối đa 60 giây, inference timeout
30 giây, model-load timeout 180 giây và 5 yêu cầu mỗi phút/người dùng. API request
deadline vẫn là 45 giây, client timeout hiện là 60 giây. Không tăng timeout toàn
ứng dụng chỉ để phục vụ STT.

Các mã lỗi STT gồm `STT_NOT_CONFIGURED`, `STT_MODEL_MISSING`,
`STT_MODEL_LOADING`, `STT_MODEL_ERROR`, `STT_MEDIA_UNAVAILABLE`,
`STT_MEDIA_TIMEOUT`, `STT_AUDIO_REQUIRED`, `STT_AUDIO_TOO_LARGE`,
`STT_UNSUPPORTED_AUDIO`, `STT_INVALID_AUDIO`, `STT_AUDIO_TOO_LONG`,
`STT_NO_SPEECH`, `STT_RATE_LIMITED`, `STT_BUSY`, `STT_TIMEOUT` và
`STT_CANCELLED`, `STT_LANGUAGE_INVALID`.

## Chất lượng tiếng Việt xen tiếng Anh

Chọn Tự động cho câu nói trộn ngôn ngữ hoặc khi chưa biết chắc ngôn ngữ. Nếu
audio chủ yếu dùng một ngôn ngữ, chọn Tiếng Việt hoặc English để gợi ý ngôn ngữ
nguồn cho Whisper. Gợi ý sai có thể làm giảm độ chính xác; transcript vẫn cần
được nghe lại và sửa trước khi chèn. Whisper cũng có thể tạo nội dung không được
nói ra khi audio không rõ hoặc không có lời nói. Để so sánh chất lượng, ghi cùng
một tập câu tiếng Việt, tiếng Anh và câu trộn Việt-Anh, đối chiếu với bản chép
tay chuẩn, rồi ghi lỗi tên/ý nghĩa và thời gian xử lý. Không kết luận từ một vài
câu thử rằng model chính xác hơn hoặc nhanh hơn model khác.

Sau khi đổi code hoặc lựa chọn mặc định, khởi động lại API (`npm run dev:api`)
để worker nạp cấu hình mới. Web có thể tiếp tục chạy bình thường.

Tài liệu tham khảo: [Transformers.js chạy Whisper trên Node](https://huggingface.co/docs/transformers.js/guides/node-audio-processing),
[cách khóa model local và tắt tải remote](https://huggingface.co/docs/transformers.js/v3.8.1/en/custom_usage),
[dtype và lưu ý quantization của Whisper](https://huggingface.co/docs/transformers.js/v3.8.1/en/guides/dtypes),
[model ONNX Whisper small](https://huggingface.co/onnx-community/whisper-small/tree/dc93399f6d0d35f7eddcb1b3f029d8684f4dfc12),
[cấu hình session ONNX Runtime](https://onnxruntime.ai/docs/api/js/interfaces/InferenceSession.SessionOptions.html).
