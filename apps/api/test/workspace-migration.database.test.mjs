import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { migrate as migrateAll, loadMigrations } from "../scripts/migrate.mjs";
async function migrate(url, options = {}) {
  return migrateAll(url, {
    loadSource: async () =>
      (await loadMigrations()).filter((f) => Number(f.name.slice(0, 3)) <= 14),
    ...options,
  });
}
import { assertTestDatabaseTarget } from "../scripts/test-database-target.mjs";
import { prepareAuthFixture } from "./disposable-auth-fixture.mjs";
import { runPilotRollback } from "../scripts/pilot-rollback-012-013.mjs";

// Guard before any connection or mutation; never load environment files.
const parentUrl = assertTestDatabaseTarget(process.env.TEST_DATABASE_URL);
const businessTables = [
  "tasks",
  "courses",
  "exams",
  "study_plans",
  "expenses",
  "documents",
  "assistant_feedback",
];
const courseTables = ["exams", "study_plans", "expenses", "documents"];
const migrationName = "014_workspace_scope.sql";
const environmentNames = [
  "DATABASE_SSL",
  "DATABASE_CA_CERT_PATH",
  "PILOT_WORKSPACE_ID",
];

async function legacySource() {
  const files = (await loadMigrations()).filter(
    (file) => Number(file.name.slice(0, 3)) <= 13,
  );
  assert.equal(
    files.length,
    13,
    "fixture must use the complete migration 001–013 history",
  );
  return files;
}

async function ownedDatabase(pool, name) {
  const { rows } = await pool.query(
    "SELECT pg_get_userbyid(datdba)=current_user AS owned FROM pg_database WHERE datname=$1",
    [name],
  );
  assert.equal(
    rows[0]?.owned,
    true,
    "test role must own the exact database target",
  );
}

async function scenario(t, { legacy = true, pilot } = {}) {
  const saved = Object.fromEntries(
    environmentNames.map((name) => [name, process.env[name]]),
  );
  process.env.DATABASE_SSL = "false";
  process.env.DATABASE_CA_CERT_PATH = "";
  if (pilot === undefined) delete process.env.PILOT_WORKSPACE_ID;
  else process.env.PILOT_WORKSPACE_ID = pilot;
  // Identifier comes solely from a random UUID, then passes the same URL guard.
  const databaseName = `examate_b2_${randomUUID().replaceAll("-", "")}_test`;
  const target = new URL(parentUrl);
  target.pathname = `/${databaseName}`;
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
        await ownedDatabase(parent, databaseName);
        await parent.query(`DROP DATABASE "${databaseName}"`);
      }
    } finally {
      await parent.end();
      for (const name of environmentNames) {
        if (saved[name] === undefined) delete process.env[name];
        else process.env[name] = saved[name];
      }
    }
  });
  await ownedDatabase(
    parent,
    decodeURIComponent(new URL(parentUrl).pathname.slice(1)),
  );
  await parent.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  pool = new pg.Pool({ connectionString: url, ssl: false, max: 1 });
  await ownedDatabase(pool, databaseName);
  await prepareAuthFixture(pool);
  if (legacy) {
    await migrate(url, { loadSource: legacySource });
    assert.equal((await ledger(pool)).length, 13);
  }
  return { pool, url };
}

async function ledger(pool) {
  return (
    await pool.query(
      "SELECT name,checksum,applied_at FROM public.schema_migrations ORDER BY name",
    )
  ).rows;
}

async function businessRows(pool, { omitWorkspace = false } = {}) {
  const result = {};
  for (const table of [...businessTables, "document_chunks"]) {
    result[table] = (
      await pool.query(
        `SELECT ${omitWorkspace ? "to_jsonb(row)-'workspace_id'" : "to_jsonb(row)"} AS data FROM public.${table} row ORDER BY id`,
      )
    ).rows.map(({ data }) => data);
  }
  return result;
}

