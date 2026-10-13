import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { withRuntime } from "./runtime-test-process.mjs";

function bootstrapKey(ip) {
  return admissionKey("bootstrap:" + ip);
}
function admissionKey(value) {
  return createHmac("sha256", Buffer.alloc(32, 7))
    .update("examate-auth-admission-v1:" + value)
    .digest("hex");
}
test("invalid trust fails main app configuration before missing cloud settings", async () =>
  withRuntime(
    "startup-config",
    { TRUSTED_PROXY_IP: "true" },
    async (worker) => {
      assert.equal(worker.first.type, "startup-error");
      assert.equal(worker.first.name, "ConfigurationError");
      assert.match(worker.first.reason, /TRUSTED_PROXY_IP/);
      assert.equal(worker.first.listenCalls, 0);
      assert.equal((await worker.exited)[0], 1);
    },
  ));
async function bootstrap(worker, xff) {
  return worker.call({ type: "bootstrap", xff });
}
function assertAdmission(response, ip, status) {
  assert.equal(response.status, status);
  assert.equal(response.observed.ip, ip);
  assert.deepEqual(response.keys, [{ key: bootstrapKey(ip), limit: 1 }]);
  if (status === 429) assert.equal(response.body.code, "LOGIN_RATE_LIMITED");
}

for (const TRUSTED_PROXY_IP of [undefined, ""])
  test(`proxy trust is off when ${TRUSTED_PROXY_IP === undefined ? "absent" : "empty"}; direct fake XFF cannot evade admission`, async () =>
    withRuntime("proxy", { TRUSTED_PROXY_IP }, async (worker) => {
      assert.equal(worker.first.type, "ready");
      assert.deepEqual(worker.first.trust, {
        loopback: false,
        mappedLoopback: false,
        olderLoopback: false,
        other: false,
      });
      const first = await bootstrap(worker, "198.51.100.11");
      assertAdmission(first, "127.0.0.1", 200);
      const second = await bootstrap(worker, "198.51.100.12");
      assertAdmission(second, "127.0.0.1", 429);
      assert.deepEqual(second.counters, first.counters);
      assert.equal(second.rows, first.rows);
    }));

test("trusted loopback proxy gives separate verified-client bootstrap buckets and limits repeats", async () =>
  withRuntime("proxy", { TRUSTED_PROXY_IP: "127.0.0.1" }, async (worker) => {
    assert.equal(worker.first.type, "ready");
    assertAdmission(
      await bootstrap(worker, "198.51.100.11"),
      "198.51.100.11",
      200,
    );
    assert.deepEqual(worker.first.trust, {
      loopback: true,
      mappedLoopback: true,
      olderLoopback: false,
      other: false,
    });
    const second = await bootstrap(worker, "198.51.100.12");
    assertAdmission(second, "198.51.100.12", 200);
    assert.equal(second.counters.length, 2);
    assert.equal(second.rows, 2);
    const repeated = await bootstrap(worker, "198.51.100.11");
    assertAdmission(repeated, "198.51.100.11", 429);
    assert.deepEqual(repeated.counters, second.counters);
    assert.equal(repeated.rows, second.rows);
  }));

test("a different socket hop ignores XFF even with an explicit trusted proxy configured", async () =>
  withRuntime("proxy", { TRUSTED_PROXY_IP: "192.0.2.10" }, async (worker) => {
    assert.equal(worker.first.type, "ready");
    assert.equal(worker.first.trust.other, true);
    assert.equal(worker.first.trust.loopback, false);
    const first = await bootstrap(worker, "198.51.100.11");
    assertAdmission(first, "127.0.0.1", 200);
    const second = await bootstrap(worker, "198.51.100.12");
    assertAdmission(second, "127.0.0.1", 429);
    assert.deepEqual(second.counters, first.counters);
  }));

test("only immediate proxy hop is trusted; older attacker entries never choose the admission key", async () =>
  withRuntime("proxy", { TRUSTED_PROXY_IP: "127.0.0.1" }, async (worker) => {
    assert.equal(worker.first.type, "ready");
    const first = await bootstrap(worker, "203.0.113.66, 198.51.100.11");
    assertAdmission(first, "198.51.100.11", 200);
    const second = await bootstrap(worker, "203.0.113.77, 198.51.100.11");
    assertAdmission(second, "198.51.100.11", 429);
    assert.deepEqual(second.counters, first.counters);
  }));

test("a trusted-address entry in XFF cannot extend trust beyond hop zero", async () =>
  withRuntime("proxy", { TRUSTED_PROXY_IP: "127.0.0.1" }, async (worker) => {
    assert.equal(worker.first.type, "ready");
    assert.equal(worker.first.trust.loopback, true);
    assert.equal(worker.first.trust.olderLoopback, false);
    const first = await bootstrap(worker, "203.0.113.66, 127.0.0.1");
    assertAdmission(first, "127.0.0.1", 200);
    const second = await bootstrap(worker, "203.0.113.77, 127.0.0.1");
    assertAdmission(second, "127.0.0.1", 429);
    assert.deepEqual(second.counters, first.counters);
  }));

