import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { inspect } from "node:util";
import pg from "pg";
import { assertTestDatabaseTarget } from "../scripts/test-database-target.mjs";
import { migrate, loadMigrations } from "../scripts/migrate.mjs";
import { PilotCliError } from "../scripts/pilot-cli-common.mjs";
import { runPilotRollback } from "../scripts/pilot-rollback-012-013.mjs";
import { prepareAuthFixture } from "./disposable-auth-fixture.mjs";

// Guard before any Pool/connection/migration/fixture/cleanup. Never load .env,
// call the production CLI, or select a production connection configuration.
const parentUrl = assertTestDatabaseTarget(process.env.TEST_DATABASE_URL);
const projectRef = "a1b2c3d4e5f6g7h8i9j0";
const migrationName = "014_workspace_scope.sql";
const businessTables = [
  "tasks",
  "courses",
  "exams",
  "study_plans",
  "expenses",
  "documents",
  "assistant_feedback",
];
const options = { apply: true, projectRef, confirmProject: projectRef };
const privateContent = "SYNTHETIC_PRIVATE_014_DOCUMENT";
const environmentNames = [
  "DATABASE_SSL",
  "DATABASE_CA_CERT_PATH",
  "DATABASE_POOL_MAX",
  "PILOT_WORKSPACE_ID",
];
const checksum = (file) =>
  createHash("sha256").update(file.sql.replace(/\r\n/g, "\n")).digest("hex");

async function runtime() {
  const module = await import("../scripts/pilot-rollback-014.mjs");
  assert.equal(typeof module.runPilotRollback014, "function");
  return module.runPilotRollback014;
}

async function legacySource() {
  const source = (await loadMigrations()).filter(
    (file) => Number(file.name.slice(0, 3)) <= 13,
  );
  assert.equal(source.length, 13);
  return source;
}

async function ownedDatabase(client, name) {
  assert.equal(
    (
      await client.query(
        "SELECT pg_get_userbyid(datdba)=current_user AS owned FROM pg_database WHERE datname=$1",
        [name],
      )
    ).rows[0]?.owned,
    true,
    "fixture role must own this exact database",
  );
}

async function ledger(client) {
  return (
    await client.query(
      "SELECT name,checksum,applied_at FROM public.schema_migrations ORDER BY name",
    )
  ).rows;
}

async function schema(client) {
  return {
    columns: (
      await client.query(
        "SELECT table_name,column_name,ordinal_position,is_nullable,data_type,udt_schema,udt_name,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position",
      )
    ).rows,
    relations: (
      await client.query(
        "SELECT c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m') ORDER BY c.relname",
      )
    ).rows,
    constraints: (
      await client.query(
        "SELECT c.relname,con.conname,con.contype,con.convalidated,pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,con.conname",
      )
    ).rows,
    indexes: (
      await client.query(
        "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname",
      )
    ).rows,
  };
}

async function rows(client, omitWorkspace = false) {
  const result = {};
  // Catalog identifiers are quoted, never treated as executable input.
  const tables = (
    await client.query(
      "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname<>'schema_migrations' ORDER BY c.relname",
    )
  ).rows;
  for (const { relname } of tables) {
    const quoted = '"' + relname.replaceAll('"', '""') + '"';
    const projection =
      omitWorkspace && businessTables.includes(relname)
        ? "to_jsonb(r)-'workspace_id'"
        : "to_jsonb(r)";
    result[relname] = (
      await client.query(
        `SELECT ${projection} AS data FROM public.${quoted} r ORDER BY (${projection})::text`,
      )
    ).rows.map(({ data }) => data);
  }
  result["auth.users"] = (
    await client.query("SELECT * FROM auth.users ORDER BY id")
  ).rows;
  result["auth.sessions"] = (
    await client.query("SELECT * FROM auth.sessions ORDER BY id")
  ).rows;
  return result;
}

async function state(client) {
  return {
    schema: await schema(client),
    rows: await rows(client),
    ledger: await ledger(client),
    triggers: (
      await client.query(
        "SELECT c.relname,t.tgname,t.tgenabled,t.tgisinternal,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,t.tgname",
      )
    ).rows,
  };
}

function privateError(error, extra = []) {
  assert.ok(error instanceof PilotCliError);
  assert.equal(error.cause, undefined);
  const printable = inspect(error, { depth: 20 });
  for (const value of [
    projectRef,
    privateContent,
    "SYNTHETIC_PRIVATE_PG",
    ...extra,
  ]) {
    assert.ok(!printable.includes(value));
  }
  return true;
}

