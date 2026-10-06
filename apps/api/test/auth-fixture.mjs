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
  };
  const store = {
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
  return { config, store, adapter, state, rows, userId, sessionId };
}