for (const [label, TRUSTED_PROXY_IP] of [
  ["boolean", "true"],
  ["false boolean", "false"],
  ["hop count", "1"],
  ["CIDR", "127.0.0.1/8"],
  ["list", "127.0.0.1,192.0.2.10"],
  ["hostname", "proxy-sensitive.example.test"],
  ["IPv6", "::1"],
  ["mapped IPv6 configuration", "::ffff:127.0.0.1"],
  ["wildcard", "*"],
  ["URL", "http://proxy-sensitive.example.test"],
  ["noncanonical IPv4", "127.000.0.1"],
  ["invalid IPv4", "256.0.0.1"],
  ["canonical unspecified IPv4", "0.0.0.0"],
  ["canonical broadcast IPv4", "255.255.255.255"],
  ["unspecified network", "0.1.2.3"],
  ["multicast", "224.0.0.1"],
])
  test(`misconfigured proxy ${label} fails startup before listening without echoing its value`, async () =>
    withRuntime("proxy", { TRUSTED_PROXY_IP }, async (worker) => {
      assert.equal(worker.first.type, "startup-error");
      assert.equal(worker.first.name, "ConfigurationError");
      assert.match(worker.first.reason, /TRUSTED_PROXY_IP/);
      assert.ok(!worker.first.reason.includes(TRUSTED_PROXY_IP));
      assert.equal(worker.first.listening, false);
      assert.equal(worker.first.listenCalls, 0);
      assert.equal((await worker.exited)[0], 1);
      assert.equal(worker.stderr, "");
    }));

test("missing Auth configuration still fails closed for session bootstrap without a Cookie", async () =>
  withRuntime("auth-config", {}, async ({ first }) => {
    assert.equal(first.type, "config-response");
    assert.equal(first.status, 503);
    assert.equal(first.body.code, "AUTH_UNAVAILABLE");
    assert.deepEqual(first.headers, {});
    assert.equal(first.rows, 0);
    assert.equal(first.counters, 0);
    assert.equal(first.verifyCalls, 0);
  }));

for (const [label, forms, canonical] of [
  [
    "mapped IPv4",
    ["198.51.100.11", "::ffff:198.51.100.11", "::ffff:c633:640b"],
    "198.51.100.11",
  ],
  [
    "IPv6",
    ["2001:0db8:0000:0000:0000:0000:0000:0001", "2001:db8::1", "2001:DB8::1"],
    "2001:db8::1",
  ],
])
  test(`canonical ${label} representations share one admission bucket`, async () =>
    withRuntime("proxy", { TRUSTED_PROXY_IP: "127.0.0.1" }, async (worker) => {
      for (const [index, ip] of forms.entries()) {
        const response = await bootstrap(worker, ip);
        assert.equal(response.status, index === 0 ? 200 : 429);
        assert.deepEqual(response.keys, [
          { key: bootstrapKey(canonical), limit: 1 },
        ]);
        assert.equal(response.counters.length, 1);
      }
    }));

test("invalid forwarded IPs and absent/empty XFF fall back to the socket bucket", async () =>
  withRuntime("proxy", { TRUSTED_PROXY_IP: "127.0.0.1" }, async (worker) => {
    const inputs = [
      undefined,
      "",
      "untrusted-host.test",
      "127.0.0.1:99",
      "127.000.0.1",
      "[::1]",
      "fe80::1%eth0",
    ];
    for (const [index, xff] of inputs.entries()) {
      const response = await bootstrap(worker, xff);
      assert.equal(response.status, index === 0 ? 200 : 429);
      assert.deepEqual(response.keys, [
        { key: bootstrapKey("127.0.0.1"), limit: 1 },
      ]);
      assert.equal(response.counters.length, 1);
    }
  }));

test("login uses separate trusted-client IP buckets and still limits repeats", async () =>
  withRuntime("proxy", { TRUSTED_PROXY_IP: "127.0.0.1" }, async (worker) => {
    await worker.call({
      type: "fixture-settings",
      bootstrapLimit: 100,
      ipLimit: 1,
    });
    const logins = [
      ["198.51.100.11", "first@example.test", 200],
      ["198.51.100.12", "second@example.test", 200],
      ["198.51.100.11", "third@example.test", 429],
    ];
    for (const [xff, email, status] of logins) {
      const session = await bootstrap(worker, xff);
      assert.equal(session.status, 200);
      const response = await worker.call({
        type: "login",
        xff,
        email,
        cookie: session.setCookie.split(";")[0],
        csrf: session.body.csrfToken,
      });
      assert.equal(response.status, status);
      assert.ok(
        response.keys.some((entry) => entry.key === admissionKey("ip:" + xff)),
      );
    }
  }));

for (const secure of [false, true])
  test(`forwarded security headers do not change cookies or Origin/CSRF checks (secure=${secure})`, async () =>
    withRuntime("proxy", { TRUSTED_PROXY_IP: "127.0.0.1" }, async (worker) => {
      const origin = secure
        ? "https://pilot.example.test"
        : "http://127.0.0.1:5173";
      await worker.call({
        type: "fixture-settings",
        secure,
        origin,
        bootstrapLimit: 100,
      });
      const headers = {
        "X-Forwarded-Proto": secure ? "http" : "https",
        "X-Forwarded-Host": "attacker.test",
      };
      const session = await worker.call({
        type: "bootstrap",
        xff: "198.51.100.11",
        headers,
      });
      assert.equal(session.status, 200);
      assert.ok(
        session.setCookie.startsWith(
          secure ? "__Host-examate_session=" : "examate_session_local=",
        ),
      );
      assert.equal(/; Secure(?:;|$)/.test(session.setCookie), secure);
      const credentials = {
        type: "login",
        xff: "198.51.100.11",
        headers,
        cookie: session.setCookie.split(";")[0],
        csrf: session.body.csrfToken,
      };
      for (const overrides of [
        { origin: "https://attacker.test" },
        { origin, csrf: "incorrect-csrf" },
      ]) {
        const denied = await worker.call({ ...credentials, ...overrides });
        assert.equal(denied.status, 403);
        assert.equal(denied.newAdmissions.length, 0);
        assert.equal(denied.loginCalls, 0);
      }
      const allowed = await worker.call({ ...credentials, origin });
      assert.equal(allowed.status, 200);
      assert.equal(/; Secure(?:;|$)/.test(allowed.setCookie), secure);
    }));