async function unchangedState(pool) {
  return {
    rows: await businessRows(pool),
    workspaces: (await pool.query("SELECT * FROM workspaces ORDER BY id")).rows,
    ledger: await ledger(pool),
    columns: (
      await pool.query(
        "SELECT table_name,column_name,is_nullable,data_type,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position",
      )
    ).rows,
    constraints: (
      await pool.query(
        "SELECT c.relname,con.conname,pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,con.conname",
      )
    ).rows,
    indexes: (
      await pool.query(
        "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname",
      )
    ).rows,
  };
}

async function seedStoredRows(pool) {
  const courseId = (
    await pool.query("SELECT id FROM courses ORDER BY slug LIMIT 1")
  ).rows[0].id;
  const linked = randomUUID(),
    unlinked = randomUUID(),
    chunk = randomUUID(),
    feedback = randomUUID();
  await pool.query(
    "INSERT INTO documents(id,name,media_type,storage_key,size_bytes,course_id) VALUES($1,'Linked fixture.pdf','application/pdf',$2,9,$3),($4,'Unassigned fixture.pdf','application/pdf',$5,9,NULL)",
    [
      linked,
      `fixture/${linked}.pdf`,
      courseId,
      unlinked,
      `fixture/${unlinked}.pdf`,
    ],
  );
  await pool.query(
    "INSERT INTO document_chunks(id,document_id,chunk_index,content,source_page) VALUES($1,$2,0,'Preserved document fixture content',1)",
    [chunk, linked],
  );
  await pool.query(
    "INSERT INTO assistant_feedback(id,answer_id,submission_id,rating,snapshot,payload_hash) VALUES($1,$2,$3,'helpful',$4,$5)",
    [
      feedback,
      randomUUID(),
      randomUUID(),
      JSON.stringify({
        schemaVersion: 1,
        request: {
          question: "Fixture question",
          mode: "general",
          operation: "question",
        },
        response: {
          answer: "Fixture answer",
          mode: "general",
          answerable: true,
          citations: [],
        },
      }),
      "a".repeat(64),
    ],
  );
  return { linked, unlinked, chunk, feedback };
}

async function clearBusinessRows(pool) {
  // This database was created by this scenario; no shared database is reset.
  for (const table of [
    "document_chunks",
    "documents",
    "assistant_feedback",
    "expenses",
    "study_plans",
    "exams",
    "tasks",
    "courses",
  ])
    await pool.query(`DELETE FROM public.${table}`);
}

async function assertScoped(pool, workspaceId) {
  for (const table of businessTables) {
    assert.equal(
      (
        await pool.query(
          `SELECT count(*)::integer AS count FROM public.${table} WHERE workspace_id IS DISTINCT FROM $1::uuid`,
          [workspaceId],
        )
      ).rows[0].count,
      0,
      table,
    );
  }
}

async function migrationRejectedWithoutChanges(pool, url) {
  const before = await unchangedState(pool);
  await assert.rejects(migrate(url), { code: "P0001" });
  assert.deepEqual(await unchangedState(pool), before);
  assert.equal(
    (await ledger(pool)).some(({ name }) => name === migrationName),
    false,
  );
}

test("014 migrates an empty legacy business database without a pilot setting or workspace", async (t) => {
  const { pool, url } = await scenario(t);
  await clearBusinessRows(pool);
  await migrate(url);
  const columns = (
    await pool.query(
      "SELECT table_name,is_nullable,data_type FROM information_schema.columns WHERE table_schema='public' AND column_name='workspace_id' AND table_name=ANY($1::text[]) ORDER BY table_name",
      [businessTables],
    )
  ).rows;
  assert.equal(columns.length, 7);
  for (const column of columns) {
    assert.equal(column.is_nullable, "NO", column.table_name);
    assert.equal(column.data_type, "uuid", column.table_name);
  }
  assert.equal(
    (await pool.query("SELECT count(*)::integer AS count FROM workspaces"))
      .rows[0].count,
    0,
  );
  assert.equal((await ledger(pool)).length, 14);
});

