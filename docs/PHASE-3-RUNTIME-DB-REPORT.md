# Đợt 3 — B0d: bind/origin/proxy; DB còn chờ Docker

Ngày 13/10/2026; repo `D:\New-Tech\Final-Project`, nhánh
`feature/tai-rag-integration`, bắt đầu từ `f114346`.
Tài đã chọn origin dev **http://127.0.0.1:5173**.

## 1. Kết luận nghiệm thu theo phạm vi

**Hoàn thành 3a ở mức code và HTTP/process cô lập. Chưa hoàn thành B0d toàn bộ.**
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

## Nguồn kỹ thuật

- [Express proxy trust](https://expressjs.com/en/guide/behind-proxies/): trust phải khớp hop thật, không tin forwarded header tuỳ tiện.
- [Nginx proxy_set_header](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header): ghi đè header tại proxy.
- [Vite server options](https://vite.dev/config/server-options#server-strictport): host/port cố định và strictPort.
- [Vite envDir](https://vite.dev/config/shared-options#envdir): false để tắt env loading trong diagnostic.
- [Compose static addresses](https://docs.docker.com/reference/compose-file/services/#ipv4_address): địa chỉ static đi cùng subnet IPAM.
- [Node net.isIP](https://nodejs.org/api/net.html#netisipinput): validate IP literal; canonical IPv6/mapped được kiểm thực bằng Node 24 trong regression.