function audited(client, { failDelete = false, loseCommit = false } = {}) {
  const commands = [],
    readOnly = [],
    timeouts = [],
    locks = [];
  return {
    commands,
    readOnly,
    timeouts,
    locks,
    async query(sql, values) {
      const text = typeof sql === "string" ? sql : sql.text;
      commands.push(text);
      if (
        failDelete &&
        /\bDELETE\s+FROM\s+public\.schema_migrations\b/i.test(text)
      ) {
        throw Object.assign(
          new Error(`SYNTHETIC_PRIVATE_PG ${privateContent} ${projectRef}`),
          { detail: privateContent, cause: new Error(projectRef) },
        );
      }
      const result = await client.query(sql, values);
      if (loseCommit && /^\s*COMMIT\s*;?\s*$/i.test(text)) {
        throw new Error(`SYNTHETIC_PRIVATE_PG ${privateContent} ${projectRef}`);
      }
      if (!/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(text)) {
        readOnly.push(
          (await client.query("SHOW transaction_read_only")).rows[0]
            .transaction_read_only,
        );
        timeouts.push(
          (await client.query("SHOW lock_timeout")).rows[0].lock_timeout,
        );
        locks.push(
          (
            await client.query(
              "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND pid=pg_backend_pid() AND objid=424204 AND granted) AS held",
            )
          ).rows[0].held,
        );
      }
      return result;
    },
  };
}

