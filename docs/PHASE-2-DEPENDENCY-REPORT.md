# Đợt 2 — B0c: vá dependency có kiểm soát

Ngày kiểm: 13/10/2026. Repository `D:\New-Tech\Final-Project`, nhánh
`feature/tai-rag-integration`, bắt đầu từ `49a138f`.

## 1. Kết luận và phạm vi

Đã hoàn thành nhóm A/B/C bằng npm, không sửa code runtime. Audit đầy đủ giảm
từ 6 package bị cảnh báo xuống 0; production audit giảm từ 4 xuống 0.
Sau `npm ci` sạch: typecheck/test/build/format đều exit 0, **591 test pass**,
không fail/skipped/cancelled. Multipart regression xanh cả trước và sau nâng.

Đây là kết quả B0c trên máy hiện tại, **không phải chứng nhận pilot an toàn**:
scope dữ liệu, quyền viewer, provisioning Auth và budget AI vẫn ngoài đợt này.
Máy còn dùng Node 24.13.0, thấp hơn engine của một số tooling; xem mục 7.

Không push/merge/deploy, không chạy migration, không nối hay thay đổi Supabase,
không gọi Gemini. Không thêm dependency trực tiếp hoặc package mới trong lock;
không overrides/resolutions/audit fix/hand-edit lockfile. Giữ nguyên file prompt
untracked có trước và `.claude/settings.json`.

## 2. Thứ tự thực hiện và commit

| Bước | Commit    | Nội dung                                                        |
| ---- | --------- | --------------------------------------------------------------- |
| 0    | `3430214` | `docs: record project review, pilot roadmap and phase 1 status` |
| A    | `fe6b70e` | `fix(deps): align Nest 12.1.3 and guard multipart uploads`      |
| B    | `1e0bf04` | `fix(deps): patch proxy-addr within Express semver`             |
| C    | `87ccbe3` | `fix(deps): patch build tooling within parent semver`           |

Commit bàn giao báo cáo được tạo riêng sau bốn commit trên; xem `git log`.

Bước 0 stage đúng README, review và roadmap. Sửa dòng blockquote thành
“vùng bấm tối thiểu 44px”; README dẫn tới
[báo cáo Đợt 1](PHASE-1-SESSION-ACCESS-REPORT.md), phân biệt gate đã kiểm
320–1440px với workspace sau đăng nhập Supabase thật chưa nghiệm thu.
Review giữ số liệu lịch sử, bổ sung cập nhật Đợt 1. Không stage
`docs/PHASE-4-RAG-EVALUATION-PROMPT.md`.

## 3. Phiên bản và đường phụ thuộc

| Nhóm/package                                    | Trước  | Sau    | Căn cứ lựa chọn                                       |
| ----------------------------------------------- | ------ | ------ | ----------------------------------------------------- |
| A: @nestjs/common/core/platform-express/testing | 12.0.1 | 12.1.3 | Bốn package khớp phiên bản, pin exact qua npm         |
| A: multer                                       | 2.2.0  | 2.4.0  | platform-express 12.1.3 khai báo chính xác 2.4.0      |
| B: express                                      | 5.2.1  | 5.2.1  | Không nâng Express hoặc bật trust proxy               |
| B: proxy-addr                                   | 2.0.7  | 2.0.8  | Express yêu cầu `^2.0.7`                              |
| C: source-map-js                                | 1.2.1  | 1.2.2  | PostCSS, @tailwindcss/node, css-tree yêu cầu `^1.2.1` |
| C: brace-expansion                              | 5.0.9  | 5.0.12 | minimatch 10.2.6 yêu cầu `^5.0.8`                     |
| C: fast-uri                                     | 3.1.7  | 3.1.8  | ajv 8.20.0 yêu cầu `^3.0.1`; không lên major 4        |

CLI/schematics giữ 12.0.0: đây là các tooling có lịch phiên bản riêng, không
ép trùng với bốn package framework/runtime/testing. Build thực tế vẫn pass.

Thay đổi transitive nhóm A do npm resolve: file-type 22.0.2 → 22.1.1,
strtok3 10.3.5 → 10.4.1, uint8array-extras 1.5.0 → 1.6.0. Multer mới bỏ
concat-stream và npm loại sáu entry không còn cần: concat-stream, buffer-from,
readable-stream, string_decoder, typedarray, util-deprecate. So sánh với lock
ở `49a138f`: **0 entry package mới**. Nhóm B chỉ đổi proxy-addr; nhóm C chỉ
đổi đúng ba phiên bản kể trên.

