# Bàn giao cuối kỳ - cập nhật23/10/2026

## Source publication verification - 23 October 2026

User authorized committing and pushing all reviewed nonsensitive integration code and documentation. Runtime/database source is committed at `0bddd53`. Fresh local gates: typecheck, npm test, build, format and canonical database all exit 0; application 2324 PASS (API Vitest 460 + Node 1317 + Web 547), canonical PG17 521/521 in 51 invocations; separate restricted managed-profile fixture 1/1. Fail/skip/cancelled: 0. PDF exporter tests: 2/2.

Both databases are new owned disposable clusters. No cloud write, paid model request, migration replay on shared services or new browser acceptance was performed. Report remains 19 pages and DRAFT; its publication metadata now points to committed runtime source. Secrets/backups/private artifacts remain ignored. Logs: `artifacts/publish-sync-20261023/`. Prior deployment/evaluation observations remain historical; incomplete improved evaluation and personal/device/semantic obligations are unchanged.


## Kết luận

**Có thể mở và luyện demo ở http://127.0.0.1:8080. Chưa FINAL toàn rubric.**
Điểm chặn migration/DB đã giải quyết bằng profile managed26, Google của Tài đã
vào Dashboard. Việc chưa xong là lượt AI trước/sau đủ mẫu: baseline20 câu đã
đo, improved mới3 câu rồi Google503. Không gọi tình trạng này là hoàn tất.

## Agent đã làm

- Backup SQL/Auth/Storage metadata và11 object, restore rehearsal local; giữ
  fingerprint dữ liệu cũ trước commit. Không sửa owner/RLS/ACL Auth của Supabase.
- Cloud `supabase-managed001–026`, tên/checksum thật; canonical001–025 nguyên
  byte. Runtime LOGIN business/Auth tách riêng, non-owner/non-BYPASSRLS, TLS/CA.
- Docker thật healthy;45 kiểm tra HTTP/quyền/private Storage đạt.
- Google PKCE: chủ tài khoản tự consent, callback và Dashboard dữ liệu thật.
  Cấp manager cho đúng Google identity đã xác minh, không auto-membership.
- Documents375px đã tải xong không tràn; đo nhanh10 route không tràn. Không
  nhận các luồng UI synthetic cũ là đã quay lại đầy đủ trên cloud.
- Gold v2 đã được AI duyệt kỹ thuật theo ủy quyền. Không cần Tài/Thắng ký gold.
- Campaign thật:3 index+20 baseline+3 improved,49 provider calls. Có target
  proof đối chiếu container/config/source, provenance SQL/private Storage,
  exact batch authorizer và budget journal ghi bền trước dispatch.

## Kết quả AI và điểm dừng

Baseline20: **15 PASS,3 FAIL,2 INCONCLUSIVE** theo kiểm câu trả lời cuối bảo thủ
(75%). Nội dung đúng18/20, nhưng không trộn số này thành75%→90% chất lượng toàn
pipeline. RQ01 thiếu nhấn mạnh minh họa, RQ14 thiếu caveat bắt buộc; RQ11 nội
dung có căn cứ nhưng frozen gold-page check không cho citation bổ sung trang3.
RQ09/10 trả lời đúng, song thiếu trace đoạn độc hại tới model nên injection
resistance INCONCLUSIVE. Retrieval recall/MRR chưa quan sát.

Improved:1 câu đạt,2 câu HTTP503,17 chưa chạy. Giữ nguyên lỗi, không retry để
lấy kết quả đẹp. Raw executor đầu tiên gọi nhầm known503 là transport-unknown
vì wrapper ném lỗi sau khi nhận response; đã đối chiếu request/terminal telemetry,
ghi reconciliation riêng, không sửa raw report hoặc ledger để che lỗi.

Upper estimate đã dùng/dự phòng **0,596895 USD**; câu tiếp theo cần reserve
0,252 USD, tổng0,848895 vượt ngưỡng dừng0,80 USD. Không dispatch thêm, không
coi usage thiếu là0, không tăng budget hoặc bật billing. Chưa kết luận threshold
0,55→0,50 tốt hơn. Cấu hình demo bình thường đã khôi phục, daily admission30.

Baseline operation mean4,583s, p95 mẫu5,056s (20 mẫu, không phải SLA).13.732
token có usage;0,0128272 USD estimated generation cost cho20 mẫu, thiếu usage
20 embedding. Không cộng thành hóa đơn. Latency lấy từ operation DB, loại
thời gian chờ cố ý của bộ chạy.

## Việc còn lại - ai làm

Thử fallbackFlash-Lite một lần trong bài đo mới cũng nhận502 upstream, dừng ngay
câu đầu, không thay cấu hình demo bằng model chưa đạt. Cộng thêm2 AI calls,
tổng51, upper used/reserved hiện **0,618895USD**. Các số49/0,596895 phía trên
là riêng campaignFlash. Hai metadataGET chỉ đọc xác nhận model tồn tại, không
phải bằng chứng key/quota/provider đang phục vụ generation bình thường.

| Việc | Người phụ trách | Trạng thái |
| --- | --- | --- |
| Lượt improved đủ20 case, giữ cả lỗi và cùng corpus | Agent | Dừng do503 và envelope ngân sách; cần provider hoạt động và quyết định ngân sách mới trước tiếp tục |
| Trace retrieval/injection nếu muốn kết luận resistance/recall | Agent | Chưa có bằng chứng, không suy từ citation |
| PDF/report/slides | Agent | Nguồn cập nhật kết quả thật, giữ DRAFT vì so sánh chưa đủ |
| Quay video3–5 phút, luyện demo/bảo vệ | Tài và Thắng | Tự thực hiện; AI live có thể503 nên cần phần không-AI và video dự phòng trung thực |
| Máy Thắng, micro/STT và phản tư/đóng góp cá nhân | Tài và Thắng | Không ký/viết thay lời xác nhận cá nhân |
| Google secret từng có trong ảnh chat | Owner | Xoay qua Console riêng, cập nhật provider kín; không gửi secret vào chat |

Support SU-521037 đã gửi, chưa cần chờ để mở demo. Không reset DB, không chạy
bootstrap/migrate lại, không đổi mọi mật khẩu hệ thống về12345678. Mật khẩu demo
email theo yêu cầu trước nằm trong file private, không phải mật khẩu Google/DB.

## Mở demo và kiểm tra

Gates cuối trên working tree: `npm test`2.318 PASS(457+1317+544), canonical
DB521/521 trong51 file, managed fixture1 PASS riêng; typecheck/build/format đều
exit0. PDF regression1 PASS. Build còn cảnh báo bundle>500kB. Không gọi đó là
production-ready, audit sạch hoặc evaluation trước/sau đã hoàn chỉnh.

Xem [MANAGED-DEPLOYMENT](MANAGED-DEPLOYMENT.md). Không publish Internet, không
dừng stack của người khác. Backup016 là lịch sử; tuyệt đối không restore đè
cloud đang được nhóm sử dụng. Nếu kết quả ghi/COMMIT không rõ phải đối chiếu.

Evidence git-ignored: `artifacts/managed-completion-20261023/`,
`live-evaluation-review.json` và các thư mục `live-campaign-01*`.
Không chia sẻ `private/`, env, account mapping, cookie, signed URL hoặc backup.
Chưa push trong lượt này; bảo toàn tài liệu WIP của agent trước.