test("014 creates the configured pilot workspace and preserves every legacy row and nullable course link", async (t) => {
  const pilot = randomUUID();
  const { pool, url } = await scenario(t, { pilot });
  const fixture = await seedStoredRows(pool);
  const before = await businessRows(pool, { omitWorkspace: true });
  assert.ok(businessTables.every((table) => before[table].length > 0));
  await migrate(url);
  assert.deepEqual(await businessRows(pool, { omitWorkspace: true }), before);
  await assertScoped(pool, pilot);
  assert.deepEqual(
    (await pool.query("SELECT id,active FROM workspaces")).rows,
    [{ id: pilot, active: true }],
  );
  assert.equal(
    (
      await pool.query("SELECT course_id FROM documents WHERE id=$1", [
        fixture.unlinked,
      ])
    ).rows[0].course_id,
    null,
  );
  const firstLedger = await ledger(pool);
  await migrate(url);
  assert.deepEqual(await ledger(pool), firstLedger);
  assert.equal(firstLedger.length, 14);
  for (const file of (await loadMigrations()).filter(
    (f) => Number(f.name.slice(0, 3)) <= 14,
  ))
    assert.equal(
      firstLedger.find(({ name }) => name === file.name)?.checksum,
      createHash("sha256")
        .update(file.sql.replace(/\r\n/g, "\n"))
        .digest("hex"),
    );
});

test("applied real 014 blocks rollback 012/013 without changing data or schema", async (t) => {
  const pilot = randomUUID();
  const { pool, url } = await scenario(t, { pilot });
  await migrate(url);
  const before = await unchangedState(pool);
  const client = await pool.connect();
  try {
    await assert.rejects(
      runPilotRollback(client, {
        apply: true,
        projectRef: "a1b2c3d4e5f6g7h8i9j0",
        confirmProject: "a1b2c3d4e5f6g7h8i9j0",
      }),
      /later or unknown migration/,
    );
    // The fixture pool has one slot, held by this client until finally. Reuse
    // it rather than waiting forever for a second pool connection.
    assert.deepEqual(await unchangedState(client), before);
  } finally {
    client.release();
  }
});

test("fresh seeded migrations receive the valid pilot setting through the production runner default", async (t) => {
  const pilot = randomUUID();
  const { pool, url } = await scenario(t, { legacy: false, pilot });
  await migrate(url);
  assert.equal((await ledger(pool)).length, 14);
  assert.ok(
    (await pool.query("SELECT count(*)::integer AS count FROM tasks")).rows[0]
      .count > 0,
  );
  await assertScoped(pool, pilot);
  assert.deepEqual((await pool.query("SELECT id FROM workspaces")).rows, [
    { id: pilot },
  ]);
});

test("014 rejects populated legacy tables with no workspace or pilot setting and rolls back all changes", async (t) => {
  const { pool, url } = await scenario(t);
  await seedStoredRows(pool);
  await migrationRejectedWithoutChanges(pool, url);
});

for (const table of [
  "tasks",
  "courses",
  "expenses",
  "documents",
  "assistant_feedback",
]) {
  test(`014 detects business data when only ${table} contains rows`, async (t) => {
    const { pool, url } = await scenario(t);
    await seedStoredRows(pool);
    const existing = (await businessRows(pool))[table];
    const row = existing.find((item) => !item.course_id);
    assert.ok(row, `independent ${table} fixture row exists`);
    await clearBusinessRows(pool);
    await pool.query(
      `INSERT INTO public.${table} SELECT (json_populate_record(NULL::public.${table}, $1::json)).*`,
      [JSON.stringify(row)],
    );
    await migrationRejectedWithoutChanges(pool, url);
  });
}

for (const invalid of [
  "not-a-uuid",
  "",
  "   ",
  "11111111-1111-1111-1111-111111111111; SELECT 1",
]) {
  test(`invalid pilot setting ${JSON.stringify(invalid)} is omitted by the runner and fails populated backfill safely`, async (t) => {
    const { pool, url } = await scenario(t, { pilot: invalid });
    await migrationRejectedWithoutChanges(pool, url);
  });
}

