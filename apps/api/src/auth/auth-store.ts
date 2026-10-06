import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import type { EncryptedTokens } from "./session-crypto.js";
import type { PilotRole } from "@examate/contracts";
import type { DatabaseTransaction } from "../database/database.service.js";
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
  constructor(private readonly db: DatabaseService) {}
  async markRefreshStarted(hash: string, version: number) {
    // Independent autocommit BEFORE provider dispatch, while the parent holds FOR UPDATE.
    return (
      (
        await this.db.query(
          "INSERT INTO pilot_refresh_attempts (cookie_hash,version) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING cookie_hash",
          [hash, version],
        )
      ).rows.length === 1
    );
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
  async replacePreSession(oldHash: string, row: SessionRow) {
    await this.db.transaction(async (tx) => {
      const old = await tx.query(
        "SELECT cookie_hash FROM pilot_sessions WHERE cookie_hash=$1 AND kind='prelogin' AND revoked_at IS NULL AND expires_at>NOW() FOR UPDATE",
        [oldHash],
      );
      if (!old.rows.length) throw new Error("PRESESSION_CONSUMED");
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
  ): Promise<PilotRole | undefined> {
    const row = (
      await this.db.query<{ role: PilotRole }>(
        `SELECT m.role FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.workspace_id=$1 AND m.user_id=$2 AND m.active=true AND w.active=true`,
        [workspaceId, userId],
      )
    ).rows[0];
    return row && ["manager", "member", "viewer"].includes(row.role)
      ? row.role
      : undefined;
  }
  async authSessionActive(id: string, userId: string) {
    return (
      (
        await this.db.query(
          "SELECT id FROM auth.sessions WHERE id=$1 AND user_id=$2 AND (not_after IS NULL OR not_after>NOW())",
          [id, userId],
        )
      ).rows.length === 1
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
