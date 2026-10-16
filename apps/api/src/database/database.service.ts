import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Pool, PoolClient, QueryResult, QueryResultRow, types } from "pg";
import { databaseConfig } from "../config/config.js";
import { errorCode, log } from "../common/log.js";
import type { PilotPrincipal } from "@examate/contracts";
import { requirePrincipal } from "../auth/principal.js";

types.setTypeParser(1082, (value: string) => value);

export interface DatabaseTransaction {
  query<T extends QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool = new Pool(databaseConfig());

  constructor() {
    this.pool.on("error", (error) =>
      log("error", "database.idle_error", { code: errorCode(error) }),
    );
  }

  async query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
    try {
      return await this.pool.query<T>(text, values);
    } catch (error) {
      this.throwDatabaseError(error);
    }
  }

  async transaction<T>(work: (tx: DatabaseTransaction) => Promise<T>) {
    let client: PoolClient | undefined;
    let discard = false;
    try {
      client = await this.pool.connect();
      try {
        await client.query("BEGIN");
      } catch (error) {
        discard = true;
        throw error;
      }
      let result: T;
      try {
        result = await work({
          query: <Row extends QueryResultRow>(
            text: string,
            values: unknown[] = [],
          ) => client!.query<Row>(text, values),
        });
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          discard = true;
          log("error", "database.rollback_failed", {
            code: errorCode(rollbackError),
          });
        }
        throw error;
      }
      try {
        await client.query("COMMIT");
      } catch (error) {
        // The server may have committed before the connection failed. Never
        // retry work or represent a later ROLLBACK as proof it did not commit.
        discard = true;
        log("error", "database.commit_unknown", { code: errorCode(error) });
        throw error;
      }
      return result;
    } catch (error) {
      this.throwDatabaseError(error);
    } finally {
      client?.release(discard);
    }
  }

  async workspaceTransaction<T>(
    principal: PilotPrincipal | undefined,
    work: (tx: DatabaseTransaction) => Promise<T>,
  ) {
    // Shape validation is not authentication: callers must supply the principal
    // established by the server guard. Capture IDs before acquiring a client.
    const { userId, workspaceId } = requirePrincipal(principal);
    return this.transaction(async (tx) => {
      await tx.query(
        "SELECT set_config('examate.user_id', $1, true), set_config('examate.workspace_id', $2, true)",
        [userId, workspaceId],
      );
      return work(tx);
    });
  }

  private throwDatabaseError(error: unknown): never {
    const code = errorCode(error);
    log("error", "database.query_failed", { code });
    if (
      code.startsWith("08") ||
      [
        "ECONNREFUSED",
        "ECONNRESET",
        "ETIMEDOUT",
        "ENOTFOUND",
        "EAI_AGAIN",
        "ENETUNREACH",
        "EHOSTUNREACH",
        "EPIPE",
        "57P01",
        "57P02",
        "57P03",
        "53300",
        "57014",
      ].includes(code) ||
      (error instanceof Error &&
        /timeout|connection terminated/i.test(error.message))
    )
      throw new ServiceUnavailableException({
        code: "DATABASE_UNAVAILABLE",
        message: "Database is unavailable. Please retry.",
      });
    throw error;
  }

  async ping() {
    const startedAt = Date.now();
    await this.query("SELECT 1");
    return Date.now() - startedAt;
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
