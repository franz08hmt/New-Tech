import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { corpusDocuments } from "../scripts/rag-evaluation-corpus.mjs";

// F09-B.1 transport tests. The server below is a loopback stand-in for the Nest
// Auth/session/CSRF routes; it never reaches a provider, database or the network.
export const ORIGIN = "http://127.0.0.1:5173";
export const EMAIL = "eval-operator@example.test";
export const PASSWORD = "SENTINEL-PASSWORD-7f3a91";
export const COOKIE_VALUE = "SENTINEL-SESSION-COOKIE-55c2";
export const CSRF = "SENTINEL-CSRF-TOKEN-a81d";
export const root = fileURLToPath(new URL("../../../", import.meta.url));
export const manifest = JSON.parse(
  await readFile(resolve(root, "docs/evaluation-cases.json")),
);
export const BRIEF = corpusDocuments[0];
export const POLICY = corpusDocuments[1];
export const documentIds = {
  [BRIEF.file]: randomUUID(),
  [POLICY.file]: randomUUID(),
};
export const eligible = [
  "E01",
  "E03",
  "E04",
  "E05",
  "E06",
  "E07",
  "E15",
  "E16",
];

export function groundedAnswer() {
  return {
    answer: "The demo lasts six minutes. [S1]",
    answerable: true,
    reasonCode: "ANSWER_GENERATED",
    citations: [
      {
        sourceId: "S1",
        chunkId: randomUUID(),
        documentId: documentIds[BRIEF.file],
        title: BRIEF.file,
        page: 1,
        chunkIndex: 0,
      },
    ],
    provider: "google",
    model: "gemini-2.5-flash",
    mode: "documents",
    ragEnabled: true,
    promptVersion: "rag-v1",
  };
}
export function refusal() {
  return {
    answer: "Không tìm thấy bằng chứng phù hợp trong tài liệu.",
    answerable: false,
    reasonCode: "NO_RELEVANT_EVIDENCE",
    citations: [],
    provider: "google",
    model: "gemini-2.5-flash",
    mode: "documents",
    ragEnabled: true,
    promptVersion: "rag-v1",
  };
}

