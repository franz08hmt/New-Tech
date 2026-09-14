import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  INestApplication,
  ValidationPipe,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { errorCode, log, requestContext } from "./log.js";

@Catch()
class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const body =
      error instanceof HttpException
        ? error.getResponse()
        : { message: "Internal server error", code: "INTERNAL_ERROR" };
    log("error", "request.failed", { status, code: errorCode(error) });
    response.status(status).json({
      statusCode: status,
      ...(typeof body === "string" ? { message: body } : body),
      requestId: requestContext.getStore()?.requestId,
    });
  }
}
export function configureApp(app: INestApplication, origins: string[] = []) {
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
      const path = req.url.split("?")[0];
      const safePath =
        /^\/api\/(health|tasks|documents|assistant\/status)(\/[0-9a-f-]{36}(\/status|\/download)?)?$/i.test(
          path,
        )
          ? path
          : "/unmatched";
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
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableCors({
    origin: origins,
    credentials: false,
    exposedHeaders: ["X-Request-ID"],
  });
  app.enableShutdownHooks();
  const server = app.getHttpServer();
  server.requestTimeout = 60000;
  server.headersTimeout = 30000;
}
