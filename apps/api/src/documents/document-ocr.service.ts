import { ApiError, GoogleGenAI } from "@google/genai";
import { Injectable, Optional } from "@nestjs/common";
import { createCanvas } from "@napi-rs/canvas";
import { log } from "../common/log.js";
import { documentOcrConfig } from "../config/config.js";
import { safeAiAdmissionError } from "../assistant/ai-admission.service.js";
import {
  AiUsageService,
  classifyProviderOutcome,
  type ProviderCallToken,
} from "../assistant/ai-usage.service.js";
import {
  createProviderDeadline,
  settleProviderCall,
} from "../assistant/provider-lifecycle.js";
import { ocrPagePrompt } from "../assistant/prompt-registry.js";
import {
  assessDocumentText,
  normalizeDocumentText,
} from "./document-text-quality.js";
import type { ExtractedPdfPage } from "./pdf-text-extractor.service.js";

export type DocumentOcrFailure =
  | "OCR_NOT_CONFIGURED"
  | "OCR_TIMEOUT"
  | "OCR_QUOTA"
  | "OCR_UNAVAILABLE"
  | "OCR_INVALID_RESPONSE"
  | "OCR_RENDER_FAILED";

export class DocumentOcrError extends Error {
  constructor(readonly code: DocumentOcrFailure) {
    super("Document OCR failed.");
  }
}

/**
 * OCR is deliberately opt-in: a re-index can otherwise create many paid model
 * calls. Only pages rejected by the deterministic text-quality gate are sent.
 */
@Injectable()
export class DocumentOcrService {
  private readonly config = documentOcrConfig();
  private client?: GoogleGenAI;

  constructor(@Optional() private readonly usage?: AiUsageService) {}

  plannedProviderCalls(pages: ExtractedPdfPage[]) {
    if (!this.config.enabled || !this.config.configured) return 0;
    return pages
      .filter((page) => !assessDocumentText(page.text, page.page).useful)
      .slice(0, this.config.maxPages).length;
  }

  async recover(buffer: Buffer, pages: ExtractedPdfPage[]) {
    const candidates = pages
      .filter((page) => !assessDocumentText(page.text, page.page).useful)
      .slice(0, this.config.maxPages);
    if (!this.config.enabled || candidates.length === 0)
      return { pages, attemptedPageNumbers: [] as number[] };
    if (!this.config.apiKey) throw new DocumentOcrError("OCR_NOT_CONFIGURED");

    const startedAt = Date.now();
    try {
      const { getDocument } = await importPdfJs();
      const task = getDocument({
        data: new Uint8Array(buffer),
        useSystemFonts: true,
      });
      try {
        const document = await task.promise;
        const replacements = new Map<number, string>();
        for (const candidate of candidates) {
          const page = await document.getPage(candidate.page);
          try {
            const viewport = page.getViewport({ scale: 1.5 });
            if (viewport.width * viewport.height > 12_000_000)
              throw new DocumentOcrError("OCR_RENDER_FAILED");
            const canvas = createCanvas(
              Math.ceil(viewport.width),
              Math.ceil(viewport.height),
            );
            const context = canvas.getContext("2d");
            await page.render({
              canvas: canvas as never,
              canvasContext: context as never,
              viewport,
            }).promise;
            const image = canvas.toBuffer("image/png");
            if (image.length > 8 * 1024 * 1024)
              throw new DocumentOcrError("OCR_RENDER_FAILED");
            const text = await this.readImage(image);
            if (text) replacements.set(candidate.page, text);
          } finally {
            page.cleanup();
          }
        }
        const recovered = pages.map((page) => {
          const text = replacements.get(page.page);
          return text ? { ...page, text, source: "ocr" as const } : page;
        });
        log("info", "document.ocr_completed", {
          attemptedPageCount: candidates.length,
          recoveredPageCount: replacements.size,
          model: this.config.model,
          durationMs: Date.now() - startedAt,
        });
        return {
          pages: recovered,
          attemptedPageNumbers: candidates.map((page) => page.page),
        };
      } finally {
        await task.destroy();
      }
    } catch (error: unknown) {
      const admissionError = safeAiAdmissionError(error);
      if (admissionError) throw admissionError;
      const failure = this.normalizeError(error);
      log("error", "document.ocr_failed", {
        model: this.config.model,
        errorType: failure.code,
        durationMs: Date.now() - startedAt,
      });
      throw failure;
    }
  }

