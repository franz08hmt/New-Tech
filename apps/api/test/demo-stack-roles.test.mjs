import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { testArtifacts } from "./test-artifacts.mjs";

test("role harness rejects outsider login 500 instead of using actual as expected", async (t) => {
  const directory = testArtifacts(t),
    credentials = join(directory, "people.json");
  writeFileSync(
    credentials,
    JSON.stringify(
      ["manager", "member", "viewer", "outsider"].map((role) => ({
        role,
        email: `${role}@fixture.invalid`,
        password: "synthetic-test-only",
      })),
    ),
  );
  const server = createServer(async (req, res) => {
    let input = "";
    for await (const part of req) input += part;
    const role = (req.headers.cookie || "").split("=")[1] || "manager";
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Set-Cookie", `fixture=${role}; HttpOnly`);
    const reply = (status, value) => {
      res.statusCode = status;
      res.end(JSON.stringify(value));
    };
    if (req.url === "/api/auth/session")
      return reply(200, { csrfToken: "fixture" });
    if (req.url === "/api/auth/login") {
      const r = JSON.parse(input).email.split("@")[0];
      res.setHeader("Set-Cookie", `fixture=${r}; HttpOnly`);
      if (r === "outsider")
        return reply(500, { error: { code: "INTERNAL_ERROR" } });
      return reply(200, {
        csrfToken: "fixture",
        status: "authenticated",
        principal: { role: r },
      });
    }
    if (req.url === "/api/tasks")
      return reply(
        req.method === "GET"
          ? 200
          : !req.headers.cookie || role === "viewer"
            ? 403
            : 201,
        [],
      );
    if (req.url === "/api/documents") return reply(200, []);
    if (req.url === "/api/admin/ai-usage")
      return reply(role === "manager" ? 200 : 403, {});
    if (req.url.startsWith("/api/study-coach/quizzes"))
      return reply(200, { items: [], total: 0 });
    return reply(404, {});
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL("./demo-stack-roles-check.mjs", import.meta.url)),
      credentials,
    ],
    {
      env: {
        ...process.env,
        DEMO_BASE: `http://127.0.0.1:${server.address().port}/api`,
        DEMO_ORIGIN: "http://127.0.0.1:5173",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "",
    error = "";
  child.stdout.on("data", (x) => (output += x));
  child.stderr.on("data", (x) => (error += x));
  const exit = await new Promise((resolve) => child.on("exit", resolve));
  assert.equal(exit, 1, `unexpected login 500 must fail the harness; ${error}`);
  const checks = output
    .trim()
    .split("\n")
    .map((x) => JSON.parse(x));
  assert.ok(
    checks.some((x) => x.check?.includes("outsider") && x.ok === false),
  );
});
