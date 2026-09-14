import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { loadEnvironment, databaseConfig } from "../dist/config/config.js";
import { migrate } from "../scripts/migrate.mjs";
import { fakeDependencies, httpApp, json, pdfForm } from "./helpers.mjs";

loadEnvironment();
const url = process.env.TEST_DATABASE_URL;
test(
  "real PostgreSQL: migrations twice, HTTP Tasks/Documents persist after API restart; Storage mocked",
  { skip: !url ? "TEST_DATABASE_URL is absent; no real DB evidence" : false },
  async () => {
    const parsed = new URL(url);
    assert.match(
      parsed.pathname,
      /_test$/,
      "Use a dedicated database whose name ends in _test",
    );
    if (process.env.DATABASE_URL) {
      const runtime = new URL(process.env.DATABASE_URL);
      assert.ok(
        parsed.hostname !== runtime.hostname ||
          parsed.port !== runtime.port ||
          parsed.pathname !== runtime.pathname,
        "Test target must differ from runtime database",
      );
    }
    await migrate(url);
    await migrate(url);
    const pool = new pg.Pool(databaseConfig(url));
    const oldUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = url;
    const fixture = fakeDependencies();
    let server, taskId, documentId;
    try {
      server = await httpApp(undefined, fixture.storage);
      const response = await server.request(
        "/tasks",
        json("POST", {
          title: `Persistence ${randomUUID()}`,
          dueDate: "2028-02-29",
        }),
      );
      assert.equal(response.status, 201);
      const task = await response.json();
      taskId = task.id;
      assert.equal(
        (
          await server.request(
            `/tasks/${taskId}/status`,
            json("PATCH", { status: "done" }),
          )
        ).status,
        200,
      );
      const uploaded = await server.request("/documents", pdfForm());
      assert.equal(uploaded.status, 201);
      documentId = (await uploaded.json()).id;
      await server.app.close();
      server = await httpApp(undefined, fixture.storage);
      const tasks = await (await server.request("/tasks")).json();
      assert.equal(tasks.find((row) => row.id === taskId).status, "done");
      assert.equal(
        tasks.find((row) => row.id === taskId).due_date,
        "2028-02-29",
      );
      const docs = await (await server.request("/documents")).json();
      assert.equal(
        docs.find((row) => row.id === documentId).storage_status,
        "stored",
      );
      assert.equal(
        (await server.request(`/documents/${documentId}/download`)).status,
        200,
      );
      assert.equal(
        (await server.request(`/documents/${documentId}`, { method: "DELETE" }))
          .status,
        204,
      );
      const result = await pool.query("SELECT status FROM tasks WHERE id=$1", [
        taskId,
      ]);
      assert.equal(result.rows[0].status, "done");
      console.log(
        "DATA PROOF: task persisted as done after API restart; document metadata persisted; Storage was mocked.",
      );
    } finally {
      await server?.app.close();
      if (documentId)
        await pool.query("DELETE FROM documents WHERE id=$1", [documentId]);
      if (taskId) await pool.query("DELETE FROM tasks WHERE id=$1", [taskId]);
      await pool.end();
      if (oldUrl) process.env.DATABASE_URL = oldUrl;
      else delete process.env.DATABASE_URL;
    }
  },
);
