# Đợt 3 — B0d: bind/origin/proxy và Docker/DB disposable

Ngày 13/10/2026; repo `D:\New-Tech\Final-Project`, nhánh
`feature/tai-rag-integration`, bắt đầu từ `f114346`.
Tài đã chọn origin dev **http://127.0.0.1:5173**.

**Trạng thái mới nhất:** 3b đã kiểm thật, 688 test ở bốn gates và 10 DB
integration pass; stack đã dọn. Mục 8 là bàn giao hiện tại; mục 1–7 giữ
snapshot/lịch sử 3a, không thay thế kết quả mới.

## 1. Snapshot 3a — trước khi tiếp tục Docker/DB

**Hoàn thành 3a ở mức code và HTTP/process cô lập. Chưa hoàn thành B0d toàn bộ.**

Đây là snapshot lịch sử tại `3598b24`. Kết quả 3b mới và kết luận hiện tại ở
mục 8 bên dưới; không dùng tình trạng Docker bị chặn này làm trạng thái mới nhất.
Docker info đầu và cuối đợt đều exit 1: không kết nối được pipe
`dockerDesktopLinuxEngine`. Theo yêu cầu, dừng sau 3a; **không thực hiện 3b**.

- Baseline bốn gates exit 0: 591 pass; API Vitest 197, API node:test 216, web 178.
- Cuối 3a bốn gates exit 0: **644 pass**; API Vitest 197, API node:test 269, web 178.
- Fail/skipped/cancelled: 0 trong full suite cuối. API Vitest 14 file, web 9 file.
- Thêm 53 test: bind 23, proxy 30. Quan sát **46 test RED** trước fix, 7 test
  xanh từ đầu là regression/control, không gọi chúng là RED.
- Không push/merge/deploy, không sửa migration hoặc chạm Supabase/Gemini.
- Không sửa `.env` thật, Dockerfile, contracts, dependency/lockfile, hoặc
  `.claude/settings.json`. File prompt untracked có trước vẫn nguyên, không stage.

**Không chạy `npm run test:database`**: không có kết quả pass hoặc skipped 0
cho suite DB. Không dùng con số 644 để thay thế nghiệm thu DB/Supabase.

## 2. Commit theo từng phần

| Phần | Commit    | Nội dung                                                              |
| ---- | --------- | --------------------------------------------------------------------- |
| 3a.1 | `78a9bba` | `fix(runtime): validate explicit bind independently of cookie origin` |
| 3a.2 | `1e1c163` | `fix(dev): pin loopback origin and separate Docker origin`            |
| 3a.3 | `aac73af` | `fix(auth): trust only the explicit Nginx peer for client admission`  |

Commit tài liệu bàn giao được tạo riêng sau ba commit trên; xem `git log`.

## 3. Bind và origin

`httpRuntimeConfig()` validate cấu hình HTTP riêng. `appConfig()` gọi nó trước
khi đọc config DB/Storage; `configureApp()` cũng validate để entry point test
không bỏ qua cấu hình trust sai.

- HOST mặc định 127.0.0.1 trong cả development/test/production, không suy ra từ
  PUBLIC_ORIGIN, NODE_ENV hoặc cookie Secure. `main.ts` dùng config.host trực tiếp.
- HOST chỉ nhận IP literal; empty/hostname/URL/CIDR/list/port/bracketed IPv6 sai
  đều lỗi ConfigurationError, không tự đổi thành 0.0.0.0. IPv6 `::1` bind thật
  trong child test; wildcard IP chỉ được chấp nhận khi khai báo tường minh.
- Compose đặt HOST=0.0.0.0 bên trong container API, **không thêm published API port**.
- Vite host 127.0.0.1, port 5173, strictPort true; proxy target 127.0.0.1:3000.
  Port bận thì lỗi, không tự đổi thành 5174. Không đổi cơ chế cookie/Origin/CSRF.