async function fixture(t) {
  const saved = Object.fromEntries(
    environmentNames.map((name) => [name, process.env[name]]),
  );
  process.env.DATABASE_SSL = "false";
  process.env.DATABASE_CA_CERT_PATH = "";
  process.env.DATABASE_POOL_MAX = "1";
  const workspaceId = randomUUID();
  process.env.PILOT_WORKSPACE_ID = workspaceId;
  const name = `examate_phase6_014_${randomUUID().replaceAll("-", "")}_test`;
  const target = new URL(parentUrl);
  target.pathname = `/${name}`;
  const url = assertTestDatabaseTarget(target.href);
  const parent = new pg.Pool({
    connectionString: parentUrl,
    ssl: false,
    max: 1,
  });
  let pool,
    created = false;
  t.after(async () => {
    try {
      await pool?.end();
      if (created) {
        assertTestDatabaseTarget(url);
        assert.equal(decodeURIComponent(new URL(url).pathname.slice(1)), name);
        await ownedDatabase(parent, name);
        await parent.query(`DROP DATABASE "${name}"`);
      }
    } finally {
      await parent.end();
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
  await ownedDatabase(
    parent,
    decodeURIComponent(new URL(parentUrl).pathname.slice(1)),
  );
  await parent.query(`CREATE DATABASE "${name}"`);
  created = true;
  pool = new pg.Pool({ connectionString: url, ssl: false, max: 1 });
  await ownedDatabase(pool, name);
  await prepareAuthFixture(pool);
  await migrate(url, { loadSource: legacySource });
  assert.equal((await ledger(pool)).length, 13);
  await pool.query("INSERT INTO public.workspaces(id) VALUES($1)", [
    workspaceId,
  ]);
  const userId = randomUUID();
  await pool.query("INSERT INTO auth.users(id) VALUES($1)", [userId]);
  await pool.query("INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)", [
    randomUUID(),
    userId,
  ]);
  await pool.query(
    "INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'member')",
    [workspaceId, userId],
  );
  const linkedId = randomUUID(),
    unlinkedId = randomUUID(),
    chunkId = randomUUID();
  const courseId = (
    await pool.query("SELECT id FROM courses ORDER BY slug LIMIT 1")
  ).rows[0].id;
  await pool.query(
    "INSERT INTO documents(id,name,media_type,storage_key,size_bytes,course_id) VALUES($1,'Private fixture.pdf','application/pdf',$2,9,$3),($4,'Private unassigned.pdf','application/pdf',$5,9,NULL)",
    [
      linkedId,
      `phase6/${linkedId}.pdf`,
      courseId,
      unlinkedId,
      `phase6/${unlinkedId}.pdf`,
    ],
  );
  await pool.query(
    "INSERT INTO document_chunks(id,document_id,chunk_index,content,source_page) VALUES($1,$2,0,$3,1)",
    [chunkId, linkedId, privateContent],
  );
  await pool.query(
    "INSERT INTO assistant_feedback(id,answer_id,submission_id,rating,snapshot,payload_hash) VALUES($1,$2,$3,'helpful',$4,$5)",
    [
      randomUUID(),
      randomUUID(),
      randomUUID(),
      JSON.stringify({
        schemaVersion: 1,
        request: {
          question: privateContent,
          mode: "general",
          operation: "question",
        },
        response: {
          answer: privateContent,
          mode: "general",
          answerable: true,
          citations: [],
        },
      }),
      "a".repeat(64),
    ],
  );
  const legacySchema = await schema(pool),
    legacyRows = await rows(pool, true),
    legacyLedger = await ledger(pool);
  assert.ok(businessTables.every((table) => legacyRows[table].length > 0));
  await migrate(url);
  assert.equal((await ledger(pool)).length, 14);
  return {
    pool,
    url,
    workspaceId,
    legacySchema,
    legacyRows,
    legacyLedger,
    linkedId,
    unlinkedId,
    chunkId,
  };
}

async function refuses(client, run, extra = [], config, reason) {
  const before = await state(client);
  const wrapper = audited(client);
  await assert.rejects(run(wrapper, options, config), (error) => {
    privateError(error, extra);
    if (reason) assert.match(error.message, reason);
    return true;
  });
  assert.ok(
    !wrapper.commands.some((sql) =>
      /\b(?:ALTER|DROP|DELETE|INSERT|UPDATE|COMMIT)\b/i.test(sql),
    ),
  );
  assert.deepEqual(await state(client), before);
  assert.equal(
    (await client.query("SHOW transaction_read_only")).rows[0]
      .transaction_read_only,
    "off",
  );
  return wrapper;
}

test("014 dry run is read-only; apply restores the EXACT pre-014 schema and every business row, then 012/013 rollback and default remigration succeed", async (t) => {
  const run = await runtime();
  const f = await fixture(t);
  const client = await f.pool.connect();
  try {
    const before = await state(client);
    const dry = audited(client);
    const plan = await run(dry, { projectRef });
    assert.equal(plan.dryRun, true);
    assert.equal(plan.applied, false);
    assert.deepEqual(plan.ledgerEntries, [migrationName]);
    assert.equal(dry.commands[0].trim().toUpperCase(), "BEGIN READ ONLY");
    assert.equal(dry.commands.at(-1).trim().toUpperCase(), "ROLLBACK");
    assert.ok(
      dry.readOnly.length > 0 && dry.readOnly.every((value) => value === "on"),
    );
    assert.ok(
      !dry.commands.some((sql) =>
        /\b(?:ALTER|DROP|DELETE|INSERT|UPDATE|COMMIT)\b/i.test(sql),
      ),
    );
    assert.deepEqual(await state(client), before);
    const apply = audited(client);
    const result = await run(apply, options);
    assert.equal(result.applied, true);
    assert.equal(result.dryRun, false);
    assert.deepEqual(result.ledgerEntries, [migrationName]);
    for (const output of [plan, result]) {
      for (const value of [
        projectRef,
        privateContent,
        f.workspaceId,
        f.linkedId,
      ])
        assert.ok(!inspect(output, { depth: 20 }).includes(value));
    }
    assert.equal(apply.commands[0].trim().toUpperCase(), "BEGIN");
    assert.equal(apply.commands.at(-1).trim().toUpperCase(), "COMMIT");
    assert.ok(apply.timeouts.includes("5s"));
    assert.ok(
      apply.locks.some(Boolean),
      "apply uses migration advisory lock 424204",
    );
    assert.ok(!apply.commands.some((sql) => /\bDROP\s+TABLE\b/i.test(sql)));
    assert.deepEqual(await schema(client), f.legacySchema);
    assert.deepEqual(await rows(client, true), f.legacyRows);
    assert.deepEqual(await ledger(client), f.legacyLedger);
    assert.equal(
      (
        await client.query("SELECT course_id FROM documents WHERE id=$1", [
          f.unlinkedId,
        ])
      ).rows[0].course_id,
      null,
    );
    const actions = (
      await client.query(
        "SELECT conname,confdeltype FROM pg_constraint WHERE conname=ANY($1::text[]) ORDER BY conname",
        [
          [
            "exams_course_id_fkey",
            "study_plans_course_id_fkey",
            "expenses_course_id_fkey",
            "documents_course_id_fkey",
          ],
        ],
      )
    ).rows;
    assert.deepEqual(actions, [
      { conname: "documents_course_id_fkey", confdeltype: "n" },
      { conname: "exams_course_id_fkey", confdeltype: "c" },
      { conname: "expenses_course_id_fkey", confdeltype: "n" },
      { conname: "study_plans_course_id_fkey", confdeltype: "c" },
    ]);
    await runPilotRollback(client, options);
    assert.equal((await ledger(client)).length, 11);
    const afterPilotRows = await rows(client, true);
    for (const table of [
      ...businessTables,
      "document_chunks",
      "ai_evaluations",
      "auth.users",
      "auth.sessions",
    ])
      assert.deepEqual(afterPilotRows[table], f.legacyRows[table]);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
  // Release the only held client before the migration runner opens its Pool.
  await migrate(f.url);
  const restored = await ledger(f.pool);
  const source = await loadMigrations();
  assert.equal(restored.length, source.length);
  assert.equal(restored.length, 14);
  for (const file of source)
    assert.equal(
      restored.find((entry) => entry.name === file.name)?.checksum,
      checksum(file),
    );
  const restoredRows = await rows(f.pool, true);
  for (const table of [
    ...businessTables,
    "document_chunks",
    "ai_evaluations",
    "auth.users",
    "auth.sessions",
  ])
    assert.deepEqual(restoredRows[table], f.legacyRows[table]);
  assert.deepEqual(
    restoredRows.workspaces.map(({ id }) => id),
    [f.workspaceId],
  );
  await migrate(f.url);
  assert.deepEqual(await ledger(f.pool), restored);
});

test("014 incorrect full confirmation refuses real SQL before any query", async (t) => {
  const run = await runtime();
  const { pool } = await fixture(t);
  const client = await pool.connect();
  try {
    const before = await state(client),
      wrapper = audited(client);
    await assert.rejects(
      run(wrapper, { ...options, confirmProject: "z9y8x7w6v5u4t3s2r1q0" }),
      privateError,
    );
    assert.equal(wrapper.commands.length, 0);
    assert.deepEqual(await state(client), before);
  } finally {
    client.release();
  }
});

for (const variant of ["missing", "checksum"]) {
  test(`014 refuses ${variant} ledger evidence with schema and rows unchanged`, async (t) => {
    const run = await runtime();
    const { pool } = await fixture(t);
    const client = await pool.connect();
    try {
      if (variant === "missing")
        await client.query("DELETE FROM schema_migrations WHERE name=$1", [
          migrationName,
        ]);
      else
        await client.query(
          "UPDATE schema_migrations SET checksum=$2 WHERE name=$1",
          [migrationName, "synthetic-corrupt"],
        );
      await refuses(client, run);
    } finally {
      client.release();
    }
  });
}

for (const known of [false, true]) {
  test(`014 refuses ${known ? "a valid known 015" : "an unknown 011"} ledger entry before DDL`, async (t) => {
    const run = await runtime();
    const { pool } = await fixture(t);
    const client = await pool.connect();
    try {
      const file = {
        name: known ? "015_phase6_fixture.sql" : "011_phase6_unknown.sql",
        sql: "SELECT 1;",
      };
      await client.query(
        "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
        [file.name, checksum(file)],
      );
      const config = known
        ? { loadSource: async () => [...(await loadMigrations()), file] }
        : undefined;
      await refuses(client, run, [], config);
    } finally {
      client.release();
    }
  });
}

for (const dependent of [
  "view",
  "manual index",
  "manual constraint",
  "external composite foreign key",
  "SQL atomic function",
]) {
  test(`014 guard refuses ${dependent} BEFORE DDL, including auto dependents that DROP COLUMN would silently delete`, async (t) => {
    const run = await runtime();
    const { pool } = await fixture(t);
    const client = await pool.connect();
    const name = `phase6_014_dependency_${randomUUID().replaceAll("-", "")}`;
    try {
      if (dependent === "view")
        await client.query(
          `CREATE VIEW public.${name} AS SELECT id,workspace_id FROM public.tasks`,
        );
      else if (dependent === "manual index")
        await client.query(
          `CREATE INDEX ${name} ON public.tasks(workspace_id)`,
        );
      else if (dependent === "manual constraint")
        await client.query(
          `ALTER TABLE public.tasks ADD CONSTRAINT ${name} CHECK (workspace_id IS NOT NULL)`,
        );
      else if (dependent === "SQL atomic function")
        await client.query(
          `CREATE FUNCTION public.${name}() RETURNS uuid LANGUAGE SQL BEGIN ATOMIC SELECT workspace_id FROM public.tasks LIMIT 1; END`,
        );
      else
        await client.query(
          `CREATE TABLE public.${name}(workspace_id UUID,course_id UUID,FOREIGN KEY(workspace_id,course_id) REFERENCES public.courses(workspace_id,id))`,
        );
      await refuses(client, run, [name]);
    } finally {
      client.release();
    }
  });
}

// Regression GREEN: these catalog checks existed before these cases were added.
// Mutate through supported DDL only; do not UPDATE PostgreSQL catalogs.
for (const { name, statements } of [
  {
    name: "workspace column loses NOT NULL",
    statements: [
      "ALTER TABLE public.tasks ALTER COLUMN workspace_id DROP NOT NULL",
    ],
  },
  {
    name: "composite foreign key becomes deferrable",
    statements: [
      "ALTER TABLE public.exams ALTER CONSTRAINT exams_workspace_course_fk DEFERRABLE",
    ],
  },
  {
    name: "expected workspace index name is reused for the wrong key",
    statements: [
      "DROP INDEX public.tasks_workspace_idx",
      "CREATE INDEX tasks_workspace_idx ON public.tasks(title)",
    ],
  },
  {
    name: "foreign key enforcement triggers are disabled",
    statements: ["ALTER TABLE public.tasks DISABLE TRIGGER ALL"],
  },
]) {
  test(`014 catalog drift regression: ${name} refuses BEFORE DDL with every row and schema object unchanged`, async (t) => {
    const run = await runtime();
    const { pool } = await fixture(t);
    const client = await pool.connect();
    try {
      for (const statement of statements) await client.query(statement);
      await refuses(
        client,
        run,
        [],
        undefined,
        /scope objects are missing or differ from the verified migration schema/i,
      );
    } finally {
      client.release();
    }
  });
}

test("014 refuses two post-migration workspaces before losing an existing row assignment", async (t) => {
  const run = await runtime();
  const { pool } = await fixture(t);
  const client = await pool.connect();
  const secondWorkspace = randomUUID();
  try {
    await client.query("INSERT INTO public.workspaces(id) VALUES($1)", [
      secondWorkspace,
    ]);
    await client.query(
      "UPDATE public.tasks SET workspace_id=$1 WHERE id=(SELECT id FROM public.tasks ORDER BY id LIMIT 1)",
      [secondWorkspace],
    );
    await refuses(client, run, [secondWorkspace]);
  } finally {
    client.release();
  }
});

test("014 ledger deletion failure after DDL restores the exact scoped schema and all rows atomically", async (t) => {
  const run = await runtime();
  const { pool } = await fixture(t);
  const client = await pool.connect();
  try {
    const before = await state(client),
      wrapper = audited(client, { failDelete: true });
    await assert.rejects(run(wrapper, options), privateError);
    assert.ok(wrapper.commands.some((sql) => /\bALTER\s+TABLE\b/i.test(sql)));
    assert.equal(wrapper.commands.at(-1).trim().toUpperCase(), "ROLLBACK");
    assert.ok(!wrapper.commands.some((sql) => /^\s*COMMIT\b/i.test(sql)));
    assert.deepEqual(await state(client), before);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("014 lost acknowledgement AFTER real COMMIT reports outcome unknown without private database details", async (t) => {
  const run = await runtime();
  const f = await fixture(t);
  const client = await f.pool.connect();
  try {
    const wrapper = audited(client, { loseCommit: true });
    await assert.rejects(run(wrapper, options), (error) => {
      privateError(error);
      assert.match(error.message, /outcome (?:may be )?unknown/i);
      return true;
    });
    assert.ok(wrapper.commands.some((sql) => /^\s*COMMIT\b/i.test(sql)));
    assert.deepEqual(await schema(client), f.legacySchema);
    assert.deepEqual(await rows(client, true), f.legacyRows);
    assert.deepEqual(await ledger(client), f.legacyLedger);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
