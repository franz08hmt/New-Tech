import { createHash } from "node:crypto";

// F09-B.1 authenticated HTTP evaluation: transport, run plan and preflight.
// The public API is the only way in. Identity, workspace and role are decided
// by the server from the session; nothing here can supply or override them, and
// no maintenance DB, service key or debug route is involved.

export class HttpEvaluationError extends Error {
  // The message is the code only: errors must never carry a rejected argument,
  // credential, cookie or response text.
  constructor(code) {
    super(code);
    this.name = "HttpEvaluationError";
    this.code = code;
  }
}
const reject = (code) => new HttpEvaluationError(code);
export const ARGUMENT_REJECTED = "HTTP_EVALUATION_ARGUMENT_REJECTED";
export const TARGET_INVALID = "HTTP_EVALUATION_TARGET_INVALID";
export const CASE_OUT_OF_SCOPE = "HTTP_EVALUATION_CASE_OUT_OF_SCOPE";
export const PLAN_NOT_APPROVED = "HTTP_EVALUATION_PLAN_NOT_APPROVED";
export const PLAN_ALREADY_EXECUTED = "HTTP_EVALUATION_PLAN_ALREADY_EXECUTED";
export const PLAN_RESERVED = "HTTP_EVALUATION_PLAN_RESERVED";
export const LEDGER_UNAVAILABLE = "HTTP_EVALUATION_LEDGER_UNAVAILABLE";
export const CREDENTIALS_UNAVAILABLE =
  "HTTP_EVALUATION_CREDENTIALS_UNAVAILABLE";

const DEFAULT_BASE = "http://127.0.0.1:3000/api/";
const DEFAULT_ORIGIN = "http://127.0.0.1:5173";
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
const FLAGS = new Set(["--preflight", "--execute", "--credentials-stdin"]);
const VALUE_FLAGS = {
  "--base-url": "baseUrl",
  "--origin": "origin",
  "--mapping": "mapping",
  "--only": "only",
  "--output": "output",
  "--timeout-ms": "timeoutMs",
  "--max-requests": "maxRequests",
  "--approve-plan": "approvePlan",
  "--rerun-acknowledged": "rerunAcknowledged",
};
const HASH = /^[0-9a-f]{64}$/;
const RUN_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Unknown arguments are rejected without being echoed: a flag that looks like a
 * credential, principal, role or provider switch is never interpreted at all.
 */
export function parseHttpEvaluationArguments(values) {
  const options = {
    baseUrl: DEFAULT_BASE,
    origin: DEFAULT_ORIGIN,
    timeoutMs: 45000,
    maxRequests: 10,
  };
  const seen = new Set();
  let preflight = false,
    execute = false,
    credentialsStdin = false,
    marker = false;
  for (let i = 0; i < values.length; i++) {
    const flag = values[i];
    if (flag === "--http-evaluation" && !marker) {
      marker = true;
      continue;
    }
    if (seen.has(flag)) throw reject(ARGUMENT_REJECTED);
    if (FLAGS.has(flag)) {
      seen.add(flag);
      if (flag === "--preflight") preflight = true;
      else if (flag === "--execute") execute = true;
      else credentialsStdin = true;
    } else if (Object.hasOwn(VALUE_FLAGS, flag)) {
      const value = values[++i];
      if (value === undefined || value.startsWith("--"))
        throw reject(ARGUMENT_REJECTED);
      seen.add(flag);
      options[VALUE_FLAGS[flag]] = value;
    } else throw reject(ARGUMENT_REJECTED);
  }
  if (!marker || (preflight && execute)) throw reject(ARGUMENT_REJECTED);
  options.timeoutMs = Number(options.timeoutMs);
  options.maxRequests = Number(options.maxRequests);
  if (
    !Number.isInteger(options.timeoutMs) ||
    options.timeoutMs < 100 ||
    options.timeoutMs > 120000 ||
    !Number.isInteger(options.maxRequests) ||
    options.maxRequests < 1 ||
    options.maxRequests > 10 ||
    !options.mapping ||
    (options.only !== undefined && !/^E\d{2}(,E\d{2})*$/.test(options.only))
  )
    throw reject(ARGUMENT_REJECTED);
  options.action = execute ? "execute" : preflight ? "preflight" : "dry_run";
  options.credentialsStdin = credentialsStdin;
  // Secrets are read only after an explicit opt-in, and only in modes that use them.
  if (credentialsStdin !== (options.action !== "dry_run"))
    throw reject(ARGUMENT_REJECTED);
  if (options.action === "execute") {
    if (!HASH.test(options.approvePlan ?? "")) throw reject(ARGUMENT_REJECTED);
  } else if (options.approvePlan !== undefined) throw reject(ARGUMENT_REJECTED);
  if (options.rerunAcknowledged !== undefined) {
    const ids = options.rerunAcknowledged.split(",");
    if (options.action !== "execute" || !ids.every((id) => RUN_ID.test(id)))
      throw reject(ARGUMENT_REJECTED);
    options.rerunAcknowledged = ids.map((id) => id.toLowerCase());
  } else options.rerunAcknowledged = [];
  return options;
}