- Template/default dev cùng origin 127.0.0.1:5173. Docker dùng biến riêng
  DOCKER_PUBLIC_ORIGIN=127.0.0.1:8080 với scheme http; Compose truyền origin này
  cho cả PUBLIC_ORIGIN và ALLOWED_ORIGINS của API.

| Môi trường         | Bind API                  | Public origin         | Trust                                   |
| ------------------ | ------------------------- | --------------------- | --------------------------------------- |
| Dev trực tiếp/Vite | 127.0.0.1                 | http://127.0.0.1:5173 | Tắt                                     |
| Compose dự kiến    | 0.0.0.0 nội bộ            | http://127.0.0.1:8080 | Chỉ Nginx 172.30.250.10 tại hop 0       |
| Child test         | Loopback, port ngẫu nhiên | Fixture riêng         | Tắt hoặc hop loopback để mô phỏng proxy |

Template **không ghi đè `.env` đang có**. README yêu cầu Tài sửa riêng HOST,
PUBLIC_ORIGIN, ALLOWED_ORIGINS, PORT và để TRUSTED_PROXY_IP trống cho dev, rồi
restart API. Không copy đè file chứa secrets. Luồng login Supabase thật chưa
nghiệm thu; không khẳng định `.env` người dùng hiện đã đủ hoặc đúng cấu hình.

## 4. Proxy và admission

TRUSTED_PROXY_IP trống/absent là tắt. Khi bật, chỉ nhận một IPv4 literal unicast;
reject true/false/số hop/hostname/CIDR/list/IPv6/wildcard/0-network/multicast/
broadcast. Không chấp nhận `trust proxy=true` hoặc tin cả subnet.

Express custom trust predicate chỉ nhận **socket peer đúng IP tại hop 0**;
địa chỉ mapped IPv6 được chuẩn hoá. Cùng IP xuất hiện ở hop 1 không kéo dài
chuỗi trust. Auth lấy req.ip do Express xác định, không đọc raw XFF; validate
và canonicalize IPv6/mapped IPv4 trước HMAC admission. Giá trị forwarded sai
dùng socket bucket; không tạo bucket tuỳ ý theo text client đưa vào.

Nginx đổi XFF từ proxy_add_x_forwarded_for sang **remote_addr**, ghi đè cả
forwarded host/proto; Origin header vẫn chuyển nguyên và Auth kiểm exact origin.
Cookie flags vẫn theo PUBLIC_ORIGIN qua AuthSettings, không theo req.protocol.

Compose dùng bridge 172.30.250.0/24, Nginx/web .10, API .20. TRUSTED_PROXY_IP
khớp đúng địa chỉ web. Network vẫn cho phép egress cần thiết, không dùng
internal network chặn Supabase. Chỉ web publish 127.0.0.1:8080:80.

**Trust boundary:** IP nhận diện network peer, không chứng minh tên process.
Thiết kế giả định quyền sở hữu container/address/network được kiểm soát, không
có real_ip rewriting tuỳ tiện. Không publish API trực tiếp khi dùng trust. NAT,
subnet overlap và peer address trên Docker Desktop **chưa kiểm thật**; phải kiểm
3b trước nghiệm thu triển khai. IP rate limit không phân biệt được người cùng NAT.

Chuẩn hoá địa chỉ có thể đổi bucket của dạng IP từng được ghi khác cách biểu
diễn; không xoá/reset counter hoặc sửa SQL trong đợt này. Không đổi limits,
thời hạn session, role/scope, thuật toán RAG hay API response shape.

## 5. Test viết trước và review

Tests fork worker với env allowlist PATH/SystemRoot/TEMP/TMP và giá trị cấu hình
test được nêu rõ; loại credentials/NODE_OPTIONS, không load .env/dist/main.js.
DB/Storage in-memory, adapter Auth giả lập, HTTP/HTTPS ngoài loopback và AI bị
chặn. Đây là Nest/Express/AuthService HTTP thật trên **fixture**, không phải
Supabase Auth, không phải DB integration hoặc Nginx runtime.

