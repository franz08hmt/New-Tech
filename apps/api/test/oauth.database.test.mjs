import { before, after, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  openOAuthFixture,
  begin,
  deferred,
  bounded,
} from "./oauth-db-fixture.mjs";
import { AuthService } from "../dist/auth/auth.service.js";
import { AuthStore } from "../dist/auth/auth-store.js";
import { tokenHash, randomToken } from "../dist/auth/session-crypto.js";
let f;
const unexpectedCookies = [];
afterEach(() => {
  const observed = unexpectedCookies.splice(0);
  assert.deepEqual(
    observed,
    [],
    "rejected/uncertain callbacks never mutate cookies",
  );
});
before(async () => {
  f = await openOAuthFixture();
});
after(async () => {
  await f?.close();
});
test("real non-owner attempt single-use concurrent callbacks exchange once with SQL overlap", async () => {
  const catalog = (
    await f.db.query(
      "SELECT current_user=session_user AS same,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user",
    )
  ).rows[0];
  assert.deepEqual(catalog, {
    same: true,
    rolsuper: false,
    rolbypassrls: false,
  });
  const p = await begin(f),
    entered = deferred(),
    release = deferred(),
    original = f.adapter.exchangeCode;
  let stateEntered = 0;
  f.adapter.exchangeCode = async (...a) => {
    entered.resolve();
    if (!stateEntered++) await release.promise;
    return original.apply(f.adapter, a);
  };
  const before = f.state.exchanges;
  const first = f.auth.googleCallback(p.req, p.response, p.query);
  await bounded(entered.promise);
  const otherDb = f.openRuntime(2),
    other = new AuthService(() => f.config, new AuthStore(otherDb), f.adapter);
  assert.notEqual(
    (await f.db.query("SELECT pg_backend_pid() AS pid")).rows[0].pid,
    (await otherDb.query("SELECT pg_backend_pid() AS pid")).rows[0].pid,
  );
  assert.equal(
    await bounded(
      other.googleCallback(
        p.req,
        {
          setHeader() {
            unexpectedCookies.push("set-cookie");
          },
        },
        p.query,
      ),
    ),
    "restart_required",
  );
  // Exchange is waiting, but the same runtime pool can serve another DB request.
  assert.equal((await bounded(f.db.query("SELECT 1 AS n"))).rows[0].n, 1);
  release.resolve();
  const firstResult = await bounded(first);
  assert.equal(f.state.exchanges - before, 1);
  assert.equal(
    stateEntered,
    1,
    "one provider exchange enters despite concurrent callbacks",
  );
  assert.equal(firstResult, "success");
  f.adapter.exchangeCode = original;
  const row = (
    await f.admin.query(
      "SELECT verifier,claimed_at FROM pilot_oauth_attempts WHERE prelogin_hash=$1",
      [tokenHash(p.cookie.split("=")[1])],
    )
  ).rows[0];
  assert.equal(row.verifier, null);
  assert.ok(row.claimed_at);
});
test("new flow replaces claimed attempt and late callback cannot replace new flow/session", async () => {
  const p = await begin(f),
    id = new URLSearchParams(p.query).get("attempt");
  const secret = await f.store.claimOAuth(
    tokenHash(p.cookie.split("=")[1]),
    tokenHash(id),
    f.config.origin,
  );
  assert.ok(secret);
  await f.auth.googleStart(p.req);
  const oldCount = (
    await f.admin.query(
      "SELECT count(*)::int AS n FROM pilot_sessions WHERE kind='authenticated'",
    )
  ).rows[0].n;
  assert.equal(
    await f.auth.googleCallback(
      p.req,
      {
        setHeader() {
          unexpectedCookies.push("set-cookie");
        },
      },
      p.query,
    ),
    "restart_required",
  );
  assert.equal(
    (
      await f.admin.query(
        "SELECT count(*)::int AS n FROM pilot_sessions WHERE kind='authenticated'",
      )
    ).rows[0].n,
    oldCount,
  );
});
test("expiry cleanup, restart decryption and context-free bootstrap remain fail closed", async () => {
  const p = await begin(f),
    hash = tokenHash(p.cookie.split("=")[1]);
  await f.admin.query(
    "UPDATE pilot_oauth_attempts SET expires_at=NOW()-INTERVAL '1 second' WHERE prelogin_hash=$1",
    [hash],
  );
  assert.equal(
    await f.auth.googleCallback(
      p.req,
      {
        setHeader() {
          unexpectedCookies.push("set-cookie");
        },
      },
      p.query,
    ),
    "restart_required",
  );
  const newer = await begin(f);
  assert.equal(
    (
      await f.admin.query(
        "SELECT 1 FROM pilot_oauth_attempts WHERE prelogin_hash=$1",
        [hash],
      )
    ).rowCount,
    0,
  );
  const restarted = new AuthService(
    () => f.config,
    new AuthStore(f.db),
    f.adapter,
  );
  assert.equal(
    await restarted.googleCallback(newer.req, newer.response, newer.query),
    "success",
  );
});
test("real prelogin revocation while provider waits prevents account swap, and no transaction holds pool max=1", async () => {
  const one = f.openRuntime(1),
    store = new AuthStore(one),
    auth = new AuthService(() => f.config, store, f.adapter),
    p = await begin(f, auth);
  const started = deferred(),
    release = deferred(),
    original = f.adapter.exchangeCode;
  f.adapter.exchangeCode = async (...a) => {
    started.resolve();
    await release.promise;
    return original.apply(f.adapter, a);
  };
  const result = auth.googleCallback(
    p.req,
    {
      setHeader() {
        unexpectedCookies.push("set-cookie");
      },
    },
    p.query,
  );
  await bounded(started.promise);
  await bounded(store.revoke(tokenHash(p.cookie.split("=")[1])));
  release.resolve();
  assert.equal(await bounded(result), "restart_required");
  f.adapter.exchangeCode = original;
});
test("different browser/session and tampered ciphertext do not exchange; DB failures never issue cookies", async () => {
  const a = await begin(f),
    b = await begin(f),
    before = f.state.exchanges;
  assert.equal(
    await f.store.claimOAuth(
      tokenHash(b.cookie.split("=")[1]),
      tokenHash(new URLSearchParams(a.query).get("attempt")),
      f.config.origin,
    ),
    undefined,
    "store must reject different prelogin before returning any encrypted verifier",
  );
  assert.equal(
    await f.auth.googleCallback(
      b.req,
      {
        setHeader() {
          unexpectedCookies.push("set-cookie");
        },
      },
      a.query,
    ),
    "restart_required",
  );
  const hash = tokenHash(a.cookie.split("=")[1]);
  await f.admin.query(
    "UPDATE pilot_oauth_attempts SET verifier=jsonb_set(verifier,'{data}','\"tampered\"') WHERE prelogin_hash=$1",
    [hash],
  );
  assert.equal(
    await f.auth.googleCallback(
      a.req,
      {
        setHeader() {
          unexpectedCookies.push("set-cookie");
        },
      },
      a.query,
    ),
    "restart_required",
  );
  assert.equal(f.state.exchanges, before);
});

