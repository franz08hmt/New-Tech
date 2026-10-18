// Requires an already installed Playwright via PLAYWRIGHT_MODULE; never installs packages.
// Real Chromium, synthetic OAuth and isolated PostgreSQL Auth store; no cloud.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const modulePath = process.env.PLAYWRIGHT_MODULE;
if (!modulePath)
  throw Error(
    "Set PLAYWRIGHT_MODULE to an existing Playwright module; no automatic install.",
  );
const { chromium } = await import(pathToFileURL(resolve(modulePath)).href);
const compose = process.argv.includes("--compose"),
  origin = compose ? "http://127.0.0.1:8080" : "http://127.0.0.1:5173";
const output = resolve(root, "artifacts", "f01-browser-" + Date.now());
await mkdir(output, { recursive: true });
const env = Object.fromEntries(
  [
    "PATH",
    "Path",
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
  ]
    .filter((k) => process.env[k])
    .map((k) => [k, process.env[k]]),
);
Object.assign(env, {
  TEST_DATABASE_URL:
    process.env.TEST_DATABASE_URL ||
    "postgresql://examate_test:local-test-only@127.0.0.1:55433/examate_test",
  DATABASE_SSL: "false",
  DATABASE_CA_CERT_PATH: "",
  FIXTURE_ORIGIN: origin,
  PUBLIC_ORIGIN: origin,
  ALLOWED_ORIGINS: origin,
});
let api,
  vite,
  logs = "",
  browser;