for (const matching of [false, true]) {
  test(`014 uses the sole existing workspace with ${matching ? "a matching" : "no"} pilot setting and creates no extra workspace`, async (t) => {
    const pilot = randomUUID();
    const { pool, url } = await scenario(t, {
      pilot: matching ? pilot : undefined,
    });
    await pool.query("INSERT INTO workspaces(id) VALUES($1)", [pilot]);
    const before = await businessRows(pool, { omitWorkspace: true });
    await migrate(url);
    assert.deepEqual(await businessRows(pool, { omitWorkspace: true }), before);
    await assertScoped(pool, pilot);
    assert.deepEqual((await pool.query("SELECT id FROM workspaces")).rows, [
      { id: pilot },
    ]);
  });
}

test("014 rejects a pilot setting different from the sole workspace without changing data or schema", async (t) => {
  const { pool, url } = await scenario(t, { pilot: randomUUID() });
  await pool.query("INSERT INTO workspaces(id) VALUES($1)", [randomUUID()]);
  await migrationRejectedWithoutChanges(pool, url);
});

test("014 rejects populated databases with two workspaces even when the pilot setting matches one", async (t) => {
  const pilot = randomUUID();
  const { pool, url } = await scenario(t, { pilot });
  await pool.query("INSERT INTO workspaces(id) VALUES($1),($2)", [
    pilot,
    randomUUID(),
  ]);
  await migrationRejectedWithoutChanges(pool, url);
});

test("014 enforces indexed NOT NULL workspace foreign keys with RESTRICT on all seven business tables", async (t) => {
  const pilot = randomUUID();
  const { pool, url } = await scenario(t, { pilot });
  await seedStoredRows(pool);
  await migrate(url);
  for (const table of businessTables) {
    const column = (
      await pool.query(
        "SELECT attnum,attnotnull FROM pg_attribute WHERE attrelid=$1::regclass AND attname='workspace_id'",
        [`public.${table}`],
      )
    ).rows[0];
    assert.ok(column, `${table}.workspace_id exists`);
    assert.equal(column.attnotnull, true, table);
    const workspaceFks = (
      await pool.query(
        "SELECT confdeltype FROM pg_constraint WHERE contype='f' AND conrelid=$1::regclass AND confrelid='public.workspaces'::regclass AND conkey=ARRAY[$2::smallint]",
        [`public.${table}`, column.attnum],
      )
    ).rows;
    assert.deepEqual(workspaceFks, [{ confdeltype: "r" }], table);
    assert.ok(
      (
        await pool.query(
          "SELECT 1 FROM pg_index WHERE indrelid=$1::regclass AND indisvalid AND indpred IS NULL AND indkey[0]=$2::smallint",
          [`public.${table}`, column.attnum],
        )
      ).rows.length > 0,
      `${table} has an index beginning with workspace_id`,
    );
    await assert.rejects(
      pool.query(
        `UPDATE public.${table} SET workspace_id=NULL WHERE id=(SELECT id FROM public.${table} LIMIT 1)`,
      ),
      { code: "23502" },
    );
    await assert.rejects(
      pool.query(
        `UPDATE public.${table} SET workspace_id=$1 WHERE id=(SELECT id FROM public.${table} LIMIT 1)`,
        [randomUUID()],
      ),
      { code: "23503" },
    );
  }
  await assert.rejects(
    pool.query("DELETE FROM workspaces WHERE id=$1", [pilot]),
    { code: "23503" },
  );
});

async function createCourse(pool, workspaceId, suffix) {
  return (
    await pool.query(
      `INSERT INTO courses(workspace_id,slug,name,code,detail,tone,cover,cover_alt)
     VALUES($1,$2,'Fixture course',$3,'Fixture course description','slate','/img/fixture.webp','Fixture course image') RETURNING id`,
      [workspaceId, `fixture-${suffix}`, `FIX ${suffix}`],
    )
  ).rows[0].id;
}