test("COMMIT uncertainty at claim and issuance never replays or returns unconfirmed cookie", async () => {
  const { loseNextCommit } = await import("./receipt-tenant-fixture.mjs");
  for (const stage of ["claim", "issuance"]) {
    const p = await begin(f),
      before = f.state.exchanges;
    const count = (
      await f.admin.query(
        "SELECT count(*)::int AS n FROM pilot_sessions WHERE kind='authenticated'",
      )
    ).rows[0].n;
    const original = f.adapter.exchangeCode;
    let restore;
    if (stage === "claim") restore = loseNextCommit(f.db);
    else
      f.adapter.exchangeCode = async (...a) => {
        const tokens = await original.apply(f.adapter, a);
        restore = loseNextCommit(f.db);
        return tokens;
      };
    try {
      assert.equal(
        await f.auth.googleCallback(
          p.req,
          {
            setHeader() {
              unexpectedCookies.push("set-cookie");
            },
          },
          p.query,
        ),
        "restart_required",
      );
      assert.equal(f.state.exchanges - before, stage === "claim" ? 0 : 1);
      assert.equal(
        (
          await f.admin.query(
            "SELECT count(*)::int AS n FROM pilot_sessions WHERE kind='authenticated'",
          )
        ).rows[0].n,
        count + (stage === "issuance" ? 1 : 0),
      );
      assert.equal(
        await f.auth.googleCallback(
          p.req,
          {
            setHeader() {
              unexpectedCookies.push("set-cookie");
            },
          },
          p.query,
        ),
        "restart_required",
      );
      assert.equal(f.state.exchanges - before, stage === "claim" ? 0 : 1);
    } finally {
      restore?.();
      f.adapter.exchangeCode = original;
    }
  }
});
test("a new start during exchange prevents stale issuance on real store; SQL error rolls transition back", async () => {
  const p = await begin(f),
    started = deferred(),
    release = deferred(),
    original = f.adapter.exchangeCode;
  f.adapter.exchangeCode = async (...a) => {
    started.resolve();
    await release.promise;
    return original.apply(f.adapter, a);
  };
  const slow = f.auth.googleCallback(
    p.req,
    {
      setHeader() {
        unexpectedCookies.push("set-cookie");
      },
    },
    p.query,
  );
  await bounded(started.promise);
  await f.auth.googleStart(p.req);
  release.resolve();
  assert.equal(await bounded(slow), "restart_required");
  f.adapter.exchangeCode = original;
  const q = await begin(f),
    transaction = f.db.transaction.bind(f.db);
  let fired = false;
  f.db.transaction = (work) =>
    transaction((tx) =>
      work({
        query(sql, values) {
          if (sql.startsWith("INSERT INTO pilot_sessions") && !fired) {
            fired = true;
            throw Error("synthetic insert failure");
          }
          return tx.query(sql, values);
        },
      }),
    );
  try {
    assert.equal(
      await f.auth.googleCallback(
        q.req,
        {
          setHeader() {
            unexpectedCookies.push("set-cookie");
          },
        },
        q.query,
      ),
      "restart_required",
    );
  } finally {
    f.db.transaction = transaction;
  }
  assert.equal(fired, true);
  assert.equal(
    (
      await f.admin.query(
        "SELECT revoked_at FROM pilot_sessions WHERE cookie_hash=$1",
        [tokenHash(q.cookie.split("=")[1])],
      )
    ).rows[0].revoked_at,
    null,
  );
});
test("Google verified identities retain DB manager/member/viewer/no-access and session revocation gates", async () => {
  for (const role of ["manager", "member", "viewer", "absent", "inactive"]) {
    f.state.user = role;
    const p = await begin(f),
      headers = {};
    assert.equal(
      await f.auth.googleCallback(
        p.req,
        {
          setHeader(n, v) {
            headers[n.toLowerCase()] = v;
          },
        },
        p.query,
      ),
      "success",
    );
    const req = {
      method: "GET",
      path: "/api/tasks",
      headers: { cookie: headers["set-cookie"].split(";")[0] },
    };
    if (["absent", "inactive"].includes(role))
      await assert.rejects(
        f.auth.authenticate(req),
        (e) => e.getStatus() === 403,
      );
    else assert.equal((await f.auth.authenticate(req)).role, role);
  }
  f.state.user = "member";
});

