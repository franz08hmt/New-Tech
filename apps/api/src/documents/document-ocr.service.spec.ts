import "reflect-metadata";
import { GoogleGenAI } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentOcrService } from "./document-ocr.service.js";

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
  render: vi.fn(() => ({ promise: Promise.resolve() })),
  cleanup: vi.fn(),
  destroy: vi.fn(),
  toBuffer: vi.fn(() => Buffer.from("png-fixture")),
}));

vi.mock("@google/genai", async (importOriginal) => {
  const sdk = await importOriginal<typeof import("@google/genai")>();
  return {
    ...sdk,
    GoogleGenAI: vi.fn(function () {
      return { models: { generateContent: mocks.generateContent } };
    }),
  };
});

vi.mock("@napi-rs/canvas", () => ({
  createCanvas: vi.fn(() => ({
    getContext: () => ({}),
    toBuffer: mocks.toBuffer,
  })),
}));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      getPage: vi.fn(async () => ({
        getViewport: () => ({ width: 900, height: 1200 }),
        render: mocks.render,
        cleanup: mocks.cleanup,
      })),
    }),
    destroy: mocks.destroy,
  })),
}));

describe("DocumentOcrService", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "unit-test-key");
    vi.stubEnv("DOCUMENT_OCR_ENABLED", "true");
    vi.stubEnv("DOCUMENT_OCR_MAX_PAGES", "25");
    vi.stubEnv("GEMINI_OCR_TIMEOUT_MS", "30000");
    vi.spyOn(console, "log").mockImplementation(() => {});
    mocks.generateContent.mockReset().mockResolvedValue({
      text: "Recovered paragraph with enough useful words for indexing.",
      modelVersion: "gemini-2.5-flash-001",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("renders and OCRs only low-text pages without sending document metadata", async () => {
    const descriptors: unknown[] = [];
    const finishes: unknown[][] = [];
    const models: unknown[][] = [];
    const usage = {
      startProviderCall: vi.fn((descriptor: unknown) => {
        descriptors.push(descriptor);
        return Symbol("provider call");
      }),
      finishProviderCall: vi.fn((...args: unknown[]) => finishes.push(args)),
      updateProviderModel: vi.fn((...args: unknown[]) => models.push(args)),
    };
    const service = new DocumentOcrService(usage as never);
    const result = await service.recover(Buffer.from("%PDF-fixture"), [
      { page: 1, text: "A complete native paragraph with useful information." },
      { page: 2, text: "2" },
      { page: 3, text: "3" },
    ]);

    expect(result.pages).toEqual([
      { page: 1, text: "A complete native paragraph with useful information." },
      {
        page: 2,
        text: "Recovered paragraph with enough useful words for indexing.",
        source: "ocr",
      },
      {
        page: 3,
        text: "Recovered paragraph with enough useful words for indexing.",
        source: "ocr",
      },
    ]);
    expect(result.attemptedPageNumbers).toEqual([2, 3]);
    expect(mocks.generateContent).toHaveBeenCalledTimes(2);
    const request = mocks.generateContent.mock.calls[0][0];
    expect(request.contents[0].parts[1]).toEqual({
      inlineData: {
        mimeType: "image/png",
        data: Buffer.from("png-fixture").toString("base64"),
      },
    });
    expect(JSON.stringify(request)).not.toContain("complete native paragraph");
    expect(descriptors).toEqual([
      {
        type: "ocr_page",
        provider: "google",
        model: "gemini-2.5-flash",
        prompt: { id: "documents.ocr.page", version: "ocr-v1" },
      },
      {
        type: "ocr_page",
        provider: "google",
        model: "gemini-2.5-flash",
        prompt: { id: "documents.ocr.page", version: "ocr-v1" },
      },
    ]);
    expect(finishes).toHaveLength(2);
    expect(finishes[0][1]).toBe("success");
    expect(finishes[0][2]).toBeUndefined();
    expect(models).toEqual([
      [expect.anything(), "gemini-2.5-flash-001"],
      [expect.anything(), "gemini-2.5-flash-001"],
    ]);
    expect(GoogleGenAI).toHaveBeenCalledOnce();
  });

  it("does not render or call Gemini when OCR is disabled", async () => {
    vi.stubEnv("DOCUMENT_OCR_ENABLED", "false");
    const service = new DocumentOcrService();
    const pages = [{ page: 1, text: "" }];
    await expect(
      service.recover(Buffer.from("%PDF-fixture"), pages),
    ).resolves.toEqual({ pages, attemptedPageNumbers: [] });
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });
});
