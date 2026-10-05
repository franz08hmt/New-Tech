import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Only this test's allocated directory is removed, including on assertion failure. */
export function testArtifacts(t) {
  const root = fileURLToPath(new URL("../../../artifacts/", import.meta.url));
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(resolve(root, "evaluation-test-"));
  t.after(() => {
    const child = relative(root, directory);
    if (!child || child.startsWith("..") || isAbsolute(child))
      throw new Error("Test cleanup escaped artifacts.");
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}
