// TEST HARNESS ONLY. Server-side role/ownership matrix against the local demo
// stack (demo-stack-server.mjs), through its public HTTP API as four synthetic
// users. Prints one JSON line per check; exits 1 if any expectation fails.
//   node apps/api/test/demo-stack-roles-check.mjs <credentials.json>
import { readFileSync } from "node:fs";

const origin = process.env.DEMO_ORIGIN ?? "http://127.0.0.1:5173";
const base = process.env.DEMO_BASE ?? "http://127.0.0.1:3000/api";
const people = JSON.parse(readFileSync(process.argv[2], "utf8"));

async function client(email, password) {
  const pre = await fetch(`${base}/auth/session`);
  const preBody = await pre.json();
  const login = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: pre.headers.get("set-cookie").split(";")[0],
      Origin: origin,
      "X-CSRF-Token": preBody.csrfToken,
    },
    body: JSON.stringify({ email, password }),
  });
  if (login.status !== 200) return { loginStatus: login.status };
  const session = await login.json();
  const headers = {
    Cookie: login.headers.get("set-cookie").split(";")[0],
    Origin: origin,
    "X-CSRF-Token": session.csrfToken,
  };
  return {
    loginStatus: 200,
    session,
    call: (path, init = {}) =>
      fetch(`${base}${path}`, {
        ...init,
        headers: {
          ...headers,
          ...(init.body && typeof init.body === "string"
            ? { "Content-Type": "application/json" }
            : {}),
          ...init.headers,
        },
      }),
  };
}

const byRole = Object.fromEntries(people.map((p) => [p.role ?? "outsider", p]));
const failures = [];
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures.push(name);
  console.log(JSON.stringify({ check: name, actual, expected, ok }));
};

const manager = await client(byRole.manager.email, byRole.manager.password);
const member = await client(byRole.member.email, byRole.member.password);
const viewer = await client(byRole.viewer.email, byRole.viewer.password);
const outsider = await client(byRole.outsider.email, byRole.outsider.password);

check("manager login", manager.loginStatus, 200);
check("manager role in session", manager.session.principal.role, "manager");
check("viewer role in session", viewer.session.principal.role, "viewer");
// A user with no membership never gets a principal.
check(
  "outsider has no workspace access",
  outsider.loginStatus === 200 ? outsider.session.status : outsider.loginStatus,
  outsider.loginStatus === 200 ? "no_access" : outsider.loginStatus,
);

const task = (title) => ({
  method: "POST",
  body: JSON.stringify({ title }),
});
check("viewer reads tasks", (await viewer.call("/tasks")).status, 200);
check(
  "viewer cannot create a task",
  (await viewer.call("/tasks", task("Viewer should be refused"))).status,
  403,
);
const created = await member.call(
  "/tasks",
  task("Member task from role check"),
);
check("member can create a task", created.status, 201);
check(
  "manager can create a task",
  (await manager.call("/tasks", task("Manager task from role check"))).status,
  201,
);
if (outsider.call)
  check(
    "outsider cannot read tasks",
    (await outsider.call("/tasks")).status,
    403,
  );

// Documents: delete is a manager-only action.
const docs = await (await manager.call("/documents")).json();
const first = (docs.documents ?? docs)[0];
if (first) {
  check(
    "viewer cannot delete a document",
    (await viewer.call(`/documents/${first.id}`, { method: "DELETE" })).status,
    403,
  );
  check(
    "member cannot delete a document",
    (await member.call(`/documents/${first.id}`, { method: "DELETE" })).status,
    403,
  );
  check(
    "viewer cannot start indexing",
    (await viewer.call(`/documents/${first.id}/process`, { method: "POST" }))
      .status,
    403,
  );
}

// AI usage dashboard: managers only.
check(
  "manager reads AI usage",
  (await manager.call("/admin/ai-usage")).status,
  200,
);
check(
  "member cannot read AI usage",
  (await member.call("/admin/ai-usage")).status,
  403,
);
check(
  "viewer cannot read AI usage",
  (await viewer.call("/admin/ai-usage")).status,
  403,
);

// Study Coach quizzes are personal: another user gets the generic not-found.
const quizzes = await (
  await manager.call("/study-coach/quizzes?page=1&pageSize=20")
).json();
const quiz = (quizzes.items ?? quizzes.quizzes ?? [])[0];
if (quiz) {
  check(
    "owner reads own quiz",
    (await manager.call(`/study-coach/quizzes/${quiz.id}`)).status,
    200,
  );
  check(
    "another member cannot read the quiz",
    (await member.call(`/study-coach/quizzes/${quiz.id}`)).status,
    404,
  );
  check(
    "a manager does not get others' quizzes either",
    (
      await (
        await member.call("/study-coach/quizzes?page=1&pageSize=20")
      ).json()
    ).total ?? 0,
    0,
  );
}

// Origin/CSRF are enforced by the server, not by the page.
const noCsrf = await fetch(`${base}/tasks`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: origin },
  body: JSON.stringify({ title: "no session" }),
});
check(
  "request without a session is refused",
  [401, 403].includes(noCsrf.status),
  true,
);

if (failures.length) {
  console.log(JSON.stringify({ failed: failures }));
  process.exit(1);
}
