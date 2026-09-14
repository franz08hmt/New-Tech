import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import {
  appConfig,
  ConfigurationError,
  loadEnvironment,
} from "./config/config.js";
import { configureApp } from "./common/http.js";
import { log } from "./common/log.js";

async function bootstrap() {
  loadEnvironment();
  const config = appConfig();
  const app = await NestFactory.create(AppModule);
  configureApp(app, config.origins);
  await app.listen(
    config.port,
    process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1",
  );
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
