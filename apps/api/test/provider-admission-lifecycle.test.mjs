import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";

const directory = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(
  directory,
  "fixtures/provider-admission-lifecycle-child.mjs",
);

function runChild(scenario) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.execPath,
      ["--unhandled-rejections=strict", fixture, scenario],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGKILL"), 10_000);
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.once("error", rejectPromise);
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      resolvePromise({ code, signal, stdout, stderr });
    });
  });
}

for (const scenario of [
  "generation-timeout",
  "stream-timeout",
  "stream-abort",
  "embedding-timeout",
  "ocr-timeout",
]) {
  test(`${scenario}: permit wait cannot expose an unhandled rejection or dispatch late`, async () => {
    const result = await runChild(scenario);
    assert.equal(
      result.code,
      0,
      `subprocess failed (${result.signal ?? "exit"}); stderr=${result.stderr}`,
    );
    assert.match(result.stdout, new RegExp(`RESULT ${scenario} `));
    assert.equal(result.stderr, "");
  });
}
