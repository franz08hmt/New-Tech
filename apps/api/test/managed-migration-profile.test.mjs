import assert from "node:assert/strict";
import test from "node:test";
import {
  loadMigrations,
  migrationChecksum,
  validateMigrationLedger,
  migrate,
} from "../scripts/migrate.mjs";

test("managed profile is explicit, immutable-history preserving and honestly checksummed", async () => {
  const canonical = await loadMigrations();
  const managed = await loadMigrations(undefined, {
    profile: "supabase-managed",
  });
  assert.equal(managed.length, canonical.length + 1);
  assert.equal(managed.at(-1).name, "026_managed_platform_connect.sql");
  for (let i = 0; i < canonical.length; i++) {
    if ([16, 24].includes(i)) {
      assert.notEqual(managed[i].name, canonical[i].name);
      assert.notEqual(
        migrationChecksum(managed[i]),
        migrationChecksum(canonical[i]),
      );
      assert.match(managed[i].path, /managed-migrations/);
      assert.doesNotMatch(
        managed[i].sql,
        /(?:GRANT|REVOKE|ALTER)\s[^;]*\b(?:SCHEMA auth|auth\.sessions)/i,
      );
    } else assert.deepEqual(managed[i], canonical[i]);
  }
  const ledger = managed
    .slice(0, 16)
    .map((f) => ({ name: f.name, checksum: migrationChecksum(f) }));
  assert.doesNotThrow(() => validateMigrationLedger(ledger, managed));
  assert.throws(
    () =>
      validateMigrationLedger(
        [
          ...ledger,
          {
            name: canonical[16].name,
            checksum: migrationChecksum(canonical[16]),
          },
        ],
        managed,
      ),
    /history|profile/i,
  );
  assert.throws(
    () =>
      validateMigrationLedger(
        [{ name: "unknown.sql", checksum: "0" }],
        managed,
      ),
    /history|profile/i,
  );
  assert.throws(
    () =>
      validateMigrationLedger(
        [{ name: managed[0].name, checksum: "0" }],
        managed,
      ),
    /checksum/i,
  );
  assert.throws(
    () => validateMigrationLedger([ledger[1]], managed),
    /history|prefix/i,
  );
  await assert.rejects(
    loadMigrations(undefined, { profile: "wrong" }),
    /profile/i,
  );
});

test("migration options fail closed before reading source or opening a connection", async () => {
  const loadSource = () => {
    throw Error("source must not be read");
  };
  await assert.rejects(
    migrate("postgresql://127.0.0.1/options_test", {
      loadSource,
      profile: "unknown",
    }),
    /profile/i,
  );
  await assert.rejects(
    migrate("postgresql://127.0.0.1/options_test", {
      loadSource,
      beforeCommit: () => {},
    }),
    /beforeCommit.*managed/i,
  );
});