function loopbackUrl(text, { requireApiPath }) {
  let url;
  try {
    url = new URL(text);
  } catch {
    throw reject(TARGET_INVALID);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !LOOPBACK.has(url.hostname) ||
    url.username ||
    url.password ||
    text.includes("?") ||
    text.includes("#") ||
    (requireApiPath && !["/api", "/api/"].includes(url.pathname)) ||
    (!requireApiPath && text !== url.origin)
  )
    throw reject(TARGET_INVALID);
  return url;
}

/** Validated before any credential is read or any request is sent. */
export function validateHttpTarget(baseUrlText, originText) {
  const base = loopbackUrl(baseUrlText, { requireApiPath: true });
  base.pathname = "/api/";
  const origin = loopbackUrl(originText, { requireApiPath: false });
  return { base, origin: origin.origin };
}

/** First scope: live document-question RAG cases of the frozen manifest. */
export function eligibleCases(definition) {
  return definition.cases.filter(
    (item) =>
      item.mode === "live" &&
      item.group === "pdf_quality" &&
      item.scope?.kind === "document" &&
      (item.assistantMode ?? "documents") === "documents" &&
      (item.operation ?? "question") === "question",
  );
}
export function selectHttpCases(definition, only) {
  const eligible = eligibleCases(definition);
  if (!only) return eligible;
  const ids = only.split(",");
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !eligible.some((item) => item.id === id))
  )
    throw reject(CASE_OUT_OF_SCOPE);
  return eligible.filter((item) => ids.includes(item.id));
}

/**
 * The approvable run plan. Nothing secret is in it; the operator approves this
 * exact hash for `--execute`. The client request cap is not a provider cap: how
 * many provider calls a request causes is decided by the server.
 */
export function buildRunPlan({
  definition,
  manifestSha256,
  mapping,
  selected,
  target,
  options,
}) {
  if (selected.length > options.maxRequests) throw reject(ARGUMENT_REJECTED);
  const files = new Set(selected.map((item) => item.scope.file));
  const plan = {
    version: 1,
    kind: "authenticated_http_document_question",
    manifestSha256,
    corpusRevision: definition.corpusRevision,
    target: { base: target.base.href, origin: target.origin },
    caseIds: selected.map((item) => item.id),
    documents: definition.documents
      .filter((file) => files.has(file))
      .map((file) => ({ file, id: mapping.documents[file] })),
    maxRequests: options.maxRequests,
    timeoutMs: options.timeoutMs,
    caps: { clientRequests: selected.length, serverProviderCalls: "unknown" },
    generationRetries: 0,
    loginRetries: 0,
  };
  return {
    plan,
    planSha256: createHash("sha256").update(JSON.stringify(plan)).digest("hex"),
  };
}