  private async readImage(image: Buffer) {
    this.client ??= new GoogleGenAI({
      apiKey: this.config.apiKey!,
      vertexai: false,
      httpOptions: { retryOptions: { attempts: 1 } },
    });
    const controller = new AbortController();
    let deadline: ReturnType<typeof createProviderDeadline> | undefined;
    let providerCall: ProviderCallToken | undefined;
    let providerCallFinished = false;
    let permitAuthorized = false;
    let providerDispatched = false;
    try {
      deadline = createProviderDeadline(this.config.timeoutMs, () =>
        controller.abort(),
      );
      const prompt = ocrPagePrompt();
      providerCall = this.usage?.startProviderCall({
        type: "ocr_page",
        provider: "google",
        model: this.config.model,
        prompt: prompt.reference,
      });
      await this.usage?.authorizeProviderCall(providerCall);
      permitAuthorized = true;
      if (deadline.hasExpired()) {
        this.usage?.discardProviderCallBeforeDispatch(providerCall);
        providerCallFinished = true;
        throw new DocumentOcrError("OCR_TIMEOUT");
      }
      providerDispatched = true;
      const result = await Promise.race([
        settleProviderCall(() =>
          this.client!.models.generateContent({
            model: this.config.model,
            contents: [
              {
                role: "user",
                parts: [
                  { text: prompt.systemInstruction },
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: image.toString("base64"),
                    },
                  },
                ],
              },
            ],
            config: {
              candidateCount: 1,
              responseModalities: ["TEXT"],
              maxOutputTokens: 8192,
              abortSignal: controller.signal,
              httpOptions: { retryOptions: { attempts: 1 } },
            },
          }),
        ),
        deadline.event,
      ]);
      if (result.kind === "timeout") throw new DocumentOcrError("OCR_TIMEOUT");
      if (result.kind === "error") throw result.error;
      const response = result.value;
      if (response.modelVersion)
        this.usage?.updateProviderModel(providerCall, response.modelVersion);
      this.usage?.finishProviderCall(
        providerCall,
        "success",
        response.usageMetadata,
      );
      providerCallFinished = true;
      const raw = response.text?.trim();
      if (
        !raw ||
        raw.length > 30_000 ||
        raw.includes(this.config.apiKey ?? "\u0000")
      )
        throw new DocumentOcrError("OCR_INVALID_RESPONSE");
      if (raw === "[NO_TEXT]") return "";
      const text = normalizeDocumentText(raw);
      return text && assessDocumentText(text).useful ? text : "";
    } catch (error: unknown) {
      const admissionError = safeAiAdmissionError(error);
      if (admissionError) throw admissionError;
      if (permitAuthorized && !providerDispatched && !providerCallFinished) {
        this.usage?.discardProviderCallBeforeDispatch(providerCall);
        providerCallFinished = true;
      }
      const failure = this.normalizeError(error);
      if (permitAuthorized && providerDispatched && !providerCallFinished)
        this.usage?.finishProviderCall(
          providerCall,
          classifyProviderOutcome(failure),
          undefined,
          error instanceof ApiError,
        );
      throw failure;
    } finally {
      deadline?.dispose();
    }
  }

  private normalizeError(error: unknown) {
    const admissionError = safeAiAdmissionError(error);
    if (admissionError) return admissionError;
    if (error instanceof DocumentOcrError) return error;
    if (error instanceof ApiError) {
      if ([408, 504].includes(error.status))
        return new DocumentOcrError("OCR_TIMEOUT");
      if (error.status === 429) return new DocumentOcrError("OCR_QUOTA");
      if ([400, 401, 403, 503].includes(error.status))
        return new DocumentOcrError("OCR_UNAVAILABLE");
    }
    return new DocumentOcrError("OCR_RENDER_FAILED");
  }
}

async function importPdfJs() {
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}
