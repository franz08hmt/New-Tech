// TEST HARNESS ONLY. Shows, through the same origin a browser uses, that the
// general-mode SSE reply arrives in pieces over time instead of at the end (it
// would arrive at once if a proxy buffered it). Needs the demo stack running with
// the "slow" scenario selected:
//   curl -X POST http://127.0.0.1:3999/control/scenario -d '{"scenario":"slow"}'
//   node apps/api/test/demo-stack-stream-check.mjs http://127.0.0.1:8080 manager@demo.test <password>
const [origin, email, password] = process.argv.slice(2);
if (!origin || !email || !password) throw Error("origin, email, password");
const api = `${origin}/api`;
const pre = await fetch(`${api}/auth/session`);
const preBody = await pre.json();
const login = await fetch(`${api}/auth/login`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Cookie: pre.headers.get("set-cookie").split(";")[0],
    Origin: origin,
    "X-CSRF-Token": preBody.csrfToken,
  },
  body: JSON.stringify({ email, password }),
});
if (login.status !== 200) throw Error(`login ${login.status}`);
const session = await login.json();
const started = Date.now();
const response = await fetch(`${api}/assistant/chat/stream`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    Cookie: login.headers.get("set-cookie").split(";")[0],
    Origin: origin,
    "X-CSRF-Token": session.csrfToken,
  },
  body: JSON.stringify({
    message: "Explain what a process is.",
    mode: "general",
  }),
});
const arrivals = [];
const decoder = new TextDecoder();
let deltas = 0;
for await (const chunk of response.body) {
  const text = decoder.decode(chunk);
  deltas += (text.match(/"type":"delta"/g) ?? []).length;
  arrivals.push({ atMs: Date.now() - started, bytes: chunk.length });
}
const first = arrivals[0]?.atMs ?? null;
const last = arrivals.at(-1)?.atMs ?? null;
console.log(
  JSON.stringify({
    status: response.status,
    contentType: response.headers.get("content-type"),
    chunks: arrivals.length,
    deltaEvents: deltas,
    firstChunkMs: first,
    lastChunkMs: last,
    incremental: first !== null && last !== null && last - first > 1000,
  }),
);
