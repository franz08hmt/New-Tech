import "reflect-metadata";
import { beforeEach, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { Test } from "@nestjs/testing";
import { AppModule } from "../dist/app.module.js";
import { DatabaseService } from "../dist/database/database.service.js";
import { StorageService } from "../dist/documents/storage.service.js";
import { AuthStore } from "../dist/auth/auth-store.js";
import { AUTH_CONFIG, AUTH_ADAPTER } from "../dist/auth/auth-config.js";
import { SPEECH_CONFIG } from "../dist/speech/speech-config.js";
import { SPEECH_PROVIDER } from "../dist/speech/speech.types.js";
import { AudioInspector } from "../dist/speech/audio-inspector.js";
import { SpeechLimiter } from "../dist/speech/speech-limiter.js";
import { configureApp } from "../dist/common/http.js";
import { authFixture } from "./auth-fixture.mjs";
import { fakeDependencies, json } from "./helpers.mjs";

let app, base, fixture, config, cookie, csrf, calls, mediaCalls, provider;
beforeEach(async () => {
  cookie = undefined;
  csrf = undefined;
  fixture = authFixture();
  config = {
    enabled: true,
    provider: "local",
    model: "onnx-community/whisper-small",
    modelRevision: "dc93399f6d0d35f7eddcb1b3f029d8684f4dfc12",
    modelDir: "C:/fixture/artifacts/stt-models",
    device: "cpu",
    dtype: "q8",
    maxBytes: 5242880,
    maxDurationMs: 60000,
    timeoutMs: 30000,
    modelLoadTimeoutMs: 180000,
    requestsPerMinute: 30,
    concurrency: 1,
    ffmpeg: "ffmpeg",
    ffprobe: "ffprobe",
  };
  calls = 0;
  mediaCalls = 0;
  provider = {
    async status() {
      return config.enabled ? "ready" : "not_configured";
    },
    async transcribe() {
      calls++;
      return { text: "Private transcript fixture", detectedLanguages: ["vi"] };
    },
  };
  const dependencies = fakeDependencies();
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService)
    .useValue(dependencies.database)
    .overrideProvider(StorageService)
    .useValue(dependencies.storage)
    .overrideProvider(AUTH_CONFIG)
    .useValue(() => fixture.config)
    .overrideProvider(AUTH_ADAPTER)
    .useValue(fixture.adapter)
    .overrideProvider(AuthStore)
    .useValue(fixture.store)
    .overrideProvider(SPEECH_CONFIG)
    .useValue(() => config)
    .overrideProvider(SPEECH_PROVIDER)
    .useValue(provider)
    .overrideProvider(AudioInspector)
    .useValue({
      available: async () => true,
      async inspect(file) {
        mediaCalls++;
        if (!file) throw new Error("Unexpected missing file");
        return {
          buffer: file.buffer,
          mimeType: "audio/wav",
          extension: "wav",
          durationMs: 1000,
        };
      },
    });
  app = (await builder.compile()).createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  const session = await send("/auth/session");
  cookie = session.headers.get("set-cookie").split(";")[0];
  csrf = (await session.json()).csrfToken;
  const login = await send(
    "/auth/login",
    json("POST", { email: "fixture@example.test", password: "synthetic-only" }),
  );
  assert.equal(login.status, 200);
  cookie = login.headers.get("set-cookie").split(";")[0];
  csrf = (await login.json()).csrfToken;
});
afterEach(async () => {
  await app?.close();
});
function send(path, init = {}, headers = {}) {
  return fetch(`${base}/api${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(10000),
    headers: {
      ...init.headers,
      ...(cookie
        ? {
            Cookie: cookie,
            Origin: fixture.config.origin,
            "X-CSRF-Token": csrf,
          }
        : {}),
      ...headers,
    },
  });
}
function form(extra = {}) {
  const body = new FormData();
  body.append(
    "file",
    new Blob([extra.bytes ?? "fixture-audio"], { type: "audio/wav" }),
    "private-filename.wav",
  );
  return { method: "POST", body };
}

test("speech status is authenticated, independent of Gemini, and does not expose credentials", async () => {
  const denied = await send("/speech/status", {}, { Cookie: "" });
  assert.equal(denied.status, 401);
  config.enabled = false;
  const response = await send("/speech/status");
  const body = await response.json();
  assert.equal(body.status, "not_configured");
  assert.equal(body.maxDurationMs, 60000);
  assert.doesNotMatch(JSON.stringify(body), /HF_TOKEN|apiKey/);
  const disabled = await send("/speech/transcriptions", form());
  assert.equal(disabled.status, 503);
  assert.equal(calls, 0);
  assert.equal(mediaCalls, 0);
});
test("local model readiness is visible and rejects uploads before multipart inference", async () => {
  provider.status = async () => "model_missing";
  let response = await send("/speech/status");
  assert.equal((await response.json()).status, "model_missing");
  response = await send("/speech/transcriptions", form());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "STT_MODEL_MISSING");
  assert.equal(mediaCalls, 0);
  assert.equal(calls, 0);

  provider.status = async () => "loading";
  response = await send("/speech/status");
  assert.equal((await response.json()).status, "loading");
  response = await send("/speech/transcriptions", form());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "STT_MODEL_LOADING");
});
test("transcribes for viewers too, returns request ID and preserves membership checks", async () => {
  fixture.store.membership = async () => "viewer";
  const response = await send("/speech/transcriptions", form());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.text, "Private transcript fixture");
  assert.equal(body.requestId, response.headers.get("X-Request-ID"));
  assert.equal(calls, 1);
});
test("Auth, CSRF and revoked membership deny before media/provider", async () => {
  assert.equal(
    (await send("/speech/transcriptions", form(), { Cookie: "" })).status,
    401,
  );
  assert.equal(
    (await send("/speech/transcriptions", form(), { "X-CSRF-Token": "wrong" }))
      .status,
    403,
  );
  fixture.state.member = false;
  assert.equal((await send("/speech/transcriptions", form())).status, 403);
  assert.equal(mediaCalls, 0);
  assert.equal(calls, 0);
});
test("membership revoked during media processing prevents a paid call", async () => {
  const inspector = app.get(AudioInspector);
  const original = inspector.inspect;
  inspector.inspect = async (file) => {
    const result = await original(file);
    fixture.state.member = false;
    return result;
  };
  assert.equal((await send("/speech/transcriptions", form())).status, 403);
  assert.equal(calls, 0);
});
test("membership revoked during transcription prevents returning the transcript", async () => {
  provider.transcribe = async () => {
    calls++;
    fixture.state.member = false;
    return { text: "Private transcript fixture", detectedLanguages: [] };
  };
  const response = await send("/speech/transcriptions", form());
  assert.equal(response.status, 403);
  assert.doesNotMatch(await response.text(), /Private transcript/);
});
test("rejects forged identity fields and extra multipart fields before media/provider", async () => {
  const forged = form();
  forged.body.append("workspaceId", "forged-workspace");
  assert.equal((await send("/speech/transcriptions", forged)).status, 400);
  const extraField = form();
  extraField.body.append("language", "vi");
  assert.equal((await send("/speech/transcriptions", extraField)).status, 400);
  assert.equal(calls, 0);
  assert.equal(mediaCalls, 0);
});
test("multipart overflow, extra files and invalid fields release concurrency slots", async () => {
  config.concurrency = 1;
  assert.equal(
    (
      await send(
        "/speech/transcriptions",
        form({ bytes: new Uint8Array(5242881) }),
      )
    ).status,
    413,
  );
  const extra = form();
  extra.body.append("file", new Blob(["extra"]), "extra.wav");
  assert.equal((await send("/speech/transcriptions", extra)).status, 400);
  const invalidField = form();
  invalidField.body.append("unexpected", "invalid");
  assert.equal(
    (await send("/speech/transcriptions", invalidField)).status,
    400,
  );
  assert.equal((await send("/speech/transcriptions", form())).status, 200);
  assert.equal(calls, 1);
});
test("rate admission precedes multipart processing and returns Retry-After", async () => {
  config.requestsPerMinute = 1;
  assert.equal((await send("/speech/transcriptions", form())).status, 200);
  const response = await send("/speech/transcriptions", form());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "60");
  assert.equal(mediaCalls, 1);
  assert.equal(calls, 1);
});
test("provider errors release a slot and do not expose raw error text", async () => {
  config.concurrency = 1;
  provider.transcribe = async () => {
    calls++;
    throw Error("private-provider-secret");
  };
  const first = await send("/speech/transcriptions", form());
  assert.equal(first.status, 500);
  assert.doesNotMatch(await first.text(), /private-provider-secret/);
  provider.transcribe = async () => ({
    text: "Recovered",
    detectedLanguages: [],
  });
  assert.equal((await send("/speech/transcriptions", form())).status, 200);
});
test("client disconnect aborts upstream and releases a slot", async () => {
  config.concurrency = 1;
  let started, aborted;
  const entered = new Promise((resolve) => {
    started = resolve;
  });
  const cancelled = new Promise((resolve) => {
    aborted = resolve;
  });
  provider.transcribe = async (_audio, signal) => {
    started();
    return new Promise((_resolve, reject) =>
      signal.addEventListener(
        "abort",
        () => {
          aborted();
          reject(Error("cancelled-fixture"));
        },
        { once: true },
      ),
    );
  };
  const controller = new AbortController();
  const pending = send("/speech/transcriptions", {
    ...form(),
    signal: controller.signal,
  }).catch(() => {});
  await entered;
  controller.abort();
  await pending;
  await Promise.race([
    cancelled,
    new Promise((_resolve, reject) =>
      setTimeout(() => reject(Error("Missing upstream abort")), 2000),
    ),
  ]);
  provider.transcribe = async () => ({
    text: "After cancel",
    detectedLanguages: [],
  });
  assert.equal((await send("/speech/transcriptions", form())).status, 200);
});

test("disconnect during an incomplete multipart upload releases admission without media work", async () => {
  config.concurrency = 1;
  const limiter = app.get(SpeechLimiter);
  const acquire = limiter.acquire.bind(limiter);
  let entered, finished;
  const admitted = new Promise((resolve) => {
    entered = resolve;
  });
  const released = new Promise((resolve) => {
    finished = resolve;
  });
  limiter.acquire = (...args) => {
    const release = acquire(...args);
    entered();
    return () => {
      release();
      finished();
    };
  };
  const upload = httpRequest(`${base}/api/speech/transcriptions`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: fixture.config.origin,
      "X-CSRF-Token": csrf,
      "Content-Type": "multipart/form-data; boundary=stt-partial-fixture",
      "Content-Length": "1000000",
    },
  });
  upload.on("error", () => {});
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(
      () => reject(Error("Incomplete upload did not release admission")),
      3000,
    );
  });
  try {
    upload.write(
      '--stt-partial-fixture\r\nContent-Disposition: form-data; name="file"; filename="fixture.wav"\r\nContent-Type: audio/wav\r\n\r\nRIFF',
    );
    await Promise.race([admitted, timeout]);
    upload.destroy();
    await Promise.race([released, timeout]);
    assert.equal(mediaCalls, 0);
    assert.equal(calls, 0);
    assert.equal((await send("/speech/transcriptions", form())).status, 200);
  } finally {
    clearTimeout(timer);
    upload.destroy();
  }
});
