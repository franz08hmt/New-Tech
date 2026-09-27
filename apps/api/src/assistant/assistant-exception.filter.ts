import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import { log, requestContext } from "../common/log.js";
import { AssistantError } from "./assistant.types.js";

@Catch(AssistantError)
export class AssistantExceptionFilter implements ExceptionFilter<AssistantError> {
  catch(error: AssistantError, host: ArgumentsHost) {
    const statusCode =
      error.kind === "timeout" ? 504 : error.kind === "upstream" ? 502 : 503;
    const message =
      error.kind === "not_configured"
        ? "AI assistant is not configured."
        : error.kind === "timeout"
          ? "AI assistant timed out. Please retry."
          : "AI assistant is temporarily unavailable.";
    const code = {
      not_configured: "AI_NOT_CONFIGURED",
      timeout: "AI_TIMEOUT",
      quota: "AI_QUOTA",
      authentication: "AI_AUTHENTICATION",
      unavailable: "AI_UNAVAILABLE",
      upstream: "AI_UPSTREAM",
    }[error.kind];
    log("error", "request.failed", { status: statusCode, code });
    const response = host.switchToHttp().getResponse<{
      status(code: number): { json(body: unknown): void };
    }>();
    response.status(statusCode).json({
      statusCode,
      code,
      message,
      requestId: requestContext.getStore()?.requestId,
    });
  }
}