test("014 rejects cross-workspace course references in exams, study plans, expenses and documents", async (t) => {
  const pilot = randomUUID(),
    other = randomUUID();
  const { pool, url } = await scenario(t, { pilot });
  await seedStoredRows(pool);
  await migrate(url);
  await pool.query("INSERT INTO workspaces(id) VALUES($1)", [other]);
  const foreignCourse = await createCourse(pool, other, "other");
  const before = await businessRows(pool);
  for (const table of courseTables) {
    const fks = (
      await pool.query(
        `SELECT con.confdeltype,
         ARRAY(SELECT attname::text FROM unnest(con.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.num ORDER BY ord) AS local_columns,
         ARRAY(SELECT attname::text FROM unnest(con.confkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=con.confrelid AND a.attnum=k.num ORDER BY ord) AS foreign_columns
       FROM pg_constraint con WHERE contype='f' AND conrelid=$1::regclass AND confrelid='public.courses'::regclass`,
        [`public.${table}`],
      )
    ).rows;
    assert.ok(
      fks.some(
        (fk) =>
          fk.local_columns.join(",") === "workspace_id,course_id" &&
          fk.foreign_columns.join(",") === "workspace_id,id" &&
          fk.confdeltype === "r",
      ),
      table,
    );
    const nullable = (
      await pool.query(
        "SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='course_id'",
        [table],
      )
    ).rows[0].is_nullable;
    assert.equal(
      nullable,
      ["expenses", "documents"].includes(table) ? "YES" : "NO",
      table,
    );
    await assert.rejects(
      pool.query(
        `UPDATE public.${table} SET course_id=$1 WHERE id=(SELECT id FROM public.${table} LIMIT 1)`,
        [foreignCourse],
      ),
      { code: "23503" },
    );
  }
  assert.deepEqual(await businessRows(pool), before);
});

for (const relation of ["exams", "study_plans"]) {
  test(`014 changes course deletion from CASCADE to RESTRICT for ${relation}`, async (t) => {
    const pilot = randomUUID();
    const { pool, url } = await scenario(t, { pilot });
    await migrate(url);
    const course = await createCourse(
      pool,
      pilot,
      relation === "exams" ? "exam" : "plan",
    );
    const id = randomUUID();
    if (relation === "exams")
      await pool.query(
        "INSERT INTO exams(id,workspace_id,course_id,topic,exam_date,exam_time,room) VALUES($1,$2,$3,'Fixture exam','2028-02-29','09:00','Fixture room')",
        [id, pilot, course],
      );
    else
      await pool.query(
        "INSERT INTO study_plans(id,workspace_id,course_id,title) VALUES($1,$2,$3,'Fixture study plan')",
        [id, pilot, course],
      );
    await assert.rejects(
      pool.query("DELETE FROM courses WHERE id=$1", [course]),
      { code: "23503" },
    );
    assert.equal(
      (await pool.query(`SELECT course_id FROM ${relation} WHERE id=$1`, [id]))
        .rows[0].course_id,
      course,
    );
  });
}

test("014 preserves the document chunk cascade when a scoped document is deleted", async (t) => {
  const { pool, url } = await scenario(t, { pilot: randomUUID() });
  const fixture = await seedStoredRows(pool);
  await migrate(url);
  assert.equal(
    (
      await pool.query("SELECT id FROM document_chunks WHERE id=$1", [
        fixture.chunk,
      ])
    ).rows.length,
    1,
  );
  await pool.query("DELETE FROM documents WHERE id=$1", [fixture.linked]);
  assert.equal(
    (
      await pool.query("SELECT id FROM document_chunks WHERE id=$1", [
        fixture.chunk,
      ])
    ).rows.length,
    0,
  );
  assert.equal(
    (
      await pool.query("SELECT id FROM documents WHERE id=$1", [
        fixture.unlinked,
      ])
    ).rows.length,
    1,
  );
  assert.equal(
    (
      await pool.query("SELECT id FROM assistant_feedback WHERE id=$1", [
        fixture.feedback,
      ])
    ).rows.length,
    1,
  );
});
