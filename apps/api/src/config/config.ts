import { existsSync, readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(
  new URL("../../../../", import.meta.url),
);
const envPath = fileURLToPath(new URL("../../../../.env", import.meta.url));
export function loadEnvironment() {
  try {
    if (existsSync(envPath)) loadEnvFile(envPath);
  } catch {
    throw new ConfigurationError("Cannot read repository root .env");
  }
}
export class ConfigurationError extends Error {}
export function geminiConfig() {
  const rawKey = process.env.GEMINI_API_KEY?.trim();
  const apiKey = rawKey && !rawKey.includes("REPLACE_") ? rawKey : undefined;
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  if (!/^gemini-[A-Za-z0-9._-]{1,80}$/.test(model) || model === apiKey)
    throw new ConfigurationError("Invalid configuration: GEMINI_MODEL");
  return {
    configured: Boolean(apiKey),
    apiKey,
    model,
    timeoutMs: integer("GEMINI_TIMEOUT_MS", 30000, 60000),
    maxOutputTokens: integer("GEMINI_MAX_OUTPUT_TOKENS", 1024, 8192),
  };
}
function integer(name: string, fallback: number, max: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > max)
    throw new ConfigurationError(
      `Invalid configuration: ${name} must be 1..${max}`,
    );
  return value;
}
function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value || value.includes("REPLACE_"))
    throw new ConfigurationError(
      `Missing configuration: ${name}. See .env.example`,
    );
  return value;
}
export function databaseConfig(connectionString = required("DATABASE_URL")) {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new ConfigurationError("Invalid DATABASE_URL");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new ConfigurationError("DATABASE_URL must use PostgreSQL");
  if (
    [...url.searchParams.keys()].some((key) =>
      key.toLowerCase().startsWith("ssl"),
    )
  )
    throw new ConfigurationError(
      "Remove ssl* URL parameters; use DATABASE_SSL and DATABASE_CA_CERT_PATH for verified TLS",
    );
  const tls = process.env.DATABASE_SSL ?? "true";
  if (!["true", "false"].includes(tls))
    throw new ConfigurationError("DATABASE_SSL must be true or false");
  if (
    tls === "false" &&
    !["localhost", "127.0.0.1", "::1", "[::1]", "db"].includes(url.hostname)
  )
    throw new ConfigurationError(
      "DATABASE_SSL=false is only allowed for local PostgreSQL",
    );
  const cert = process.env.DATABASE_CA_CERT_PATH?.trim();
  const certPath = cert
    ? isAbsolute(cert)
      ? cert
      : resolve(projectRoot, cert)
    : undefined;
  let ca: string | undefined;
  if (tls === "true" && certPath) {
    if (!existsSync(certPath))
      throw new ConfigurationError(
        "DATABASE_CA_CERT_PATH does not point to an existing certificate file",
      );
    try {
      ca = readFileSync(certPath, "utf8");
    } catch {
      throw new ConfigurationError(
        "DATABASE_CA_CERT_PATH certificate file cannot be read",
      );
    }
    try {
      if (!ca.includes("-----BEGIN CERTIFICATE-----")) throw new Error();
      new X509Certificate(ca);
    } catch {
      throw new ConfigurationError(
        "DATABASE_CA_CERT_PATH must contain a valid PEM X.509 certificate",
      );
    }
  }
  return {
    connectionString,
    ssl:
      tls === "true"
        ? {
            rejectUnauthorized: true,
            ...(ca ? { ca } : {}),
          }
        : (false as const),
    max: integer("DATABASE_POOL_MAX", 5, 20),
    connectionTimeoutMillis: integer("DATABASE_TIMEOUT_MS", 5000, 30000),
    statement_timeout: integer("DATABASE_TIMEOUT_MS", 5000, 30000),
    query_timeout: integer("DATABASE_TIMEOUT_MS", 5000, 30000),
    idleTimeoutMillis: 30000,
  };
}
export function appConfig() {
  const database = databaseConfig();
  const rawUrl = required("SUPABASE_URL");
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid SUPABASE_URL");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("SUPABASE_URL must be an HTTPS project origin");
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  let key: string;
  if (secret && !secret.includes("REPLACE_")) {
    if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(secret))
      throw new Error("SUPABASE_SECRET_KEY must be an sb_secret_ server key");
    key = secret;
  } else {
    key = required("SUPABASE_SERVICE_ROLE_KEY");
    try {
      const payload = JSON.parse(
        Buffer.from(key.split(".")[1], "base64url").toString(),
      );
      if (payload.role !== "service_role") throw new Error();
    } catch {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY must be a legacy service_role JWT (server only)",
      );
    }
  }
  const bucket = required("SUPABASE_STORAGE_BUCKET");
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(bucket))
    throw new Error("Invalid SUPABASE_STORAGE_BUCKET");
  const nodeEnv = process.env.NODE_ENV ?? "development";
  if (!["development", "test", "production"].includes(nodeEnv))
    throw new Error("Invalid NODE_ENV");
  const origins = (
    process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://localhost:8080"
  )
    .split(",")
    .filter(Boolean);
  for (const origin of origins) {
    try {
      if (new URL(origin).origin !== origin) throw new Error();
    } catch {
      throw new Error("ALLOWED_ORIGINS must contain exact URL origins");
    }
  }
  return {
    database,
    gemini: geminiConfig(),
    port: integer("PORT", 3000, 65535),
    origins,
    storage: {
      url: url.origin,
      key,
      bucket,
      timeout: integer("STORAGE_TIMEOUT_MS", 15000, 30000),
    },
  };
}
