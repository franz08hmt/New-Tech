import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import {
  AUTH_CONFIG,
  authUnavailable,
  uuid,
  type AuthConfig,
} from "./auth-config.js";
import type { SessionTokens } from "./session-crypto.js";
import { log } from "../common/log.js";
export interface VerifiedIdentity {
  userId: string;
  sessionId: string;
  expiresAt: number;
}
export interface AuthAdapter {
  login(email: string, password: string): Promise<SessionTokens>;
  refresh(token: string): Promise<SessionTokens>;
  verify(token: string): Promise<VerifiedIdentity>;
  logout(token: string): Promise<void>;
}
export function authInvalid(): never {
  throw new UnauthorizedException({
    code: "AUTH_INVALID",
    message: "Thông tin đăng nhập hoặc phiên xác thực không hợp lệ.",
  });
}
@Injectable()
export class SupabaseAuthAdapter implements AuthAdapter {
  constructor(@Inject(AUTH_CONFIG) private readonly settings: AuthConfig) {}
  private async request(path: string, body?: object, accessToken?: string) {
    const config = this.settings(),
      start = Date.now();
    try {
      const response = await fetch(`${config.url}/auth/v1${path}`, {
        method: body ? "POST" : "GET",
        redirect: "error",
        headers: {
          apikey: config.apiKey,
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      log("info", "auth.provider.completed", {
        durationMs: Date.now() - start,
        status: response.status,
        operation: path.startsWith("/token")
          ? "token"
          : path.startsWith("/logout")
            ? "logout"
            : "verify",
      });
      if (!response.ok) {
        await response.body?.cancel();
        if ([400, 401, 403, 422].includes(response.status)) authInvalid();
        return authUnavailable();
      }
      if (response.status === 204) return null;
      if (!response.body) return authUnavailable();
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const item = await reader.read();
          if (item.done) break;
          size += item.value.byteLength;
          if (size > 64000) {
            await reader.cancel();
            return authUnavailable();
          }
          chunks.push(item.value);
        }
      } finally {
        reader.releaseLock();
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      log("info", "auth.provider.failed", {
        durationMs: Date.now() - start,
        code: "AUTH_UNAVAILABLE",
      });
      return authUnavailable();
    }
  }
  async login(email: string, password: string): Promise<SessionTokens> {
    const response = await this.request("/token?grant_type=password", {
      email,
      password,
    });
    if (
      typeof response?.access_token !== "string" ||
      !response.access_token ||
      response.access_token.length > 16_000 ||
      typeof response.refresh_token !== "string" ||
      !response.refresh_token ||
      response.refresh_token.length > 16_000 ||
      !Number.isInteger(response.expires_in) ||
      response.expires_in <= 0 ||
      response.expires_in > 86400
    )
      return authUnavailable();
    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresAt: Date.now() + response.expires_in * 1000,
    };
  }
  async refresh(token: string): Promise<SessionTokens> {
    const response = await this.request("/token?grant_type=refresh_token", {
      refresh_token: token,
    });
    if (
      typeof response?.access_token !== "string" ||
      !response.access_token ||
      response.access_token.length > 16000 ||
      typeof response.refresh_token !== "string" ||
      !response.refresh_token ||
      response.refresh_token.length > 16000 ||
      !Number.isInteger(response.expires_in) ||
      response.expires_in <= 0 ||
      response.expires_in > 86400
    )
      return authUnavailable();
    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresAt: Date.now() + response.expires_in * 1000,
    };
  }
  async verify(token: string): Promise<VerifiedIdentity> {
    const user = await this.request("/user", undefined, token);
    // Decode only AFTER Supabase verified this exact token. No local signature verifier.
    try {
      const parts = token.split(".");
      if (parts.length !== 3 || token.length > 16_000) return authInvalid();
      const claims = JSON.parse(
        Buffer.from(parts[1], "base64url").toString("utf8"),
      );
      if (
        !uuid.test(user?.id) ||
        claims.sub !== user.id ||
        !uuid.test(claims.session_id) ||
        !Number.isInteger(claims.exp) ||
        claims.exp * 1000 <= Date.now() ||
        user.is_anonymous === true
      )
        return authInvalid();
      return {
        userId: user.id,
        sessionId: claims.session_id,
        expiresAt: claims.exp * 1000,
      };
    } catch {
      return authInvalid();
    }
  }
  async logout(token: string) {
    await this.request("/logout?scope=local", {}, token);
  }
}