const AUTH_CODE = /^[A-Z][A-Z0-9_]{2,39}$/;
const safeId = (value) =>
  typeof value === "string" && /^[A-Za-z0-9._-]{1,80}$/.test(value)
    ? value
    : null;
function failureCode(response) {
  const code = response.body?.code;
  return typeof code === "string" && AUTH_CODE.test(code)
    ? code
    : `HTTP_${response.status}`;
}

/**
 * One session over the existing cookie + CSRF + Origin contract. Requests go to
 * paths fixed by this module under one validated base; redirects are never
 * followed, nothing is retried, and cookies never leave the base origin.
 */
export function createHttpTransport({
  base,
  origin,
  fetchImpl = globalThis.fetch,
  timeoutMs = 45000,
}) {
  const jar = new Map();
  let csrf;
  let opened = false;
  const cookieHeader = () =>
    [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
  function absorb(response) {
    let changed = false;
    for (const line of response.headers.getSetCookie?.() ?? []) {
      const pair = line.split(";")[0];
      const at = pair.indexOf("=");
      if (at < 1) continue;
      const name = pair.slice(0, at).trim();
      const value = pair.slice(at + 1).trim();
      if (value) jar.set(name, value);
      else jar.delete(name);
      changed = true;
    }
    return changed;
  }
  // A failure to finish the exchange, tagged with where it stopped. The message
  // is the code only; no response text, header or cookie is ever attached.
  const interrupted = (phase) =>
    Object.assign(reject("NETWORK_OR_TIMEOUT"), { phase });
  async function send(method, path, body) {
    const url = new URL(path, base);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname))
      throw reject(TARGET_INVALID);
    const headers = { Accept: "application/json" };
    if (jar.size) headers.Cookie = cookieHeader();
    if (method !== "GET") {
      headers["Content-Type"] = "application/json";
      headers.Origin = origin;
      if (csrf) headers["X-CSRF-Token"] = csrf;
    }
    // One deadline covers the whole exchange: connection, headers and the full
    // body. It is raced explicitly so it holds even if fetchImpl or the body
    // stream ignores the abort signal.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const deadline = new Promise((_, expire) =>
      controller.signal.addEventListener(
        "abort",
        () => expire(new Error("deadline")),
        {
          once: true,
        },
      ),
    );
    deadline.catch(() => {});
    const finish = () => clearTimeout(timer);
    let response;
    try {
      response = await Promise.race([
        fetchImpl(url.href, {
          method,
          headers,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          redirect: "manual",
          signal: controller.signal,
        }),
        deadline,
      ]);
    } catch {
      // Whether the server received and acted on it is unknown; never retried.
      finish();
      controller.abort();
      throw interrupted("before_response");
    }
    if (response.status >= 300 && response.status < 400) {
      finish();
      controller.abort();
      throw reject("REDIRECT_REFUSED");
    }
    // Headers alone are not a completed response. A session cookie may already
    // exist, so remember to close it even if the body never arrives.
    const cookiesChanged = absorb(response);
    if (path === "auth/login" && cookiesChanged) opened = true;
    let text;
    try {
      text = await Promise.race([response.text(), deadline]);
    } catch {
      // The body was cut off, reset or never finished: the exchange is not
      // complete, so it is a transport failure and not an empty or bad answer.
      finish();
      controller.abort();
      throw interrupted("response_body");
    }
    finish();
    let parsed = null;
    let bodyStatus = "empty";
    if (text !== "") {
      // A fully received body that is not JSON is a contract failure of the
      // answer, kept apart from transport failures. It is never echoed.
      try {
        parsed = JSON.parse(text);
        bodyStatus = "json";
      } catch {
        bodyStatus = "invalid_json";
      }
    }
    return {
      status: response.status,
      body: parsed,
      bodyStatus,
      requestId: safeId(response.headers.get("x-request-id")),
      receiptPresent: response.headers.has("x-assistant-answer-id"),
    };
  }
  return {
    async login(credentials) {
      const bootstrap = await send("GET", "auth/session");
      if (
        bootstrap.status !== 200 ||
        typeof bootstrap.body?.csrfToken !== "string"
      )
        throw reject(failureCode(bootstrap));
      csrf = bootstrap.body.csrfToken;
      const login = await send("POST", "auth/login", {
        email: credentials.email,
        password: credentials.password,
      });
      if (login.status !== 200 || typeof login.body?.csrfToken !== "string")
        throw reject(failureCode(login));
      csrf = login.body.csrfToken;
      opened = true;
      return login.body.status === "authenticated"
        ? { status: "authenticated", role: login.body.principal?.role }
        : { status: String(login.body.status) };
    },
    get: (path) => send("GET", path),
    // One attempt only. A generation POST is never re-sent after any outcome.
    post: (path, body) => send("POST", path, body),
    async logout() {
      if (!opened) return false;
      try {
        return (await send("POST", "auth/logout", {})).status === 200;
      } catch {
        return false;
      } finally {
        jar.clear();
        csrf = undefined;
        opened = false;
      }
    },
  };
}

