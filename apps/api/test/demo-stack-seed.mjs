// TEST HARNESS ONLY. Seeds the local demo stack through its public HTTP API as
// a synthetic manager: upload each PDF, assign a course and index it.
//   node apps/api/test/demo-stack-seed.mjs <credentials.json> <pdf-dir>
// demo-stack-server.mjs also calls seedDemoStack() itself when DEMO_SEED_DIR is
// set. No credential value is printed.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export async function seedDemoStack({
  email,
  password,
  pdfDir,
  origin = "http://127.0.0.1:5173",
  base = "http://127.0.0.1:3000/api",
}) {
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
  if (login.status !== 200) throw Error(`login ${login.status}`);
  const session = await login.json();
  const headers = {
    Cookie: login.headers.get("set-cookie").split(";")[0],
    Origin: origin,
    "X-CSRF-Token": session.csrfToken,
  };
  const api = (path, init = {}) =>
    fetch(`${base}${path}`, {
      ...init,
      headers: { ...headers, ...init.headers },
    });

  const listing = await (await api("/courses")).json();
  const courses = listing.courses ?? listing;
  const course = (code) => courses.find((c) => c.code === code)?.id;
  const assignment = {
    "os-processes-demo.pdf": course("CS301"),
    "database-normalization-demo.pdf": course("CS305"),
  };
  const results = [];
  for (const name of readdirSync(pdfDir)
    .filter((n) => n.endsWith(".pdf"))
    .sort()) {
    const form = new FormData();
    form.append(
      "file",
      new Blob([readFileSync(join(pdfDir, name))], { type: "application/pdf" }),
      name,
    );
    if (assignment[name]) form.append("courseId", assignment[name]);
    const upload = await api("/documents", { method: "POST", body: form });
    if (upload.status !== 201 && upload.status !== 200)
      throw Error(`upload ${name} ${upload.status}`);
    const document = await upload.json();
    const id = document.id ?? document.document?.id;
    const index = await api(`/documents/${id}/process`, { method: "POST" });
    results.push({ name, upload: upload.status, index: index.status });
  }
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [credentialsFile, pdfDir] = process.argv.slice(2);
  if (!credentialsFile || !pdfDir)
    throw Error("credentials file and pdf dir required");
  const manager = JSON.parse(readFileSync(credentialsFile, "utf8")).find(
    (person) => person.role === "manager",
  );
  for (const row of await seedDemoStack({
    email: manager.email,
    password: manager.password,
    pdfDir,
  }))
    console.log(row.name, "upload", row.upload, "index", row.index);
}