const events = [];
let waiter;
function event(value) {
  events.push(value);
  waiter?.();
}
async function until(predicate, label) {
  let timer;
  try {
    await Promise.race([
      (async () => {
        while (!predicate()) await new Promise((r) => (waiter = r));
      })(),
      new Promise(
        (_, reject) => (timer = setTimeout(() => reject(Error(label)), 30000)),
      ),
    ]);
  } finally {
    clearTimeout(timer);
    waiter = undefined;
  }
}
async function command(value) {
  const n = events.filter((x) => x === "FIXTURE_COMMAND_APPLIED").length;
  api.stdin.write(JSON.stringify(value) + "\n");
  await until(
    () => events.filter((x) => x === "FIXTURE_COMMAND_APPLIED").length > n,
    "fixture command acknowledgement",
  );
}
async function childStop(child) {
  if (!child || child.exitCode !== null) return;
  child.stdin.write("stop\n");
  await new Promise((done, reject) => {
    const timer = setTimeout(
      () => reject(Error("owned fixture did not stop")),
      20000,
    );
    child.once("exit", () => {
      clearTimeout(timer);
      done();
    });
  });
}
const results = [];
try {
  if (!compose) {
    api = spawn(process.execPath, ["apps/api/test/oauth-browser-fixture.mjs"], {
      cwd: root,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let pending = "";
    api.stdout.on("data", (data) => {
      logs += data;
      pending += data;
      while (pending.includes("\n")) {
        const i = pending.indexOf("\n");
        event(pending.slice(0, i).trim());
        pending = pending.slice(i + 1);
      }
    });
    api.stderr.on("data", (data) => {
      logs += data;
    });
    api.on("exit", () => event("API_EXIT"));
    await until(
      () =>
        events.includes("OAUTH_FIXTURE_READY") || events.includes("API_EXIT"),
      "fixture readiness",
    );
    assert.ok(events.includes("OAUTH_FIXTURE_READY"), "OAuth fixture startup");
    vite = spawn(
      process.execPath,
      [
        resolve(root, "node_modules/vite/bin/vite.js"),
        "--host",
        "127.0.0.1",
        "--port",
        "5173",
        "--strictPort",
      ],
      { cwd: resolve(root, "apps/web"), env, stdio: ["pipe", "pipe", "pipe"] },
    );
    vite.stdout.on("data", (d) => event(String(d)));
    vite.stderr.on("data", (d) => {
      logs += d;
    });
    await until(() => events.some((x) => x.includes("5173")), "Vite readiness");
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const width of [1440, 375]) {
    const context = await browser.newContext({
        viewport: { width, height: 900 },
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", () => errors.push("pageerror"));
    page.on("console", (m) => {
      if (m.type() === "error")
        errors.push(m.text().replace(/https?:\/\/[^\s]+/g, "[URL redacted]"));
    });
    page.on("response", (r) => {
      if (r.status() >= 400) {
        const u = new URL(r.url());
        console.log(
          JSON.stringify({
            resourceStatus: r.status(),
            path: u.pathname.startsWith("/api/")
              ? u.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id")
              : "static",
          }),
        );
      }
    });
    let mode = "success",
      posts = 0;
    context.on("request", (r) => {
      if (
        r.method() === "POST" &&
        new URL(r.url()).pathname === "/api/auth/google/start"
      )
        posts++;
    });
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      if (
        url.origin === "https://fixture.supabase.test" &&
        url.pathname === "/auth/v1/authorize"
      ) {
        const callback = new URL(url.searchParams.get("redirect_to"));
        assert.equal(callback.origin, origin);
        assert.equal(callback.pathname, "/api/auth/google/callback");
        assert.equal(url.searchParams.get("code_challenge_method"), "s256");
        assert.equal(url.searchParams.has("state"), false);
        const suffix =
          mode === "cancel"
            ? "&error=access_denied"
            : mode === "bad-code"
              ? "&code=invalid-code"
              : "&code=synthetic-code";
        return route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><title>Synthetic OAuth</title><main><h1>Local fake OAuth — no Google request</h1><a id="continue" href="${callback.href.replaceAll("&", "&amp;")}${suffix.replaceAll("&", "&amp;")}">Continue synthetic account</a></main>`,
        });
      }
      throw Error("Unexpected external request blocked");
    });
    await page.goto(origin);
    const google = () =>
      page.getByRole("button", { name: "Đăng nhập bằng Google" });
    await google().waitFor({ state: "visible" });
    await google().isEnabled();
    assert.ok((await google().boundingBox()).height >= 44);
    await google().focus();
    assert.equal(
      await google().evaluate((el) => el === document.activeElement),
      true,
    );
    mode = "cancel";
    await google().click();
    await page.locator("#continue").click();
    await page.getByText(/đã hủy đăng nhập Google/i).waitFor();
    assert.equal(new URL(page.url()).search, "");
    mode = "bad-code";
    await google().click();
    await page.locator("#continue").click();
    await page.getByText(/Chưa hoàn tất đăng nhập Google/).waitFor();
    mode = "success";
    await google().click();
    await page.locator("#continue").click();
    await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
    assert.equal(new URL(page.url()).search, "");
    let session = await context.request
      .get(origin + "/api/auth/session")
      .then((r) => r.json());
    assert.equal(session.status, "authenticated");
    assert.equal(session.principal.role, "member");
    await page.reload();
    await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
    assert.equal(
      (await context.request.get(origin + "/api/tasks")).status(),
      200,
    );
    if (!compose) {
      await page.goto(origin + "/#study-plan");
      await page
        .getByLabel("Quick note 1", { exact: true })
        .fill("Synthetic previous-account note");
      await page
        .getByRole("button", { name: "Open ExaMate AI", exact: true })
        .click();
      await page
        .getByLabel("Câu hỏi cho ExaMate", { exact: true })
        .fill("Synthetic previous-account draft");
      await page
        .getByRole("button", { name: "Đóng ExaMate AI", exact: true })
        .click();
    }
    const denied = await context.request.post(
      origin + "/api/auth/google/start",
      { headers: { Origin: "https://evil.test" }, data: {} },
    );
    assert.equal(denied.status(), 403);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await google().waitFor({ state: "visible" });
    assert.equal(
      (await context.request.get(origin + "/api/tasks")).status(),
      401,
    );
    assert.equal(
      posts,
      3,
      "cancel/error/success each send exactly one start, never automatic replay",
    );
    if (!compose) {
      await command({ user: "absent" });
      await google().click();
      await page.locator("#continue").click();
      await page
        .getByText(/chưa được cấp quyền workspace/)
        .first()
        .waitFor();
      assert.equal(
        (await context.request.get(origin + "/api/tasks")).status(),
        403,
      );
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await google().waitFor({ state: "visible" });
      await command({ user: "viewer" });
      await google().click();
      await page.locator("#continue").click();
      await page
        .getByRole("button", { name: "Sign out", exact: true })
        .waitFor();
      session = await context.request
        .get(origin + "/api/auth/session")
        .then((r) => r.json());
      assert.equal(session.principal.role, "viewer");
      await page.goto(origin + "/#study-plan");
      assert.notEqual(
        await page.getByLabel("Quick note 1", { exact: true }).inputValue(),
        "Synthetic previous-account note",
      );
      await page
        .getByRole("button", { name: "Open ExaMate AI", exact: true })
        .click();
      assert.equal(
        await page
          .getByLabel("Câu hỏi cho ExaMate", { exact: true })
          .inputValue(),
        "",
      );
      await page
        .getByRole("button", { name: "Đóng ExaMate AI", exact: true })
        .click();

      assert.equal(
        (
          await context.request.post(origin + "/api/tasks", {
            headers: { Origin: origin, "X-CSRF-Token": session.csrfToken },
            data: { title: "Synthetic forbidden task" },
          })
        ).status(),
        403,
      );
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await google().waitFor({ state: "visible" });
      await command({ user: "manager" });
      await google().click();
      await page.locator("#continue").click();
      await page
        .getByRole("button", { name: "Sign out", exact: true })
        .waitFor();
      session = await context.request
        .get(origin + "/api/auth/session")
        .then((r) => r.json());
      assert.equal(session.principal.role, "manager");
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await google().waitFor({ state: "visible" });
      await command({ user: "member", delay: true });
      const n = events.filter(
        (e) => e === "OAUTH_FIXTURE_EXCHANGE_STARTED",
      ).length;
      await google().click();
      const delayed = page.locator("#continue").click();
      await until(
        () =>
          events.filter((e) => e === "OAUTH_FIXTURE_EXCHANGE_STARTED").length >
          n,
        "delayed exchange entered",
      );
      const other = await context.newPage();
      await other.goto(origin);
      await other
        .getByRole("button", { name: "Sign in", exact: true })
        .waitFor();
      await command({ user: "viewer" });
      await other
        .getByLabel("Email", { exact: true })
        .fill("fixture@example.test");
      await other
        .getByLabel("Password", { exact: true })
        .fill("synthetic-password");
      await other.getByRole("button", { name: "Sign in", exact: true }).click();
      await other
        .getByRole("button", { name: "Sign out", exact: true })
        .waitFor();
      await command({ release: true });
      await delayed;
      await page
        .getByRole("button", { name: "Sign out", exact: true })
        .waitFor();
      session = await context.request
        .get(origin + "/api/auth/session")
        .then((r) => r.json());
      assert.equal(
        session.principal.role,
        "viewer",
        "slow callback must not replace password account B",
      );
      await other.close();
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await google().waitFor({ state: "visible" });
      await command({ user: "member" });
    }
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    // Expected 401/403 deliberately exercised through direct API, not UI fetches.
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: resolve(output, `${compose ? "compose" : "native"}-${width}.png`),
      fullPage: true,
    });
    results.push({
      width,
      success: true,
      cancel: true,
      error: true,
      reload: true,
      logout: true,
      csrf: true,
      roleMatrix: !compose,
      accountRace: !compose,
      overflow: false,
      consoleErrors: 0,
    });
    await context.close();
  }
  assert.ok(
    !/synthetic-code|synthetic-access|synthetic-refresh|code_verifier/.test(
      logs,
    ),
    "server logs never contain provider credentials/code",
  );
  await writeFile(
    resolve(output, "results.json"),
    JSON.stringify({ compose, results }, null, 2),
  );
  console.log(
    JSON.stringify({
      browser: "PASS",
      compose,
      results,
      artifactDirectory: output,
    }),
  );
} finally {
  await browser?.close();
  if (vite && vite.exitCode === null) {
    vite.kill();
    await new Promise((r) => vite.once("exit", r));
  }
  await childStop(api);
}
