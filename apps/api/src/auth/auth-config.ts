import { ServiceUnavailableException } from "@nestjs/common";

export const AUTH_CONFIG = Symbol("AUTH_CONFIG");
export const AUTH_ADAPTER = Symbol("AUTH_ADAPTER");
export const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export interface AuthSettings {
  origin: string;
  url: string;
  apiKey: string;
  workspaceId: string;
  encryptionKey: Buffer;
  keyVersion: string;
  secure: boolean;
  cacheMs: number;
  timeoutMs: number;
  sessionVerification: "database" | "auth_user";
}
export type AuthConfig = () => AuthSettings;
export function authUnavailable(): never {
  throw new ServiceUnavailableException({
    code: "AUTH_UNAVAILABLE",
    message:
      "Dịch vụ xác thực đang gián đoạn hoặc chưa được cấu hình. Hãy thử lại sau.",
  });
}
export function authConfig(): AuthSettings {
  try {
    const origin = new URL(process.env.PUBLIC_ORIGIN ?? "");
    const url = new URL(process.env.SUPABASE_URL ?? "");
    const local =
      origin.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    if (
      origin.origin !== process.env.PUBLIC_ORIGIN ||
      (!local && origin.protocol !== "https:") ||
      url.protocol !== "https:" ||
      url.origin !== process.env.SUPABASE_URL?.replace(/\/$/, "")
    )
      throw new Error();
    const apiKey =
      process.env.SUPABASE_PUBLISHABLE_KEY ??
      process.env.SUPABASE_ANON_KEY ??
      "";
    const workspaceId = process.env.PILOT_WORKSPACE_ID ?? "";
    const rawKey = process.env.SESSION_ENCRYPTION_KEY ?? "";
    const encryptionKey = Buffer.from(rawKey, "base64");
    const keyVersion = process.env.SESSION_KEY_VERSION ?? "v1";
    const cacheMs = Number(process.env.AUTH_VERIFY_CACHE_SECONDS ?? 30) * 1000;
    const sessionVerification =
      process.env.AUTH_SESSION_VERIFICATION ?? "database";
    let publicKey = apiKey.startsWith("sb_publishable_");
    if (!publicKey)
      try {
        publicKey =
          JSON.parse(
            Buffer.from(apiKey.split(".")[1], "base64url").toString("utf8"),
          ).role === "anon";
      } catch {
        publicKey = false;
      }
    if (
      !publicKey ||
      apiKey.includes("REPLACE_") ||
      !uuid.test(workspaceId) ||
      encryptionKey.length !== 32 ||
      encryptionKey.toString("base64") !== rawKey ||
      !/^[a-zA-Z0-9_-]{1,30}$/.test(keyVersion) ||
      !Number.isInteger(cacheMs) ||
      cacheMs < 0 ||
      cacheMs > 30_000 ||
      !["database", "auth_user"].includes(sessionVerification)
    )
      throw new Error();
    return {
      origin: origin.origin,
      url: url.origin,
      apiKey,
      workspaceId,
      encryptionKey,
      keyVersion,
      secure: !local,
      cacheMs,
      timeoutMs: 5000,
      sessionVerification:
        sessionVerification as AuthSettings["sessionVerification"],
    };
  } catch {
    return authUnavailable();
  }
}
