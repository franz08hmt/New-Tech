// A separate process running one authenticated HTTP evaluation with injected,
// synthetic credentials and provenance. Used to race real processes on a ledger.
import { runHttpEvaluation } from "../../scripts/rag-evaluation-http.mjs";

const config = JSON.parse(process.env.F09B11_CHILD);
try {
  const exit = await runHttpEvaluation(config.args, {
    credentials: async () => ({
      email: config.email,
      password: config.password,
    }),
    provenanceVerifier: async () => ({
      status: "verified",
      method: "synthetic test hook",
    }),
    ledgerDir: config.ledgerDir,
    write: () => {},
  });
  process.stdout.write(JSON.stringify({ exit }) + "\n");
} catch (error) {
  process.stdout.write(
    JSON.stringify({ error: error.code ?? "UNEXPECTED" }) + "\n",
  );
  process.exitCode = 1;
}
