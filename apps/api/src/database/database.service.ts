import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Pool, QueryResultRow, types } from "pg";
import { databaseConfig } from "../config/config.js";
import { errorCode, log } from "../common/log.js";

types.setTypeParser(1082, (value: string) => value);

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
