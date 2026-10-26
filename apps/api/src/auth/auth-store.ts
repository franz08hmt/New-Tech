import { Injectable } from "@nestjs/common";
import { AuthDatabaseService } from "../database/auth-database.service.js";
import type { EncryptedTokens } from "./session-crypto.js";
import type { PilotRole } from "@examate/contracts";
import type { DatabaseTransaction } from "../database/database.service.js";
export const AUTH_SESSION_ACTIVE_SQL =
  "SELECT $1::uuid AS id WHERE examate_private.auth_session_active($1::uuid,$2::uuid)";
export class AuthLimitReached extends Error {
  constructor(readonly resetAt: string) {
    super("AUTH_LIMIT_REACHED");
  }
}
export interface SessionRow {
  cookie_hash: string;
  kind: "prelogin" | "authenticated";
  user_id: string | null;
  auth_session_id: string | null;
  csrf_token: string;
  tokens: EncryptedTokens | null;
  expires_at: Date;
  idle_expires_at: Date;
  revoked_at: Date | null;
  version: number;
}
@Injectable()
export class AuthStore {
  // Whether migration 027's sign-in functions exist; rechecked every minute so
  // applying the migration needs no restart, and an older database costs nothing.
  private membersInstalled: { value: boolean; until: number } | undefined;
  constructor(private readonly db: AuthDatabaseService) {}
  private async membersReady(tx: DatabaseTransaction) {
    const now = Date.now();
    if (this.membersInstalled && this.membersInstalled.until > now)
      return this.membersInstalled.value;
    const value =
      (
        await tx.query<{ ok: boolean }>(
          "SELECT to_regprocedure('examate_private.record_member_profile(uuid,uuid,text,text)') IS NOT NULL AS ok",
        )
      ).rows[0]?.ok === true;
    this.membersInstalled = { value, until: now + 60_000 };
    return value;
  }
  async markRefreshStarted(hash: string, version: number) {
    // Independent autocommit BEFORE provider dispatch, while the parent holds FOR UPDATE.
    const result = await this.db.query(
      "INSERT INTO pilot_refresh_attempts (cookie_hash,version) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [hash, version],
    );
    return result.rowCount === 1;
  }
  async admission(
    keys: Array<{ key: string; limit: number }>,
    windowSeconds: number,
  ) {
    try {
      await this.db.transaction(async (tx) => {
        for (const entry of [...keys].sort((a, b) =>
          a.key.localeCompare(b.key),
        )) {
          const result = await tx.query(
            `WITH bucket AS (SELECT to_timestamp(floor(extract(epoch FROM NOW())/$3::int)*$3::int) AS start)
       INSERT INTO pilot_auth_limits (key,window_started,hits) SELECT $1,start,1 FROM bucket
       ON CONFLICT (key,window_started) DO UPDATE SET hits=pilot_auth_limits.hits+1
       WHERE pilot_auth_limits.hits<$2 RETURNING key`,
            [entry.key, entry.limit, windowSeconds],
          );
          if (!result.rows.length) {
            const reset = await tx.query<{ reset_at: Date }>(
              "SELECT to_timestamp((floor(extract(epoch FROM NOW())/$1::int)+1)*$1::int) AS reset_at",
              [windowSeconds],
            );
            throw new AuthLimitReached(reset.rows[0].reset_at.toISOString());
          }
        }
      });
      return { allowed: true as const };
    } catch (error) {
      if (error instanceof AuthLimitReached)
        return { allowed: false as const, resetAt: error.resetAt };
      throw error;
    }
  }
  async lockedSession<T>(
    hash: string,
    work: (row: SessionRow | undefined, tx: DatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (tx) => {
      const result = await tx.query<SessionRow>(
        "SELECT * FROM pilot_sessions WHERE cookie_hash=$1 FOR UPDATE",
        [hash],
      );
      return work(result.rows[0], tx);
    });
  }
  async find(hash: string): Promise<SessionRow | undefined> {
    return (
      await this.db.query<SessionRow>(
        "SELECT * FROM pilot_sessions WHERE cookie_hash=$1",
        [hash],
      )
    ).rows[0];
  }
  async create(row: SessionRow) {
    await this.db.query(
      "INSERT INTO pilot_sessions (cookie_hash,kind,user_id,auth_session_id,csrf_token,tokens,expires_at,idle_expires_at,version) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)",
      [
        row.cookie_hash,
        row.kind,
        row.user_id,
        row.auth_session_id,
        row.csrf_token,
        row.tokens ? JSON.stringify(row.tokens) : null,
        row.expires_at,
        row.idle_expires_at,
        row.version,
      ],
    );
  }
  async startOAuth(
    pre: string,
    attempt: {
      id: string;
      origin: string;
      verifier: EncryptedTokens;
      expiresAt: Date;
    },
  ) {
    return this.db.transaction(async (tx) => {
      // Serialize bounded admission/cleanup; this lock never spans a network call.
      await tx.query("SELECT pg_advisory_xact_lock(424205)");
      const p = await tx.query(
        "SELECT cookie_hash FROM pilot_sessions WHERE cookie_hash=$1 AND kind='prelogin' AND revoked_at IS NULL AND expires_at>NOW() AND idle_expires_at>NOW() FOR UPDATE",
        [pre],
      );
      if (!p.rowCount) throw Error("OAUTH_ATTEMPT_INVALID");
      await tx.query(
        "DELETE FROM pilot_oauth_attempts WHERE prelogin_hash IN (SELECT prelogin_hash FROM pilot_oauth_attempts WHERE expires_at<=NOW() LIMIT 1000)",
      );
      const count = await tx.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM pilot_oauth_attempts",
      );
      if (count.rows[0].count >= 10000) throw Error("OAUTH_CAPACITY");
      const inserted = await tx.query(
        `INSERT INTO pilot_oauth_attempts(prelogin_hash,attempt_hash,provider,origin,verifier,expires_at)
        SELECT $1,$2,'google',$3,$4::jsonb,LEAST($5::timestamptz,clock_timestamp()+INTERVAL '5 minutes')
        FROM pilot_sessions p WHERE p.cookie_hash=$1 AND p.kind='prelogin' AND p.revoked_at IS NULL
          AND p.expires_at>clock_timestamp() AND p.idle_expires_at>clock_timestamp()
        ON CONFLICT(prelogin_hash) DO UPDATE SET attempt_hash=EXCLUDED.attempt_hash,origin=EXCLUDED.origin,verifier=EXCLUDED.verifier,expires_at=EXCLUDED.expires_at,claimed_at=NULL
        RETURNING attempt_hash`,
        [
          pre,
          attempt.id,
          attempt.origin,
          JSON.stringify(attempt.verifier),
          attempt.expiresAt,
        ],
      );
      if (!inserted.rowCount) throw Error("OAUTH_ATTEMPT_INVALID");
    });
  }
  async claimOAuth(pre: string, id: string, origin: string) {
    return this.db.transaction(async (tx) => {
      const p = await tx.query(
        "SELECT cookie_hash FROM pilot_sessions WHERE cookie_hash=$1 AND kind='prelogin' AND revoked_at IS NULL AND expires_at>NOW() AND idle_expires_at>NOW() FOR UPDATE",
        [pre],
      );
      if (!p.rowCount) return undefined;
      const a = await tx.query<{ verifier: EncryptedTokens }>(
        "SELECT verifier FROM pilot_oauth_attempts WHERE prelogin_hash=$1 AND attempt_hash=$2 AND provider='google' AND origin=$3 AND claimed_at IS NULL AND expires_at>NOW() FOR UPDATE",
        [pre, id, origin],
      );
      if (!a.rowCount) return undefined;
      // NOW() is fixed at BEGIN. A lock wait must not extend the attempt or
      // prelogin lifetime. Recheck wall time after both rows have been locked.
      const claimed = await tx.query(
        "UPDATE pilot_oauth_attempts SET claimed_at=clock_timestamp(),verifier=NULL WHERE prelogin_hash=$1 AND attempt_hash=$2 AND expires_at>clock_timestamp() AND EXISTS(SELECT 1 FROM pilot_sessions p WHERE p.cookie_hash=$1 AND p.kind='prelogin' AND p.revoked_at IS NULL AND p.expires_at>clock_timestamp() AND p.idle_expires_at>clock_timestamp()) RETURNING attempt_hash",
        [pre, id],
      );
      if (!claimed.rowCount) return undefined;
      return a.rows[0].verifier;
    });
  }
  async replacePreSession(
    oldHash: string,
    row: SessionRow,
    oauthAttempt?: string,
  ) {
    await this.db.transaction(async (tx) => {
      const old = await tx.query(
        "SELECT cookie_hash FROM pilot_sessions WHERE cookie_hash=$1 AND kind='prelogin' AND revoked_at IS NULL AND expires_at>NOW() FOR UPDATE",
        [oldHash],
      );
      if (!old.rows.length) throw new Error("PRESESSION_CONSUMED");
      if (oauthAttempt) {
        const attempt = await tx.query(
          "SELECT attempt_hash FROM pilot_oauth_attempts WHERE prelogin_hash=$1 AND attempt_hash=$2 AND claimed_at IS NOT NULL AND expires_at>clock_timestamp() AND EXISTS(SELECT 1 FROM pilot_sessions p WHERE p.cookie_hash=$1 AND p.kind='prelogin' AND p.revoked_at IS NULL AND p.expires_at>clock_timestamp() AND p.idle_expires_at>clock_timestamp()) FOR UPDATE",
          [oldHash, oauthAttempt],
        );
        if (!attempt.rowCount) throw Error("OAUTH_ATTEMPT_INVALID");
      }
      await tx.query(
        "UPDATE pilot_sessions SET revoked_at=NOW() WHERE cookie_hash=$1",
        [oldHash],
      );
      await tx.query(
        "INSERT INTO pilot_sessions (cookie_hash,kind,user_id,auth_session_id,csrf_token,tokens,expires_at,idle_expires_at,version) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)",
        [
          row.cookie_hash,
          row.kind,
          row.user_id,
          row.auth_session_id,
          row.csrf_token,
          JSON.stringify(row.tokens),
          row.expires_at,
          row.idle_expires_at,
          row.version,
        ],
      );
    });
  }
  async membership(
    workspaceId: string,
    userId: string,
    tx?: DatabaseTransaction,
  ): Promise<PilotRole | undefined> {
    const read = async (query: DatabaseTransaction) =>
      (
        await query.query<{ role: PilotRole }>(
          `SELECT m.role FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.workspace_id=$1 AND m.user_id=$2 AND m.active=true AND w.active=true${tx ? " FOR SHARE OF m, w" : ""}`,
          [workspaceId, userId],
        )
      ).rows[0];
    const row = tx
      ? await read(tx)
      : await this.db.transaction(async (authTx) => {
          await authTx.query(
            "SELECT set_config('examate.user_id', $1, true), set_config('examate.workspace_id', $2, true)",
            [userId, workspaceId],
          );
          return read(authTx);
        });
    return row && ["manager", "member", "viewer"].includes(row.role)
      ? row.role
      : undefined;
  }
  /**
   * Remembers who signed in (for the manager's member list) and accepts a
   * waiting invitation for the confirmed address. Both are no-ops before
   * migration 027 is applied; callers treat any failure as "no change".
   */
  async recordMemberProfile(
    workspaceId: string,
    userId: string,
    email: string,
    name: string | undefined,
  ) {
    await this.db.transaction(async (tx) => {
      if (!(await this.membersReady(tx))) return;
      await tx.query(
        "SELECT set_config('examate.user_id', $1, true), set_config('examate.workspace_id', $2, true)",
        [userId, workspaceId],
      );
      await tx.query(
        "SELECT examate_private.record_member_profile($1,$2,$3,$4)",
        [workspaceId, userId, email, name ?? null],
      );
    });
  }

  async acceptInvitation(
    workspaceId: string,
    userId: string,
    email: string,
  ): Promise<PilotRole | undefined> {
    const role = await this.db.transaction(async (tx) => {
      if (!(await this.membersReady(tx))) return undefined;
      await tx.query(
        "SELECT set_config('examate.user_id', $1, true), set_config('examate.workspace_id', $2, true)",
        [userId, workspaceId],
      );
      return (
        await tx.query<{ role: string | null }>(
          "SELECT examate_private.accept_workspace_invitation($1,$2,$3) AS role",
          [workspaceId, userId, email],
        )
      ).rows[0]?.role;
    });
    return role && ["manager", "member", "viewer"].includes(role)
      ? (role as PilotRole)
      : undefined;
  }

  async authSessionActive(id: string, userId: string) {
    return (
      (await this.db.query(AUTH_SESSION_ACTIVE_SQL, [id, userId])).rows
        .length === 1
    );
  }
  async revoke(hash: string) {
    await this.db.query(
      "UPDATE pilot_sessions SET revoked_at=COALESCE(revoked_at,NOW()) WHERE cookie_hash=$1",
      [hash],
    );
  }
  async touch(hash: string) {
    await this.db.query(
      "UPDATE pilot_sessions SET idle_expires_at=LEAST(expires_at,NOW()+INTERVAL '30 minutes') WHERE cookie_hash=$1 AND revoked_at IS NULL",
      [hash],
    );
  }
}