| Mốc quan sát                                                 | Kết quả                                                              |
| ------------------------------------------------------------ | -------------------------------------------------------------------- |
| RED đầu: bind + proxy                                        | 42 test: 39 fail, 3 control pass, exit 1                             |
| GREEN bind focused                                           | 23/23, exit 0                                                        |
| RED proxy bổ sung theo review                                | 27 test: 21 fail, 6 regression pass, exit 1                          |
| RED main config khi thiếu cloud                              | 1 fail: còn báo DATABASE_URL trước khi có validator TRUSTED_PROXY_IP |
| RED 0-network + control multicast                            | 1 fail, 1 pass trước bổ sung chặn 0/8                                |
| GREEN focused Auth + multipart + proxy (trước hai case cuối) | 63/63, exit 0                                                        |
| Full suite cuối                                              | 644/644, exit 0, không skip/fail                                     |

46 unique test từng fail được đối chiếu từ tên test trong bốn log RED, không
cộng trùng các lần chạy. Bảy control/regression gồm trust mặc định tắt, thiếu
Auth fail closed, invalid/empty forwarded fallback, multicast và cookie/CSRF
có sẵn. Không nới assertions để làm xanh.

Coverage đáng chú ý: mọi NODE_ENV/public HTTPS vẫn bind loopback mặc định;
invalid config chưa listen; spoof XFF khi direct không né bucket; hop khác bị
bỏ qua; trusted client khác nhau có bootstrap/login bucket khác; repeat bị
429; attacker entry cũ không quyết định IP; IPv6/mapped variants cùng bucket;
forwarded proto/host không đổi cookie Secure/name; wrong Origin/CSRF bị 403
trước admission/provider. 28 test Auth có sẵn và 7 multipart regression vẫn pass.

Reviewer độc lập theo doubt-driven-development đã chỉ ra: origin `.env` cũ,
canonical IP/fallback, validator ở mọi entry point, peer không phải process và
giới hạn Docker. Đã xử lý bằng code/tests/README và ghi rõ trade-off. Tài chọn
không thêm cross-model review; không gọi CLI/model bên ngoài.

### Lỗi trung gian đã xử lý, không giấu

- Lượt GREEN bind đầu: 11 fail do fixture nhận diện lớp lỗi qua error.name;
  ConfigurationError có sẵn kế thừa tên Error. Sửa fixture dùng constructor.name;
  không đổi production exception để chiều test. Focused bind sau đó 23/23.
- Fixture RED ban đầu có cleanup race EPIPE; sửa handshake cleanup rồi lưu
  lượt RED sạch 39 fail/3 pass, không coi lỗi fixture đó là lỗi sản phẩm.
- Diagnostic Vite đầu dùng envFile:false có deprecation warning. Bản kiểm
  cuối dùng envDir:false, không load env files.
- Extra Prettier check từng đưa .env.example vào và báo không có parser.
  Không thay rule; kiểm dotenv bằng Node parseEnv, kiểm riêng file hỗ trợ bằng
  Prettier exit 0. Root format gate cuối vẫn exit 0.

## 6. Bằng chứng chạy thật và logs

Artifacts (ignored Git): `artifacts/phase3-runtime-20261013/`.

| Lệnh                                                                      | Baseline    | Cuối 3a        | Log                                           |
| ------------------------------------------------------------------------- | ----------- | -------------- | --------------------------------------------- |
| node -v                                                                   | v24.13.0    | Không đổi Node | node-version.log                              |
| docker info                                                               | 1           | 1              | docker-info-baseline.log, docker-info-end.log |
| npm run typecheck                                                         | 0           | 0              | typecheck-baseline/final.log                  |
| npm test                                                                  | 0: 591 pass | 0: 644 pass    | tests-baseline/final.log                      |
| npm run build                                                             | 0           | 0              | build-baseline/final.log                      |
| npm run format:check                                                      | 0           | 0              | format-baseline/final.log                     |
| docker compose --env-file .env.example config --no-env-resolution --quiet | —           | 0              | compose-bind/origin/proxy/final-config.log    |
| npm run test:database                                                     | Không chạy  | Không chạy     | Không có kết quả DB                           |