test("attempt/prelogin expiry during claim or issuance lock wait stops the next security boundary", async () => {
  for (const stage of ["claim", "issuance"])
    for (const field of ["attempt", "prelogin"]) {
      const p = await begin(f),
        hash = tokenHash(p.cookie.split("=")[1]),
        before = f.state.exchanges;
      const blocker = await f.admin.connect(),
        waiting = deferred(),
        transaction = f.db.transaction.bind(f.db),
        exchange = f.adapter.exchangeCode;
      let blocked = false,
        armed = stage === "claim",
        cookies = 0;
      const lock = async () => {
        await blocker.query("BEGIN");
        blocked = true;
        await blocker.query(
          "SELECT cookie_hash FROM pilot_sessions WHERE cookie_hash=$1 FOR UPDATE",
          [hash],
        );
      };
      try {
        if (stage === "claim") await lock();
        else
          f.adapter.exchangeCode = async (...args) => {
            const tokens = await exchange.apply(f.adapter, args);
            await lock();
            armed = true;
            return tokens;
          };
        f.db.transaction = (work) =>
          transaction((tx) =>
            work({
              query(sql, values) {
                const result = tx.query(sql, values);
                if (
                  armed &&
                  sql.startsWith("SELECT cookie_hash FROM pilot_sessions") &&
                  sql.includes("FOR UPDATE")
                ) {
                  armed = false;
                  waiting.resolve();
                }
                return result;
              },
            }),
          );
        const result = f.auth.googleCallback(
          p.req,
          {
            setHeader() {
              cookies++;
            },
          },
          p.query,
        );
        await bounded(waiting.promise); // BEGIN completed; parent lock is held by blocker.
        if (field === "attempt")
          await f.admin.query(
            "UPDATE pilot_oauth_attempts SET expires_at=clock_timestamp() WHERE prelogin_hash=$1",
            [hash],
          );
        else
          await blocker.query(
            "UPDATE pilot_sessions SET expires_at=statement_timestamp(),idle_expires_at=statement_timestamp() WHERE cookie_hash=$1",
            [hash],
          );
        await blocker.query("COMMIT");
        blocked = false;
        assert.equal(
          await bounded(result),
          "restart_required",
          `${stage}/${field} expiry must reject`,
        );
        assert.equal(
          cookies,
          0,
          `${stage}/${field} expiry must never deliver a cookie`,
        );
        assert.equal(
          f.state.exchanges - before,
          stage === "claim" ? 0 : 1,
          `${stage}/${field} expiry must stop exchange/issuance at its next boundary`,
        );
      } finally {
        if (blocked) await blocker.query("ROLLBACK");
        blocker.release();
        f.db.transaction = transaction;
        f.adapter.exchangeCode = exchange;
      }
    }
});