/** Records only path/method/flags, never header or body values. */
export async function fakeApi(options = {}) {
  const state = {
    role: "member",
    loginStatus: "authenticated",
    loginHttp: 200,
    loginCode: undefined,
    redirectLoginTo: undefined,
    documents: {},
    chat: () => ({ status: 200, body: groundedAnswer() }),
    chatDelayMs: 0,
    // F09-B.1.1 hooks: hold login until N logins arrived, and hold a chat reply.
    loginBarrier: 0,
    // Paths whose reply is cut off after valid headers (partial body, then reset).
    cut: new Set(),
    chatGate: undefined,
    assistantStatus: "ready",
    ...options,
  };
  const requests = [];
  let logins = 0;
  const loginWaiters = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    const url = new URL(req.url, "http://127.0.0.1");
    const entry = {
      method: req.method,
      path: url.pathname,
      search: url.search,
      origin: req.headers.origin,
      cookie: req.headers.cookie,
      csrf: req.headers["x-csrf-token"],
      bodyHasPassword: raw.includes(PASSWORD),
      rawBody: raw,
    };
    requests.push(entry);
    const json = (status, body, headers = {}) => {
      if (state.cut.has(url.pathname)) {
        res.writeHead(status, {
          "content-type": "application/json",
          "content-length": "1000",
          ...headers,
        });
        res.write('{"status":"part');
        return setTimeout(() => res.destroy(), 25);
      }
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(JSON.stringify(body));
    };
    const sessionOk =
      entry.cookie?.includes(`examate_session=${COOKIE_VALUE}`) &&
      entry.csrf === `${CSRF}-session` &&
      entry.origin === ORIGIN;
    if (url.pathname === "/api/auth/session" && req.method === "GET")
      return json(
        200,
        { status: "anonymous", csrfToken: `${CSRF}-pre` },
        { "set-cookie": "examate_pre=PRE-COOKIE; Path=/; HttpOnly" },
      );
    if (url.pathname === "/api/auth/login" && req.method === "POST") {
      if (state.redirectLoginTo) {
        res.writeHead(302, { location: state.redirectLoginTo });
        return res.end();
      }
      const body = JSON.parse(raw || "{}");
      if (
        entry.origin !== ORIGIN ||
        entry.csrf !== `${CSRF}-pre` ||
        !entry.cookie?.includes("examate_pre=PRE-COOKIE") ||
        body.email !== EMAIL ||
        body.password !== PASSWORD
      )
        return json(401, { code: "AUTH_INVALID", message: "denied" });
      if (state.loginBarrier) {
        logins++;
        if (logins >= state.loginBarrier)
          loginWaiters.splice(0).forEach((r) => r());
        else await new Promise((r) => loginWaiters.push(r));
      }
      if (state.loginHttp !== 200)
        return json(state.loginHttp, {
          code: state.loginCode ?? "AUTH_UNAVAILABLE",
          message: "x",
        });
      if (state.loginStatus !== "authenticated")
        return json(200, {
          status: state.loginStatus,
          csrfToken: `${CSRF}-session`,
        });
      return json(
        200,
        {
          status: "authenticated",
          csrfToken: `${CSRF}-session`,
          principal: {
            userId: randomUUID(),
            workspaceId: randomUUID(),
            role: state.role,
          },
          expiresAt: new Date(Date.now() + 3.6e6).toISOString(),
          accessExpiresAt: new Date(Date.now() + 3.6e6).toISOString(),
        },
        {
          "set-cookie": `examate_session=${COOKIE_VALUE}; Path=/; HttpOnly`,
        },
      );
    }
    if (url.pathname === "/api/auth/logout" && req.method === "POST")
      return json(200, { status: "signed_out", upstreamRevoked: true });
    if (!entry.cookie?.includes(`examate_session=${COOKIE_VALUE}`))
      return json(401, { code: "AUTH_REQUIRED", message: "login" });
    if (url.pathname === "/api/assistant/status")
      return json(200, {
        status: state.assistantStatus,
        provider: "google",
        modes: ["general", "documents"],
        ragEnabled: true,
        credentialsExposedToClient: false,
      });
    const doc = /^\/api\/documents\/([0-9a-f-]{36})$/.exec(url.pathname);
    if (doc && req.method === "GET") {
      const file = Object.keys(documentIds).find(
        (name) => documentIds[name] === doc[1],
      );
      if (!file || state.documents[file] === "missing")
        return json(404, { code: "DOCUMENT_NOT_FOUND", message: "none" });
      const document = corpusDocuments.find((d) => d.file === file);
      return json(200, {
        id: doc[1],
        name: file,
        media_type: "application/pdf",
        size_bytes: 1000,
        storage_status: "stored",
        processing_status: "ready",
        index_quality: {
          total_page_count: document.pages.length,
          useful_text_page_count: document.pages.length,
          low_text_page_count: 0,
          indexed_chunk_count: document.pages.length,
          skipped_page_numbers: [],
          needs_ocr: false,
          ocr_page_count: 0,
          ocr_page_numbers: [],
        },
        course_id: null,
        course_slug: null,
        course_name: null,
        course_code: null,
        created_at: "2026-10-22T00:00:00Z",
        updated_at: "2026-10-22T00:00:00Z",
        ...state.documents[file],
      });
    }
    if (url.pathname === "/api/assistant/chat" && req.method === "POST") {
      if (!sessionOk)
        return json(403, { code: "CSRF_INVALID", message: "csrf" });
      const index = requests.filter((r) => r.path === url.pathname).length;
      const reply = state.chat(index, JSON.parse(raw), entry);
      if (state.chatGate) await state.chatGate;
      if (state.chatDelayMs && reply.hang) {
        await new Promise((r) => setTimeout(r, state.chatDelayMs));
        return res.destroy();
      }
      if (reply.socket) {
        // Complete, valid headers and then an incomplete body.
        res.writeHead(200, {
          "content-type": "application/json",
          "content-length": "1000",
          "x-request-id": `req-${index}`,
        });
        res.write('{"answer":"partial');
        if (reply.socket === "partial_then_destroy")
          return setTimeout(() => res.destroy(), 25);
        return; // headers_then_hang: the body never finishes
      }
      if (reply.raw !== undefined) {
        res.writeHead(200, {
          "content-type": "application/json",
          "x-request-id": `req-${index}`,
        });
        return res.end(reply.raw);
      }
      return json(reply.status, reply.body, {
        "x-request-id": `req-${index}`,
        "x-assistant-answer-id": "answer-receipt-id",
      });
    }
    return json(404, { code: "NOT_FOUND", message: "no" });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    state,
    requests,
    close: async () => {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    },
    count: (path, method) =>
      requests.filter(
        (r) => r.path === path && (!method || r.method === method),
      ).length,
  };
}