Compose JSON được kiểm chọn lọc, không in env/secrets: API không published,
HOST rõ ràng, TRUSTED_PROXY_IP trùng địa chỉ Nginx. Parse/config check **không
thay thế** docker compose build/up hoặc nginx -t trong container.

Dev-origin diagnostic khởi động API giả lập trên 3000 + Vite thật trên 5173,
kiểm qua đường proxy: health 200; Auth thiếu config 503 AUTH_UNAVAILABLE;
wrong Origin/CSRF 403; login synthetic đúng 200. Một Vite thứ hai cùng port
bị từ chối thay vì sang port khác. Log `dev-origin-after-proxy.log` exit 0.
Không dùng key giả trong môi trường thật để vượt Auth; synthetic config chỉ
được inject trong test harness, không có runtime bypass flag.

Đã chạy riêng **npm run dev:web** qua terminal, quan sát:

```text
VITE v8.2.2 ready in 433 ms
Local: http://127.0.0.1:5173/
```

Sau kiểm đã đóng bằng q; không còn listener 3000/5173 của các fixture/dev
server. Không kiểm UI/Chrome hay login Supabase thật trong đợt này.

Lockfile SHA-256 không đổi:
`DC399813C704AB8DDB77DAD8C31B79CA942670B6C049CDBF54B7E8B6DA994B26`.
Không có thay đổi migration 001–013, database.test.mjs, compose.local-db.yaml,
Dockerfiles, contracts hoặc settings trong diff so với f114346.

## 7. Tài tự kiểm lại và phần còn lại

Từ root, sau chỉnh các biến công khai trong .env theo README:

```powershell
npm run typecheck
npm test
npm run build
npm run format:check
# Test focused tự fork worker, không cần DB/Storage/Auth cloud:
node --test apps/api/test/bind.test.mjs apps/api/test/proxy-trust.test.mjs
npm run dev:api
# Terminal thứ hai:
npm run dev:web
```

Dev API vẫn cần cấu hình DB/Storage hợp lệ; Auth thiếu cấu hình là 503 đúng,
không phải lý do đổi CORS/CSRF hoặc điền key giả. Mở đúng origin 127.0.0.1:5173;
localhost là origin khác. Kiểm README trước chạy migrate: không tự áp 012/013
trên Supabase dùng chung.

**Để tiếp tục 3b:** mở Docker Desktop Linux engine, đợi docker info exit 0,
rồi yêu cầu tiếp tục phần Docker/DB. Chưa làm: build/up stack, Nginx → API thật,
pgvector disposable, Auth schema fixture, migrations hai lần/checksum,
non-owner NOBYPASSRLS/grants, row locks/race admission/persistence và guard
TEST_DATABASE_URL localhost/khác DATABASE_URL trong .env. Không coi hướng dẫn
DB cũ là đã tương thích migration 012/013.

Node dev vẫn 24.13.0, dưới engines của một số tooling (nhánh 24 cần 24.15+).
Gates trên máy này đã pass, không chứng minh runtime supported-engine trên
Docker hoặc máy khác. Dockerfile vẫn nhánh 24, không đổi trong đợt này.
Auth fixture phục vụ test SQL/HTTP **không phải Supabase Auth thật**. Không làm
B1/B2, không grant/provision/migrate cloud; dừng bàn giao 3a.

## 8. Tiếp tục 3b — Docker và DB đã kiểm thật

Ngày 13/10/2026, bắt đầu từ `3598b24`. Docker info exit 0:
**ServerVersion 29.6.2, OSType linux**. B0d 3b đã đạt các phép kiểm local được
giao. Không có nghiệm thu Supabase Auth, tenant authorization, Storage cloud,
AI live, B1/B2 hoặc public deployment trong kết luận này.

### 8.1. Preflight và baseline

