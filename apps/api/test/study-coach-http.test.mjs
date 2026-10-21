import assert from "node:assert/strict";
import { test } from "node:test";
import { httpApp } from "./helpers.mjs";

test("Study Coach exposes an owner-scoped paged quiz list", async () => {
  let workspaceTransactions = 0;
  const database = {
    query: async () => ({ rows: [] }),
    transaction: async (work) => work({ query: async () => ({ rows: [] }) }),
    workspaceTransaction: async (_principal, work) => {
      workspaceTransactions++;
      return work({ query: async () => ({ rows: [] }) });
    },
  };
  const server = await httpApp(database, {});
  try {
    const response = await server.request(
      "/study-coach/quizzes?page=1&pageSize=20",
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
    const afterValid = workspaceTransactions;
    for (const query of [
      "page=0",
      "page=-1",
      "page=1&page=2",
      "pageSize=51",
      "pageSize[]=20",
      "unexpected=true",
    ]) {
      const invalid = await server.request(`/study-coach/quizzes?${query}`);
      assert.equal(invalid.status, 400, query);
      const body = await invalid.json();
      assert.equal(body.code, "STUDY_QUIZ_REQUEST_INVALID", query);
      assert.doesNotMatch(JSON.stringify(body), /SELECT|stack|page=1&page=2/);
    }
    assert.equal(
      workspaceTransactions,
      afterValid,
      "invalid list queries must stop before workspace SQL",
    );
  } finally {
    await server.app.close();
  }
});
