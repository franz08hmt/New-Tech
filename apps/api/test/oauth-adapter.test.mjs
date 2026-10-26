import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { SupabaseAuthAdapter } from "../dist/auth/supabase-auth.adapter.js";
import { authFixture } from "./auth-fixture.mjs";
const token = (claims) =>
  `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.not-a-real-signature`;
test("authoritative user verification plus issuer/audience/sub/session/expiry contract", async (t) => {
  const f = authFixture(),
    adapter = new SupabaseAuthAdapter(() => f.config),
    calls = [];
  let upstream = () => Response.json({ id: f.userId });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    return upstream();
  });
  const good = {
    sub: f.userId,
    session_id: f.sessionId,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: f.config.url + "/auth/v1",
    aud: "authenticated",
  };
  assert.equal((await adapter.verify(token(good))).userId, f.userId);
  for (const change of [
    { iss: "https://evil.test/auth/v1" },
    { aud: "anon" },
    { sub: f.config.workspaceId },
    { session_id: "bad" },
    { exp: 0 },
  ]) {
    await assert.rejects(
      adapter.verify(token({ ...good, ...change })),
      (e) => e.getStatus() === 401,
    );
  }
  upstream = () => Response.json({ id: f.userId }, { status: 401 });
  await assert.rejects(
    adapter.verify(token(good)),
    (e) => e.getStatus() === 401,
  );
  assert.equal(
    calls.length,
    7,
    "even locally well-formed claims never replace authoritative verification",
  );
  for (const c of calls) {
    assert.equal(c.url, f.config.url + "/auth/v1/user");
    assert.equal(c.options.redirect, "error");
  }
});
test("PKCE exchange fixed request, timeout, safe errors and bounded response", async (t) => {
  const f = authFixture(),
    adapter = new SupabaseAuthAdapter(() => f.config);
  let response = () =>
      Response.json({
        access_token: "synthetic-access",
        refresh_token: "synthetic-refresh",
        expires_in: 3600,
      }),
    calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    return response();
  });
  assert.equal(
    (await adapter.exchangeCode("synthetic-code", "v".repeat(43))).accessToken,
    "synthetic-access",
  );
  assert.equal(calls[0].url, f.config.url + "/auth/v1/token?grant_type=pkce");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    auth_code: "synthetic-code",
    code_verifier: "v".repeat(43),
  });
  assert.ok(calls[0].options.signal);
  assert.equal(calls[0].options.redirect, "error");
  response = () => new Response("x".repeat(65000));
  await assert.rejects(
    adapter.exchangeCode("code", "verifier"),
    (e) => e.getStatus() === 503,
  );
  response = () =>
    Response.json({ error_description: "private-sentinel" }, { status: 400 });
  await assert.rejects(
    adapter.exchangeCode("code", "verifier"),
    (e) =>
      e.getStatus() === 401 &&
      !JSON.stringify(e.getResponse()).includes("private-sentinel"),
  );
});

test("exchange deadline aborts once, maps safely and never retries the code", async (t) => {
  const f = authFixture();
  f.config.timeoutMs = 20;
  let calls = 0;
  t.mock.method(
    globalThis,
    "fetch",
    (_url, options) =>
      new Promise((_, reject) => {
        calls++;
        const onAbort = () => reject(new Error("PRIVATE_SENTINEL"));
        options.signal.addEventListener("abort", onAbort, { once: true });
        if (options.signal.aborted) onAbort();
      }),
  );
  // Keep the synthetic pending HTTP operation alive, as a socket would be.
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(
      new SupabaseAuthAdapter(() => f.config).exchangeCode("code", "verifier"),
      (e) =>
        e.getStatus() === 503 &&
        !JSON.stringify(e.getResponse()).includes("PRIVATE_SENTINEL"),
    );
    assert.equal(calls, 1);
  } finally {
    clearTimeout(keepAlive);
  }
});

test("verified identity carries an e-mail only when Auth confirms it, and a bounded display name", async (t) => {
  const f = authFixture(),
    adapter = new SupabaseAuthAdapter(() => f.config);
  let user;
  t.mock.method(globalThis, "fetch", async () => Response.json(user));
  const good = {
    sub: f.userId,
    session_id: f.sessionId,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: f.config.url + "/auth/v1",
    aud: "authenticated",
  };
  user = {
    id: f.userId,
    email: " Student@Example.TEST ",
    email_confirmed_at: "2026-10-01T00:00:00Z",
    user_metadata: { full_name: "  Student\u0007 " + "x".repeat(200) },
  };
  const confirmed = await adapter.verify(token(good));
  assert.equal(confirmed.email, "student@example.test");
  assert.equal(confirmed.displayName.length, 120);
  assert.ok(!/[\u0000-\u001f]/.test(confirmed.displayName));
  user = {
    id: f.userId,
    email: "student@example.test",
    email_confirmed_at: null,
  };
  const unconfirmed = await adapter.verify(token(good));
  assert.equal(unconfirmed.email, undefined);
  assert.equal(unconfirmed.userId, f.userId);
  user = { id: f.userId, user_metadata: { name: "Only Name" } };
  const nameOnly = await adapter.verify(token(good));
  assert.deepEqual(
    [nameOnly.email, nameOnly.displayName],
    [undefined, "Only Name"],
  );
});