- Git đúng nhánh/HEAD; chỉ có prompt untracked đã tồn tại, không stage.
- Baseline bốn gates đã chạy lại, logs cho thấy 644 pass: API Vitest 197,
  API node:test 269, web 178, 0 fail/skip. Output baseline từng exit không được
  lấy hết từ session nền; kết quả gate cuối được thu đủ exit code riêng.
- Docker networks trước chạy: bridge 172.17/16, sop 172.18/16,
  individual_project 172.19/16, coursemate-ai 172.20/16, examate-ai 172.21/16.
  Windows có Wi-Fi 192.168.1/24 và WSL 172.17.128/20. Không chồng
  **172.30.250/24**; không coi default route 0/0 là subnet đã cấp. Không đổi subnet 3a.
- Chỉ tạo project `examate-b0d-20261013`, volume test-postgres-data theo project.
  Không dùng volume/container khác; không chạy vào Supabase.

### 8.2. Build và lỗi thật được xử lý

`docker compose -p examate-b0d-20261013 build` lần đầu exit 1: Dockerfile thiếu
workspace `packages/contracts`, build web báo TS2307. Sửa duy nhất phần COPY
contracts vào build của API/web và runtime API; không đổi model, app logic,
lockfile hoặc Node ngoài nhánh 24. Lần build sau exit 0 cho cả hai image.
Container API chạy **Node v24.21.0**; máy host vẫn v24.13.0.

Lượt stack đầu healthy nhưng curl 8080 thất bại: override dùng internal-only
network khiến publish host không hoạt động. Sửa **test override**, không sửa
3a: API chỉ nối pilot internal; web/DB thêm ingress để host truy cập loopback.
Ingress do Docker cấp 172.23/16; network pilot vẫn 172.30.250/24. Không cho API
egress cloud. Đây là lỗi setup kiểm thử đã đo, không giấu hoặc gọi là pass.

### 8.3. Proof Nginx, origin và API port

Stack build/up thật với Compose base + local-db + compose.test-stack.yaml;
thêm overlay diagnostic tạm không commit. `up -d --wait` exit 0;
`nginx -t` trong container exit 0.

```text
web  127.0.0.1:8080->80/tcp
db   127.0.0.1:55432->5432/tcp
api  3000/tcp (HostConfig.PortBindings = {})
```

Gửi `X-Forwarded-For: 1.2.3.4` qua 8080, diagnostic metadata-only ghi:

```json
{
  "event": "TEMP_PROXY_PROOF",
  "ip": "172.23.0.1",
  "socket": "172.30.250.10",
  "forwarded": "172.23.0.1",
  "status": 503
}
```

IP client là gateway ingress thật, không phải header giả; socket peer đúng
Nginx .10. Diagnostic không log cookie/key/token/response body và đã xoá sau
kiểm. API chỉ gắn network pilot; inspect xác nhận pilot Internal=true.

| Request thực                                            | Kết quả                                       |
| ------------------------------------------------------- | --------------------------------------------- |
| GET 8080/api/health                                     | HTTP 200, `{status:ok}`                       |
| GET 8080/api/auth/session, giả XFF                      | HTTP 503, AUTH_UNAVAILABLE, không Auth config |
| POST 8080/api/auth/login, Origin attacker và không CSRF | HTTP 403, CSRF_INVALID                        |
| curl 127.0.0.1:3000/api/health                          | exit 7, không kết nối được                    |

POST trên chứng minh request bị chặn; vì thiếu CSRF cùng lúc, không gọi đó là
phép chứng minh Origin-only với Auth cấu hình thật. Những phép kiểm độc lập
Origin/CSRF có sẵn trong Auth/3a vẫn pass. Không điền fake Auth key để vượt gate.

Trong kiểm, API dùng DB local và role `examate_b0d_runtime_fixture`:
current_database examate_test; rolsuper/rolbypassrls/rolcreatedb/rolcreaterole
đều false. Storage config **có sẵn** được giữ riêng để startup validation,
không gọi Storage và không in giá trị. Auth/Gemini keys bị loại bỏ, API không
có network egress. File env riêng có key đã xoá sau down.

