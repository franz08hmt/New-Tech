import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ServiceUnavailableException,
  UnauthorizedException,
  HttpException,
} from "@nestjs/common";
import { authFixture } from "./auth-fixture.mjs";
import { fakeDependencies, httpApp, json } from "./helpers.mjs";
import { errorCode } from "../dist/common/log.js";
const sentinel = "PRIVATE_SENTINEL_NEVER_LOG";
async function capture(run) {
  const logs = [],
    original = console.log;
  console.log = (s) => logs.push(JSON.parse(s));
  try {
    await run(logs);
  } finally {
    console.log = original;
    assert.ok(
      !JSON.stringify(logs).includes(sentinel),
      "no headers/body/nested error or arbitrary path leaks",
    );
  }
}
async function appFor(auth, run) {
  const f = fakeDependencies(),
    s = await httpApp(
      f.database,
      f.storage,
      undefined,
      undefined,
      undefined,
      auth,
    );
  try {
    await run(s);
  } finally {
    await s.app.close();
  }
}
const completed = (logs, path) =>
  logs.filter((l) => l.event === "request.completed" && l.path === path);
function sameId(logs, response, code) {
  const id = response.headers.get("x-request-id"),
    fail = logs.find((l) => l.event === "request.failed" && l.requestId === id);
  assert.equal(fail?.code, code);
  return id;
}
test("Auth diagnostics: configuration unavailable session remains 503/body unchanged, logs safe code and fixed route", async () =>
  capture(async (logs) => {
    const auth = authFixture();
    auth.config = null;
    await appFor(auth, async (s) => {
      const r = await s.request("/auth/session?email=" + sentinel, {
        headers: { Authorization: sentinel, "X-Request-ID": sentinel },
      });
      assert.equal(r.status, 503);
      const body = await r.json();
      assert.deepEqual(Object.keys(body).sort(), [
        "code",
        "message",
        "requestId",
        "statusCode",
      ]);
      assert.equal(body.code, "AUTH_UNAVAILABLE");
      assert.equal(
        body.message,
        "Dịch vụ xác thực đang gián đoạn hoặc chưa được cấu hình. Hãy thử lại sau.",
      );
      assert.equal(body.statusCode, 503);
      assert.equal(body.requestId, r.headers.get("x-request-id"));
      sameId(logs, r, "AUTH_UNAVAILABLE");
      assert.equal(completed(logs, "/api/auth/session").length, 1);
    });
  }));
test("Auth diagnostics: upstream/nested sensitive failure logs only AUTH_UNAVAILABLE, login semantics unchanged", async () =>
  capture(async (logs) => {
    const auth = authFixture();
    auth.adapter.login = async () => {
      throw Object.assign(Error(sentinel), {
        code: sentinel,
        cause: { password: sentinel, token: sentinel },
      });
    };
    await appFor(auth, async (s) => {
      const bootstrap = await s.request("/auth/session"),
        csrf = (await bootstrap.json()).csrfToken;
      const r = await s.request("/auth/login?key=" + sentinel, {
        ...json("POST", {
          email: sentinel + "@example.test",
          password: sentinel,
        }),
        headers: {
          "Content-Type": "application/json",
          Cookie: bootstrap.headers.get("set-cookie").split(";")[0],
          Origin: auth.config.origin,
          "X-CSRF-Token": csrf,
          Authorization: sentinel,
        },
      });
      assert.equal(r.status, 503);
      assert.equal((await r.json()).code, "AUTH_UNAVAILABLE");
      sameId(logs, r, "AUTH_UNAVAILABLE");
      assert.equal(completed(logs, "/api/auth/login").length, 1);
    });
  }));
test("Auth diagnostics: wrong password remains 401 AUTH_INVALID and never exposes credentials in logs", async () =>
  capture(async (logs) => {
    const auth = authFixture();
    auth.adapter.login = async () => {
      throw new UnauthorizedException({
        code: "AUTH_INVALID",
        message: "Thông tin đăng nhập hoặc phiên xác thực không hợp lệ.",
      });
    };
    await appFor(auth, async (s) => {
      const bootstrap = await s.request("/auth/session"),
        csrf = (await bootstrap.json()).csrfToken;
      const r = await s.request("/auth/login", {
        ...json("POST", {
          email: sentinel + "@example.test",
          password: sentinel,
        }),
        headers: {
          "Content-Type": "application/json",
          Cookie: bootstrap.headers.get("set-cookie").split(";")[0],
          Origin: auth.config.origin,
          "X-CSRF-Token": csrf,
        },
      });
      assert.equal(r.status, 401);
      const body = await r.json();
      assert.equal(body.code, "AUTH_INVALID");
      assert.equal(
        body.message,
        "Thông tin đăng nhập hoặc phiên xác thực không hợp lệ.",
      );
      sameId(logs, r, "AUTH_INVALID");
      assert.equal(completed(logs, "/api/auth/login").length, 1);
      assert.equal((await s.request("/tasks")).status, 401);
    });
  }));
