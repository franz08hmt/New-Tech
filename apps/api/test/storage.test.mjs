import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { StorageService } from "../dist/documents/storage.service.js";
import { databaseConfig, appConfig } from "../dist/config/config.js";

const originalFetch = globalThis.fetch;
const saved = { ...process.env };
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env))
    if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});
function configure() {
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.DATABASE_CA_CERT_PATH;
  process.env.DATABASE_URL =
    "postgresql://demo:demo@localhost:5432/examate_test";
  process.env.DATABASE_SSL = "false";
  process.env.SUPABASE_URL = "https://storage.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = `test.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.test`;
  process.env.SUPABASE_STORAGE_BUCKET = "test-bucket";
}
test("Storage HTTP adapter sends private bucket check, bytes, short signed URL and delete prefixes", async () => {
  configure();
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return Response.json(
      url.includes("/bucket/")
        ? { public: false }
        : url.includes("/object/sign/")
          ? {
              signedURL:
                "/object/sign/test-bucket/documents/test.pdf?token=fixture",
            }
          : {},
    );
  };
  const storage = new StorageService();
  await storage.upload("documents/test.pdf", Buffer.from("%PDF-1.4"));
  assert.equal(
    calls[0].init.headers.Authorization,
    `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  );
  assert.equal(calls[1].init.headers["Content-Type"], "application/pdf");
  assert.equal(calls[1].init.headers["x-upsert"], "false");
  assert.ok(calls[1].init.body instanceof Uint8Array);
  assert.ok(calls[1].init.signal);
  assert.equal(calls[1].init.redirect, "error");
  const signed = await storage.signedDownload(
    "documents/test.pdf",
    "study notes.pdf",
  );
  assert.equal(signed.expiresIn, 60);
  assert.ok(signed.url.includes("download=study+notes.pdf"));
  assert.deepEqual(JSON.parse(calls[3].init.body), { expiresIn: 60 });
  await storage.remove("documents/test.pdf");
  assert.deepEqual(JSON.parse(calls[4].init.body), {
    prefixes: ["documents/test.pdf"],
  });
});

test("Storage secret key uses apikey without sending it as a Bearer JWT", async () => {
  configure();
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test_fixture";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "REPLACE_SERVICE_ROLE_JWT";
  globalThis.fetch = async (_url, init) => {
    assert.equal(init.headers.apikey, "sb_secret_test_fixture");
    assert.equal(init.headers.Authorization, undefined);
    return Response.json({ public: false });
  };
  await new StorageService().assertPrivateBucket();
});
test("Storage HTTP adapter refuses public buckets and hides provider errors", async () => {
  configure();
  globalThis.fetch = async () => Response.json({ public: true });
  await assert.rejects(
    new StorageService().upload("documents/test.pdf", Buffer.from("%PDF-")),
    (error) => error.getStatus() === 503,
  );
  globalThis.fetch = async () =>
    new Response("secret provider detail", { status: 500 });
  await assert.rejects(
    new StorageService().remove("documents/test.pdf"),
    (error) => error.getStatus() === 503 && !error.message.includes("secret"),
  );
});
test("Storage HTTP adapter handles timeout/network and malformed signed response", async () => {
  configure();
  globalThis.fetch = async () => {
    throw new DOMException("timeout", "TimeoutError");
  };
  await assert.rejects(
    new StorageService().remove("documents/test.pdf"),
    (error) => error.getStatus() === 503,
  );
  globalThis.fetch = async (url) =>
    Response.json(
      url.includes("/bucket/")
        ? { public: false }
        : { signedURL: "https://untrusted.example/" },
    );
  await assert.rejects(
    new StorageService().signedDownload("documents/test.pdf", "test.pdf"),
    (error) => error.getStatus() === 503,
  );
});
test("Configuration fails closed for missing credentials and insecure cloud TLS", () => {
  configure();
  delete process.env.DATABASE_URL;
  assert.throws(() => appConfig(), /DATABASE_URL/);
  configure();
  process.env.DATABASE_URL = "postgresql://demo:demo@cloud.example/db";
  assert.throws(() => databaseConfig(), /only allowed for local/);
  process.env.DATABASE_SSL = "true";
  assert.equal(databaseConfig().ssl.rejectUnauthorized, true);
  process.env.DATABASE_URL += "?sslmode=no-verify";
  assert.throws(() => databaseConfig(), /Remove ssl/);
});