### 8.4. DB guard và integration

Guard được test viết trước: RED exit 1 vì module chưa tồn tại, sau implement
44/44 unit pass. Không khẳng định từng case đã RED riêng. Guard chạy trước
mọi Pool/migration/grant/cleanup: exact localhost/127.0.0.1, PostgreSQL,
database *_test, không query/socket/fragment override; so sánh DATABASE_URL
process và `.env` độc lập, canonical alias/default port/encoded DB name,
không coi đổi credentials là target khác. Không load `.env` vào process,
error không có URI/credentials. Thiếu TEST_DATABASE_URL fail, không skip.

DB test cũ đã chạy vào **container riêng** và RED với 3F000, thiếu schema auth
ở migration 012. Thêm schema fixture chỉ trong test harness, không sửa 001–013:
auth.users chỉ id; auth.sessions chỉ id/user_id/not_after. Schema/role được
gắn marker test; không sửa auth schema/role có marker khác.

Runtime role là LOGIN riêng, NOINHERIT/NOBYPASSRLS/NOSUPERUSER/NOCREATEDB/
NOCREATEROLE, không owner. Grant USAGE schema, SELECT auth.sessions ba cột,
read workspaces/membership, SELECT/INSERT/UPDATE sessions/limits và
SELECT/INSERT refresh intent. Không đọc auth.users/schema_migrations, không
DDL/SET ROLE owner, không write workspaces hoặc DELETE counters.

RLS vẫn bật. Fixture policies chỉ cho **backend test role**, không PUBLIC,
không phải tenant policy B2. Có probe RLS không policy: SELECT 0 row, INSERT
42501 dù được SQL grant. Không dùng owner/BYPASS để giả kiểm runtime; riêng
case legacy HTTP Tasks/Documents owner chỉ là domain persistence regression.

`npm run test:database` cuối **exit 0, 10 pass, skipped/cancelled/fail 0**:

1. 13 migrations chạy hai lần; ledger checksum và applied_at không đổi;
   checksum đối chiếu source normalize CRLF như runner.
2. Runtime role/owner/RLS flags và quyền bị từ chối đúng 42501.
3. RLS default-deny trên probe của chính lượt test.
4. Session/membership/auth-session đọc và revoke dưới runtime role.
5. Prelogin replacement một transaction, reuse bị từ chối.
6. Row lock có wait_event_type Lock thật trong pg_stat_activity; callback
   thứ hai chưa vào, sau release thấy version mới. Refresh intent độc lập
   commit khi session lock vẫn giữ; duplicate intent bị từ chối.
7. 20 admission calls Promise.all: đúng 3 allowed, 17 denied, hits=3.
8. Multi-key admission rollback counter trước khi bucket sau đã đầy.
9. Đóng/mở pool thực: session, intent, counter còn nguyên.
10. Task/document qua HTTP persisted sau restart API, download/delete thực
    trên DB; Auth/Storage mocked, không tuyên bố live Storage/Authorization.

Cleanup chỉ UUID/hash của run và bảng probe tên random đã tạo. Không truncate,
drop/reset DB; role/policies/seed minh hoạ còn trong volume test riêng. Log
database.query_failed của các case denial/limit là lỗi **cố ý được assert**,
không phải unexpected fail. SQL/runtime algorithms không sửa để test xanh.

### 8.5. Gates, artifacts và commit

| Lệnh cuối                   | Exit              | Pass / skipped                                      |
| --------------------------- | ----------------- | --------------------------------------------------- |
| npm run typecheck           | 0                 | —                                                   |
| npm test                    | 0                 | 688 / 0: API Vitest 197, API node:test 313, web 178 |
| npm run build               | 0                 | —                                                   |
| npm run format:check        | 0                 | —                                                   |
| npm run test:database       | 0                 | 10 / 0                                              |
| docker compose build        | 0 sau COPY fix    | Hai image                                           |
| docker compose up -d --wait | 0 sau ingress fix | Ba service                                          |
| nginx -t                    | 0                 | Syntax/config successful                            |

