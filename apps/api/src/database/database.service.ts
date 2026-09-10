import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool, QueryResultRow } from "pg";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://examate:examate@localhost:55432/examate",
    max: 10,
    connectionTimeoutMillis: 5_000,
  });

  query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
    return this.pool.query<T>(text, values);
  }

  async ping() {
    const startedAt = Date.now();
    await this.pool.query("SELECT 1");
    return Date.now() - startedAt;
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
