import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import {
  appConfig,
  ConfigurationError,
  loadEnvironment,
} from "./config/config.js";
import { configureApp } from "./common/http.js";
import { log } from "./common/log.js";
import { DatabaseService } from "./database/database.service.js";
import { AuthDatabaseService } from "./database/auth-database.service.js";

async function bootstrap() {
  loadEnvironment();
  const config = appConfig();
  const app = await NestFactory.create(AppModule);
  try {
    configureApp(app, config.origins);
    await app.get(DatabaseService).assertBusinessCapability();
    await app.get(AuthDatabaseService).assertCapability("examate_auth");
    await app.listen(config.port, config.host);
  } catch (error) {
    await app.close();
    throw error;
  }
}

void bootstrap().catch((error: unknown) => {
  // Config errors contain variable names only. Never serialize connection errors.
  const message =
    error instanceof ConfigurationError ||
    (error instanceof Error &&
      /configuration|DATABASE_|SUPABASE_|NODE_ENV|ALLOWED_ORIGINS/.test(
        error.message,
      ))
      ? error.message
      : "API startup failed; check configuration and port";
  log("error", "startup.failed", { message });
  process.exitCode = 1;
});
