import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  INestApplication,
  ValidationPipe,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { errorCode, log, requestContext } from "./log.js";
import { httpRuntimeConfig } from "../config/config.js";
import { normalizeIp } from "./client-ip.js";
import type {
  AssistantAnswerIdHeader,
  PilotAuthErrorCode,
} from "@examate/contracts";
import { AssistantChatDto } from "../assistant/assistant-chat.dto.js";
import { boundedHistoryInput } from "../assistant/history-validation.js";

// Only server-defined Auth response codes are promoted into HTTP diagnostics.
// Keep the shared errorCode helper (and non-Auth/RAG logging semantics) intact.
const authCodes: ReadonlySet<string> = new Set([
  "AUTH_REQUIRED",
  "AUTH_INVALID",
  "SESSION_EXPIRED",
  "SESSION_REFRESH_REQUIRED",
  "CSRF_INVALID",
  "WORKSPACE_ACCESS_DENIED",
  "ROLE_FORBIDDEN",
  "AUTH_UNAVAILABLE",
  "LOGIN_RATE_LIMITED",
  "OAUTH_NOT_CONFIGURED",
  "OAUTH_RESTART_REQUIRED",
  "OAUTH_LOGOUT_REQUIRED",
] satisfies PilotAuthErrorCode[]);

function safeRequestPath(url: string) {
  const path = url.split("?")[0];
  if (
    /^\/api\/auth\/(session|login|logout|refresh|google\/(?:status|start|callback))$/i.test(
      path,
    )
  )
    return path.toLowerCase();
  if (/^\/api\/speech\/(status|transcriptions)$/i.test(path))
    return path.toLowerCase();
  if (/^\/api\/courses(\/[a-z0-9-]+)?$/.test(path))
    return path === "/api/courses" ? path : "/api/courses/:slug";
  if (path === "/api/documents/search") return path;
  return /^\/api\/(health|tasks|documents|assistant\/(status|chat(?:\/stream)?|feedback))(\/[0-9a-f-]{36}(\/status|\/download|\/course|\/process)?)?$/i.test(
    path,
  )
    ? path.replace(/[0-9a-f-]{36}/gi, ":id")
    : "/unmatched";
}

@Catch()
class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const body =
      error instanceof HttpException
        ? error.getResponse()
        : { message: "Internal server error", code: "INTERNAL_ERROR" };
    const authCode =
      error instanceof HttpException &&
      typeof body === "object" &&
      body !== null &&
      "code" in body &&
      typeof body.code === "string" &&
      authCodes.has(body.code)
        ? body.code
        : undefined;
    log("error", "request.failed", {
      status,
      code: authCode ?? errorCode(error),
      path: safeRequestPath(host.switchToHttp().getRequest().url),
    });
    if (
      status === 429 &&
      typeof body === "object" &&
      body !== null &&
      "retryAfterSeconds" in body &&
      typeof body.retryAfterSeconds === "number" &&
      Number.isInteger(body.retryAfterSeconds) &&
      body.retryAfterSeconds > 0
    )
      response.setHeader("Retry-After", String(body.retryAfterSeconds));
    response.status(status).json({
      statusCode: status,
      ...(typeof body === "string" ? { message: body } : body),
      requestId: requestContext.getStore()?.requestId,
    });
  }
}
export function configureApp(app: INestApplication, origins: string[] = []) {
  const { trustedProxyIp } = httpRuntimeConfig();
  // Exact socket peer AND closest hop only, never a subnet or numeric hop count.
  // https://expressjs.com/en/guide/behind-proxies/
  app
    .getHttpAdapter()
    .getInstance()
    .set(
      "trust proxy",
      trustedProxyIp
        ? (address: string, hop: number) =>
            hop === 0 && normalizeIp(address) === trustedProxyIp
        : false,
    );
  app.setGlobalPrefix("api");
  app.use(
    (
      req: { method: string; url: string },
      res: {
        statusCode: number;
        setHeader: (name: string, value: string) => void;
        on: (event: string, callback: () => void) => void;
      },
      next: () => void,
    ) => {
      const requestId = randomUUID();
      const start = Date.now();
      // Only known route shapes reach logs; arbitrary query strings and filenames do not.
      const safePath = safeRequestPath(req.url);
      res.setHeader("X-Request-ID", requestId);
      res.setHeader("Cache-Control", "no-store");
      res.on("finish", () =>
        log("info", "request.completed", {
          requestId,
          method: req.method,
          path: safePath,
          status: res.statusCode,
          durationMs: Date.now() - start,
        }),
      );
      requestContext.run({ requestId }, next);
    },
  );
  app.useGlobalPipes(
    {
      transform(value: unknown, metadata) {
        if (
          metadata.metatype === AssistantChatDto &&
          value !== null &&
          typeof value === "object" &&
          "history" in value &&
          !boundedHistoryInput(value.history)
        )
          throw new BadRequestException({
            code: "HISTORY_INVALID",
            message:
              "Ngữ cảnh quá phức tạp. Bạn mở cuộc hội thoại mới rồi thử lại nhé.",
          });
        return value;
      },
    },
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        errors.some((error) => error.property === "history")
          ? new BadRequestException({
              code: "HISTORY_INVALID",
              message:
                "Chưa xác minh được ngữ cảnh. Bạn mở cuộc hội thoại mới rồi thử lại nhé.",
            })
          : new ValidationPipe().createExceptionFactory()(errors),
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableCors({
    origin: origins,
    credentials: false,
    exposedHeaders: [
      "X-Request-ID",
      "X-Assistant-Answer-ID" satisfies AssistantAnswerIdHeader,
    ],
  });
  app.enableShutdownHooks();
  const server = app.getHttpServer();
  server.requestTimeout = 60000;
  server.headersTimeout = 30000;
}
