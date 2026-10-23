import {
  CallHandler,
  Controller,
  Body,
  ExecutionContext,
  Get,
  HttpCode,
  Injectable,
  NestInterceptor,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { finalize, Subject, takeUntil } from "rxjs";
import type { AuthRequest } from "../auth/auth.service.js";
import type { AudioUpload } from "./speech.types.js";
import { checkSpeechAbort } from "./speech.types.js";
import { SpeechService } from "./speech.service.js";

type SpeechRequest = AuthRequest & {
  aborted?: boolean;
  speechSignal: AbortSignal;
  speechProcessing?: boolean;
  destroy(): void;
  on(event: string, handler: () => void): void;
  off(event: string, handler: () => void): void;
};

@Injectable()
export class SpeechAdmissionInterceptor implements NestInterceptor {
  constructor(private readonly speech: SpeechService) {}
  async intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest<SpeechRequest>();
    const res = context.switchToHttp().getResponse<{
      writableEnded: boolean;
      on(event: string, handler: () => void): void;
      off(event: string, handler: () => void): void;
    }>();
    const controller = new AbortController();
    let release: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancelledUpload = new Subject<void>();
    const cleanup = () => {
      clearTimeout(timer);
      req.off("aborted", abort);
      res.off("close", closed);
      const relinquish = release;
      release = undefined;
      relinquish?.();
      cancelledUpload.complete();
    };
    const abort = () => {
      controller.abort();
      // A disconnected upload may never settle multer's callback. There is
      // no media/provider work yet, so its admission can be released now.
      if (!req.speechProcessing) {
        cancelledUpload.next();
        cleanup();
      }
    };
    const closed = () => {
      if (!res.writableEnded) abort();
    };
    req.on("aborted", abort);
    res.on("close", closed);
    timer = setTimeout(() => {
      controller.abort(new DOMException("STT deadline", "TimeoutError"));
      if (!req.speechProcessing) {
        cancelledUpload.next();
        cleanup();
        req.destroy();
      }
    }, 150000);
    if (req.aborted) abort();
    req.speechSignal = controller.signal;
    try {
      checkSpeechAbort(controller.signal);
      release = await this.speech.admit(req.principal);
      checkSpeechAbort(controller.signal);
      return next.handle().pipe(takeUntil(cancelledUpload), finalize(cleanup));
    } catch (error) {
      cleanup();
      throw error;
    }
  }
}

@Controller("speech")
export class SpeechController {
  constructor(private readonly speech: SpeechService) {}
  @Get("status")
  status() {
    return this.speech.status();
  }

  @Post("transcriptions")
  @HttpCode(200)
  @UseInterceptors(
    SpeechAdmissionInterceptor,
    FileInterceptor("file", {
      limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
        fields: 1,
        parts: 2,
        fieldNameSize: 40,
        fieldSize: 16,
      },
    }),
  )
  transcribe(
    @UploadedFile() file: AudioUpload | undefined,
    @Body() body: unknown,
    @Req() req: SpeechRequest,
  ) {
    req.speechProcessing = true;
    return this.speech.transcribe(file, req.principal, req.speechSignal, body);
  }
}