### Release notes và thay đổi hành vi cần lưu ý

Đã đọc nguồn chính thức cho khoảng nâng:

- [12.0.2](https://github.com/nestjs/nest/releases/tag/v12.0.2): sửa UUID/pipe và xử lý lỗi/lifecycle.
- [12.0.3](https://github.com/nestjs/nest/releases/tag/v12.0.3): nâng Multer 2.4.0 và sửa UUID/ValidationPipe.
- [12.0.4](https://github.com/nestjs/nest/releases/tag/v12.0.4): merge các khóa Multer limits thay vì thay toàn bộ object.
- [12.1.0](https://github.com/nestjs/nest/releases/tag/v12.1.0): thêm cookie/CSRF/security helpers và nhiều global prefixes.
- [12.1.1](https://github.com/nestjs/nest/releases/tag/v12.1.1): sửa logger/provider overrides và pipe enum/number.
- [12.1.2](https://github.com/nestjs/nest/releases/tag/v12.1.2): có tag, trang release không có bản ghi thay đổi chi tiết; không suy đoán nội dung thiếu.
- [12.1.3](https://github.com/nestjs/nest/releases/tag/v12.1.3): sửa enhancer/lifecycle/Express; startup kiểm chặt hơn đối với class global enhancer request-scoped.

Không thấy release notes trong khoảng này tuyên bố migration breaking bắt buộc
cho cấu hình app hiện tại. Các sửa UUID/pipe/limits/enhancer có thể thay hành vi
ở app dùng chúng, nên không chỉ dựa vào semver: đã chạy suite HTTP/Auth/multipart
và build/typecheck. ExaMate không đăng ký MulterModule limits toàn cục hay
request-scoped class global enhancer trong source đã kiểm. Không bật cookie/CSRF
helpers mới, không thay lớp Auth/Origin/CSRF đang dùng. Không cần refactor runtime.

[Multer 2.4.0](https://github.com/expressjs/multer/releases/tag/v2.4.0) có
streamHandler và sửa đường upload/abort; app vẫn dùng memory storage với limits
cũ. [proxy-addr history](https://github.com/jshttp/proxy-addr/blob/master/HISTORY.md)
ghi bản 2.0.8 sửa advisory IP spoofing.

## 4. Audit trước/sau, tính theo package

| Package                  | Severity trước    | Sau A | Sau B | Cuối đợt |
| ------------------------ | ----------------- | ----- | ----- | -------- |
| @nestjs/platform-express | high (qua Multer) | hết   | hết   | hết      |
| multer                   | high              | hết   | hết   | hết      |
| proxy-addr               | critical          | còn   | hết   | hết      |
| source-map-js            | high              | còn   | còn   | hết      |
| brace-expansion          | high              | còn   | còn   | hết      |
| fast-uri                 | moderate          | còn   | còn   | hết      |

| Snapshot           | Full: critical/high/moderate/total | Omit dev: critical/high/moderate/total |
| ------------------ | ---------------------------------- | -------------------------------------- |
| Before             | 1 / 4 / 1 / 6                      | 1 / 3 / 0 / 4                          |
| A                  | 1 / 2 / 1 / 4                      | 1 / 1 / 0 / 2                          |
| B                  | 0 / 2 / 1 / 3                      | 0 / 1 / 0 / 1                          |
| After (sau npm ci) | 0 / 0 / 0 / 0                      | 0 / 0 / 0 / 0                          |

Hai lệnh audit cuối đều exit 0. Một package có thể chứa nhiều advisory; bảng
không đếm mỗi advisory thành một package mới. Audit chỉ phản ánh registry ở
thời điểm kiểm, không chứng minh app không còn lỗ hổng khác.

Raw JSON giữ trong `artifacts/phase2-dependencies-20261013/` (Git ignored):
`audit-before.json`, `audit-production-before.json`, tương tự hậu tố `A`, `B`,
`after`. Không commit JSON hoặc log/artifact.

## 5. Multipart và Auth regression

Thêm `apps/api/test/multipart.test.mjs` và child fixture
`multipart-server-fixture.mjs`; đưa suite mới vào script test API hiện có.
Child dùng Nest/Express/Multer thật, port loopback ngẫu nhiên, DB/Storage
in-memory, trusted Auth injection chỉ trong test. Không load `.env` hoặc
`dist/main.js`; môi trường child chỉ nhận PATH/SystemRoot/TEMP/TMP. Fetch ra
ngoài loopback và các lời gọi AI/indexing bị chặn. Không test upload vào API
đang nối cloud, không chạy payload DoS của advisory.

**Regression, không phải RED:** bảy test mới đều pass lần đầu trên Nest 12.0.1
/ Multer 2.2.0, sau đó pass với bản vá và sau clean install. Không ghi nhận một
test xanh sẵn là bằng chứng đã tái hiện exploit.

| Case                                                           | Kết quả trước và sau                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| PDF đúng extension/MIME/signature theo tiêu chí upload hiện có | 201, metadata stored, một mock object và một mock row                     |
| File 10 MiB + 1 byte                                           | 413, `Payload Too Large`, `File too large`                                |
| Text field lạ                                                  | 400, `Bad Request`, whitelist từ chối field                               |
| File thứ hai                                                   | 400, `Bad Request`, `Too many files`                                      |
| MIME sai                                                       | 415, `Unsupported Media Type`                                             |
| Magic sai                                                      | 415, `Unsupported Media Type`                                             |
| Ngắt request khi body còn dở                                   | Quan sát event aborted; health 200 trong timeout 2s; upload tiếp theo 201 |

Các response từ Multer/Nest trên hiện **không có application-specific `code`**.
Test assert code vẫn undefined, statusCode/error/message/requestId đúng dạng;
không tự bổ sung hoặc đổi mã trong B0c. Mỗi request bị từ chối/abort giữ nguyên
uploadCalls, mock document và object counts. PDF regression kiểm tiêu chí
endpoint upload, không chứng minh parser PDF/OCR/RAG hay malware scanning.
Abort test chứng minh process còn đáp ứng, không phải profiling mọi memory/FD leak.

`auth.test.mjs` giữ nguyên toàn bộ assertions; **28/28 pass**, cùng multipart
thành **35/35**, 0 fail/skip. Có kiểm Origin/CSRF, rotation/cookie HTTPS,
duplicate/forged cookie và principal header giả. Không nới validation.

Trust proxy xác nhận bằng source và giá trị Express thực tế `false` trong
child. `auth.service.ts` vẫn lấy `req.socket?.remoteAddress`; không đổi cách
throttle hoặc tin X-Forwarded-For. Không sửa main/configureApp/Auth source.
Thiết kế proxy khi deploy vẫn là công việc B0d riêng.

## 6. Lệnh kiểm và tính tái lập

Các lệnh npm thay đổi dependency đã chạy từ root:

```powershell
npm install @nestjs/common@12.1.3 @nestjs/core@12.1.3 @nestjs/platform-express@12.1.3 --workspace @examate/api --save-exact --ignore-scripts
npm install @nestjs/testing@12.1.3 --workspace @examate/api --save-dev --save-exact --ignore-scripts
npm update proxy-addr --ignore-scripts
npm update source-map-js brace-expansion fast-uri --ignore-scripts
npm ci
```

Update named package tuân theo semver của package cha, không thêm chúng làm
direct dependency: [npm update](https://docs.npmjs.com/cli/v11/commands/npm-update/).
Update/install đầu dùng ignore-scripts. Trước clean ci đã kiểm các install
scripts còn lại: GenAI preinstall no-op, protobufjs postinstall kiểm version
scheme, fsevents optional chỉ cho macOS. Không có install script mới từ bản vá.

`npm ci` thường (không ignore-scripts) exit 0, output:

```text
added 385 packages, and audited 389 packages in 19s
found 0 vulnerabilities
```

Npm tự thay cây node_modules, không xóa thư mục thủ công. SHA-256 lockfile trước
và sau ci giống nhau:
`DC399813C704AB8DDB77DAD8C31B79CA942670B6C049CDBF54B7E8B6DA994B26`.
Ci không đổi manifest/lock: [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/).
`npm ls @nestjs/core` exit 0: một phiên bản **12.1.3**, các nơi dùng khác deduped;
JSON được lưu ở `npm-ls-nest-core.json` trong artifacts.

| Lần chạy                         | API Vitest    | API node:test         | Web Vitest                         | Fail / skip |
| -------------------------------- | ------------- | --------------------- | ---------------------------------- | ----------- |
| Trước nâng, đã thêm 7 regression | 197 / 14 file | 216                   | 178 / 9 file                       | 0 / 0       |
| Sau A                            | 197 / 14 file | 216                   | Không chạy lại; đã xanh trước nâng | 0 / 0 ở API |
| Sau B, focused                   | —             | Auth 28 + multipart 7 | —                                  | 0 / 0       |
| Sau C + clean npm ci, full       | 197 / 14 file | 216                   | 178 / 9 file                       | 0 / 0       |

Mốc Đợt 1 là 584; thêm bảy regression thành **591**. Không thêm test ngoài
bảy case này. Node:test cuối còn ghi cancelled 0, todo 0; Vitest tất cả file
và test đều passed.

| Lệnh cuối từ root, sau clean ci | Exit | Log artifact                |
| ------------------------------- | ---- | --------------------------- |
| `npm run typecheck`             | 0    | typecheck-final.log         |
| `npm test`                      | 0    | tests-final.log             |
| `npm run build`                 | 0    | build-final.log             |
| `npm run format:check`          | 0    | format-final.log            |
| `npm audit --json`              | 0    | audit-after.json            |
| `npm audit --omit=dev --json`   | 0    | audit-production-after.json |

Sau A còn chạy root typecheck/build/format và test API, đều exit 0. Các log
`*-A.log`, `tests-B.log`, `tests-before.log`, `multipart-before.log` và
`npm-*.log` giữ output gốc. Docs/manifest/lock cũng kiểm Prettier riêng; root
format script chỉ bao phủ source/test/scripts, không thay thế kiểm docs.

## 7. Defer, reachability và giới hạn

**Không defer bản vá nào trong A/B/C:** cả ba tooling có patch trong semver
package cha. Không cần nâng major fast-uri 4 hoặc update cả CLI/toolchain.

Đường tooling đã đối chiếu với npm ls và package manifests:

- source-map-js: web → @tailwindcss/vite → @tailwindcss/node; web → vite →
  postcss; web dev test → jsdom → css-tree. Là đường build/CSS/test, không phải
  parser PDF hoặc route API. Dù plugin Vite nằm trong dependencies nên audit
  omit-dev vẫn từng báo nó, classification đó không chứng minh browser gọi
  SourceMapConsumer với dữ liệu upload.
- brace-expansion: API dev → @nestjs/cli → minimatch → brace-expansion;
  xử lý glob trong tooling, không thấy dùng như API xử lý input người dùng.
- fast-uri: API dev → @nestjs/cli → @angular-devkit/core → ajv → fast-uri;
  ở schema/tooling, không phải bộ kiểm host/Origin của Auth.

Các đường này vẫn cần bản vá vì input repository/sourcemap/glob không tin cậy
có thể ảnh hưởng build/test. Không suy ra không thể khai thác chỉ vì là dev.
Tham khảo [source-map advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q),
[brace-expansion advisory](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr),
[fast-uri advisory](https://github.com/fastify/fast-uri/security/advisories/GHSA-hrr3-gc8f-f4qj).

**Backlog môi trường:** Node máy 24.13.0, npm 11.6.2. npm ci vẫn exit 0 nhưng
có EBADENGINE của Angular devkit 22.1.5 (yêu cầu `^24.15.0` trên Node 24),
jsdom 30.0.1 (tương tự), và deprecated node-domexception 1.0.0 có sẵn. Không
đổi Node hoặc package ngoài phạm vi để giấu warning. Review lại **20/10/2026
hoặc trước B0d/pilot, tùy mốc nào đến trước**: dùng Node 24.15+ tương thích
engine, chạy lại ci/gates. Lần kiểm hiện tại không chứng minh supported-engine
runtime đã được kiểm trên máy khác.

Không chạy browser UI, DB integration thật, Gemini live hay khai thác DoS;
B0c không thay UI/SQL/RAG. Multipart/Auth là HTTP thật trên mocks trong process
cô lập, không phải kiểm Supabase thật. Không mở server demo trên 3000/5173.
Dừng sau báo cáo, chờ Tài review; chưa tiến sang B0d hoặc tính năng mới.
