import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { authDatabaseConfig } from "../config/config.js";
import { errorCode, log } from "../common/log.js";
import type { DatabaseTransaction } from "./database.service.js";

type Capability = "examate_business" | "examate_auth";

/** Independent, narrowly privileged pool for pre-principal Auth state. */
@Injectable()
export class AuthDatabaseService implements OnModuleDestroy {
  private pool?: Pool;

  constructor() {
    // Lazy construction keeps isolated HTTP/unit fixtures from opening a
    // runtime connection; app startup explicitly probes this pool.
  }

  private getPool() {
    if (!this.pool) {
      this.pool = new Pool(authDatabaseConfig());
      this.pool.on("error", (error) =>
        log("error", "auth_database.idle_error", { code: errorCode(error) }),
      );
    }
    return this.pool;
  }

  async query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
    try {
      return await this.getPool().query<T>(text, values);
    } catch (error) {
      this.throwDatabaseError(error);
    }
  }

  async transaction<T>(work: (tx: DatabaseTransaction) => Promise<T>) {
    let client: PoolClient | undefined;
    let discard = false;
    try {
      client = await this.getPool().connect();
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
          log("error", "auth_database.rollback_failed", {
            code: errorCode(rollbackError),
          });
        }
        throw error;
      }
      try {
        await client.query("COMMIT");
      } catch (error) {
        discard = true;
        log("error", "auth_database.commit_unknown", {
          code: errorCode(error),
        });
        throw error;
      }
      return result;
    } catch (error) {
      this.throwDatabaseError(error);
    } finally {
      client?.release(discard);
    }
  }

  /** Fail startup unless the connected LOGIN has exactly its intended group capability. */
  async assertCapability(capability: Capability) {
    const result = await this.query<{
      current_user: string;
      session_user: string;
      rolcanlogin: boolean;
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolreplication: boolean;
      rolinherit: boolean;
      members: string[];
      has_capability: boolean;
      business_table: boolean;
      auth_table: boolean;
      auth_session_columns: boolean;
      auth_schema: boolean;
      auth_sessions_table: boolean;
      migration_ledger: boolean;
      public_create: boolean;
      database_temp: boolean;
      database_create: boolean;
      business_truncate: boolean;
      auth_truncate: boolean;
      auth_users: boolean;
      auth_sessions_extra_columns: boolean;
      privilege_drift: boolean;
    }>(
      `
      SELECT current_user::text AS current_user, session_user::text AS session_user,
        r.rolcanlogin, r.rolsuper, r.rolbypassrls, r.rolcreatedb,
        r.rolcreaterole, r.rolreplication, r.rolinherit,
        COALESCE((SELECT array_agg(parent.rolname::text ORDER BY parent.rolname::text)
          FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid
          WHERE m.member=r.oid), ARRAY[]::text[]) AS members,
        pg_has_role(r.rolname, $1, 'member') AS has_capability,
        has_table_privilege(r.rolname,(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='tasks'),'SELECT') AS business_table,
        has_table_privilege(r.rolname,(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='pilot_sessions'),'SELECT') AS auth_table,
        has_table_privilege(r.rolname,(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='auth' AND c.relname='sessions'),'SELECT') AS auth_sessions_table,
        (has_column_privilege(r.rolname,(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='auth' AND c.relname='sessions'), a_id.attnum,'SELECT') AND
         has_column_privilege(r.rolname,(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='auth' AND c.relname='sessions'), a_user.attnum,'SELECT') AND
         has_column_privilege(r.rolname,(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='auth' AND c.relname='sessions'), a_exp.attnum,'SELECT')) AS auth_session_columns,
        has_schema_privilege(r.rolname,'auth','USAGE') AS auth_schema,
        has_table_privilege(r.rolname,(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='schema_migrations'),'SELECT') AS migration_ledger,
        has_schema_privilege(r.rolname,'public','CREATE') AS public_create,
        has_database_privilege(r.rolname,current_database(),'TEMP') AS database_temp,
        has_database_privilege(r.rolname,current_database(),'CREATE') AS database_create,
        has_table_privilege(r.rolname,(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='tasks'),'TRUNCATE') AS business_truncate,
        has_table_privilege(r.rolname,(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='pilot_sessions'),'TRUNCATE') AS auth_truncate,
        has_table_privilege(r.rolname,(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='auth' AND c.relname='users'),'SELECT') AS auth_users
        ,EXISTS(SELECT 1 FROM pg_attribute a
          WHERE a.attrelid=(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='auth' AND c.relname='sessions') AND a.attnum>0 AND NOT a.attisdropped
            AND a.attname NOT IN ('id','user_id','not_after')
            AND has_column_privilege(r.rolname,a.attrelid,a.attnum,'SELECT')) AS auth_sessions_extra_columns
        ,EXISTS(
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER',
              'SELECT WITH GRANT OPTION','INSERT WITH GRANT OPTION','UPDATE WITH GRANT OPTION',
              'DELETE WITH GRANT OPTION','TRUNCATE WITH GRANT OPTION','REFERENCES WITH GRANT OPTION','TRIGGER WITH GRANT OPTION']) p(privilege)
          WHERE n.nspname IN ('public','auth') AND c.relkind IN ('r','p','v','m','f')
            AND has_table_privilege(r.rolname,c.oid,p.privilege) IS DISTINCT FROM has_table_privilege('examate_auth',c.oid,p.privilege)
        ) OR EXISTS(
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
            CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES',
              'SELECT WITH GRANT OPTION','INSERT WITH GRANT OPTION','UPDATE WITH GRANT OPTION','REFERENCES WITH GRANT OPTION']) p(privilege)
          WHERE n.nspname IN ('public','auth') AND has_column_privilege(r.rolname,c.oid,a.attnum,p.privilege)
            IS DISTINCT FROM has_column_privilege('examate_auth',c.oid,a.attnum,p.privilege)
        ) OR EXISTS(
          SELECT 1 FROM pg_namespace n CROSS JOIN unnest(ARRAY['USAGE','CREATE','USAGE WITH GRANT OPTION','CREATE WITH GRANT OPTION']) p(privilege)
          WHERE n.nspname IN ('public','auth') AND has_schema_privilege(r.rolname,n.oid,p.privilege)
            IS DISTINCT FROM has_schema_privilege('examate_auth',n.oid,p.privilege)
        ) OR EXISTS(
          SELECT 1 FROM pg_database d CROSS JOIN unnest(ARRAY['CONNECT','CREATE','TEMP','CONNECT WITH GRANT OPTION','CREATE WITH GRANT OPTION','TEMP WITH GRANT OPTION']) p(privilege)
          WHERE d.datname=current_database() AND has_database_privilege(r.rolname,d.oid,p.privilege)
            IS DISTINCT FROM has_database_privilege('examate_auth',d.oid,p.privilege)
        ) AS privilege_drift
      FROM pg_roles r
      LEFT JOIN pg_attribute a_id ON a_id.attrelid=(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='auth' AND c.relname='sessions') AND a_id.attname='id' AND a_id.attnum>0 AND NOT a_id.attisdropped
      LEFT JOIN pg_attribute a_user ON a_user.attrelid=a_id.attrelid AND a_user.attname='user_id' AND a_user.attnum>0 AND NOT a_user.attisdropped
      LEFT JOIN pg_attribute a_exp ON a_exp.attrelid=a_id.attrelid AND a_exp.attname='not_after' AND a_exp.attnum>0 AND NOT a_exp.attisdropped
      WHERE r.rolname=session_user
    `,
      [capability],
    );
    const row = result.rows[0];
    if (
      !row ||
      row.current_user !== row.session_user ||
      !row.rolcanlogin ||
      row.rolsuper ||
      row.rolbypassrls ||
      !row.rolinherit ||
      row.rolcreatedb ||
      row.rolcreaterole ||
      row.rolreplication ||
      row.members.length !== 1 ||
      row.members[0] !== capability ||
      !row.has_capability ||
      !row.auth_table ||
      row.business_table ||
      !row.auth_schema ||
      !row.auth_session_columns ||
      row.auth_sessions_table ||
      row.auth_sessions_extra_columns ||
      row.migration_ledger ||
      row.public_create ||
      row.database_temp ||
      row.business_truncate ||
      row.database_create ||
      row.auth_truncate ||
      row.auth_users ||
      row.privilege_drift
    )
      throw new Error(
        `Connected DB login does not satisfy ${capability} capability`,
      );
  }

  private throwDatabaseError(error: unknown): never {
    const code = errorCode(error);
    log("error", "auth_database.query_failed", { code });
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

  async onModuleDestroy() {
    await this.pool?.end();
  }
}