test("a new start cannot dispatch after prelogin expires while its lock is queued", async () => {
  const p = await begin(f),
    hash = tokenHash(p.cookie.split("=")[1]),
    blocker = await f.admin.connect(),
    waiting = deferred();
  const transaction = f.db.transaction.bind(f.db);
  let blocked = false;
  try {
    await blocker.query("BEGIN");
    blocked = true;
    await blocker.query(
      "SELECT cookie_hash FROM pilot_sessions WHERE cookie_hash=$1 FOR UPDATE",
      [hash],
    );
    f.db.transaction = (work) =>
      transaction((tx) =>
        work({
          query(sql, values) {
            const response = tx.query(sql, values);
            if (
              sql.startsWith("SELECT cookie_hash FROM pilot_sessions") &&
              sql.includes("FOR UPDATE")
            )
              waiting.resolve();
            return response;
          },
        }),
      );
    const pending = f.auth.googleStart(p.req).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await bounded(waiting.promise);
    await blocker.query(
      "UPDATE pilot_sessions SET expires_at=statement_timestamp(),idle_expires_at=statement_timestamp() WHERE cookie_hash=$1",
      [hash],
    );
    await blocker.query("COMMIT");
    blocked = false;
    const result = await bounded(pending);
    assert.equal(
      result.error?.getStatus(),
      503,
      "no authorization URL after stale prelogin lock wait",
    );
  } finally {
    if (blocked) await blocker.query("ROLLBACK");
    blocker.release();
    f.db.transaction = transaction;
  }
});

test("016 checksum/idempotency, drift/dependency guards and rollback preserve sessions and allow reapply", async () => {
  const { migrate } = await import("../scripts/migrate.mjs"),
    { runPilotRollback016 } = await import("../scripts/pilot-rollback-016.mjs"),
    { runPilotRollback015 } = await import("../scripts/pilot-rollback-015.mjs");
  const options = {
      apply: true,
      projectRef: "a1b2c3d4e5f6g7h8i9j0",
      confirmProject: "a1b2c3d4e5f6g7h8i9j0",
    },
    client = await f.admin.connect();
  const before = (
    await f.admin.query(
      "SELECT cookie_hash FROM pilot_sessions ORDER BY cookie_hash",
    )
  ).rows;
  try {
    await assert.rejects(
      runPilotRollback015(client, options),
      /later or unknown/,
    );
    const dry = await runPilotRollback016(client, { ...options, apply: false });
    assert.equal(dry.applied, false);
    await client.query(
      "CREATE VIEW oauth_blocker_fixture AS SELECT attempt_hash FROM pilot_oauth_attempts",
    );
    await assert.rejects(runPilotRollback016(client, options), /refused/);
    await client.query("DROP VIEW oauth_blocker_fixture");
    await client.query(
      "ALTER TABLE pilot_oauth_attempts ADD COLUMN drift_fixture integer",
    );
    await assert.rejects(runPilotRollback016(client, options), /schema drift/);
    await client.query(
      "ALTER TABLE pilot_oauth_attempts DROP COLUMN drift_fixture",
    );
    assert.equal((await runPilotRollback016(client, options)).applied, true);
    assert.deepEqual(
      (
        await client.query(
          "SELECT cookie_hash FROM pilot_sessions ORDER BY cookie_hash",
        )
      ).rows,
      before,
    );
  } finally {
    client.release();
  }
  // The exact disposable URL stays private and passes the target guard.
  const target = new URL(process.env.TEST_DATABASE_URL);
  target.pathname = "/" + f.name;
  f.guard(target.href);
  await migrate(target.href);
  await migrate(target.href);
  assert.equal(
    (await f.admin.query("SELECT count(*)::int AS n FROM schema_migrations"))
      .rows[0].n,
    16,
  );
});
