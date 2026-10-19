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
import {
  assertRuntimeCapabilityContract,
  runtimeCapabilityError,
} from "./runtime-capability-contract.js";

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

  async assertBusinessCapability() {
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
      auth_schema: boolean;
      migration_ledger: boolean;
      public_create: boolean;
      database_temp: boolean;
      database_create: boolean;
      business_truncate: boolean;
      auth_users: boolean;
      privilege_drift: boolean;
    }>(`
      SELECT current_user::text AS current_user, session_user::text AS session_user,
        r.rolcanlogin, r.rolsuper, r.rolbypassrls, r.rolcreatedb,
        r.rolcreaterole, r.rolreplication, r.rolinherit,
        COALESCE((SELECT array_agg(parent.rolname::text ORDER BY parent.rolname::text)
          FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid
          WHERE m.member=r.oid), ARRAY[]::text[]) AS members,
        pg_has_role(r.rolname, 'examate_business', 'member') AS has_capability,
        has_table_privilege(r.rolname,(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='tasks'),'SELECT') AS business_table,
        has_table_privilege(r.rolname,(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='pilot_sessions'),'SELECT') AS auth_table,
        has_schema_privilege(r.rolname,'auth','USAGE') AS auth_schema,
        has_table_privilege(r.rolname,(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='schema_migrations'),'SELECT') AS migration_ledger,
        has_schema_privilege(r.rolname,'public','CREATE') AS public_create,
        has_database_privilege(r.rolname,current_database(),'TEMP') AS database_temp,
        has_database_privilege(r.rolname,current_database(),'CREATE') AS database_create,
        has_table_privilege(r.rolname,'public.tasks','TRUNCATE') AS business_truncate
        ,has_table_privilege(r.rolname,(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='auth' AND c.relname='users'),'SELECT') AS auth_users
        ,EXISTS(
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER',
              'SELECT WITH GRANT OPTION','INSERT WITH GRANT OPTION','UPDATE WITH GRANT OPTION',
              'DELETE WITH GRANT OPTION','TRUNCATE WITH GRANT OPTION','REFERENCES WITH GRANT OPTION','TRIGGER WITH GRANT OPTION']) p(privilege)
          WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
            AND has_table_privilege(r.rolname,c.oid,p.privilege) IS DISTINCT FROM has_table_privilege('examate_business',c.oid,p.privilege)
        ) OR EXISTS(
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
            CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES',
              'SELECT WITH GRANT OPTION','INSERT WITH GRANT OPTION','UPDATE WITH GRANT OPTION','REFERENCES WITH GRANT OPTION']) p(privilege)
          WHERE n.nspname='public' AND has_column_privilege(r.rolname,c.oid,a.attnum,p.privilege)
            IS DISTINCT FROM has_column_privilege('examate_business',c.oid,a.attnum,p.privilege)
        ) OR EXISTS(
          SELECT 1 FROM pg_namespace n CROSS JOIN unnest(ARRAY['USAGE','CREATE','USAGE WITH GRANT OPTION','CREATE WITH GRANT OPTION']) p(privilege)
          WHERE has_schema_privilege(r.rolname,n.oid,p.privilege)
            IS DISTINCT FROM has_schema_privilege('examate_business',n.oid,p.privilege)
        ) OR EXISTS(
          SELECT 1 FROM pg_database d CROSS JOIN unnest(ARRAY['CONNECT','CREATE','TEMP','CONNECT WITH GRANT OPTION','CREATE WITH GRANT OPTION','TEMP WITH GRANT OPTION']) p(privilege)
          WHERE d.datname=current_database() AND has_database_privilege(r.rolname,d.oid,p.privilege)
            IS DISTINCT FROM has_database_privilege('examate_business',d.oid,p.privilege)
        ) AS privilege_drift
      FROM pg_roles r WHERE r.rolname=session_user
    `);
    const row = result.rows[0];
    const failed = [
      !row && "login_missing",
      row && row.current_user !== row.session_user && "session_role_changed",
      row && !row.rolcanlogin && "login_required",
      row && row.rolsuper && "superuser_forbidden",
      row && row.rolbypassrls && "bypassrls_forbidden",
      row && !row.rolinherit && "inherit_required",
      row && row.rolcreatedb && "createdb_forbidden",
      row && row.rolcreaterole && "createrole_forbidden",
      row && row.rolreplication && "replication_forbidden",
      row && row.members.length !== 1 && "unexpected_role_membership",
      row && row.members[0] !== "examate_business" && "business_group_required",
      row && !row.has_capability && "business_group_missing",
      row && !row.business_table && "business_table_capability_missing",
      row && row.auth_table && "auth_table_forbidden",
      row && row.auth_schema && "auth_schema_forbidden",
      row && row.migration_ledger && "migration_ledger_forbidden",
      row && row.public_create && "public_create_forbidden",
      row && row.database_temp && "database_temp_forbidden",
      row && row.database_create && "database_create_forbidden",
      row && row.business_truncate && "business_truncate_forbidden",
      row && row.auth_users && "auth_users_forbidden",
      row && row.privilege_drift && "direct_privilege_drift",
    ].filter(Boolean);
    if (failed.length)
      throw runtimeCapabilityError(
        `Connected DB login does not satisfy business runtime capability (${failed.join(",")})`,
      );
    await assertRuntimeCapabilityContract(
      (text, values) => this.query(text, values),
      "examate_business",
    );
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