test("Auth diagnostics: logout/refresh fixed routes retain missing-session errors; unknown paths/query are redacted", async () =>
  capture(async (logs) => {
    await appFor(authFixture(), async (s) => {
      for (const route of ["logout", "refresh"]) {
        const r = await s.request("/auth/" + route + "?token=" + sentinel, {
          ...json("POST", {}),
          headers: {
            "Content-Type": "application/json",
            Cookie: sentinel,
            Origin: "http://localhost:5173",
          },
        });
        assert.equal(r.status, 401);
        sameId(logs, r, "AUTH_REQUIRED");
        assert.equal(completed(logs, "/api/auth/" + route).length, 1);
      }
      await s.request("/auth/" + sentinel + "?password=" + sentinel);
      assert.ok(completed(logs, "/unmatched").length);
    });
  }));
test("Auth diagnostics: allowed business path identifiers are replaced with fixed placeholders", async () =>
  capture(async (logs) => {
    const f = fakeDependencies(),
      s = await httpApp(f.database, f.storage);
    try {
      await s.request(
        "/documents/11111111-1111-4111-8111-111111111111?token=" + sentinel,
      );
      await s.request("/courses/" + sentinel.toLowerCase());
      assert.equal(completed(logs, "/api/documents/:id").length, 1);
      assert.equal(completed(logs, "/unmatched").length, 1);
      assert.ok(
        !JSON.stringify(logs).includes("11111111-1111-4111-8111-111111111111"),
      );
    } finally {
      await s.app.close();
    }
  }));
test("Auth diagnostics: wrapped DB failure has controlled Auth code; generic errorCode is unchanged", async () =>
  capture(async (logs) => {
    const auth = authFixture();
    auth.store.create = async () => {
      throw new ServiceUnavailableException({
        code: sentinel,
        message: sentinel,
      });
    };
    await appFor(auth, async (s) => {
      const r = await s.request("/auth/session");
      assert.equal(r.status, 503);
      sameId(logs, r, "AUTH_UNAVAILABLE");
    });
    assert.equal(
      errorCode(new HttpException({ code: "AUTH_UNAVAILABLE" }, 503)),
      "UNCLASSIFIED",
    );
  }));
test("Auth diagnostics: unknown HttpException response code is never promoted into logs or serialized there", async () =>
  capture(async (logs) => {
    const auth = authFixture();
    auth.adapter.login = async () => {
      throw new UnauthorizedException({
        code: sentinel,
        message: "Synthetic rejection",
        nested: { token: sentinel },
      });
    };
    await appFor(auth, async (s) => {
      const b = await s.request("/auth/session"),
        csrf = (await b.json()).csrfToken;
      const r = await s.request("/auth/login", {
        ...json("POST", {
          email: "synthetic@example.test",
          password: sentinel,
        }),
        headers: {
          "Content-Type": "application/json",
          Cookie: b.headers.get("set-cookie").split(";")[0],
          Origin: auth.config.origin,
          "X-CSRF-Token": csrf,
        },
      });
      assert.equal(r.status, 401);
      assert.equal((await r.json()).code, sentinel);
      sameId(logs, r, "UNCLASSIFIED");
    });
  }));

test("Google callback logs a fixed path only; query/headers/provider description stay private", async () =>
  capture(async (logs) => {
    const f = authFixture();
    f.config.googleEnabled = true;
    f.adapter.exchangeCode = async () => {
      throw Error(sentinel);
    };
    await appFor(f, async (s) => {
      const response = await s.request(
        "/auth/google/callback?attempt=invalid&code=" +
          sentinel +
          "&error_description=" +
          sentinel,
        { headers: { Authorization: sentinel }, redirect: "manual" },
      );
      assert.equal(response.status, 303);
      assert.equal(response.headers.get("referrer-policy"), "no-referrer");
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(
        new URL(response.headers.get("location")).search,
        "?oauth=restart_required",
      );
      assert.equal(completed(logs, "/api/auth/google/callback").length, 1);
    });
    const { readFile } = await import("node:fs/promises");
    const nginx = await readFile(
      new URL("../../../infra/nginx/default.conf", import.meta.url),
      "utf8",
    );
    assert.match(nginx, /log_format examate_safe/);
    assert.match(nginx, /default \/redacted/);
    assert.doesNotMatch(
      nginx,
      /\$request_uri|\$args|\$http_authorization|\$request[;' ]/,
    );
  }));