/** Operator-supplied test credentials: one JSON object on stdin, never argv. */
export async function readCredentialsFromStdin(stdin) {
  if (!stdin || stdin.isTTY) throw reject(CREDENTIALS_UNAVAILABLE);
  const chunks = [];
  let size = 0;
  for await (const chunk of stdin) {
    size += chunk.length;
    if (size > 4096) throw reject(CREDENTIALS_UNAVAILABLE);
    chunks.push(Buffer.from(chunk));
  }
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw reject(CREDENTIALS_UNAVAILABLE);
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== "email,password" ||
    typeof value.email !== "string" ||
    !value.email.includes("@") ||
    value.email.length > 254 ||
    typeof value.password !== "string" ||
    !value.password ||
    value.password.length > 1024
  )
    throw reject(CREDENTIALS_UNAVAILABLE);
  return { email: value.email, password: value.password };
}

const ROLES = ["manager", "member", "viewer"];
const failed = (reason, extra = {}) => ({ status: "failed", reason, ...extra });

/**
 * Read-only readiness: Auth, membership, document scope and configuration. It
 * sends no generation, index or upload request. Document metadata cannot prove
 * the PDF bytes or index content, so corpus provenance stays unverified unless
 * an injected verifier reaches it through a separately permitted path.
 */
export async function runPreflight({
  transport,
  credentials,
  plan,
  definition,
  provenanceVerifier,
}) {
  const conditions = {
    target: { status: "verified" },
    authSession: { status: "unknown" },
    membership: { status: "unknown" },
    documentScope: { status: "unknown" },
    assistantStatus: { status: "unknown" },
    corpusProvenance: {
      status: "unverified",
      reason: "HTTP_EXPOSES_METADATA_ONLY",
    },
    admissionReadiness: {
      status: "unverified",
      reason: "SERVER_ADMISSION_NOT_OBSERVABLE_OVER_HTTP",
    },
  };
  const result = { conditions, index: [], principalRole: null };
  const finish = () => {
    const ok = (name) => conditions[name].status === "verified";
    const transportReady = [
      "target",
      "authSession",
      "membership",
      "documentScope",
      "assistantStatus",
    ].every(ok);
    const qualityExecutionReady = transportReady && ok("corpusProvenance");
    result.readiness = {
      transportReady,
      qualityExecutionReady,
      complete: qualityExecutionReady && ok("admissionReadiness"),
    };
    result.anyFailed = Object.values(conditions).some(
      (item) => item.status === "failed",
    );
    return result;
  };
  let session;
  try {
    session = await transport.login(credentials);
  } catch (error) {
    conditions.authSession = failed(error.code ?? "AUTH_UNAVAILABLE");
    return finish();
  }
  if (session.status === "no_access") {
    conditions.authSession = { status: "verified" };
    conditions.membership = failed("WORKSPACE_ACCESS_DENIED");
    return finish();
  }
  if (session.status !== "authenticated" || !ROLES.includes(session.role)) {
    conditions.authSession = failed(
      `LOGIN_${String(session.status).toUpperCase().slice(0, 30)}`,
    );
    return finish();
  }
  conditions.authSession = { status: "verified" };
  conditions.membership = { status: "verified" };
  result.principalRole = session.role;

  try {
    const status = await transport.get("assistant/status");
    const modes = Array.isArray(status.body?.modes) ? status.body.modes : [];
    conditions.assistantStatus =
      status.status === 200 &&
      status.body?.status === "ready" &&
      modes.includes("documents") &&
      status.body?.ragEnabled === true
        ? { status: "verified", scope: "configuration_only" }
        : failed(
            status.status === 200
              ? status.body?.status === "not_configured"
                ? "AI_NOT_CONFIGURED"
                : "ASSISTANT_NOT_READY"
              : `HTTP_${status.status}`,
          );
  } catch (error) {
    conditions.assistantStatus = failed(error.code ?? "NETWORK_OR_TIMEOUT");
  }

  const documents = [];
  for (const { file, id } of plan.documents) {
    const expected = definition.corpus.documents.find((d) => d.file === file);
    const entry = { file, status: "failed" };
    documents.push(entry);
    let response;
    try {
      response = await transport.get(`documents/${id}`);
    } catch (error) {
      entry.reason = error.code ?? "NETWORK_OR_TIMEOUT";
      continue;
    }
    const body = response.body;
    if (response.status === 404) entry.reason = "DOCUMENT_NOT_FOUND_IN_SCOPE";
    else if (response.status !== 200) entry.reason = `HTTP_${response.status}`;
    else if (body?.id !== id || body?.name !== file)
      entry.reason = "DOCUMENT_NAME_MISMATCH";
    else if (
      body.storage_status !== "stored" ||
      body.processing_status !== "ready"
    )
      entry.reason = "DOCUMENT_NOT_READY";
    else if (!body.index_quality)
      entry.reason = "DOCUMENT_INDEX_QUALITY_MISSING";
    else if (body.index_quality.total_page_count !== expected.pageCount)
      entry.reason = "DOCUMENT_PAGE_COUNT_MISMATCH";
    else {
      entry.status = "verified";
      result.index.push({
        file,
        documentId: id,
        processingStatus: body.processing_status,
        totalPageCount: body.index_quality.total_page_count,
        usefulTextPageCount: body.index_quality.useful_text_page_count,
        lowTextPageCount: body.index_quality.low_text_page_count,
        needsOcr: body.index_quality.needs_ocr,
      });
    }
    entry.pageCount = expected.pageCount;
  }
  conditions.documentScope = {
    status: documents.every((d) => d.status === "verified")
      ? "verified"
      : "failed",
    metadataOnly: true,
    documents,
  };

  if (provenanceVerifier && conditions.documentScope.status === "verified") {
    try {
      const outcome = await provenanceVerifier({ plan: structuredClone(plan) });
      if (outcome?.status === "verified")
        conditions.corpusProvenance = {
          status: "verified",
          method: String(outcome.method ?? "injected verifier").slice(0, 80),
        };
    } catch {
      conditions.corpusProvenance = failed("PROVENANCE_VERIFIER_FAILED");
    }
  }
  return finish();
}

/** The reason an execute is blocked, from the first condition that stops it. */
export function executionBlockReason(preflight) {
  const { conditions } = preflight;
  for (const name of [
    "authSession",
    "membership",
    "assistantStatus",
    "documentScope",
  ])
    if (conditions[name].status !== "verified")
      return name === "documentScope"
        ? "DOCUMENT_SCOPE_FAILED"
        : (conditions[name].reason ?? `${name.toUpperCase()}_UNVERIFIED`);
  return conditions.corpusProvenance.status === "verified"
    ? null
    : conditions.corpusProvenance.reason === "HTTP_EXPOSES_METADATA_ONLY"
      ? "CORPUS_PROVENANCE_UNVERIFIED"
      : conditions.corpusProvenance.reason;
}