Artifacts ignored: `artifacts/phase3b-runtime-db-20261013/`, gồm build-before/
after, docker-info/network/subnets/routes, DB RED/final, guard RED/green,
health/auth/origin/port proof, API diagnostic log, container runtime role,
gates baseline/final, nginx config test và down logs. Không commit artifacts.

| Commit  | Phần                                            |
| ------- | ----------------------------------------------- |
| 59b581f | Include contracts workspace trong Docker images |
| 9e928a1 | Guard target DB và 44 unit regression           |
| beda3c5 | DB integration/fixture role, 10 live SQL tests  |
| c7d4baa | Test-stack override chặn API egress             |

Commit docs cuối chứa phần bàn giao/README này; xem git log. Chưa push/merge.
Lockfile vẫn SHA-256 DC399813C704AB8DDB77DAD8C31B79CA942670B6C049CDBF54B7E8B6DA994B26.
Không thay migration, app runtime 3a, contracts, .env thật hoặc settings.

### 8.6. Dọn dẹp và tự chạy lại

Đã chạy **cả hai down**, exit 0, không `-v`:

```powershell
docker compose --env-file .env.example -p examate-b0d-20261013 -f compose.yaml -f compose.local-db.yaml -f compose.test-stack.yaml -f artifacts/phase3b-runtime-db-20261013/compose-check.yaml down
docker compose -p examate-b0d-20261013 -f compose.local-db.yaml down
```

Lệnh thứ hai dọn default network đã tạo khi bắt đầu chỉ up DB. Sau down:
không còn container của project test, không listener 3000/8080/55432; SOP
frontend/backend vẫn chạy. Giữ đúng volume
`examate-b0d-20261013_test-postgres-data`, không xoá volume khác. Diagnostic,
overlay diagnostic, private-runtime.env và generator tạm đã xoá; các down
command có overlay là **lịch sử**, file đó không còn để dùng.

Chạy lại theo README: Docker info + kiểm subnet/ports; up DB qua local-db file
với project riêng; TEST_DATABASE_URL loopback đúng container; test:database;
build/up ba Compose file **tracked** (base/local-db/test-stack); curl/ps;
down ba file rồi down local-db file, không volumes flag. Proof XFF cần
diagnostic tạm riêng, không bật runtime bypass hoặc commit log/header dump.

Host Node vẫn 24.13.0 dưới engines một số tooling; Docker Node 24.21.0 đáp ứng
nhánh 24. Fixture Auth/SQL không phải Supabase Auth; RLS test role không phải
tenant isolation hay evidence viewer/member/manager của B2. Không public
pilot hoặc tự provision/migrate cloud chỉ vì B0d local đã pass.

### Nguồn tham chiếu 3a/3b

- [PostgreSQL RLS](https://www.postgresql.org/docs/16/ddl-rowsecurity.html): default-deny và khác biệt owner/BYPASSRLS.
- [PostgreSQL row locks](https://www.postgresql.org/docs/16/explicit-locking.html#LOCKING-ROWS): FOR UPDATE chờ transaction giữ khóa.
- [Compose merge/reset](https://docs.docker.com/reference/compose-file/merge/#reset-value): override/reset cấu hình test mà không nới bản 3a.

- [Express proxy trust](https://expressjs.com/en/guide/behind-proxies/): trust phải khớp hop thật, không tin forwarded header tuỳ tiện.
- [Nginx proxy_set_header](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header): ghi đè header tại proxy.
- [Vite server options](https://vite.dev/config/server-options#server-strictport): host/port cố định và strictPort.
- [Vite envDir](https://vite.dev/config/shared-options#envdir): false để tắt env loading trong diagnostic.
- [Compose static addresses](https://docs.docker.com/reference/compose-file/services/#ipv4_address): địa chỉ static đi cùng subnet IPAM.
- [Node net.isIP](https://nodejs.org/api/net.html#netisipinput): validate IP literal; canonical IPv6/mapped được kiểm thực bằng Node 24 trong regression.
