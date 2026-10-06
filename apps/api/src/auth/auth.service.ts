import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  HttpException,
} from "@nestjs/common";
import { timingSafeEqual, createHmac } from "node:crypto";
import type { PilotSessionResponse, PilotPrincipal } from "@examate/contracts";
import {
  AUTH_ADAPTER,
  AUTH_CONFIG,
  authUnavailable,
  type AuthConfig,
} from "./auth-config.js";
import { AuthStore, type SessionRow } from "./auth-store.js";
import {
  openTokens,
  randomToken,
  sealTokens,
  tokenHash,
} from "./session-crypto.js";
import {
  authInvalid,
  type AuthAdapter,
  type VerifiedIdentity,
} from "./supabase-auth.adapter.js";
export interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  path: string;
  socket?: { remoteAddress?: string };
  principal?: PilotPrincipal;
}
export interface AuthResponse {
  setHeader(name: string, value: string): void;
}
export function authRequired(code = "AUTH_REQUIRED"): never {
  throw new UnauthorizedException({
    code,
    message:
      code === "SESSION_EXPIRED"
        ? "Phiên đã hết hạn. Đăng nhập lại để tiếp tục; bản nháp vẫn được giữ."
        : "Bạn cần đăng nhập để sử dụng workspace.",
  });
}
@Injectable()
export class AuthService {
  private readonly cache = new Map<
    string,
    { identity: VerifiedIdentity; until: number }
  >();
  private readonly inFlight = new Map<string, Promise<VerifiedIdentity>>();
  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly store: AuthStore,
    @Inject(AUTH_ADAPTER) private readonly adapter: AuthAdapter,
  ) {}
  private async admission(req: AuthRequest, email?: string) {
    const c = this.config(),
      limits = c.loginLimits;
    const key = (value: string) =>
      createHmac("sha256", c.encryptionKey)
        .update("examate-auth-admission-v1:" + value)
        .digest("hex");
    const ip = req.socket?.remoteAddress ?? "unknown"; // Never trust arbitrary X-Forwarded-For.
    const keys =
      email === undefined
        ? [{ key: key("bootstrap:" + ip), limit: limits.bootstrap }]
        : [
            {
              key: key("email:" + email.trim().toLowerCase()),
              limit: limits.email,
            },
            { key: key("ip:" + ip), limit: limits.ip },
            { key: key("global-login"), limit: limits.global },
          ];
    let result;
    try {
      result = await this.store.admission(keys, limits.windowSeconds);
    } catch {
      return authUnavailable();
    }
    if (!result.allowed)
      throw new HttpException(
        {
          code: "LOGIN_RATE_LIMITED",
          message:
            "Đã có nhiều lần thử đăng nhập. Hãy chờ tới thời điểm được thông báo rồi thử lại.",
          retryAt: result.resetAt,
        },
        429,
      );
  }
  cookieName() {
    return this.config().secure
      ? "__Host-examate_session"
      : "examate_session_local";
  }
  private cookie(req: AuthRequest) {
    const header = req.headers.cookie;
    if (typeof header !== "string") return undefined;
    if (header.length > 4096) return authInvalid();
    const matches = header
      .split(";")
      .map((p) => p.trim())
      .filter((p) => p.startsWith(this.cookieName() + "="));
    if (matches.length > 1) return authInvalid();
    const value = matches[0]?.slice(this.cookieName().length + 1);
    if (value && !/^[A-Za-z0-9_-]{43}$/.test(value)) return authInvalid();
    return value;
  }
  private setCookie(res: AuthResponse, value: string, maxAge: number) {
    const c = this.config();
    res.setHeader(
      "Set-Cookie",
      `${this.cookieName()}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${c.secure ? "; Secure" : ""}`,
    );
  }
  csrf(req: AuthRequest, row: SessionRow) {
    const token = req.headers["x-csrf-token"],
      origin = req.headers.origin,
      fetchSite = req.headers["sec-fetch-site"];
    let sameOrigin = origin === this.config().origin;
    // Same-origin GET fetches may omit Origin; only URL minting GET may use Referer.
    if (
      !origin &&
      req.method === "GET" &&
      /^\/api\/documents\/[^/]+\/download$/.test(req.path)
    )
      try {
        sameOrigin =
          new URL(String(req.headers.referer)).origin === this.config().origin;
      } catch {
        sameOrigin = false;
      }
    if (
      !sameOrigin ||
      (fetchSite &&
        !["same-origin", "same-site", "none"].includes(String(fetchSite))) ||
      typeof token !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(token) ||
      !/^[A-Za-z0-9_-]{43}$/.test(row.csrf_token) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(row.csrf_token))
    )
      throw new ForbiddenException({
        code: "CSRF_INVALID",
        message:
          "Phiên gửi yêu cầu chưa hợp lệ. Tải lại trạng thái đăng nhập rồi thử lại.",
      });
  }
  private checkLocal(row?: SessionRow) {
    if (!row || row.revoked_at) return authRequired();
    if (+row.expires_at <= Date.now() || +row.idle_expires_at <= Date.now())
      return authRequired("SESSION_EXPIRED");
    return row;
  }
  private async local(req: AuthRequest) {
    const cookie = this.cookie(req);
    if (!cookie) return authRequired();
    try {
      return this.checkLocal(await this.store.find(tokenHash(cookie)));
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      return authUnavailable();
    }
  }
  private async verified(row: SessionRow) {
    const settings = this.config();
    if (!row.user_id || !row.tokens || !row.auth_session_id)
      return authInvalid();
    const tokens = openTokens(row.tokens, row.cookie_hash, settings);
    if (tokens.expiresAt <= Date.now())
      return authRequired("SESSION_REFRESH_REQUIRED");
    const key = tokenHash(tokens.accessToken),
      cached = this.cache.get(key);
    let identity =
      cached && cached.until > Date.now() ? cached.identity : undefined;
    if (!identity) {
      let pending = this.inFlight.get(key);
      if (!pending) {
        pending = this.adapter.verify(tokens.accessToken);
        this.inFlight.set(key, pending);
      }
      try {
        identity = await pending;
        if (settings.cacheMs > 0) {
          if (this.cache.size >= 1000) {
            for (const [k, v] of this.cache)
              if (v.until <= Date.now()) this.cache.delete(k);
            if (this.cache.size >= 1000)
              this.cache.delete(this.cache.keys().next().value!);
          }
          this.cache.set(key, {
            identity,
            until: Math.min(
              Date.now() + settings.cacheMs,
              identity.expiresAt,
              tokens.expiresAt,
            ),
          });
        }
      } finally {
        this.inFlight.delete(key);
      }
    }
    if (
      identity.userId !== row.user_id ||
      identity.sessionId !== row.auth_session_id ||
      identity.expiresAt <= Date.now()
    )
      return authInvalid();
    if (
      settings.sessionVerification === "database" &&
      !(await this.store.authSessionActive(identity.sessionId, identity.userId))
    )
      return authInvalid();
    return identity;
  }
  async authenticate(req: AuthRequest): Promise<PilotPrincipal> {
    try {
      const row = await this.local(req);
      if (row.kind !== "authenticated") return authRequired();
      await this.verified(row);
      const role = await this.store.membership(
        this.config().workspaceId,
        row.user_id!,
      );
      if (!role)
        throw new ForbiddenException({
          code: "WORKSPACE_ACCESS_DENIED",
          message:
            "Bạn đã đăng nhập nhưng chưa được cấp quyền workspace. Liên hệ nhóm để được cấp quyền.",
        });
      if (
        !["GET", "HEAD", "OPTIONS"].includes(req.method) ||
        /^\/api\/documents\/[^/]+\/download$/.test(req.path)
      )
        this.csrf(req, row);
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method))
        await this.store.touch(row.cookie_hash);
      return {
        userId: row.user_id!,
        workspaceId: this.config().workspaceId,
        role,
      };
    } catch (e) {
      if (e instanceof UnauthorizedException || e instanceof ForbiddenException)
        throw e;
      return authUnavailable();
    }
  }
  async session(
    req: AuthRequest,
    res: AuthResponse,
  ): Promise<PilotSessionResponse> {
    try {
      this.config();
      const cookie = this.cookie(req);
      if (!cookie) {
        await this.admission(req);
        const raw = randomToken(),
          row: SessionRow = {
            cookie_hash: tokenHash(raw),
            kind: "prelogin",
            user_id: null,
            auth_session_id: null,
            csrf_token: randomToken(),
            tokens: null,
            expires_at: new Date(Date.now() + 600_000),
            idle_expires_at: new Date(Date.now() + 600_000),
            revoked_at: null,
            version: 0,
          };
        await this.store.create(row);
        this.setCookie(res, raw, 600);
        return { status: "anonymous", csrfToken: row.csrf_token };
      }
      const row = await this.local(req);
      if (row.kind === "prelogin")
        return { status: "anonymous", csrfToken: row.csrf_token };
      const tokens = row.tokens
        ? openTokens(row.tokens, row.cookie_hash, this.config())
        : null;
      if (tokens && tokens.expiresAt <= Date.now())
        return { status: "refresh_required", csrfToken: row.csrf_token };
      await this.verified(row);
      const role = await this.store.membership(
        this.config().workspaceId,
        row.user_id!,
      );
      if (!role) return { status: "no_access", csrfToken: row.csrf_token };
      return {
        status: "authenticated",
        csrfToken: row.csrf_token,
        principal: {
          userId: row.user_id!,
          workspaceId: this.config().workspaceId,
          role,
        },
        expiresAt: row.expires_at.toISOString(),
        accessExpiresAt: new Date(tokens!.expiresAt).toISOString(),
      };
    } catch (e) {
      if (e instanceof UnauthorizedException) {
        this.setCookie(res, "", 0);
        throw e;
      }
      if (e instanceof HttpException && e.getStatus() === 429) throw e;
      return authUnavailable();
    }
  }
  async login(
    req: AuthRequest,
    res: AuthResponse,
    email: string,
    password: string,
  ): Promise<PilotSessionResponse> {
    // Origin/token validation precedes calling the remote identity service.
    if (
      !req.headers["x-csrf-token"] ||
      req.headers.origin !== this.config().origin
    )
      throw new ForbiddenException({
        code: "CSRF_INVALID",
        message: "Tải lại trạng thái đăng nhập rồi thử lại.",
      });
    const previous = await this.local(req);
    this.csrf(req, previous);
    if (previous.kind !== "prelogin") return authInvalid();
    await this.admission(req, email);
    let tokens, identity;
    try {
      tokens = await this.adapter.login(email, password);
      identity = await this.adapter.verify(tokens.accessToken);
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      return authUnavailable();
    }
    const raw = randomToken(),
      hash = tokenHash(raw),
      settings = this.config();
    const row: SessionRow = {
      cookie_hash: hash,
      kind: "authenticated",
      user_id: identity.userId,
      auth_session_id: identity.sessionId,
      csrf_token: randomToken(),
      tokens: sealTokens(tokens, hash, settings),
      expires_at: new Date(Date.now() + 28_800_000),
      idle_expires_at: new Date(Date.now() + 1_800_000),
      revoked_at: null,
      version: 0,
    };
    try {
      if (
        settings.sessionVerification === "database" &&
        !(await this.store.authSessionActive(
          identity.sessionId,
          identity.userId,
        ))
      )
        return authInvalid();
      await this.store.replacePreSession(previous.cookie_hash, row);
    } catch (e) {
      await this.adapter.logout(tokens.accessToken).catch(() => {});
      if (e instanceof UnauthorizedException) throw e;
      return authUnavailable();
    }
    this.setCookie(res, raw, 28800);
    req.headers.cookie = `${this.cookieName()}=${raw}`;
    return this.session(req, res);
  }
  async refresh(
    req: AuthRequest,
    res: AuthResponse,
  ): Promise<PilotSessionResponse> {
    try {
      const initial = await this.local(req);
      this.csrf(req, initial);
      if (initial.kind !== "authenticated") return authRequired();
      const result = await this.store.lockedSession(
        initial.cookie_hash,
        async (value, tx) => {
          const row = this.checkLocal(value);
          this.csrf(req, row);
          if (!row.user_id || !row.tokens || !row.auth_session_id)
            return authInvalid();
          const old = openTokens(row.tokens, row.cookie_hash, this.config());
          if (old.expiresAt > Date.now() + 60_000) return { failed: false }; // A waiting request sees the committed rotation.
          if (
            !(await this.store.markRefreshStarted(row.cookie_hash, row.version))
          ) {
            await tx.query(
              "UPDATE pilot_sessions SET revoked_at=NOW() WHERE cookie_hash=$1",
              [row.cookie_hash],
            );
            return { failed: true };
          }
          let tokens, identity;
          try {
            tokens = await this.adapter.refresh(old.refreshToken);
            identity = await this.adapter.verify(tokens.accessToken);
            if (
              identity.userId !== row.user_id ||
              identity.sessionId !== row.auth_session_id
            )
              return authInvalid();
            if (this.config().sessionVerification === "database") {
              const active = await tx.query(
                "SELECT id FROM auth.sessions WHERE id=$1 AND user_id=$2 AND (not_after IS NULL OR not_after>NOW())",
                [identity.sessionId, identity.userId],
              );
              if (active.rows.length !== 1) return authInvalid();
            }
          } catch {
            // Commit the local revocation, rather than rolling it back with a provider error.
            await tx.query(
              "UPDATE pilot_sessions SET revoked_at=NOW() WHERE cookie_hash=$1",
              [row.cookie_hash],
            );
            return { failed: true };
          }
          await tx.query(
            "UPDATE pilot_sessions SET tokens=$2::jsonb,version=version+1 WHERE cookie_hash=$1 AND revoked_at IS NULL",
            [
              row.cookie_hash,
              JSON.stringify(
                sealTokens(tokens, row.cookie_hash, this.config()),
              ),
            ],
          );
          return { failed: false };
        },
      );
      this.cache.clear();
      if (result.failed) return authUnavailable();
      return await this.session(req, res);
    } catch (e) {
      if (e instanceof ForbiddenException || e instanceof UnauthorizedException)
        throw e;
      return authUnavailable();
    }
  }
  async logout(req: AuthRequest, res: AuthResponse) {
    try {
      const row = await this.local(req);
      this.csrf(req, row);
      await this.store.revoke(row.cookie_hash);
      this.cache.clear();
      this.setCookie(res, "", 0);
      let upstreamRevoked = true;
      if (row.tokens) {
        const tokens = openTokens(row.tokens, row.cookie_hash, this.config());
        try {
          await this.adapter.logout(tokens.accessToken);
        } catch {
          upstreamRevoked = false;
        }
      }
      return { status: "signed_out" as const, upstreamRevoked };
    } catch (e) {
      if (e instanceof ForbiddenException || e instanceof UnauthorizedException)
        throw e;
      return authUnavailable();
    }
  }
}
