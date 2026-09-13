import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { resolve, relative } from "node:path";
import { rootCertificates } from "node:tls";
import {
  appConfig,
  databaseConfig,
  projectRoot,
} from "../dist/config/config.js";

const saved = { ...process.env };
const cwd = process.cwd();
const fixture = rootCertificates[0]; // Public test CA, never the user's certificate.
afterEach(() => {
  process.chdir(cwd);
  mock.restoreAll();
  syncBuiltinESMExports();
  for (const key of Object.keys(process.env))
    if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});
function configure() {
  for (const key of Object.keys(process.env))
    if (/^(DATABASE_|MIGRATION_|SUPABASE_)/.test(key)) delete process.env[key];
  process.env.DATABASE_URL = "postgresql://demo:demo@cloud.example/db";
  process.env.DATABASE_SSL = "true";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_STORAGE_BUCKET = "test-bucket";
}

test("portable CA resolves from repository root regardless of cwd", () => {
  configure();
  process.env.DATABASE_CA_CERT_PATH = "  secrets/prod-supabase.cer  ";
  const expected = resolve(projectRoot, "secrets/prod-supabase.cer");
  const paths = [];
  mock.method(fs, "existsSync", (path) => {
    assert.equal(path, expected);
    return true;
  });
  mock.method(fs, "readFileSync", (path, encoding) => {
    paths.push(path);
    assert.equal(encoding, "utf8");
    return fixture;
  });
  syncBuiltinESMExports();
  for (const directory of [
    projectRoot,
    resolve(projectRoot, "apps/api"),
    tmpdir(),
  ]) {
    process.chdir(directory);
    const { ssl } = databaseConfig();
    assert.equal(ssl.ca, fixture);
    assert.equal(ssl.rejectUnauthorized, true);
  }
  assert.deepEqual(paths, [expected, expected, expected]);
});

test("absolute deployment path and relative path read a real public CA fixture", (t) => {
  configure();
  const directory = fs.mkdtempSync(resolve(tmpdir(), "examate-ca-"));
  const path = resolve(directory, "fixture.pem");
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path, fixture);
  process.chdir(tmpdir());
  for (const value of [path, relative(projectRoot, path)]) {
    process.env.DATABASE_CA_CERT_PATH = value;
    assert.equal(databaseConfig().ssl.ca, fixture);
    assert.equal(databaseConfig().ssl.rejectUnauthorized, true);
  }
});

test("missing CA reports the variable without exposing configured path", () => {
  configure();
  process.env.DATABASE_CA_CERT_PATH = "secrets/absent-sensitive-name.pem";
  assert.throws(() => databaseConfig(), {
    message:
      "DATABASE_CA_CERT_PATH does not point to an existing certificate file",
  });
});

test("unreadable and invalid CA produce safe configuration errors", () => {
  configure();
  process.env.DATABASE_CA_CERT_PATH = "secrets/test.pem";
  mock.method(fs, "existsSync", () => true);
  const read = mock.method(fs, "readFileSync", () => {
    throw new Error("sensitive path");
  });
  syncBuiltinESMExports();
  assert.throws(() => databaseConfig(), {
    message: "DATABASE_CA_CERT_PATH certificate file cannot be read",
  });
  read.mock.mockImplementation(() => "not a certificate");
  assert.throws(() => databaseConfig(), {
    message: "DATABASE_CA_CERT_PATH must contain a valid PEM X.509 certificate",
  });
});

test("cloud TLS stays verified with system trust; local TLS disabled ignores CA", () => {
  configure();
  process.env.DATABASE_CA_CERT_PATH = "   ";
  assert.deepEqual(databaseConfig().ssl, { rejectUnauthorized: true });
  process.env.DATABASE_SSL = "false";
  assert.throws(() => databaseConfig(), /only allowed for local/);
  process.env.DATABASE_CA_CERT_PATH = "missing.pem";
  assert.equal(
    databaseConfig("postgres://demo:demo@localhost/test").ssl,
    false,
  );
});

test("SSL URL parameters cannot replace verified TLS", () => {
  configure();
  for (const key of ["sslmode", "sslcert", "sslrootcert", "sslkey", "SSLMode"])
    assert.throws(
      () => databaseConfig(`${process.env.DATABASE_URL}?${key}=test`),
      /Remove ssl/,
    );
});

test("secret key takes precedence over a placeholder legacy key", () => {
  configure();
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test_fixture";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "REPLACE_SERVICE_ROLE_JWT";
  assert.equal(appConfig().storage.key, "sb_secret_test_fixture");
  process.env.SUPABASE_SECRET_KEY = "invalid_fixture";
  assert.throws(() => appConfig(), /SUPABASE_SECRET_KEY must/);
});

test("legacy service_role fallback remains supported; anon rejected", () => {
  configure();
  const key = `test.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.test`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = key;
  for (const secret of ["", "REPLACE_SECRET_KEY"]) {
    process.env.SUPABASE_SECRET_KEY = secret;
    assert.equal(appConfig().storage.key, key);
  }
  process.env.SUPABASE_SERVICE_ROLE_KEY = `test.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.test`;
  assert.throws(() => appConfig(), /legacy service_role JWT/);
});
