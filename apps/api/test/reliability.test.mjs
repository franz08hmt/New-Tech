import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { fakeDependencies, httpApp, pdfForm } from "./helpers.mjs";

test("ambiguous INSERT committed: preserve object and return confirmed record", async () => {
  const fixture = fakeDependencies();
  const original = fixture.database.query.bind(fixture.database);
  fixture.database.query = async (sql, values) => {
    const result = await original(sql, values);
    if (sql.includes("INSERT INTO documents"))
      throw new Error("response lost after commit");
    return result;
  };
  const server = await httpApp(fixture.database, fixture.storage);
  try {
    const response = await server.request("/documents", pdfForm());
    assert.equal(response.status, 201);
    assert.equal(fixture.documents.size, 1);
    assert.equal(fixture.objects.size, 1);
    assert.equal(fixture.state.removeCalls, 0);
  } finally {
    await server.app.close();
  }
});

test("ambiguous INSERT and failed reconciliation: never delete an unconfirmed object", async () => {
  const fixture = fakeDependencies();
  fixture.state.failInsert = true;
  const original = fixture.database.query.bind(fixture.database);
  fixture.database.query = async (sql, values) => {
    // Matches the reconciliation lookup only. It used to read
    // "FROM documents WHERE"; the query now joins the course in, so the
    // injection is pinned to the WHERE clause that is unique to find().
    if (sql.includes("WHERE d.id = $1")) throw new Error("database offline");
    return original(sql, values);
  };
  const server = await httpApp(fixture.database, fixture.storage);
  try {
    assert.equal((await server.request("/documents", pdfForm())).status, 500);
    assert.equal(fixture.objects.size, 1);
    assert.equal(fixture.state.removeCalls, 0);
  } finally {
    await server.app.close();
  }
});

test("real pg connection refusal is a sanitized HTTP 503 for Tasks and health", async () => {
  // Reserve then release an OS-selected localhost port. Never contact a user database.
  const socket = createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const saved = { ...process.env };
  process.env.DATABASE_URL = `postgresql://fixture:fixture@127.0.0.1:${port}/connection_failure_test`;
  process.env.DATABASE_SSL = "false";
  process.env.DATABASE_TIMEOUT_MS = "500";
  const server = await httpApp(undefined, fakeDependencies().storage);
  try {
    const response = await server.request("/tasks");
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.code, "DATABASE_UNAVAILABLE");
    assert.ok(body.requestId);
    assert.ok(!JSON.stringify(body).includes("postgresql"));
    assert.equal((await server.request("/health")).status, 503);
  } finally {
    await server.app.close();
    for (const key of Object.keys(process.env))
      if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
