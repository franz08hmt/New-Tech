import { randomUUID } from "node:crypto";
export function authFixture() {
  const userId = randomUUID(),
    sessionId = randomUUID(),
    workspaceId = randomUUID();
  const rows = new Map();
  const state = {
    verifyCalls: 0,
    loginCalls: 0,
    logoutCalls: 0,
    dbFail: false,
    authFail: false,
    member: true,
    sessionActive: true,
    refreshCalls: 0,
    refreshFail: false,
    commitFail: false,
  };
  const config = {
    origin: "http://localhost:5173",
    url: "https://fixture.supabase.test",
    apiKey: "synthetic-fixture-key",
    workspaceId,
    encryptionKey: Buffer.alloc(32, 7),
    keyVersion: "v1",
    secure: false,
    cacheMs: 0,
    timeoutMs: 5000,
    sessionVerification: "database",
    loginLimits: {
      email: 5,
      ip: 20,
      global: 100,
      bootstrap: 60,
      windowSeconds: 900,
    },
  };
  const attempts = new Set(),
    counters = new Map();
  let lock = Promise.resolve();
  const store = {
    async admission(keys, windowSeconds) {
      if (state.dbFail) throw Error("sensitive-database-string");
      const window = Math.floor(Date.now() / 1000 / windowSeconds);
      if (
        keys.some(
          ({ key, limit }) => (counters.get(key + ":" + window) ?? 0) >= limit,
        )
      )
        return {
          allowed: false,
          resetAt: new Date((window + 1) * windowSeconds * 1000).toISOString(),
        };
      for (const { key } of keys)
        counters.set(
          key + ":" + window,
          (counters.get(key + ":" + window) ?? 0) + 1,
        );
      return { allowed: true };
    },
    async markRefreshStarted(hash, version) {
      const key = hash + ":" + version;
      if (attempts.has(key)) return false;
      attempts.add(key);
      return true;
    },
    async lockedSession(hash, work) {
      const previous = lock;
      let release;
      lock = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
      const row = rows.get(hash),
        before = row ? { ...row } : undefined;
      const tx = {
        query: async (sql, params) => {
          if (state.dbFail) throw Error("sensitive-database-string");
          if (sql.startsWith("SELECT id FROM auth.sessions"))
            return { rows: state.sessionActive ? [{ id: sessionId }] : [] };
          if (sql.includes("SET revoked_at")) row.revoked_at = new Date();
          else if (sql.includes("SET tokens=")) {
            row.tokens = JSON.parse(params[1]);
            row.version++;
          }
          return { rows: [] };
        },
      };
      try {
        const result = await work(row, tx);
        if (state.commitFail) throw Error("sensitive-commit-failure");
        return result;
      } catch (error) {
        if (before) Object.assign(row, before);
        throw error;
      } finally {
        release();
      }
    },
    async find(hash) {
      if (state.dbFail) throw Error("sensitive-database-string");
      return rows.get(hash);
    },
    async create(row) {
      if (state.dbFail) throw Error("sensitive-database-string");
      rows.set(row.cookie_hash, row);
    },
    async replacePreSession(hash, row) {
      if (state.dbFail) throw Error("sensitive-database-string");
      if (rows.get(hash)?.revoked_at) throw Error("PRESESSION_CONSUMED");
      rows.get(hash).revoked_at = new Date();
      rows.set(row.cookie_hash, row);
    },
    async membership() {
      if (state.dbFail) throw Error("sensitive-database-string");
      return state.member ? "member" : undefined;
    },
    async authSessionActive() {
      if (state.dbFail) throw Error("sensitive-database-string");
      return state.sessionActive;
    },
    async revoke(hash) {
      if (state.dbFail) throw Error("sensitive-database-string");
      rows.get(hash).revoked_at = new Date();
    },
    async touch() {
      if (state.dbFail) throw Error("sensitive-database-string");
    },
  };
  const adapter = {
    async refresh() {
      state.refreshCalls++;
      if (state.refreshFail) throw Error("sensitive-refresh-token");
      await new Promise((r) => setTimeout(r, 10));
      return {
        accessToken: "synthetic-rotated-access",
        refreshToken: "synthetic-rotated-refresh",
        expiresAt: Date.now() + 3600000,
      };
    },
    async login() {
      state.loginCalls++;
      if (state.authFail) throw Error("sensitive-auth-token");
      return {
        accessToken: "synthetic-access-token",
        refreshToken: "synthetic-refresh-token",
        expiresAt: Date.now() + 3600_000,
      };
    },
    async verify() {
      state.verifyCalls++;
      if (state.authFail) throw Error("sensitive-auth-token");
      return { userId, sessionId, expiresAt: Date.now() + 3600_000 };
    },
    async logout() {
      state.logoutCalls++;
      if (state.authFail) throw Error("sensitive-auth-token");
    },
  };
  return {
    config,
    store,
    adapter,
    state,
    rows,
    userId,
    sessionId,
    attempts,
    counters,
  };
}
