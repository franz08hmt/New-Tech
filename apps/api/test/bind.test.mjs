import { test } from "node:test";
import assert from "node:assert/strict";
import { withRuntime } from "./runtime-test-process.mjs";

for (const NODE_ENV of ["development", "test", "production"])
  for (const PUBLIC_ORIGIN of [undefined, "https://pilot.example.test"])
    test(`bind default remains loopback with NODE_ENV=${NODE_ENV} and ${PUBLIC_ORIGIN ? "public" : "absent"} origin`, async () =>
      withRuntime("bind", { NODE_ENV, PUBLIC_ORIGIN }, async ({ first }) => {
        assert.equal(first.type, "ready");
        assert.equal(first.config.host, "127.0.0.1");
        assert.equal(first.address.address, "127.0.0.1");
        assert.ok(first.address.port > 0);
        assert.equal(new URL(first.base).hostname, "127.0.0.1");
      }));

for (const HOST of ["127.0.0.1", "::1"])
  test(`bind explicit ${HOST} reaches actual Nest listener on that literal`, async () =>
    withRuntime("bind", { HOST }, async ({ first }) => {
      assert.equal(first.type, "ready");
      assert.equal(first.config.host, HOST);
      assert.equal(first.address.address, HOST);
      assert.equal(first.address.family, HOST === "::1" ? "IPv6" : "IPv4");
    }));

for (const HOST of ["0.0.0.0", "::", "192.0.2.10", "2001:db8::10"])
  test(`bind config accepts explicit IP literal ${HOST}`, async () =>
    withRuntime("config", { HOST }, async ({ first }) => {
      assert.equal(first.type, "config");
      assert.equal(first.config.host, HOST);
    }));

for (const [label, HOST] of [
  ["empty", ""],
  ["whitespace", " "],
  ["hostname", "localhost"],
  ["wildcard", "*"],
  ["URL", "https://bind-sensitive.example.test"],
  ["IPv4 with port", "127.0.0.1:3000"],
  ["bracketed IPv6", "[::1]"],
  ["CIDR", "127.0.0.1/8"],
  ["list", "127.0.0.1,192.0.2.10"],
  ["noncanonical IPv4", "127.000.0.1"],
  ["invalid IPv4", "256.0.0.1"],
])
  test(`bind rejects ${label} HOST before listening with safe variable-only reason`, async () =>
    withRuntime("bind", { HOST }, async (worker) => {
      assert.equal(worker.first.type, "startup-error");
      assert.equal(worker.first.name, "ConfigurationError");
      assert.match(worker.first.reason, /HOST/);
      assert.equal(worker.first.listening, false);
      assert.equal(worker.first.listenCalls, 0);
      if (HOST.trim()) assert.ok(!worker.first.reason.includes(HOST));
      assert.equal((await worker.exited)[0], 1);
      assert.equal(worker.stderr, "");
    }));
